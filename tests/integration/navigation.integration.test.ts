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

    const initialState: RouterState = {
      pathname: payload.pathname,
      searchParams: createReadonlySearchParams(payload.searchParams),
      routeId: payload.routeId,
      params: payload.params,
    };

    let activePathname = '';
    let activeSearch: ReturnType<typeof useSearchParams> | null = null;
    let activeRouter: ReturnType<typeof useRouter> | null = null;

    function NavigationApp(): React.ReactNode {
      activePathname = usePathname();
      activeSearch = useSearchParams();
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
        React.createElement('span', { key: 'path', id: 'current-pathname' }, activePathname),
      ]);
    }

    function RootApp(): React.ReactNode {
      return React.createElement(
        ClientRouterProvider,
        { initialState },
        React.createElement(NavigationApp)
      );
    }

    // 1. SSR Stage: render tree to HTML stream
    const stream = await renderReactToStream(React.createElement(RootApp));
    const ssrHtml = await streamToString(stream);

    expect(ssrHtml).toContain('<nav id="app-nav">');
    expect(ssrHtml).toContain('href="/products?category=shoes&amp;tag=new&amp;tag=sale"');
    expect(ssrHtml).toContain('href="/about"');
    expect(ssrHtml).toContain('<span id="current-pathname">/home</span>');

    // 2. Programmatic Client Navigation: push to products
    activeRouter?.push('/products?category=shoes&tag=new&tag=sale');

    expect(pushStateSpy).toHaveBeenCalledTimes(1);
    expect(pushStateSpy).toHaveBeenCalledWith({}, '', '/products?category=shoes&tag=new&tag=sale');
    expect(activePathname).toBe('/products');
    expect(activeSearch?.get('category')).toBe('shoes');
    expect(activeSearch?.getAll('tag')).toEqual(['new', 'sale']);

    // 3. Browser Popstate Navigation: simulate user clicking browser back button
    mockLocation.pathname = '/home';
    mockLocation.search = '?initial=true';
    mockLocation.href = 'http://localhost:3000/home?initial=true';

    for (const handler of registeredListeners['popstate'] ?? []) {
      handler();
    }

    expect(activePathname).toBe('/home');
    expect(activeSearch?.get('initial')).toBe('true');
  });
});
