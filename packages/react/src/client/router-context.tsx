import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type {
  RouterState,
  RouterNavigationActions,
  ReadonlyURLSearchParams,
  NavigateOptions,
} from '../types.js';
import { createBrowserNavigationActions, setupPopstateListener } from './navigation.js';

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
  readonly children: React.ReactNode;
}

export function ClientRouterProvider({
  initialState,
  actions,
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

  const browserActions = useMemo<RouterNavigationActions>(() => {
    return createBrowserNavigationActions(setState);
  }, []);

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

  const contextValue = useMemo<RouterContextValue>(
    () => ({
      state,
      actions: mergedActions,
    }),
    [state, mergedActions]
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
