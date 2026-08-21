import {
  parseTargetURL,
  isSupportedClientProtocol,
  isSameOrigin,
  performScroll,
} from './navigation.js';
import { createReadonlySearchParams } from './router-context.js';
import type {
  RouteLoader,
  RouterState,
  NavigateOptions,
  LoadedRouteModule,
} from '../types.js';

export interface TransitionCoordinatorOptions {
  readonly loader?: RouteLoader | undefined;
  readonly matchRoute?: ((pathname: string) => { routeId: string; params: Record<string, string | string[]> } | null) | undefined;
  readonly onStateUpdate: (update: (prev: RouterState) => RouterState) => void;
  readonly fallbackToNative?: ((href: string, replace?: boolean) => void) | undefined;
}

export interface TransitionCoordinator {
  navigate(href: string, mode: 'push' | 'replace', options?: NavigateOptions): Promise<boolean>;
  getActiveNavigationId(): number;
}

/**
 * Creates a client transition coordinator enforcing transaction-like commits,
 * latest-navigation-wins concurrency semantics, and graceful native document fallbacks.
 */
export function createTransitionCoordinator(
  options: TransitionCoordinatorOptions
): TransitionCoordinator {
  const { loader, matchRoute, onStateUpdate, fallbackToNative } = options;
  let activeNavigationId = 0;

  const defaultNativeFallback = (href: string, replace?: boolean): void => {
    if (typeof window === 'undefined') return;
    if (replace) {
      window.location.replace(href);
    } else {
      window.location.href = href;
    }
  };

  const triggerFallback = fallbackToNative ?? defaultNativeFallback;

  return {
    getActiveNavigationId(): number {
      return activeNavigationId;
    },

    async navigate(
      href: string,
      mode: 'push' | 'replace',
      options?: NavigateOptions
    ): Promise<boolean> {
      const navigationId = ++activeNavigationId;

      if (typeof href !== 'string' || !href.trim()) {
        return false;
      }

      const trimmed = href.trim();
      const parsed = parseTargetURL(trimmed);
      if (!parsed) {
        triggerFallback(trimmed, mode === 'replace');
        return false;
      }

      if (!isSupportedClientProtocol(parsed.protocol)) {
        triggerFallback(trimmed, mode === 'replace');
        return false;
      }

      if (!isSameOrigin(parsed)) {
        triggerFallback(trimmed, mode === 'replace');
        return false;
      }

      const pathname = parsed.pathname;
      const match = matchRoute ? matchRoute(pathname) : null;
      const routeId = match?.routeId ?? `page:${pathname}`;
      const params = match?.params ?? {};

      // If a route loader is provided, ensure route chunk loads before committing state
      let _loadedModule: LoadedRouteModule | undefined;
      if (loader) {
        try {
          _loadedModule = await loader.loadRouteModule(routeId);
        } catch {
          // If chunk loading fails and this navigation is still current, perform hard fallback
          if (navigationId === activeNavigationId) {
            triggerFallback(trimmed, mode === 'replace');
          }
          return false;
        }
      }

      // Check concurrency: if another navigation started during the async load, abort commit
      if (navigationId !== activeNavigationId) {
        return false;
      }

      // Commit history change in browser
      if (typeof window !== 'undefined') {
        if (mode === 'replace') {
          window.history.replaceState({}, '', trimmed);
        } else {
          window.history.pushState({}, '', trimmed);
        }
      }

      // Commit RouterState update
      onStateUpdate((prev) => {
        return {
          pathname: parsed.pathname,
          searchParams: createReadonlySearchParams(parsed.searchParams),
          routeId,
          params: Object.keys(params).length > 0 ? params : prev.params,
        };
      });

      // Handle scroll policy
      if (typeof window !== 'undefined') {
        performScroll(parsed, options?.scroll);
      }

      return true;
    },
  };
}
