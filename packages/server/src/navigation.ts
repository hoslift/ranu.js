import { RedirectSignal, NotFoundSignal } from '@ranu/runtime';

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
