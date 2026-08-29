import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type {
  RouterState,
  RouterNavigationActions,
  ReadonlyURLSearchParams,
  NavigateOptions,
  RouteLoader,
  PrefetchService,
  PrefetchOptions,
} from '../types.js';
import { createBrowserNavigationActions, setupPopstateListener } from './navigation.js';
import { createPrefetchService } from './prefetch.js';
import { createTransitionCoordinator } from './transition.js';

/**
 * Creates a frozen, read-only wrapper around URL search parameters.
 */
export function createReadonlySearchParams(
  params: URLSearchParams | Record<string, string | readonly string[] | undefined> = {}
): ReadonlyURLSearchParams {
  const search = new URLSearchParams();
  if (params instanceof URLSearchParams) {
    params.forEach((value, key) => search.append(key, value));
  } else {
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        for (const v of value) {
          search.append(key, v);
        }
      } else if (typeof value === 'string') {
        search.append(key, value);
      }
    }
  }

  const readonlyParams: ReadonlyURLSearchParams = {
    get(name: string): string | null {
      return search.get(name);
    },
    getAll(name: string): readonly string[] {
      return search.getAll(name);
    },
    has(name: string): boolean {
      return search.has(name);
    },
    entries(): IterableIterator<[string, string]> {
      return search.entries();
    },
    keys(): IterableIterator<string> {
      return search.keys();
    },
    values(): IterableIterator<string> {
      return search.values();
    },
    forEach(callback: (value: string, key: string) => void): void {
      search.forEach(callback);
    },
    toString(): string {
      return search.toString();
    },
    get size(): number {
      return search.size;
    },
    [Symbol.iterator](): IterableIterator<[string, string]> {
      return search[Symbol.iterator]();
    },
  };

  return Object.freeze(readonlyParams);
}

export interface RouterContextValue {
  readonly state: RouterState;
  readonly actions: RouterNavigationActions;
  readonly prefetch?: ((href: string, options?: PrefetchOptions) => Promise<boolean>) | undefined;
}

const fallbackActions: RouterNavigationActions = {
  push: (_href: string, _options?: NavigateOptions): void => {},
  replace: (_href: string, _options?: NavigateOptions): void => {},
  back: (): void => {},
  forward: (): void => {},
  refresh: (): void => {},
};

const fallbackState: RouterState = {
  pathname: '/',
  searchParams: createReadonlySearchParams(),
  routeId: '',
  params: {},
};

export const ClientRouterContext = createContext<RouterContextValue | null>(null);

export interface ClientRouterProviderProps {
  readonly initialState?: Partial<RouterState> | undefined;
  readonly actions?: Partial<RouterNavigationActions> | undefined;
  readonly loader?: RouteLoader | undefined;
  readonly prefetchService?: PrefetchService | undefined;
  readonly children: React.ReactNode;
}

export function ClientRouterProvider({
  initialState,
  actions,
  loader,
  prefetchService,
  children,
}: ClientRouterProviderProps): React.JSX.Element {
  const [state, setState] = useState<RouterState>({
    pathname: initialState?.pathname ?? '/',
    searchParams: initialState?.searchParams ?? createReadonlySearchParams(),
    routeId: initialState?.routeId ?? '',
    params: initialState?.params ?? {},
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    return setupPopstateListener(setState);
  }, []);

  const transitionCoordinator = useMemo(() => {
    if (!loader) return null;
    return createTransitionCoordinator({
      loader,
      onStateUpdate: setState,
    });
  }, [loader]);

  const activePrefetchService = useMemo(() => {
    if (prefetchService) return prefetchService;
    if (loader) {
      return createPrefetchService({ loader });
    }
    return null;
  }, [prefetchService, loader]);

  const browserActions = useMemo<RouterNavigationActions>(() => {
    if (transitionCoordinator) {
      return {
        push: (href: string, options?: NavigateOptions): void => {
          void transitionCoordinator.navigate(href, 'push', options);
        },
        replace: (href: string, options?: NavigateOptions): void => {
          void transitionCoordinator.navigate(href, 'replace', options);
        },
        back: (): void => {
          if (typeof window !== 'undefined') window.history.back();
        },
        forward: (): void => {
          if (typeof window !== 'undefined') window.history.forward();
        },
        refresh: (): void => {
          if (typeof window !== 'undefined') window.location.reload();
        },
      };
    }
    return createBrowserNavigationActions(setState);
  }, [transitionCoordinator]);

  const mergedActions = useMemo<RouterNavigationActions>(
    () => ({
      push: (href: string, options?: NavigateOptions): void =>
        actions?.push ? actions.push(href, options) : browserActions.push(href, options),
      replace: (href: string, options?: NavigateOptions): void =>
        actions?.replace ? actions.replace(href, options) : browserActions.replace(href, options),
      back: (): void => (actions?.back ? actions.back() : browserActions.back()),
      forward: (): void => (actions?.forward ? actions.forward() : browserActions.forward()),
      refresh: (): void => (actions?.refresh ? actions.refresh() : browserActions.refresh()),
    }),
    [actions, browserActions]
  );

  const prefetchCallback = useMemo(() => {
    if (!activePrefetchService) return undefined;
    return (href: string, options?: PrefetchOptions) => activePrefetchService.prefetch(href, options);
  }, [activePrefetchService]);

  const contextValue = useMemo<RouterContextValue>(
    () => {
      const val: RouterContextValue = {
        state,
        actions: mergedActions,
      };
      if (prefetchCallback) {
        (val as { prefetch?: typeof prefetchCallback }).prefetch = prefetchCallback;
      }
      return val;
    },
    [state, mergedActions, prefetchCallback]
  );

  return (
    <ClientRouterContext.Provider value={contextValue}>
      {children}
    </ClientRouterContext.Provider>
  );
}

export function useClientRouterContext(): RouterContextValue {
  const ctx = useContext(ClientRouterContext);
  if (!ctx) {
    return {
      state: fallbackState,
      actions: fallbackActions,
    };
  }
  return ctx;
}
