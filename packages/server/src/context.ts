import { getActiveRequestContext, type RanuRequestContext } from '@ranu/runtime';

/**
 * Returns the currently active RanuRequestContext.
 * Throws a deterministic framework error if called outside a valid request lifecycle.
 */
export function getRequestContext(): RanuRequestContext {
  const context = getActiveRequestContext();
  if (!context) {
    throw new Error(
      'getRequestContext() was called outside a valid request lifecycle. ' +
      'Server helpers (cookies, headers, redirect, notFound) may only be used during active request processing.'
    );
  }
  if (context.locals.get('__ranu_ssg__') === true) {
    const error = new Error(
      'Dynamic server helpers (cookies, headers, getRequestContext) cannot be accessed during Static Site Generation (SSG).'
    );
    (error as any).code = 'RANU_SSG_DYNAMIC_ACCESS';
    throw error;
  }
  return context;
}
