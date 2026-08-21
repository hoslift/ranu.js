import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createTransitionCoordinator,
  createReadonlySearchParams,
} from '../src/index.js';
import type { RouteLoader, RouterState } from '../src/types.js';

describe('Phase 14 Stage 14C: Client Transition Coordinator & Concurrency Semantics', () => {
  let originalWindow: typeof window;
  let mockLocation: { href: string; pathname: string; search: string; origin: string; replace: ReturnType<typeof vi.fn> };
  let pushStateSpy: ReturnType<typeof vi.fn>;
  let replaceStateSpy: ReturnType<typeof vi.fn>;
  let scrollToSpy: ReturnType<typeof vi.fn>;
  let fallbackSpy: ReturnType<typeof vi.fn>;
  let currentState: RouterState;
  let onStateUpdateSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockLocation = {
      href: 'http://localhost:3000/home',
      pathname: '/home',
      search: '',
      origin: 'http://localhost:3000',
      replace: vi.fn(),
    };

    pushStateSpy = vi.fn();
    replaceStateSpy = vi.fn();
    scrollToSpy = vi.fn();
    fallbackSpy = vi.fn();

    currentState = {
      pathname: '/home',
      searchParams: createReadonlySearchParams(),
      routeId: 'page:/home',
      params: {},
    };

    onStateUpdateSpy = vi.fn((update: (prev: RouterState) => RouterState) => {
      currentState = update(currentState);
    });

    originalWindow = globalThis.window;
    globalThis.window = {
      location: mockLocation,
      history: {
        pushState: pushStateSpy,
        replaceState: replaceStateSpy,
        back: vi.fn(),
        forward: vi.fn(),
        state: {},
      },
      scrollTo: scrollToSpy,
    } as unknown as typeof window;
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  it('performs successful transition: loads chunk, updates history, and commits RouterState', async () => {
    const mockLoader: RouteLoader = {
      loadRouteModule: vi.fn().mockResolvedValue({ default: () => null }),
      getRouteAssets: vi.fn(),
    };

    const coordinator = createTransitionCoordinator({
      loader: mockLoader,
      onStateUpdate: onStateUpdateSpy,
      fallbackToNative: fallbackSpy,
    });

    const success = await coordinator.navigate('/dashboard?tab=analytics', 'push', { scroll: true });

    expect(success).toBe(true);
    expect(mockLoader.loadRouteModule).toHaveBeenCalledWith('page:/dashboard');
    expect(pushStateSpy).toHaveBeenCalledWith({}, '', '/dashboard?tab=analytics');
    expect(currentState.pathname).toBe('/dashboard');
    expect(currentState.searchParams.get('tab')).toBe('analytics');
    expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
    expect(fallbackSpy).not.toHaveBeenCalled();
  });

  it('enforces latest-navigation-wins: stale async result does not overwrite newer navigation', async () => {
    let resolveFirst: (value: unknown) => void;
    let resolveSecond: (value: unknown) => void;

    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const secondPromise = new Promise((resolve) => {
      resolveSecond = resolve;
    });

    const mockLoader: RouteLoader = {
      loadRouteModule: vi.fn((routeId: string) => {
        if (routeId === 'page:/slow') return firstPromise as any;
        if (routeId === 'page:/fast') return secondPromise as any;
        return Promise.resolve({ default: () => null });
      }),
      getRouteAssets: vi.fn(),
    };

    const coordinator = createTransitionCoordinator({
      loader: mockLoader,
      onStateUpdate: onStateUpdateSpy,
      fallbackToNative: fallbackSpy,
    });

    // Start slow navigation #1
    const nav1Promise = coordinator.navigate('/slow', 'push');

    // Immediately start fast navigation #2 before #1 finishes
    const nav2Promise = coordinator.navigate('/fast', 'push');

    // Resolve second navigation first
    resolveSecond!({ default: () => 'Fast' });
    const nav2Result = await nav2Promise;
    expect(nav2Result).toBe(true);
    expect(currentState.pathname).toBe('/fast');

    // Now resolve slow navigation #1 later
    resolveFirst!({ default: () => 'Slow' });
    const nav1Result = await nav1Promise;

    // Navigation #1 was superseded, so its commit was aborted
    expect(nav1Result).toBe(false);
    expect(currentState.pathname).toBe('/fast'); // Did NOT overwrite fast!
  });

  it('falls back to native document navigation when chunk load fails', async () => {
    const mockLoader: RouteLoader = {
      loadRouteModule: vi.fn().mockRejectedValue(new Error('Bundle missing on server')),
      getRouteAssets: vi.fn(),
    };

    const coordinator = createTransitionCoordinator({
      loader: mockLoader,
      onStateUpdate: onStateUpdateSpy,
      fallbackToNative: fallbackSpy,
    });

    const success = await coordinator.navigate('/missing-page', 'push');

    expect(success).toBe(false);
    expect(fallbackSpy).toHaveBeenCalledTimes(1);
    expect(fallbackSpy).toHaveBeenCalledWith('/missing-page', false);
    // Router state must remain untouched on failure
    expect(currentState.pathname).toBe('/home');
    expect(pushStateSpy).not.toHaveBeenCalled();
  });

  it('falls back to native document navigation on cross-origin URLs immediately', async () => {
    const mockLoader: RouteLoader = {
      loadRouteModule: vi.fn(),
      getRouteAssets: vi.fn(),
    };

    const coordinator = createTransitionCoordinator({
      loader: mockLoader,
      onStateUpdate: onStateUpdateSpy,
      fallbackToNative: fallbackSpy,
    });

    const success = await coordinator.navigate('https://external-site.com/docs', 'replace');

    expect(success).toBe(false);
    expect(fallbackSpy).toHaveBeenCalledWith('https://external-site.com/docs', true);
    expect(mockLoader.loadRouteModule).not.toHaveBeenCalled();
    expect(currentState.pathname).toBe('/home');
  });
});
