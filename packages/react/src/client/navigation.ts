import type { RouterState, RouterNavigationActions, NavigateOptions } from '../types.js';
import { createReadonlySearchParams } from './router-context.js';

/**
 * Checks if a mouse event involves modifier keys (Ctrl, Shift, Alt, Meta/Cmd).
 */
export function isModifiedEvent(event: React.MouseEvent | MouseEvent): boolean {
  return Boolean(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey);
}

/**
 * Checks if a mouse event is a primary left-click.
 */
export function isLeftClick(event: React.MouseEvent | MouseEvent): boolean {
  return event.button === 0;
}

/**
 * Checks if a URL is on the same origin as the current document.
 */
export function isSameOrigin(url: URL, baseOrigin?: string): boolean {
  const currentOrigin = baseOrigin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return url.origin === currentOrigin;
}

/**
 * Checks if the protocol is supported for client-side routing (http: or https:).
 */
export function isSupportedClientProtocol(protocol: string): boolean {
  return protocol === 'http:' || protocol === 'https:';
}

/**
 * Safely parses and normalizes a target href against the current document URL.
 */
export function parseTargetURL(href: string): URL | null {
  if (typeof window === 'undefined') return null;
  try {
    return new URL(href, window.location.href);
  } catch {
    return null;
  }
}

/**
 * Performs default scroll restoration or scrolls to hash target.
 */
export function performScroll(url: URL, scrollOption?: boolean): void {
  if (scrollOption === false || typeof window === 'undefined') return;

  if (url.hash) {
    const id = decodeURIComponent(url.hash.slice(1));
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView();
      return;
    }
  }

  window.scrollTo(0, 0);
}

/**
 * Creates the browser-aware navigation actions that interface with the HTML5 History API.
 */
export function createBrowserNavigationActions(
  setState: React.Dispatch<React.SetStateAction<RouterState>>
): RouterNavigationActions {
  return {
    push(href: string, options?: NavigateOptions): void {
      if (typeof window === 'undefined') return;

      const targetURL = parseTargetURL(href);
      if (!targetURL || !isSameOrigin(targetURL) || !isSupportedClientProtocol(targetURL.protocol)) {
        window.location.href = href;
        return;
      }

      window.history.pushState({}, '', href);
      const searchParams = createReadonlySearchParams(targetURL.searchParams);
      setState(prev => ({
        ...prev,
        pathname: targetURL.pathname,
        searchParams,
      }));

      performScroll(targetURL, options?.scroll);
    },

    replace(href: string, options?: NavigateOptions): void {
      if (typeof window === 'undefined') return;

      const targetURL = parseTargetURL(href);
      if (!targetURL || !isSameOrigin(targetURL) || !isSupportedClientProtocol(targetURL.protocol)) {
        window.location.replace(href);
        return;
      }

      window.history.replaceState({}, '', href);
      const searchParams = createReadonlySearchParams(targetURL.searchParams);
      setState(prev => ({
        ...prev,
        pathname: targetURL.pathname,
        searchParams,
      }));

      performScroll(targetURL, options?.scroll);
    },

    back(): void {
      if (typeof window !== 'undefined') {
        window.history.back();
      }
    },

    forward(): void {
      if (typeof window !== 'undefined') {
        window.history.forward();
      }
    },

    refresh(): void {
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    },
  };
}

/**
 * Sets up a popstate event listener on the browser window to synchronize router state with history navigation.
 */
export function setupPopstateListener(
  setState: React.Dispatch<React.SetStateAction<RouterState>>
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handlePopstate = (): void => {
    try {
      const url = new URL(window.location.href);
      const searchParams = createReadonlySearchParams(url.searchParams);
      setState(prev => ({
        ...prev,
        pathname: url.pathname,
        searchParams,
      }));
    } catch {
      // Ignore URL parse error on popstate
    }
  };

  window.addEventListener('popstate', handlePopstate);
  return () => {
    window.removeEventListener('popstate', handlePopstate);
  };
}
