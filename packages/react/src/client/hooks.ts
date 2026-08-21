import { useClientRouterContext } from './router-context.js';
import type { RanuRouter, ReadonlyURLSearchParams } from '../types.js';

/**
 * Access the client navigation router methods.
 */
export function useRouter(): RanuRouter {
  const { actions } = useClientRouterContext();
  return actions;
}

/**
 * Access the normalized current URL pathname without query string or hash.
 */
export function usePathname(): string {
  const { state } = useClientRouterContext();
  return state.pathname;
}

/**
 * Access the immutable read-only search parameters.
 */
export function useSearchParams(): ReadonlyURLSearchParams {
  const { state } = useClientRouterContext();
  return state.searchParams;
}
