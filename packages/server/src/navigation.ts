import { RedirectSignal, NotFoundSignal, RewriteSignal, MiddlewareNextSignal } from '@ranu/runtime';
import type { MiddlewareNextOptions } from './types.js';

/**
 * Halts execution and triggers framework redirect control flow.
 * Status defaults to 307 (Temporary Redirect). Supports 308 (Permanent Redirect).
 */
export function redirect(url: string, statusOrType: number | 'push' | 'replace' = 307): never {
  let status = 307;
  if (typeof statusOrType === 'number') {
    status = statusOrType;
  }
  throw new RedirectSignal(url, status);
}

/**
 * Halts execution and triggers framework not-found control flow (HTTP 404).
 */
export function notFound(): never {
  throw new NotFoundSignal();
}

/**
 * Instructs framework middleware to continue request processing.
 * Optionally attaches headers to be merged into the final response.
 */
export function next(options?: MiddlewareNextOptions): MiddlewareNextSignal {
  return new MiddlewareNextSignal(options?.headers);
}

/**
 * Halts normal route matching and internally rewrites request to target URL/path.
 */
export function rewrite(url: string | URL): never {
  const target = typeof url === 'string' ? url : url.toString();
  throw new RewriteSignal(target);
}
