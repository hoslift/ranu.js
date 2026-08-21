import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPrefetchService } from '../src/index.js';
import type { RouteLoader } from '../src/types.js';

describe('Phase 14 Stage 14C: Prefetch Engine & Deduplication Cache', () => {
  let originalWindow: typeof window;
  let mockLoader: RouteLoader;
  let loadRouteModuleSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    loadRouteModuleSpy = vi.fn().mockResolvedValue({ default: () => null });
    mockLoader = {
      loadRouteModule: loadRouteModuleSpy,
      getRouteAssets: vi.fn(),
    };

    originalWindow = globalThis.window;
    globalThis.window = {
      location: {
        origin: 'http://localhost:3000',
        href: 'http://localhost:3000/',
      },
    } as unknown as typeof window;
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  it('prefetches internal same-origin route module', async () => {
    const prefetchService = createPrefetchService({
      loader: mockLoader,
    });

    const result = await prefetchService.prefetch('/about');
    expect(result).toBe(true);
    expect(loadRouteModuleSpy).toHaveBeenCalledTimes(1);
    expect(loadRouteModuleSpy).toHaveBeenCalledWith('page:/about');
  });

  it('deduplicates concurrent and repeated prefetch requests for the same route', async () => {
    const prefetchService = createPrefetchService({
      loader: mockLoader,
    });

    const [res1, res2, res3] = await Promise.all([
      prefetchService.prefetch('/products'),
      prefetchService.prefetch('/products'),
      prefetchService.prefetch('/products'),
    ]);

    expect(res1).toBe(true);
    expect(res2).toBe(true);
    expect(res3).toBe(true);
    expect(loadRouteModuleSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT prefetch external cross-origin links', async () => {
    const prefetchService = createPrefetchService({
      loader: mockLoader,
    });

    const result = await prefetchService.prefetch('https://external.com/docs');
    expect(result).toBe(false);
    expect(loadRouteModuleSpy).not.toHaveBeenCalled();
  });

  it('does NOT prefetch unsafe or special schemes (javascript:, mailto:, tel:)', async () => {
    const prefetchService = createPrefetchService({
      loader: mockLoader,
    });

    expect(await prefetchService.prefetch('javascript:alert(1)')).toBe(false);
    expect(await prefetchService.prefetch('mailto:test@example.com')).toBe(false);
    expect(await prefetchService.prefetch('tel:1234567890')).toBe(false);
    expect(await prefetchService.prefetch('data:text/html,bad')).toBe(false);
    expect(loadRouteModuleSpy).not.toHaveBeenCalled();
  });

  it('evicts failed prefetches from cache so subsequent navigation/prefetch can retry', async () => {
    let callCount = 0;
    loadRouteModuleSpy.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error('Chunk fetch error'));
      }
      return Promise.resolve({ default: () => null });
    });

    const prefetchService = createPrefetchService({
      loader: mockLoader,
    });

    // 1. Initial attempt fails gracefully without throwing fatal error
    const firstResult = await prefetchService.prefetch('/blog');
    expect(firstResult).toBe(false);
    expect(loadRouteModuleSpy).toHaveBeenCalledTimes(1);

    // 2. Second attempt retries and succeeds
    const secondResult = await prefetchService.prefetch('/blog');
    expect(secondResult).toBe(true);
    expect(loadRouteModuleSpy).toHaveBeenCalledTimes(2);
  });

  it('uses custom matchRoute function when provided', async () => {
    const customMatcher = vi.fn((pathname: string) => {
      if (pathname.startsWith('/items/')) return 'page:/items/[id]';
      return `page:${pathname}`;
    });

    const prefetchService = createPrefetchService({
      loader: mockLoader,
      matchRoute: customMatcher,
    });

    const result = await prefetchService.prefetch('/items/42');
    expect(result).toBe(true);
    expect(customMatcher).toHaveBeenCalledWith('/items/42');
    expect(loadRouteModuleSpy).toHaveBeenCalledWith('page:/items/[id]');
  });
});
