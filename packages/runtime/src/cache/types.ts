/**
 * Cached value entry with metadata.
 */
export interface CacheEntry<T = unknown> {
  readonly value: T;
  readonly createdAt: number;
  readonly revalidatedAt: number;
  readonly ttlMs: number;
  readonly tags: readonly string[];
  readonly staleWhileRevalidateMs?: number | undefined;
}

/**
 * Interface contract for cache stores supporting tag invalidation and monotonic timestamps.
 */
export interface CacheStore {
  get<T>(key: string): Promise<CacheEntry<T> | undefined>;
  set<T>(
    key: string,
    value: T,
    options: {
      ttl: number; // TTL in milliseconds
      tags?: string[];
      swr?: number;
      revalidatedAt?: number;
    },
  ): Promise<void>;
  delete(key: string): Promise<void>;
  deleteByTag(tag: string): Promise<number>;
  deleteByPrefix(prefix: string): Promise<number>;
  recordInvalidation?(keyOrTag: string, timestamp: number): Promise<void>;
  getLastInvalidatedAt?(keyOrTag: string): Promise<number | undefined>;
  clear?(): Promise<void>;
}

/**
 * Serialized representation of a rendered page response for Route Cache.
 */
export interface CachedRenderResult {
  readonly body: string;
  readonly status: number;
  readonly statusText: string;
  readonly headers: [string, string][];
}
