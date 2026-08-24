import type { MiddlewareContext, MiddlewareHeadersInit, RanuRequestContext } from './types.js';
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
    } catch {}
  }
  let regexStr = pattern
    .replace(/\/?:([a-zA-Z0-9_]+)\*/g, '__OPTIONAL_CATCH_ALL__')
    .replace(/\/?:([a-zA-Z0-9_]+)\+/g, '__REQUIRED_CATCH_ALL__')
    .replace(/:([a-zA-Z0-9_]+)/g, '__PARAM__')
    .replace(/\*/g, '__WILDCARD__');
  regexStr = regexStr.replace(/[-[\]{}()+?.,\\^$|#\s]/g, '\\$&');
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

function continuationFromValue(value: unknown): MiddlewareContinuation | undefined {
  if (value instanceof Response) {
    return { type: 'response', response: value };
  }
  if (value instanceof RewriteSignal) {
    return { type: 'rewrite', url: value.url };
  }
  if (value instanceof RedirectSignal) {
    return {
      type: 'response',
      response: new Response(null, {
        status: value.status,
        headers: { Location: value.url },
      }),
    };
  }
  if (value instanceof NotFoundSignal) {
    return {
      type: 'response',
      response: new Response('Not Found', { status: 404 }),
    };
  }
  if (value instanceof MiddlewareNextSignal) {
    return value.headers === undefined
      ? { type: 'next' }
      : { type: 'next', headers: value.headers };
  }
  if (!value || typeof value !== 'object' || !('type' in value)) {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  switch (candidate.type) {
    case 'next': {
      if (candidate.headers === undefined) {
        return { type: 'next' };
      }
      try {
        new Headers(candidate.headers as MiddlewareHeadersInit);
      } catch {
        throw new TypeError('Middleware continuation "next" must contain valid headers.');
      }
      return { type: 'next', headers: candidate.headers as MiddlewareHeadersInit };
    }
    case 'response':
      if (!(candidate.response instanceof Response)) {
        throw new TypeError('Middleware continuation "response" must contain a Web Response.');
      }
      return { type: 'response', response: candidate.response };
    case 'rewrite':
      if (typeof candidate.url !== 'string' || candidate.url.length === 0) {
        throw new TypeError('Middleware continuation "rewrite" must contain a non-empty URL.');
      }
      return { type: 'rewrite', url: candidate.url };
    default:
      return undefined;
  }
}

/**
 * Wrap a user-defined middleware module or handler function into a standard RuntimeMiddleware.
 */
export function createRuntimeMiddleware(mod: unknown): RuntimeMiddleware {
  if (!mod) {
    return {
      run: () => Promise.resolve({ type: 'next' }),
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
  const config: { matcher?: string | string[] } =
    typeof moduleObj.config === 'object' && moduleObj.config !== null
      ? (moduleObj.config as { matcher?: string | string[] })
      : {};
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
        return continuationFromValue(result) ?? { type: 'next' };
      } catch (err: unknown) {
        if (isControlSignal(err)) {
          const continuation = continuationFromValue(err);
          if (continuation) return continuation;
        }
        throw err;
      }
    },
  };
}
