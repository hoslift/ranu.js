import { describe, it, expect } from 'vitest';
import { MemoryCacheStore } from '../src/cache/memory-store.js';

describe('MemoryCacheStore', () => {
  it('sets and retrieves fresh entry with TTL', async () => {
    const store = new MemoryCacheStore();
    await store.set('key-1', { message: 'hello' }, { ttl: 60000 });

    const entry = await store.get<{ message: string }>('key-1');
    expect(entry).toBeDefined();
    expect(entry?.value).toEqual({ message: 'hello' });
    expect(entry?.ttlMs).toBe(60000);
    expect(entry?.tags).toEqual([]);
  });

  it('atomic deleteByTag invalidates all associated keys and returns deleted count', async () => {
    const store = new MemoryCacheStore();
    await store.set('product:1', { name: 'Item 1' }, { ttl: 60000, tags: ['products', 'catalog'] });
    await store.set('product:2', { name: 'Item 2' }, { ttl: 60000, tags: ['products'] });
    await store.set('user:42', { name: 'Alice' }, { ttl: 60000, tags: ['users'] });

    const count = await store.deleteByTag('products');
    expect(count).toBe(2);

    expect(await store.get('product:1')).toBeUndefined();
    expect(await store.get('product:2')).toBeUndefined();
    expect(await store.get('user:42')).toBeDefined();
  });

  it('deleteByPrefix invalidates nested route hierarchies', async () => {
    const store = new MemoryCacheStore();
    await store.set('route:/blog', 'blog root', { ttl: 60000 });
    await store.set('route:/blog/post-1', 'post 1', { ttl: 60000 });
    await store.set('route:/blog/post-2', 'post 2', { ttl: 60000 });
    await store.set('route:/about', 'about', { ttl: 60000 });

    const count = await store.deleteByPrefix('route:/blog');
    expect(count).toBe(3);

    expect(await store.get('route:/blog')).toBeUndefined();
    expect(await store.get('route:/blog/post-1')).toBeUndefined();
    expect(await store.get('route:/blog/post-2')).toBeUndefined();
    expect(await store.get('route:/about')).toBeDefined();
  });

  it('tracks monotonic invalidation timestamps', async () => {
    const store = new MemoryCacheStore();
    const t0 = Date.now();
    await store.set('route:/pricing', 'pricing', { ttl: 60000, tags: ['marketing'] });

    await store.deleteByTag('marketing');
    const tagTimestamp = await store.getLastInvalidatedAt('marketing');
    const keyTimestamp = await store.getLastInvalidatedAt('route:/pricing');

    expect(tagTimestamp).toBeGreaterThanOrEqual(t0);
    expect(keyTimestamp).toBeGreaterThanOrEqual(t0);
  });

  it('cleans tag reverse indices on overwrite and delete', async () => {
    const store = new MemoryCacheStore();
    await store.set('item:1', 'v1', { ttl: 60000, tags: ['tagA', 'tagB'] });
    // Overwrite with only tagA
    await store.set('item:1', 'v2', { ttl: 60000, tags: ['tagA'] });

    // Invalidating tagB should NOT delete item:1 anymore
    const countB = await store.deleteByTag('tagB');
    expect(countB).toBe(0);
    expect(await store.get('item:1')).toBeDefined();

    // Invalidating tagA should delete item:1
    const countA = await store.deleteByTag('tagA');
    expect(countA).toBe(1);
    expect(await store.get('item:1')).toBeUndefined();
  });
});
