import { describe, it, expect } from 'vitest';
import { MemoryCacheStore } from '../src/cache/memory-store.js';
import { RouteCacheManager, type CachedRenderResult } from '../src/cache/route-cache.js';

describe('RouteCacheManager — Monotonic Version Timestamping Guard', () => {
  it('discards stale background render when route key is invalidated mid-flight', async () => {
    const store = new MemoryCacheStore();
    const routeCache = new RouteCacheManager(store);

    // Initial expired cache entry
    const oldTimestamp = Date.now() - 50000;
    await store.set(
      'route:/products',
      {
        body: '<html>Old Products</html>',
        status: 200,
        statusText: 'OK',
        headers: [],
      },
      { ttl: 10000, tags: ['products'], revalidatedAt: oldTimestamp },
    );

    // Trigger SWR with slow render (60ms)
    const renderPromise = routeCache.getOrRevalidate(
      'route:/products',
      10,
      ['products'],
      async (): Promise<CachedRenderResult> => {
        await new Promise((resolve) => setTimeout(resolve, 60));
        return {
          body: '<html>Slow Stale Render</html>',
          status: 200,
          statusText: 'OK',
          headers: [],
        };
      },
    );

    const initial = await renderPromise;
    expect(initial.isStale).toBe(true);

    // Mid-flight user mutation at T=15ms via revalidatePath
    await new Promise((resolve) => setTimeout(resolve, 15));
    await store.delete('route:/products');

    // Wait for slow render to finish at T=70ms
    await new Promise((resolve) => setTimeout(resolve, 70));

    // Stale render should have been discarded (conditional commit rejected)
    const entryAfter = await store.get('route:/products');
    expect(entryAfter).toBeUndefined();
  });

  it('discards stale background render when associated tag is invalidated mid-flight', async () => {
    const store = new MemoryCacheStore();
    const routeCache = new RouteCacheManager(store);

    const oldTimestamp = Date.now() - 50000;
    await store.set(
      'route:/categories/shoes',
      {
        body: '<html>Old Shoes</html>',
        status: 200,
        statusText: 'OK',
        headers: [],
      },
      { ttl: 10000, tags: ['shoes', 'catalog'], revalidatedAt: oldTimestamp },
    );

    // Trigger SWR
    await routeCache.getOrRevalidate(
      'route:/categories/shoes',
      10,
      ['shoes', 'catalog'],
      async (): Promise<CachedRenderResult> => {
        await new Promise((resolve) => setTimeout(resolve, 60));
        return {
          body: '<html>Slow Stale Shoes</html>',
          status: 200,
          statusText: 'OK',
          headers: [],
        };
      },
    );

    // Mid-flight invalidation of tag 'catalog'
    await new Promise((resolve) => setTimeout(resolve, 15));
    await store.deleteByTag('catalog');

    // Wait for background render to finish
    await new Promise((resolve) => setTimeout(resolve, 70));

    // Stale render discarded
    const entryAfter = await store.get('route:/categories/shoes');
    expect(entryAfter).toBeUndefined();
  });
});
