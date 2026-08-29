import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createBrowserNavigationActions,
  setupPopstateListener,
  isSameOrigin,
  isSupportedClientProtocol,
  parseTargetURL,
  createReadonlySearchParams,
} from '../src/index.js';
import type { RouterState } from '../src/types.js';

describe('Phase 14 Stage 14B: Browser Navigation Coordinator & History API', () => {
  let originalWindow: typeof window;
  let mockHistoryState: Record<string, unknown> = {};
  let mockLocation: { href: string; pathname: string; search: string; origin: string; replace: ReturnType<typeof vi.fn>; reload: ReturnType<typeof vi.fn> };
  let pushStateSpy: ReturnType<typeof vi.fn>;
  let replaceStateSpy: ReturnType<typeof vi.fn>;
  let backSpy: ReturnType<typeof vi.fn>;
  let forwardSpy: ReturnType<typeof vi.fn>;
  let scrollToSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockHistoryState = {};
    pushStateSpy = vi.fn((state: unknown, _title: string, url: string) => {
      mockHistoryState = (state as Record<string, unknown>) ?? {};
      const parsed = new URL(url, mockLocation.origin);
      mockLocation.href = parsed.href;
      mockLocation.pathname = parsed.pathname;
      mockLocation.search = parsed.search;
    });
    replaceStateSpy = vi.fn((state: unknown, _title: string, url: string) => {
      mockHistoryState = (state as Record<string, unknown>) ?? {};
      const parsed = new URL(url, mockLocation.origin);
      mockLocation.href = parsed.href;
      mockLocation.pathname = parsed.pathname;
      mockLocation.search = parsed.search;
    });
    backSpy = vi.fn();
    forwardSpy = vi.fn();
    scrollToSpy = vi.fn();

    mockLocation = {
      href: 'http://localhost:3000/initial',
      pathname: '/initial',
      search: '',
      origin: 'http://localhost:3000',
      replace: vi.fn((url: string) => {
        mockLocation.href = url;
      }),
      reload: vi.fn(),
    };

    // Polyfill window object for Node test runner
    originalWindow = globalThis.window;
    globalThis.window = {
      location: mockLocation,
      history: {
        pushState: pushStateSpy,
        replaceState: replaceStateSpy,
        back: backSpy,
        forward: forwardSpy,
        state: mockHistoryState,
      },
      scrollTo: scrollToSpy,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as typeof window;
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  describe('URL & Origin Classification', () => {
    it('accurately identifies same-origin vs cross-origin URLs', () => {
      const sameOriginUrl = new URL('http://localhost:3000/about');
      const crossOriginUrl = new URL('https://example.com/about');
      const portMismatchUrl = new URL('http://localhost:8080/about');

      expect(isSameOrigin(sameOriginUrl, 'http://localhost:3000')).toBe(true);
      expect(isSameOrigin(crossOriginUrl, 'http://localhost:3000')).toBe(false);
      expect(isSameOrigin(portMismatchUrl, 'http://localhost:3000')).toBe(false);
    });

    it('identifies supported client-routing protocols', () => {
      expect(isSupportedClientProtocol('http:')).toBe(true);
      expect(isSupportedClientProtocol('https:')).toBe(true);
      expect(isSupportedClientProtocol('mailto:')).toBe(false);
      expect(isSupportedClientProtocol('javascript:')).toBe(false);
      expect(isSupportedClientProtocol('tel:')).toBe(false);
      expect(isSupportedClientProtocol('blob:')).toBe(false);
    });

    it('safely parses relative and absolute target URLs', () => {
      const relative = parseTargetURL('/dashboard?user=alice');
      expect(relative?.pathname).toBe('/dashboard');
      expect(relative?.search).toBe('?user=alice');

      const absolute = parseTargetURL('http://localhost:3000/settings');
      expect(absolute?.pathname).toBe('/settings');
    });
  });

  describe('History Actions: push() & replace()', () => {
    it('executes pushState, updates router state, and scrolls to top on same-origin navigation', () => {
      let currentState: RouterState = {
        pathname: '/initial',
        searchParams: createReadonlySearchParams(),
        routeId: 'page-1',
        params: {},
      };

      const setState = vi.fn((update: (prev: RouterState) => RouterState) => {
        currentState = update(currentState);
      });

      const actions = createBrowserNavigationActions(setState as unknown as React.Dispatch<React.SetStateAction<RouterState>>);

      actions.push('/dashboard?view=grid');

      expect(pushStateSpy).toHaveBeenCalledTimes(1);
      expect(pushStateSpy).toHaveBeenCalledWith({}, '', '/dashboard?view=grid');
      expect(setState).toHaveBeenCalledTimes(1);
      expect(currentState.pathname).toBe('/dashboard');
      expect(currentState.searchParams.get('view')).toBe('grid');
      expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
    });

    it('executes replaceState without scroll when scroll option is false', () => {
      let currentState: RouterState = {
        pathname: '/initial',
        searchParams: createReadonlySearchParams(),
        routeId: 'page-1',
        params: {},
      };

      const setState = vi.fn((update: (prev: RouterState) => RouterState) => {
        currentState = update(currentState);
      });

      const actions = createBrowserNavigationActions(setState as unknown as React.Dispatch<React.SetStateAction<RouterState>>);

      actions.replace('/settings', { scroll: false });

      expect(replaceStateSpy).toHaveBeenCalledTimes(1);
      expect(replaceStateSpy).toHaveBeenCalledWith({}, '', '/settings');
      expect(currentState.pathname).toBe('/settings');
      expect(scrollToSpy).not.toHaveBeenCalled();
    });

    it('falls back to native window.location for cross-origin targets on push', () => {
      let currentState: RouterState = {
        pathname: '/initial',
        searchParams: createReadonlySearchParams(),
        routeId: 'page-1',
        params: {},
      };

      const setState = vi.fn();
      const actions = createBrowserNavigationActions(setState as unknown as React.Dispatch<React.SetStateAction<RouterState>>);

      actions.push('https://external-auth.com/login');

      expect(pushStateSpy).not.toHaveBeenCalled();
      expect(setState).not.toHaveBeenCalled();
      expect(mockLocation.href).toBe('https://external-auth.com/login');
    });
  });

  describe('History Actions: back(), forward(), and refresh()', () => {
    it('delegates back and forward to window.history methods', () => {
      const setState = vi.fn();
      const actions = createBrowserNavigationActions(setState as unknown as React.Dispatch<React.SetStateAction<RouterState>>);

      actions.back();
      expect(backSpy).toHaveBeenCalledTimes(1);

      actions.forward();
      expect(forwardSpy).toHaveBeenCalledTimes(1);
    });

    it('delegates refresh to window.location.reload() under V1 approved semantics', () => {
      const setState = vi.fn();
      const actions = createBrowserNavigationActions(setState as unknown as React.Dispatch<React.SetStateAction<RouterState>>);

      actions.refresh();
      expect(mockLocation.reload).toHaveBeenCalledTimes(1);
    });
  });

  describe('popstate Event Listener', () => {
    it('attaches listener, synchronizes router state on popstate event, and removes listener on cleanup', () => {
      let registeredHandler: (() => void) | null = null;
      (globalThis.window.addEventListener as ReturnType<typeof vi.fn>).mockImplementation((event: string, handler: () => void) => {
        if (event === 'popstate') {
          registeredHandler = handler;
        }
      });

      let currentState: RouterState = {
        pathname: '/initial',
        searchParams: createReadonlySearchParams(),
        routeId: 'page-1',
        params: {},
      };

      const setState = vi.fn((update: (prev: RouterState) => RouterState) => {
        currentState = update(currentState);
      });

      const cleanup = setupPopstateListener(setState as unknown as React.Dispatch<React.SetStateAction<RouterState>>);

      expect(globalThis.window.addEventListener).toHaveBeenCalledWith('popstate', expect.any(Function));

      // Simulate browser back button navigation changing location
      mockLocation.pathname = '/previous-page';
      mockLocation.search = '?tab=history';
      mockLocation.href = 'http://localhost:3000/previous-page?tab=history';

      // Trigger popstate event
      registeredHandler?.();

      expect(setState).toHaveBeenCalledTimes(1);
      expect(currentState.pathname).toBe('/previous-page');
      expect(currentState.searchParams.get('tab')).toBe('history');

      // Cleanup
      cleanup();
      expect(globalThis.window.removeEventListener).toHaveBeenCalledWith('popstate', expect.any(Function));
    });
  });

  describe('Duplicate Search Parameters Preservation', () => {
    it('preserves multi-value search parameters on navigation and popstate', () => {
      let currentState: RouterState = {
        pathname: '/search',
        searchParams: createReadonlySearchParams(),
        routeId: 'search-page',
        params: {},
      };

      const setState = vi.fn((update: (prev: RouterState) => RouterState) => {
        currentState = update(currentState);
      });

      const actions = createBrowserNavigationActions(setState as unknown as React.Dispatch<React.SetStateAction<RouterState>>);

      actions.push('/search?tag=react&tag=node&tag=web');

      expect(currentState.pathname).toBe('/search');
      expect(currentState.searchParams.getAll('tag')).toEqual(['react', 'node', 'web']);
      expect(currentState.searchParams.toString()).toBe('tag=react&tag=node&tag=web');
    });
  });
});
