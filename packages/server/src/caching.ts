import { getActiveRequestContext, getActiveCacheStore, type CacheStore } from '@ranu/runtime';

export type RevalidatePathType = 'page' | 'layout';

/**
 * Resolves the currently active CacheStore instance, either from request context or global store.
 */
function resolveCacheStore(): CacheStore | undefined {
  const context = getActiveRequestContext();
  if (context && context.locals.has('__ranu_cache_store__')) {
    const store = context.locals.get('__ranu_cache_store__');
    if (store && typeof (store as any).delete === 'function') {
      return store as CacheStore;
    }
  }
  return getActiveCacheStore();
}

/**
 * Normalizes a URL path for cache invalidation.
 */
function normalizePath(rawPath: string): string {
  if (!rawPath) return '/';
  const withLeading = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  if (withLeading !== '/' && withLeading.endsWith('/')) {
    return withLeading.slice(0, -1);
  }
  return withLeading;
}

/**
 * Purges cached route entries for a given path.
 *
 * @param path - The route path to revalidate (e.g. "/products" or "/blog/[slug]")
 * @param type - Invalidation scope: 'page' evicts exact route, 'layout' evicts path and all child routes
 */
export async function revalidatePath(
  path: string,
  type: RevalidatePathType = 'page',
): Promise<void> {
  const store = resolveCacheStore();
  if (!store) {
    return;
  }

  const cleanPath = normalizePath(path);
  const routeKey = `route:${cleanPath}`;

  if (type === 'layout') {
    await store.deleteByPrefix(routeKey);
  } else {
    await store.delete(routeKey);
  }
}

/**
 * Purges all cached entries tagged with the given tag.
 *
 * @param tag - Non-empty string tag identifying associated route or data cache entries
 */
export async function revalidateTag(tag: string): Promise<void> {
  if (!tag || typeof tag !== 'string' || !tag.trim()) {
    throw new TypeError('revalidateTag requires a non-empty string tag.');
  }

  const store = resolveCacheStore();
  if (!store) {
    return;
  }

  await store.deleteByTag(tag.trim());
}
