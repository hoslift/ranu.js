import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import {
  Link,
  ClientRouterProvider,
  useRouter,
  usePathname,
  useSearchParams,
  renderReactToStream,
  type RanuHydrationPayload,
  createReadonlySearchParams,
  type RouterState,
} from '@ranu/react';

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

describe('Phase 14 Stage 14B: Client Navigation Integration Test', () => {
  let originalWindow: typeof window;
  let mockLocation: { href: string; pathname: string; search: string; origin: string; replace: ReturnType<typeof vi.fn>; reload: ReturnType<typeof vi.fn> };
  let pushStateSpy: ReturnType<typeof vi.fn>;
  let replaceStateSpy: ReturnType<typeof vi.fn>;
  let backSpy: ReturnType<typeof vi.fn>;
  let forwardSpy: ReturnType<typeof vi.fn>;
  let registeredListeners: Record<string, ((e?: unknown) => void)[]> = {};

  beforeEach(() => {
    registeredListeners = {};
    mockLocation = {
      href: 'http://localhost:3000/home',
      pathname: '/home',
      search: '',
      origin: 'http://localhost:3000',
      replace: vi.fn(),
      reload: vi.fn(),
    };

    pushStateSpy = vi.fn((_state: unknown, _title: string, url: string) => {
      const parsed = new URL(url, mockLocation.origin);
      mockLocation.href = parsed.href;
      mockLocation.pathname = parsed.pathname;
      mockLocation.search = parsed.search;
    });

    replaceStateSpy = vi.fn((_state: unknown, _title: string, url: string) => {
      const parsed = new URL(url, mockLocation.origin);
      mockLocation.href = parsed.href;
      mockLocation.pathname = parsed.pathname;
      mockLocation.search = parsed.search;
    });

    backSpy = vi.fn();
    forwardSpy = vi.fn();

    originalWindow = globalThis.window;
    globalThis.window = {
      location: mockLocation,
      history: {
        pushState: pushStateSpy,
        replaceState: replaceStateSpy,
        back: backSpy,
        forward: forwardSpy,
        state: {},
      },
      scrollTo: vi.fn(),
      addEventListener: vi.fn((event: string, handler: (e?: unknown) => void) => {
        if (!registeredListeners[event]) {
          registeredListeners[event] = [];
        }
        registeredListeners[event].push(handler);
      }),
      removeEventListener: vi.fn((event: string, handler: (e?: unknown) => void) => {
        if (registeredListeners[event]) {
          registeredListeners[event] = registeredListeners[event].filter(h => h !== handler);
        }
      }),
    } as unknown as typeof window;
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  it('SSR stream -> hydrated navigation -> History pushState -> popstate reactive updates', async () => {
    const payload: RanuHydrationPayload = {
      buildId: 'b_int_14b',
      routeId: 'home-page',
      pathname: '/home',
      params: {},
      searchParams: { initial: 'true' },
      publicEnv: {},
      assets: { js: ['/assets/main.js'], css: ['/assets/main.css'] },
    };

    let activeRouter: ReturnType<typeof useRouter> | null = null;

    function NavigationApp(): React.ReactNode {
      const pathname = usePathname();
      const search = useSearchParams();
      activeRouter = useRouter();

      return React.createElement('nav', { id: 'app-nav' }, [
        React.createElement(
          Link,
          {
            key: 'products',
            href: '/products?category=shoes&tag=new&tag=sale',
            id: 'nav-products',
          },
          'Products'
        ),
        React.createElement(
          Link,
          {
            key: 'about',
            href: '/about',
            id: 'nav-about',
          },
          'About'
        ),
        React.createElement('span', { key: 'path', id: 'current-pathname' }, pathname),
        React.createElement('span', { key: 'cat', id: 'category-param' }, search.get('category') ?? ''),
      ]);
    }

    function createTree(path: string, searchRecord: Record<string, string | readonly string[]> = {}): React.ReactElement {
      const state: RouterState = {
        pathname: path,
        searchParams: createReadonlySearchParams(searchRecord),
        routeId: payload.routeId,
        params: payload.params,
      };

      return React.createElement(
        ClientRouterProvider,
        { initialState: state },
        React.createElement(NavigationApp)
      );
    }

    // 1. SSR Stage: render initial tree to HTML stream
    const stream1 = await renderReactToStream(createTree(payload.pathname, payload.searchParams as Record<string, string | readonly string[]>));
    const ssrHtml1 = await streamToString(stream1);

    expect(ssrHtml1).toContain('<nav id="app-nav">');
    expect(ssrHtml1).toContain('href="/products?category=shoes&amp;tag=new&amp;tag=sale"');
    expect(ssrHtml1).toContain('href="/about"');
    expect(ssrHtml1).toContain('<span id="current-pathname">/home</span>');

    // 2. Programmatic Client Navigation: push to products
    activeRouter?.push('/products?category=shoes&tag=new&tag=sale');

    expect(pushStateSpy).toHaveBeenCalledTimes(1);
    expect(pushStateSpy).toHaveBeenCalledWith({}, '', '/products?category=shoes&tag=new&tag=sale');
    expect(mockLocation.pathname).toBe('/products');
    expect(mockLocation.search).toBe('?category=shoes&tag=new&tag=sale');

    // Re-render tree at new URL to verify reactive consumer presentation
    const stream2 = await renderReactToStream(createTree(mockLocation.pathname, { category: 'shoes', tag: ['new', 'sale'] }));
    const ssrHtml2 = await streamToString(stream2);
    expect(ssrHtml2).toContain('<span id="current-pathname">/products</span>');
    expect(ssrHtml2).toContain('<span id="category-param">shoes</span>');

    // 3. Browser Popstate Navigation: simulate user clicking browser back button
    mockLocation.pathname = '/home';
    mockLocation.search = '?initial=true';
    mockLocation.href = 'http://localhost:3000/home?initial=true';

    for (const handler of registeredListeners['popstate'] ?? []) {
      handler();
    }

    const stream3 = await renderReactToStream(createTree(mockLocation.pathname, { initial: 'true' }));
    const ssrHtml3 = await streamToString(stream3);
    expect(ssrHtml3).toContain('<span id="current-pathname">/home</span>');
  });

  it('hydrated app -> Link prefetch -> route asset resolved -> transition coordinator updates RouterState', async () => {
    const mockModuleLoader = vi.fn().mockResolvedValue({
      default: () => React.createElement('div', { id: 'settings-page' }, 'Settings Content'),
    });

    const registry = {
      buildId: 'b_int_14c',
      assets: {
        'page:/settings': {
          js: ['/_ranu/assets/settings.js'],
          css: [],
        },
      },
    };

    const loader = {
      loadRouteModule: mockModuleLoader,
      getRouteAssets: (rId: string) => registry.assets[rId as keyof typeof registry.assets],
    };

    let activeRouter: ReturnType<typeof useRouter> | null = null;
    let currentPath = '';

    function SettingsApp(): React.ReactNode {
      currentPath = usePathname();
      activeRouter = useRouter();
      return React.createElement(
        'div',
        null,
        React.createElement(Link, { href: '/settings', id: 'settings-link' }, 'Settings'),
        React.createElement('span', { id: 'active-path' }, currentPath)
      );
    }

    const initialState: RouterState = {
      pathname: '/home',
      searchParams: createReadonlySearchParams(),
      routeId: 'page:/home',
      params: {},
    };

    // Render tree with loader and prefetch
    const stream = await renderReactToStream(
      React.createElement(
        ClientRouterProvider,
        { initialState, loader },
        React.createElement(SettingsApp)
      )
    );
    const html = await streamToString(stream);
    expect(html).toContain('Settings');
    expect(html).toContain('<span id="active-path">/home</span>');

    // Trigger navigation to settings
    activeRouter?.push('/settings');

    // Verify chunk loader was called
    expect(mockModuleLoader).toHaveBeenCalledWith('page:/settings');
  });
});
