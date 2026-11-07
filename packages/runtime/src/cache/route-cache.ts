import type { CacheStore, CachedRenderResult } from './types.js';

export interface RouteCacheLookupResult {
  readonly result: CachedRenderResult;
  readonly isStale: boolean;
  readonly isHit: boolean;
}

/**
 * RouteCacheManager provides route-level ISR caching with:
 * 1. Single-Flight Coalescing Mutex to eliminate cache stampedes and dogpiling.
 * 2. Monotonic Version Timestamping to guard against stale background overwrite races.
 */
export class RouteCacheManager {
  private readonly coalescingMutex = new Map<string, Promise<CachedRenderResult>>();
  private readonly swrMutex = new Map<string, Promise<void>>();
  private readonly inFlightTimestamps = new Map<string, number>();

  constructor(private readonly cacheStore: CacheStore) {}

  getStore(): CacheStore {
    return this.cacheStore;
  }

  async getOrRevalidate(
    routeKey: string,
    ttlSeconds: number,
    tags: string[],
    renderFn: () => Promise<CachedRenderResult>,
  ): Promise<RouteCacheLookupResult> {
    const entry = await this.cacheStore.get<CachedRenderResult>(routeKey);
    const now = Date.now();
    const ttlMs = ttlSeconds * 1000;

    // 1. Fresh Cache Hit
    if (entry && now - entry.revalidatedAt < ttlMs) {
      return {
        result: entry.value,
        isStale: false,
        isHit: true,
      };
    }

    // 2. Stale Cache Hit -> Return stale data immediately, revalidate in background via mutex
    if (entry) {
      this.triggerBackgroundRevalidate(routeKey, ttlMs, tags, renderFn);
      return {
        result: entry.value,
        isStale: true,
        isHit: true,
      };
    }

    // 3. Cache Miss -> Await single-flight render
    let inFlight = this.coalescingMutex.get(routeKey);
    if (!inFlight) {
      inFlight = this.executeRevalidate(routeKey, ttlMs, tags, renderFn);
      this.coalescingMutex.set(routeKey, inFlight);
    }

    const result = await inFlight;
    return {
      result,
      isStale: false,
      isHit: false,
    };
  }

  private triggerBackgroundRevalidate(
    routeKey: string,
    ttlMs: number,
    tags: string[],
    renderFn: () => Promise<CachedRenderResult>,
  ): void {
    if (this.swrMutex.has(routeKey) || this.coalescingMutex.has(routeKey)) {
      return;
    }

    const swrPromise = this.executeRevalidate(routeKey, ttlMs, tags, renderFn)
      .then(() => {})
      .catch((_err) => {
        // Background revalidation failures must not crash the Node.js process with unhandled rejection
      })
      .finally(() => {
        this.swrMutex.delete(routeKey);
      });

    this.swrMutex.set(routeKey, swrPromise);
  }

  private async executeRevalidate(
    routeKey: string,
    ttlMs: number,
    tags: string[],
    renderFn: () => Promise<CachedRenderResult>,
  ): Promise<CachedRenderResult> {
    const revalidationStartedAt = Date.now();
    this.inFlightTimestamps.set(routeKey, revalidationStartedAt);

    try {
      const freshResult = await renderFn();

      // Guard against Stale Overwrite Race Condition:
      const isStaleOverwrite = await this.checkStaleOverwrite(routeKey, tags, revalidationStartedAt);
      if (!isStaleOverwrite) {
        await this.cacheStore.set(routeKey, freshResult, {
          ttl: ttlMs,
          tags,
          revalidatedAt: Date.now(),
        });
      }

      return freshResult;
    } finally {
      this.coalescingMutex.delete(routeKey);
      this.inFlightTimestamps.delete(routeKey);
    }
  }

  /**
   * Extracts all parent route prefixes for layout invalidation tracking.
   * E.g. "route:/blog/post-1" -> ["route:/", "route:/blog"]
   */
  private extractParentPrefixes(routeKey: string): string[] {
    const prefixScheme = routeKey.startsWith('route:') ? 'route:' : '';
    const rawPath = prefixScheme ? routeKey.slice('route:'.length) : routeKey;
    if (!rawPath.startsWith('/') || rawPath === '/') {
      return [];
    }

    const segments = rawPath.split('/').filter(Boolean);
    const prefixes: string[] = [];

    // Root layout prefix
    prefixes.push(`${prefixScheme}/`);

    // Intermediate layout prefixes
    let currentPath = '';
    for (let i = 0; i < segments.length - 1; i++) {
      currentPath += `/${segments[i]}`;
      prefixes.push(`${prefixScheme}${currentPath}`);
    }

    return prefixes;
  }

  private async checkStaleOverwrite(
    routeKey: string,
    tags: string[],
    startedAt: number,
  ): Promise<boolean> {
    // 1. Check if the exact routeKey was invalidated mid-flight
    if (typeof this.cacheStore.getLastInvalidatedAt === 'function') {
      const keyInv = await this.cacheStore.getLastInvalidatedAt(routeKey);
      if (keyInv !== undefined && keyInv >= startedAt) {
        return true;
      }

      // 2. Check if any parent route layout prefix was invalidated mid-flight
      const parentPrefixes = this.extractParentPrefixes(routeKey);
      for (const prefix of parentPrefixes) {
        const prefixInv = await this.cacheStore.getLastInvalidatedAt(prefix);
        if (prefixInv !== undefined && prefixInv >= startedAt) {
          return true;
        }
      }

      // 3. Check if any associated tag was invalidated mid-flight
      for (const tag of tags) {
        const tagInv = await this.cacheStore.getLastInvalidatedAt(tag);
        if (tagInv !== undefined && tagInv >= startedAt) {
          return true;
        }
      }
    }

    // 4. Check if a newer revalidation already committed to this key
    const current = await this.cacheStore.get<CachedRenderResult>(routeKey);
    if (current && current.revalidatedAt > startedAt) {
      return true;
    }

    return false;
  }
}
