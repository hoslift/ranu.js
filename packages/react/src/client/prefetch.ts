import { isSupportedClientProtocol, isSameOrigin, parseTargetURL } from './navigation.js';
import type { RouteLoader, PrefetchOptions, PrefetchService } from '../types.js';

export interface CreatePrefetchServiceOptions {
  readonly loader: RouteLoader;
  readonly matchRoute?: ((pathname: string) => string | null) | undefined;
}

/**
 * Creates a browser PrefetchService that preloads route assets based strictly on trusted metadata.
 */
export function createPrefetchService(options: CreatePrefetchServiceOptions): PrefetchService {
  const { loader, matchRoute } = options;
  const prefetchCache = new Map<string, Promise<boolean>>();

  return {
    async prefetch(href: string, _options?: PrefetchOptions): Promise<boolean> {
      if (typeof href !== 'string' || !href.trim()) {
        return false;
      }

      const trimmed = href.trim();
      const parsed = parseTargetURL(trimmed);
      if (!parsed) {
        return false;
      }

      if (!isSupportedClientProtocol(parsed.protocol)) {
        return false;
      }

      if (!isSameOrigin(parsed)) {
        // Cross-origin URLs are never prefetched by the internal router
        return false;
      }

      // Resolve routeId from pathname using provided matcher or direct pathname
      const pathname = parsed.pathname;
      const routeId = matchRoute ? matchRoute(pathname) : `page:${pathname}`;

      if (!routeId) {
        return false;
      }

      // Check deduplication cache
      const cached = prefetchCache.get(routeId);
      if (cached) {
        return cached;
      }

      const prefetchPromise = (async (): Promise<boolean> => {
        try {
          await loader.loadRouteModule(routeId);
          return true;
        } catch {
          // On failure, evict from cache so future attempts may retry
          prefetchCache.delete(routeId);
          return false;
        }
      })();

      prefetchCache.set(routeId, prefetchPromise);
      return prefetchPromise;
    },
  };
}
