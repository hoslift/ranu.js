import { describe, it, expect, vi } from 'vitest';
import React, { useState } from 'react';
import {
  ClientRouterProvider,
  createReadonlySearchParams,
  useRouter,
  usePathname,
  useSearchParams,
  renderReactToStream,
  type RanuRouter,
  type ReadonlyURLSearchParams,
  type RouterState,
  type RouterNavigationActions,
  type RanuHydrationPayload,
} from '../src/index.js';

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  return result;
}

describe('Phase 14 Stage 14A: Router Context, State & Public Hooks', () => {
  describe('ClientRouterProvider & State Initialization', () => {
    it('initializes router state from Phase 13 hydration payload data', async () => {
      const samplePayload: RanuHydrationPayload = {
        buildId: 'b_test_14a',
        routeId: 'blog-post-page',
        pathname: '/blog/first-post',
        params: { slug: 'first-post' },
        searchParams: { view: 'full', filter: ['react', 'node'] },
        publicEnv: { RANU_PUBLIC_APP: 'true' },
        assets: { js: ['/assets/main.js'], css: ['/assets/main.css'] },
      };

      const initialSearch = createReadonlySearchParams(samplePayload.searchParams);
      const initialState: RouterState = {
        pathname: samplePayload.pathname,
        searchParams: initialSearch,
        routeId: samplePayload.routeId,
        params: samplePayload.params,
      };

      let capturedPathname = '';
      let capturedSearch: ReadonlyURLSearchParams | null = null;

      function Consumer(): React.JSX.Element {
        capturedPathname = usePathname();
        capturedSearch = useSearchParams();
        return <div id="rendered">{capturedPathname}</div>;
      }

      function App(): React.JSX.Element {
        return (
          <ClientRouterProvider initialState={initialState}>
            <Consumer />
          </ClientRouterProvider>
        );
      }

      const stream = await renderReactToStream(<App />);
      const html = await streamToString(stream);

      expect(html).toContain('id="rendered"');
      expect(capturedPathname).toBe('/blog/first-post');
      expect(capturedSearch?.get('view')).toBe('full');
      expect(capturedSearch?.getAll('filter')).toEqual(['react', 'node']);
    });

    it('provides safe deterministic fallback state when rendered outside provider', async () => {
      let capturedPathname = '';
      let capturedSearch: ReadonlyURLSearchParams | null = null;
      let capturedRouter: RanuRouter | null = null;

      function OutsideConsumer(): React.JSX.Element {
        capturedPathname = usePathname();
        capturedSearch = useSearchParams();
        capturedRouter = useRouter();
        return <div id="outside">{capturedPathname}</div>;
      }

      const stream = await renderReactToStream(<OutsideConsumer />);
      const html = await streamToString(stream);

      expect(html).toContain('id="outside"');
      expect(capturedPathname).toBe('/');
      expect(capturedSearch?.get('anything')).toBeNull();
      expect(capturedSearch?.has('anything')).toBe(false);
      expect(typeof capturedRouter?.push).toBe('function');
      expect(typeof capturedRouter?.replace).toBe('function');
      expect(typeof capturedRouter?.back).toBe('function');
      expect(typeof capturedRouter?.forward).toBe('function');
      expect(typeof capturedRouter?.refresh).toBe('function');

      // Calling fallback router methods must not throw
      expect(() => capturedRouter?.push('/test')).not.toThrow();
      expect(() => capturedRouter?.replace('/test')).not.toThrow();
      expect(() => capturedRouter?.back()).not.toThrow();
      expect(() => capturedRouter?.forward()).not.toThrow();
      expect(() => capturedRouter?.refresh()).not.toThrow();
    });
  });

  describe('usePathname()', () => {
    it('returns normalized pathname without query parameters or hash', async () => {
      let capturedPathname = '';

      function Consumer(): React.JSX.Element {
        capturedPathname = usePathname();
        return <span>{capturedPathname}</span>;
      }

      function App(): React.JSX.Element {
        return (
          <ClientRouterProvider
            initialState={{
              pathname: '/docs/getting-started',
              searchParams: createReadonlySearchParams({ section: 'intro' }),
              routeId: 'docs-page',
              params: {},
            }}
          >
            <Consumer />
          </ClientRouterProvider>
        );
      }

      const stream = await renderReactToStream(<App />);
      const html = await streamToString(stream);

      expect(html).toContain('/docs/getting-started');
      expect(capturedPathname).toBe('/docs/getting-started');
      expect(capturedPathname).not.toContain('?');
      expect(capturedPathname).not.toContain('#');
    });

    it('updates reactively when router state changes', async () => {
      let capturedPathname = '';

      function Consumer(): React.JSX.Element {
        capturedPathname = usePathname();
        return <span id="path">{capturedPathname}</span>;
      }

      function App({ currentPath }: { readonly currentPath: string }): React.JSX.Element {
        return (
          <ClientRouterProvider
            initialState={{
              pathname: currentPath,
              searchParams: createReadonlySearchParams(),
              routeId: 'page',
              params: {},
            }}
          >
            <Consumer />
          </ClientRouterProvider>
        );
      }

      const stream1 = await renderReactToStream(<App currentPath="/initial" />);
      const html1 = await streamToString(stream1);
      expect(html1).toContain('/initial');
      expect(capturedPathname).toBe('/initial');

      const stream2 = await renderReactToStream(<App currentPath="/updated" />);
      const html2 = await streamToString(stream2);
      expect(html2).toContain('/updated');
      expect(capturedPathname).toBe('/updated');
    });
  });

  describe('useSearchParams() & ReadonlyURLSearchParams', () => {
    it('supports get, getAll, has, entries, keys, values, forEach, toString, and size', () => {
      const search = createReadonlySearchParams({
        category: ['books', 'tech'],
        sort: 'desc',
        page: '1',
        empty: '',
      });

      expect(search.get('sort')).toBe('desc');
      expect(search.get('nonexistent')).toBeNull();
      expect(search.getAll('category')).toEqual(['books', 'tech']);
      expect(search.getAll('nonexistent')).toEqual([]);
      expect(search.has('sort')).toBe(true);
      expect(search.has('nonexistent')).toBe(false);
      expect(search.get('empty')).toBe('');
      expect(search.has('empty')).toBe(true);
      expect(search.size).toBe(5); // 2 category + sort + page + empty

      const keys = Array.from(search.keys());
      expect(keys).toEqual(['category', 'category', 'sort', 'page', 'empty']);

      const values = Array.from(search.values());
      expect(values).toEqual(['books', 'tech', 'desc', '1', '']);

      const entries = Array.from(search.entries());
      expect(entries).toEqual([
        ['category', 'books'],
        ['category', 'tech'],
        ['sort', 'desc'],
        ['page', '1'],
        ['empty', ''],
      ]);

      const iterated: Array<[string, string]> = [];
      for (const entry of search) {
        iterated.push(entry);
      }
      expect(iterated).toEqual(entries);

      const forEachCollected: Record<string, string[]> = {};
      search.forEach((value, key) => {
        if (!forEachCollected[key]) {
          forEachCollected[key] = [];
        }
        forEachCollected[key].push(value);
      });
      expect(forEachCollected['category']).toEqual(['books', 'tech']);
      expect(forEachCollected['sort']).toEqual(['desc']);

      expect(search.toString()).toBe('category=books&category=tech&sort=desc&page=1&empty=');
    });

    it('constructs from standard URLSearchParams instances', () => {
      const native = new URLSearchParams('theme=dark&tab=profile&tab=settings');
      const search = createReadonlySearchParams(native);

      expect(search.get('theme')).toBe('dark');
      expect(search.getAll('tab')).toEqual(['profile', 'settings']);
      expect(search.toString()).toBe('theme=dark&tab=profile&tab=settings');
    });

    it('enforces read-only immutability by omitting mutation methods', () => {
      const search = createReadonlySearchParams({ key: 'val' });

      expect('append' in search).toBe(false);
      expect('delete' in search).toBe(false);
      expect('set' in search).toBe(false);
      expect('sort' in search).toBe(false);
      expect(Object.isFrozen(search)).toBe(true);
    });
  });

  describe('useRouter() Action Delegation', () => {
    it('delegates push, replace, back, forward, and refresh through RouterNavigationActions', async () => {
      const pushSpy = vi.fn();
      const replaceSpy = vi.fn();
      const backSpy = vi.fn();
      const forwardSpy = vi.fn();
      const refreshSpy = vi.fn();

      const actions: RouterNavigationActions = {
        push: pushSpy,
        replace: replaceSpy,
        back: backSpy,
        forward: forwardSpy,
        refresh: refreshSpy,
      };

      let capturedRouter: RanuRouter | null = null;

      function Consumer(): React.JSX.Element {
        capturedRouter = useRouter();
        return <div>consumer</div>;
      }

      function App(): React.JSX.Element {
        return (
          <ClientRouterProvider actions={actions}>
            <Consumer />
          </ClientRouterProvider>
        );
      }

      const stream = await renderReactToStream(<App />);
      await streamToString(stream);

      capturedRouter?.push('/dashboard', { scroll: false });
      expect(pushSpy).toHaveBeenCalledTimes(1);
      expect(pushSpy).toHaveBeenCalledWith('/dashboard', { scroll: false });

      capturedRouter?.replace('/login');
      expect(replaceSpy).toHaveBeenCalledTimes(1);
      expect(replaceSpy).toHaveBeenCalledWith('/login', undefined);

      capturedRouter?.back();
      expect(backSpy).toHaveBeenCalledTimes(1);

      capturedRouter?.forward();
      expect(forwardSpy).toHaveBeenCalledTimes(1);

      capturedRouter?.refresh();
      expect(refreshSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Server Import Safety', () => {
    it('evaluates and imports router hooks without window or document in Node environment', async () => {
      const reactModule = await import('../src/index.js');

      expect(typeof reactModule.useRouter).toBe('function');
      expect(typeof reactModule.usePathname).toBe('function');
      expect(typeof reactModule.useSearchParams).toBe('function');
      expect(typeof reactModule.ClientRouterProvider).toBe('function');
      expect(typeof reactModule.createReadonlySearchParams).toBe('function');
    });
  });
});
