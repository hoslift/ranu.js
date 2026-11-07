import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  registerRequestContextStore,
  type RanuRequestContext,
  type RequestContextStore,
  MemoryCacheStore,
  setActiveCacheStore,
} from '@ranu/runtime';
import { revalidatePath, revalidateTag } from '../src/caching.js';

class TestContextStore implements RequestContextStore {
  private als = new AsyncLocalStorage<RanuRequestContext>();
  run<T>(context: RanuRequestContext, callback: () => T | Promise<T>): T | Promise<T> {
    return this.als.run(context, callback);
  }
  get(): RanuRequestContext | undefined {
    return this.als.getStore();
  }
}

describe('Public Cache Primitives (revalidatePath, revalidateTag)', () => {
  let unregister: (() => void) | undefined;
  let contextStore: TestContextStore;
  let cacheStore: MemoryCacheStore;

  beforeEach(() => {
    contextStore = new TestContextStore();
    unregister = registerRequestContextStore(contextStore);
    cacheStore = new MemoryCacheStore();
    setActiveCacheStore(cacheStore);
  });

  afterEach(() => {
    unregister?.();
    setActiveCacheStore(undefined);
  });

  it('revalidatePath page deletes exact route key', async () => {
    await cacheStore.set('route:/products', 'data', { ttl: 60000 });
    await cacheStore.set('route:/products/item-1', 'child', { ttl: 60000 });

    await revalidatePath('/products', 'page');

    expect(await cacheStore.get('route:/products')).toBeUndefined();
    expect(await cacheStore.get('route:/products/item-1')).toBeDefined();
  });

  it('revalidatePath layout deletes path and all nested children', async () => {
    await cacheStore.set('route:/blog', 'blog root', { ttl: 60000 });
    await cacheStore.set('route:/blog/post-1', 'post 1', { ttl: 60000 });
    await cacheStore.set('route:/blog/post-2', 'post 2', { ttl: 60000 });
    await cacheStore.set('route:/about', 'about', { ttl: 60000 });

    await revalidatePath('/blog', 'layout');

    expect(await cacheStore.get('route:/blog')).toBeUndefined();
    expect(await cacheStore.get('route:/blog/post-1')).toBeUndefined();
    expect(await cacheStore.get('route:/blog/post-2')).toBeUndefined();
    expect(await cacheStore.get('route:/about')).toBeDefined();
  });

  it('revalidateTag deletes all entries with specified tag', async () => {
    await cacheStore.set('route:/p1', 'p1', { ttl: 60000, tags: ['catalog'] });
    await cacheStore.set('route:/p2', 'p2', { ttl: 60000, tags: ['catalog', 'featured'] });
    await cacheStore.set('route:/user', 'u', { ttl: 60000, tags: ['users'] });

    await revalidateTag('catalog');

    expect(await cacheStore.get('route:/p1')).toBeUndefined();
    expect(await cacheStore.get('route:/p2')).toBeUndefined();
    expect(await cacheStore.get('route:/user')).toBeDefined();
  });

  it('revalidateTag throws TypeError on empty or whitespace tag', async () => {
    await expect(revalidateTag('')).rejects.toThrow(TypeError);
    await expect(revalidateTag('   ')).rejects.toThrow(TypeError);
    await expect(revalidateTag(null as any)).rejects.toThrow(TypeError);
  });

  it('revalidatePath and revalidateTag work inside active RanuRequestContext with request-scoped store', async () => {
    const requestScopedStore = new MemoryCacheStore();
    await requestScopedStore.set('route:/dashboard', 'dash', { ttl: 60000, tags: ['dash-tag'] });

    const locals = new Map<string, unknown>();
    locals.set('__ranu_cache_store__', requestScopedStore);

    const mockContext: RanuRequestContext = {
      requestId: 'req-1',
      request: new Request('http://localhost/api/revalidate'),
      url: new URL('http://localhost/api/revalidate'),
      params: {},
      locals,
      signal: new AbortController().signal,
      responseCookies: [],
      waitUntil: () => {},
    };

    await contextStore.run(mockContext, async () => {
      await revalidatePath('/dashboard');
      await revalidateTag('dash-tag');
    });

    expect(await requestScopedStore.get('route:/dashboard')).toBeUndefined();
  });

  it('safely no-ops outside active store without throwing', async () => {
    setActiveCacheStore(undefined);
    await expect(revalidatePath('/some/path')).resolves.toBeUndefined();
    await expect(revalidateTag('some-tag')).resolves.toBeUndefined();
  });
});
