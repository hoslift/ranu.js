import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  registerRequestContextStore,
  type RanuRequestContext,
  type RequestContextStore,
  MemoryCacheStore,
  RouteCacheManager,
  setActiveCacheStore as setSrcActiveCacheStore,
  type CachedRenderResult,
} from '../src/index.js';
import { setActiveCacheStore as setDistActiveCacheStore } from '@ranu/runtime';
import { revalidatePath, revalidateTag } from '../../server/src/caching.js';

class TestContextStore implements RequestContextStore {
  private als = new AsyncLocalStorage<RanuRequestContext>();
  run<T>(context: RanuRequestContext, callback: () => T | Promise<T>): T | Promise<T> {
    return this.als.run(context, callback);
  }
  get(): RanuRequestContext | undefined {
    return this.als.getStore();
  }
}

describe('Adversarial Stress Harness: RouteCacheManager & Invalidation Primitives', () => {
  let unregister: (() => void) | undefined;
  let contextStore: TestContextStore;
  let cacheStore: MemoryCacheStore;
  let routeCache: RouteCacheManager;

  beforeEach(() => {
    contextStore = new TestContextStore();
    unregister = registerRequestContextStore(contextStore);
    cacheStore = new MemoryCacheStore();
    setSrcActiveCacheStore(cacheStore);
    setDistActiveCacheStore(cacheStore);
    routeCache = new RouteCacheManager(cacheStore);
  });

  afterEach(() => {
    unregister?.();
    setSrcActiveCacheStore(undefined);
    setDistActiveCacheStore(undefined);
  });

  describe('1. Cache Stampede / Dogpiling Elimination', () => {
    it('coalesces 200 concurrent requests on cold cache miss into exactly 1 render execution', async () => {
      let renderCalls = 0;
      const renderFn = vi.fn(async (): Promise<CachedRenderResult> => {
        renderCalls++;
        await new Promise((resolve) => setTimeout(resolve, 40));
        return {
          body: '<html>Stampede Test</html>',
          status: 200,
          statusText: 'OK',
          headers: [['content-type', 'text/html; charset=utf-8']],
        };
      });

      const promises = Array.from({ length: 200 }, () =>
        routeCache.getOrRevalidate('route:/catalog', 60, ['catalog'], renderFn),
      );

      const results = await Promise.all(promises);

      expect(renderCalls).toBe(1);
      expect(renderFn).toHaveBeenCalledTimes(1);

      for (const res of results) {
        expect(res.result.body).toBe('<html>Stampede Test</html>');
        expect(res.result.status).toBe(200);
        expect(res.isStale).toBe(false);
        expect(res.isHit).toBe(false);
      }

      // Subsequent 50 requests get instant fresh cache hits without re-rendering
      const subsequent = await Promise.all(
        Array.from({ length: 50 }, () =>
          routeCache.getOrRevalidate('route:/catalog', 60, ['catalog'], renderFn),
        ),
      );

      expect(renderCalls).toBe(1);
      for (const res of subsequent) {
        expect(res.isHit).toBe(true);
        expect(res.isStale).toBe(false);
      }
    });

    it('coalesces 200 concurrent requests on stale SWR entry into exactly 1 background render', async () => {
      const expiredTimestamp = Date.now() - 120000;
      await cacheStore.set(
        'route:/pricing',
        {
          body: '<html>Stale Pricing</html>',
          status: 200,
          statusText: 'OK',
          headers: [],
        },
        { ttl: 30000, tags: ['pricing'], revalidatedAt: expiredTimestamp },
      );

      let bgRenderCalls = 0;
      const renderFn = vi.fn(async (): Promise<CachedRenderResult> => {
        bgRenderCalls++;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          body: '<html>Fresh Pricing</html>',
          status: 200,
          statusText: 'OK',
          headers: [],
        };
      });

      const promises = Array.from({ length: 200 }, () =>
        routeCache.getOrRevalidate('route:/pricing', 30, ['pricing'], renderFn),
      );

      const responses = await Promise.all(promises);

      // All 200 requests receive stale data immediately
      for (const res of responses) {
        expect(res.isHit).toBe(true);
        expect(res.isStale).toBe(true);
        expect(res.result.body).toBe('<html>Stale Pricing</html>');
      }

      // Wait for background render to finish
      await new Promise((resolve) => setTimeout(resolve, 80));

      expect(bgRenderCalls).toBe(1);

      // Next request gets the freshly committed data
      const next = await routeCache.getOrRevalidate('route:/pricing', 30, ['pricing'], renderFn);
      expect(next.isHit).toBe(true);
      expect(next.isStale).toBe(false);
      expect(next.result.body).toBe('<html>Fresh Pricing</html>');
    });

    it('isolates concurrent stampedes across different routes without cross-talk', async () => {
      const renderCallsMap = new Map<string, number>();

      const createRender = (id: string) => {
        return vi.fn(async (): Promise<CachedRenderResult> => {
          renderCallsMap.set(id, (renderCallsMap.get(id) ?? 0) + 1);
          await new Promise((resolve) => setTimeout(resolve, 30));
          return {
            body: `Content for ${id}`,
            status: 200,
            statusText: 'OK',
            headers: [],
          };
        });
      };

      const renderA = createRender('route-a');
      const renderB = createRender('route-b');
      const renderC = createRender('route-c');

      const batchA = Array.from({ length: 40 }, () =>
        routeCache.getOrRevalidate('route:/a', 60, ['tag-a'], renderA),
      );
      const batchB = Array.from({ length: 40 }, () =>
        routeCache.getOrRevalidate('route:/b', 60, ['tag-b'], renderB),
      );
      const batchC = Array.from({ length: 40 }, () =>
        routeCache.getOrRevalidate('route:/c', 60, ['tag-c'], renderC),
      );

      const [resA, resB, resC] = await Promise.all([
        Promise.all(batchA),
        Promise.all(batchB),
        Promise.all(batchC),
      ]);

      expect(renderCallsMap.get('route-a')).toBe(1);
      expect(renderCallsMap.get('route-b')).toBe(1);
      expect(renderCallsMap.get('route-c')).toBe(1);

      for (const r of resA) expect(r.result.body).toBe('Content for route-a');
      for (const r of resB) expect(r.result.body).toBe('Content for route-b');
      for (const r of resC) expect(r.result.body).toBe('Content for route-c');
    });

    it('releases mutex cleanly on renderFn exception and propagates error to all waiting callers', async () => {
      let renderAttempts = 0;
      const failingRender = vi.fn(async (): Promise<CachedRenderResult> => {
        renderAttempts++;
        await new Promise((resolve) => setTimeout(resolve, 30));
        throw new Error('Database connection failed during render');
      });

      const promises = Array.from({ length: 50 }, () =>
        routeCache.getOrRevalidate('route:/error-route', 60, ['error'], failingRender),
      );

      const settled = await Promise.allSettled(promises);

      // All 50 concurrent callers receive the rejected error
      for (const s of settled) {
        expect(s.status).toBe('rejected');
        if (s.status === 'rejected') {
          expect(s.reason.message).toBe('Database connection failed during render');
        }
      }

      expect(renderAttempts).toBe(1);

      // Mutex was unlocked in finally block; subsequent attempt can render successfully
      const successRender = vi.fn(async (): Promise<CachedRenderResult> => {
        return {
          body: 'Recovered body',
          status: 200,
          statusText: 'OK',
          headers: [],
        };
      });

      const recovered = await routeCache.getOrRevalidate('route:/error-route', 60, ['error'], successRender);
      expect(recovered.result.body).toBe('Recovered body');
      expect(recovered.isHit).toBe(false);
    });

    it('does not return Error object as CachedRenderResult when cache miss awaits a failing background revalidation', async () => {
      await cacheStore.set(
        'route:/bg-fail',
        {
          body: 'Stale Data',
          status: 200,
          statusText: 'OK',
          headers: [],
        },
        { ttl: 10000, tags: [], revalidatedAt: Date.now() - 50000 },
      );

      const failingRender = async (): Promise<CachedRenderResult> => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        throw new Error('Async background render crash');
      };

      const swrRes = await routeCache.getOrRevalidate('route:/bg-fail', 10, [], failingRender);
      expect(swrRes.isStale).toBe(true);

      // Invalidate mid-flight at T=10ms
      await new Promise((resolve) => setTimeout(resolve, 10));
      await cacheStore.delete('route:/bg-fail');

      // Request 2 arrives while background revalidation is in-flight:
      let req2: any;
      try {
        req2 = await routeCache.getOrRevalidate('route:/bg-fail', 10, [], failingRender);
      } catch {
        req2 = { result: null };
      }

      // If it returned a lookup result, the result must NOT be an Error object!
      expect(req2.result instanceof Error).toBe(false);
    });
  });

  describe('2. Stale Overwrite Race Conditions & Monotonic Timestamps', () => {
    it('discards slow background render when revalidatePath evicts route mid-flight', async () => {
      const oldTimestamp = Date.now() - 50000;
      await cacheStore.set(
        'route:/items',
        {
          body: 'Old Items',
          status: 200,
          statusText: 'OK',
          headers: [],
        },
        { ttl: 10000, tags: ['items'], revalidatedAt: oldTimestamp },
      );

      // Trigger SWR with slow 60ms render
      const swrPromise = routeCache.getOrRevalidate(
        'route:/items',
        10,
        ['items'],
        async (): Promise<CachedRenderResult> => {
          await new Promise((resolve) => setTimeout(resolve, 60));
          return {
            body: 'Slow Stale Render',
            status: 200,
            statusText: 'OK',
            headers: [],
          };
        },
      );

      const initial = await swrPromise;
      expect(initial.isStale).toBe(true);

      // Mid-flight invalidation at T=15ms
      await new Promise((resolve) => setTimeout(resolve, 15));
      await revalidatePath('/items', 'page');

      // Wait for slow render to complete at T=75ms
      await new Promise((resolve) => setTimeout(resolve, 75));

      // Assert stale render was discarded and not committed
      const stored = await cacheStore.get('route:/items');
      expect(stored).toBeUndefined();
    });

    it('discards slow background render when revalidateTag evicts associated tag mid-flight', async () => {
      const oldTimestamp = Date.now() - 50000;
      await cacheStore.set(
        'route:/shop/shoes',
        {
          body: 'Old Shoes',
          status: 200,
          statusText: 'OK',
          headers: [],
        },
        { ttl: 10000, tags: ['shoes', 'storefront'], revalidatedAt: oldTimestamp },
      );

      await routeCache.getOrRevalidate(
        'route:/shop/shoes',
        10,
        ['shoes', 'storefront'],
        async (): Promise<CachedRenderResult> => {
          await new Promise((resolve) => setTimeout(resolve, 60));
          return {
            body: 'Slow Stale Shoes',
            status: 200,
            statusText: 'OK',
            headers: [],
          };
        },
      );

      // Invalidate by secondary tag 'storefront' at T=15ms
      await new Promise((resolve) => setTimeout(resolve, 15));
      await revalidateTag('storefront');

      // Wait for background render to finish
      await new Promise((resolve) => setTimeout(resolve, 75));

      // Assert entry is not committed
      const stored = await cacheStore.get('route:/shop/shoes');
      expect(stored).toBeUndefined();
    });

    it('preserves newer commit when an older slow render finishes later (monotonic ordering)', async () => {
      // Simulate Render 1 starting at T=0 (slow, 70ms)
      const render1Promise = routeCache.getOrRevalidate(
        'route:/race',
        60,
        ['race'],
        async (): Promise<CachedRenderResult> => {
          await new Promise((resolve) => setTimeout(resolve, 70));
          return {
            body: 'Slow Old Render (T=0)',
            status: 200,
            statusText: 'OK',
            headers: [],
          };
        },
      );

      // Wait 15ms, then manually simulate a newer commit (T=15) with revalidatedAt = Date.now()
      await new Promise((resolve) => setTimeout(resolve, 15));
      const committedTimestamp = Date.now();
      await cacheStore.set(
        'route:/race',
        {
          body: 'Fast Fresh Render (T=15)',
          status: 200,
          statusText: 'OK',
          headers: [],
        },
        { ttl: 60000, tags: ['race'], revalidatedAt: committedTimestamp },
      );

      // Wait for Render 1 to complete at T=85ms
      await render1Promise;
      await new Promise((resolve) => setTimeout(resolve, 80));

      // Assert that Fast Fresh Render was NOT overwritten by the slower older render
      const stored = await cacheStore.get<CachedRenderResult>('route:/race');
      expect(stored).toBeDefined();
      expect(stored?.value.body).toBe('Fast Fresh Render (T=15)');
    });

    it('commits successfully when invalidation occurred BEFORE render began', async () => {
      // Invalidation at T=0
      await revalidatePath('/fresh', 'page');

      // Wait 10ms, then render begins at T=10
      await new Promise((resolve) => setTimeout(resolve, 10));
      const res = await routeCache.getOrRevalidate(
        'route:/fresh',
        60,
        ['fresh'],
        async (): Promise<CachedRenderResult> => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return {
            body: 'Fresh Render After Invalidation',
            status: 200,
            statusText: 'OK',
            headers: [],
          };
        },
      );

      expect(res.result.body).toBe('Fresh Render After Invalidation');
      expect(res.isHit).toBe(false);

      // Since render started AFTER invalidation, it MUST be committed to cache
      const stored = await cacheStore.get<CachedRenderResult>('route:/fresh');
      expect(stored).toBeDefined();
      expect(stored?.value.body).toBe('Fresh Render After Invalidation');
    });

    it('discards stale render when layout prefix invalidation occurs mid-flight on existing entry', async () => {
      const oldTimestamp = Date.now() - 50000;
      await cacheStore.set(
        'route:/blog/post-1',
        {
          body: 'Old Post 1',
          status: 200,
          statusText: 'OK',
          headers: [],
        },
        { ttl: 10000, tags: ['blog'], revalidatedAt: oldTimestamp },
      );

      // Trigger SWR
      await routeCache.getOrRevalidate(
        'route:/blog/post-1',
        10,
        ['blog'],
        async (): Promise<CachedRenderResult> => {
          await new Promise((resolve) => setTimeout(resolve, 60));
          return {
            body: 'Fresh Post 1 Render',
            status: 200,
            statusText: 'OK',
            headers: [],
          };
        },
      );

      // Mid-flight layout invalidation of /blog parent
      await new Promise((resolve) => setTimeout(resolve, 15));
      await revalidatePath('/blog', 'layout');

      // Wait for slow render to complete
      await new Promise((resolve) => setTimeout(resolve, 75));

      // Post 1 was evicted by deleteByPrefix and its invalidation timestamp recorded; must not be committed!
      const stored = await cacheStore.get('route:/blog/post-1');
      expect(stored).toBeUndefined();
    });

    it('discards stale render when layout prefix invalidation occurs mid-flight on COLD cache miss', async () => {
      // route:/blog/cold-post is completely absent from cache store
      expect(await cacheStore.get('route:/blog/cold-post')).toBeUndefined();

      // Cold miss triggers slow render (60ms)
      const renderPromise = routeCache.getOrRevalidate(
        'route:/blog/cold-post',
        10,
        [],
        async (): Promise<CachedRenderResult> => {
          await new Promise((resolve) => setTimeout(resolve, 60));
          return {
            body: 'Cold Post Render with Stale Layout',
            status: 200,
            statusText: 'OK',
            headers: [],
          };
        },
      );

      // Mid-flight layout invalidation of /blog parent at T=15ms
      await new Promise((resolve) => setTimeout(resolve, 15));
      await revalidatePath('/blog', 'layout');

      // Wait for slow render to complete
      await renderPromise;

      const stored = await cacheStore.get('route:/blog/cold-post');
      expect(stored).toBeUndefined();
    });
  });

  describe('3. Invalidation Granularity & Validation', () => {
    it('revalidatePath page evicts ONLY the exact route, preserving child routes and sibling routes', async () => {
      await cacheStore.set('route:/admin', 'admin-root', { ttl: 60000 });
      await cacheStore.set('route:/admin/users', 'admin-users', { ttl: 60000 });
      await cacheStore.set('route:/admin-other', 'admin-other', { ttl: 60000 });

      await revalidatePath('/admin', 'page');

      expect(await cacheStore.get('route:/admin')).toBeUndefined();
      expect(await cacheStore.get('route:/admin/users')).toBeDefined();
      expect(await cacheStore.get('route:/admin-other')).toBeDefined();
    });

    it('revalidatePath layout evicts the route and all child route prefixes, but NOT sibling prefixes', async () => {
      await cacheStore.set('route:/docs', 'docs-root', { ttl: 60000 });
      await cacheStore.set('route:/docs/intro', 'docs-intro', { ttl: 60000 });
      await cacheStore.set('route:/docs/api/v1', 'docs-api-v1', { ttl: 60000 });
      await cacheStore.set('route:/docs-legacy', 'docs-legacy', { ttl: 60000 });
      await cacheStore.set('route:/doc', 'doc-unrelated', { ttl: 60000 });

      await revalidatePath('/docs', 'layout');

      expect(await cacheStore.get('route:/docs')).toBeUndefined();
      expect(await cacheStore.get('route:/docs/intro')).toBeUndefined();
      expect(await cacheStore.get('route:/docs/api/v1')).toBeUndefined();
      // Crucial: /docs-legacy and /doc must NOT be evicted by /docs prefix
      expect(await cacheStore.get('route:/docs-legacy')).toBeDefined();
      expect(await cacheStore.get('route:/doc')).toBeDefined();
    });

    it('normalizes trailing slashes so /products/ evicts /products', async () => {
      await cacheStore.set('route:/products', 'data', { ttl: 60000 });
      await revalidatePath('/products/', 'page');
      expect(await cacheStore.get('route:/products')).toBeUndefined();
    });

    it('revalidateTag evicts all routes tagged with the given tag in O(1)', async () => {
      await cacheStore.set('route:/p1', 'p1', { ttl: 60000, tags: ['promo', 'apparel'] });
      await cacheStore.set('route:/p2', 'p2', { ttl: 60000, tags: ['apparel'] });
      await cacheStore.set('route:/p3', 'p3', { ttl: 60000, tags: ['electronics'] });

      await revalidateTag('apparel');

      expect(await cacheStore.get('route:/p1')).toBeUndefined();
      expect(await cacheStore.get('route:/p2')).toBeUndefined();
      expect(await cacheStore.get('route:/p3')).toBeDefined();
    });

    it('revalidateTag rejects empty strings, whitespace, and non-strings with TypeError', async () => {
      await expect(revalidateTag('')).rejects.toThrow(TypeError);
      await expect(revalidateTag('   ')).rejects.toThrow(TypeError);
      await expect(revalidateTag('\t\n')).rejects.toThrow(TypeError);
      await expect(revalidateTag(null as any)).rejects.toThrow(TypeError);
      await expect(revalidateTag(undefined as any)).rejects.toThrow(TypeError);
      await expect(revalidateTag(42 as any)).rejects.toThrow(TypeError);
      await expect(revalidateTag({} as any)).rejects.toThrow(TypeError);
    });

    it('cleans up reverse key tag tracking when a key is individually deleted', async () => {
      await cacheStore.set('route:/tagged-page', 'data', { ttl: 60000, tags: ['shared-tag'] });
      await cacheStore.delete('route:/tagged-page');

      // Re-invoking deleteByTag should return 0 deleted entries
      const count = await cacheStore.deleteByTag('shared-tag');
      expect(count).toBe(0);
    });
  });
});
