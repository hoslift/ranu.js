import type { RanuRequestContext, MiddlewareContext } from './types.js';
import type { RuntimeMiddleware, MiddlewareContinuation } from './dispatch.js';
import {
  isControlSignal,
  RewriteSignal,
  RedirectSignal,
  NotFoundSignal,
  MiddlewareNextSignal,
} from './signals.js';

/**
 * Compiles a path pattern string into a RegExp.
 * Supports:
 * - Exact paths: `/dashboard`
 * - Parameterized segments: `/users/:id` -> `/users/([^/]+)`
 * - Catch-all segments: `/docs/:path*` -> `/docs(?:/(.*))?`
 * - Plus catch-all segments: `/docs/:path+` -> `/docs/(.+)`
 * - Wildcards: `/api/*` -> `/api/.*`
 */
export function compileMatcherPattern(pattern: string): RegExp {
  if (pattern.includes('(?')) {
    let p = pattern;
    if (!p.startsWith('^')) p = '^' + p;
    if (!p.endsWith('$')) p = p + '$';
    try {
      return new RegExp(p);
    } catch {
      // Fallback to standard path conversion if regex parsing fails
    }
  }

  // Tokenize parameter patterns first, then escape regex characters
  let regexStr = pattern
    .replace(/\/?:([a-zA-Z0-9_]+)\*/g, '__OPTIONAL_CATCH_ALL__')
    .replace(/\/?:([a-zA-Z0-9_]+)\+/g, '__REQUIRED_CATCH_ALL__')
    .replace(/:([a-zA-Z0-9_]+)/g, '__PARAM__')
    .replace(/\*/g, '__WILDCARD__');

  // Escape special regex characters
  regexStr = regexStr.replace(/[-[\]{}()+?.,\\^$|#\s]/g, '\\$&');

  // Replace tokens with corresponding regex subpatterns
  regexStr = regexStr
    .replace(/__OPTIONAL_CATCH_ALL__/g, '(?:/(.*))?')
    .replace(/__REQUIRED_CATCH_ALL__/g, '/(.+)')
    .replace(/__PARAM__/g, '([^/]+)')
    .replace(/__WILDCARD__/g, '.*');

  if (!regexStr.startsWith('^')) {
    regexStr = '^' + regexStr;
  }
  if (!regexStr.endsWith('$')) {
    regexStr = regexStr + '$';
  }
  return new RegExp(regexStr);
}

/**
 * Tests if a given pathname matches a pattern string.
 */
export function matchPathPattern(pattern: string, pathname: string): boolean {
  if (pattern === pathname) {
    return true;
  }
  const re = compileMatcherPattern(pattern);
  return re.test(pathname);
}

/**
 * Wrap a user-defined middleware module or handler function into a standard RuntimeMiddleware.
 */
export function createRuntimeMiddleware(mod: unknown): RuntimeMiddleware {
  if (!mod) {
    return {
      run: async () => ({ type: 'next' }),
    };
  }

  const moduleObj = typeof mod === 'object' && mod !== null ? (mod as Record<string, unknown>) : {};
  const handler =
    typeof mod === 'function'
      ? (mod as (req: Request, ctx: MiddlewareContext) => unknown)
      : typeof moduleObj.default === 'function'
        ? (moduleObj.default as (req: Request, ctx: MiddlewareContext) => unknown)
        : typeof moduleObj.middleware === 'function'
          ? (moduleObj.middleware as (req: Request, ctx: MiddlewareContext) => unknown)
          : undefined;

  const config = (typeof moduleObj.config === 'object' && moduleObj.config !== null
    ? moduleObj.config
    : {}) as { matcher?: string | string[] };
  const matcher = config.matcher;
  const compiledMatchers = matcher
    ? (Array.isArray(matcher) ? matcher : [matcher]).map(compileMatcherPattern)
    : undefined;

  return {
    async run(request: Request, context: RanuRequestContext): Promise<MiddlewareContinuation> {
      if (!handler || typeof handler !== 'function') {
        return { type: 'next' };
      }

      const pathname = context.url.pathname;

      // Internal framework assets ALWAYS bypass middleware
      if (pathname.startsWith('/_ranu/')) {
        return { type: 'next' };
      }

      // Check user matcher config if specified
      if (compiledMatchers && compiledMatchers.length > 0) {
        const matches = compiledMatchers.some((re) => re.test(pathname));
        if (!matches) {
          return { type: 'next' };
        }
      }

      const middlewareContext: MiddlewareContext = {
        requestId: context.requestId,
        params: context.params,
        locals: context.locals,
        signal: context.signal,
      };

      try {
        const result = await handler(request, middlewareContext);

        if (result instanceof Response) {
          return { type: 'response', response: result };
        }
        if (result instanceof RewriteSignal) {
          return { type: 'rewrite', url: result.url };
        }
        if (result instanceof RedirectSignal) {
          return {
            type: 'response',
            response: new Response(null, {
              status: result.status,
              headers: { Location: result.url },
            }),
          };
        }
        if (result instanceof NotFoundSignal) {
          return {
            type: 'response',
            response: new Response('Not Found', { status: 404 }),
          };
        }
        if (result instanceof MiddlewareNextSignal) {
          return { type: 'next', headers: result.headers };
        }
        if (result && typeof result === 'object' && 'type' in result) {
          return result as MiddlewareContinuation;
        }

        return { type: 'next' };
      } catch (err: unknown) {
        if (isControlSignal(err)) {
          if (err instanceof RewriteSignal) {
            return { type: 'rewrite', url: err.url };
          }
          if (err instanceof RedirectSignal) {
            return {
              type: 'response',
              response: new Response(null, {
                status: err.status,
                headers: { Location: err.url },
              }),
            };
          }
          if (err instanceof NotFoundSignal) {
            return {
              type: 'response',
              response: new Response('Not Found', { status: 404 }),
            };
          }
          if (err instanceof MiddlewareNextSignal) {
            return { type: 'next', headers: err.headers };
          }
        }
        throw err;
      }
    },
  };
}
