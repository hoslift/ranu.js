import { describe, it, expect, vi } from 'vitest';
import { MemoryCacheStore } from '../src/cache/memory-store.js';
import { RouteCacheManager, type CachedRenderResult } from '../src/cache/route-cache.js';

describe('RouteCacheManager — Single-Flight Coalescing Mutex', () => {
  it('coalesces 100 concurrent requests into exactly ONE render execution on cache miss', async () => {
    const store = new MemoryCacheStore();
    const routeCache = new RouteCacheManager(store);

    let renderCalls = 0;
    const renderFn = vi.fn(async (): Promise<CachedRenderResult> => {
      renderCalls++;
      // Artificial async delay simulating server rendering / database queries
      await new Promise((resolve) => setTimeout(resolve, 25));
      return {
        body: '<html>Rendered Page</html>',
        status: 200,
        statusText: 'OK',
        headers: [['content-type', 'text/html']],
      };
    });

    // Fire 100 concurrent requests
    const promises = Array.from({ length: 100 }, () =>
      routeCache.getOrRevalidate('route:/catalog', 60, ['catalog'], renderFn),
    );

    const results = await Promise.all(promises);

    // Exactly 1 render call executed
    expect(renderCalls).toBe(1);
    expect(renderFn).toHaveBeenCalledTimes(1);

    // All 100 requests received the identical result
    for (const res of results) {
      expect(res.result.body).toBe('<html>Rendered Page</html>');
      expect(res.result.status).toBe(200);
      expect(res.isStale).toBe(false);
      expect(res.isHit).toBe(false);
    }

    // Subsequent request is a fresh hit without executing render
    const nextResult = await routeCache.getOrRevalidate('route:/catalog', 60, ['catalog'], renderFn);
    expect(nextResult.isHit).toBe(true);
    expect(nextResult.isStale).toBe(false);
    expect(renderCalls).toBe(1);
  });

  it('SWR returns stale data immediately and triggers single-flight background revalidation without dogpiling', async () => {
    const store = new MemoryCacheStore();
    const routeCache = new RouteCacheManager(store);

    // Seed expired entry (revalidatedAt 100 seconds ago, TTL 30s)
    const expiredTimestamp = Date.now() - 100000;
    await store.set(
      'route:/news',
      {
        body: '<html>Stale News</html>',
        status: 200,
        statusText: 'OK',
        headers: [['content-type', 'text/html']],
      },
      { ttl: 30000, tags: ['news'], revalidatedAt: expiredTimestamp },
    );

    let backgroundCalls = 0;
    const renderFn = vi.fn(async (): Promise<CachedRenderResult> => {
      backgroundCalls++;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return {
        body: '<html>Fresh News</html>',
        status: 200,
        statusText: 'OK',
        headers: [['content-type', 'text/html']],
      };
    });

    // 10 concurrent requests arrive for stale route
    const concurrentRequests = Array.from({ length: 10 }, () =>
      routeCache.getOrRevalidate('route:/news', 30, ['news'], renderFn),
    );

    const responses = await Promise.all(concurrentRequests);

    // All receive stale data immediately
    for (const res of responses) {
      expect(res.isHit).toBe(true);
      expect(res.isStale).toBe(true);
      expect(res.result.body).toBe('<html>Stale News</html>');
    }

    // Wait for background revalidation to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Background revalidation executed exactly once (no dogpiling)
    expect(backgroundCalls).toBe(1);

    // Subsequent request gets the fresh cache hit
    const freshRes = await routeCache.getOrRevalidate('route:/news', 30, ['news'], renderFn);
    expect(freshRes.isHit).toBe(true);
    expect(freshRes.isStale).toBe(false);
    expect(freshRes.result.body).toBe('<html>Fresh News</html>');
  });
});
