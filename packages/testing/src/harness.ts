import type { HttpMethod, RouteKind } from '@ranu/core';
import type { CompiledRouteRecord, CompiledRouteSegment } from '@ranu/router';
import {
  RanuServerRuntime,
  type ApiEndpointDispatcher,
  type RanuRenderer,
  type StaticDispatcher,
  type RuntimeMiddleware,
} from '@ranu/runtime';
import { NodeRequestContextStore } from '@ranu/runtime-node';
import type {
  CreateTestContextOptions,
  TestContext,
  TestRequestOptions,
  TestRouteDefinition,
  TestRouteHandlerMap,
} from './types.js';

function compilePatternSegments(pathname: string): {
  segments: CompiledRouteSegment[];
  params: string[];
} {
  const parts = pathname.split('/').filter(Boolean);
  const segments: CompiledRouteSegment[] = [];
  const params: string[] = [];

  for (const part of parts) {
    if (part.startsWith('[[...') && part.endsWith(']]')) {
      const p = part.slice(5, -2);
      segments.push({ kind: 'optional-catch-all', param: p });
      params.push(p);
    } else if (part.startsWith('[...') && part.endsWith(']')) {
      const p = part.slice(4, -1);
      segments.push({ kind: 'catch-all', param: p });
      params.push(p);
    } else if (part.startsWith('[') && part.endsWith(']')) {
      const p = part.slice(1, -1);
      segments.push({ kind: 'dynamic', param: p });
      params.push(p);
    } else {
      segments.push({ kind: 'static', value: part });
    }
  }

  return { segments, params };
}

/**
 * Creates an in-memory test context for sub-50ms headless execution.
 */
export function createTestContext(options: CreateTestContextOptions = {}): TestContext {
  const baseOrigin = options.baseOrigin ?? 'http://localhost:3000';
  const handlerRegistry = new Map<string, TestRouteHandlerMap>();
  const routeRecords: CompiledRouteRecord[] = [...(options.routeRecords ?? [])];

  const routeDefs: TestRouteDefinition[] = [];
  if (Array.isArray(options.routes)) {
    routeDefs.push(...options.routes);
  } else if (options.routes) {
    for (const [pathname, handler] of Object.entries(options.routes)) {
      routeDefs.push({ pathname, handler });
    }
  }

  for (const def of routeDefs) {
    const { segments, params } = compilePatternSegments(def.pathname);
    const isPage = def.kind === 'page';
    const routeId = `${isPage ? 'page' : 'api'}:${def.pathname}`;

    handlerRegistry.set(routeId, def.handler);

    if (isPage) {
      routeRecords.push({
        routeId,
        kind: 'page',
        pattern: { segments },
        pathnameTemplate: def.pathname,
        params,
        layouts: [],
        errors: [],
      });
    } else {
      let methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
      if (typeof def.handler === 'object' && def.handler !== null) {
        methods = Object.keys(def.handler).map((m) => m.toUpperCase() as HttpMethod);
      }

      routeRecords.push({
        routeId,
        kind: 'api',
        pattern: { segments },
        pathnameTemplate: def.pathname,
        params,
        methods,
        layouts: [],
        loading: undefined,
        errors: [],
        notFound: undefined,
      });
    }
  }

  const apiDispatcher: ApiEndpointDispatcher = {
    async dispatch(req, ctx, target) {
      const handler = handlerRegistry.get(target.routeId);
      if (!handler) {
        return new Response('Not Found', { status: 404 });
      }
      if (typeof handler === 'function') {
        return await handler(req, ctx);
      }
      const methodHandler = handler[req.method.toUpperCase() as HttpMethod];
      if (methodHandler) {
        return await methodHandler(req, ctx);
      }
      const allowed = Object.keys(handler).join(', ');
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { Allow: allowed },
      });
    },
  };

  const renderer: RanuRenderer = {
    async render(req, ctx, target) {
      const handler = handlerRegistry.get(target.routeId);
      if (typeof handler === 'function') {
        return await handler(req, ctx);
      }
      if (handler && typeof handler === 'object') {
        const getHandler = handler.GET ?? (handler as any).get;
        if (getHandler) {
          return await getHandler(req, ctx);
        }
      }
      return new Response('Page Not Found', { status: 404 });
    },
  };

  const staticDispatcher: StaticDispatcher = {
    async dispatch() {
      return new Response('Static File Not Found', { status: 404 });
    },
  };

  const middleware: RuntimeMiddleware | undefined = options.middleware
    ? {
        async run(req, ctx) {
          const res = await options.middleware!(req, ctx);
          if (res instanceof Response) {
            return { type: 'response', response: res };
          }
          return { type: 'next' };
        },
      }
    : undefined;

  const contextStore = new NodeRequestContextStore();
  const runtime = new RanuServerRuntime({
    routeRecords,
    contextStore,
    apiDispatcher,
    staticDispatcher,
    renderer,
    ...(middleware ? { middleware } : {}),
    config: { mode: 'development' },
  });

  async function dispatchFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    let req: Request;
    if (input instanceof Request) {
      req = input;
    } else {
      const urlStr = typeof input === 'string' ? input : input.toString();
      const finalUrl = urlStr.startsWith('http://') || urlStr.startsWith('https://')
        ? urlStr
        : new URL(urlStr, baseOrigin).toString();

      req = new Request(finalUrl, init);
    }

    if (options.env) {
      const originalEnv: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(options.env)) {
        originalEnv[k] = process.env[k];
        process.env[k] = v;
      }
      try {
        return await runtime.handle(req);
      } finally {
        for (const [k, v] of Object.entries(originalEnv)) {
          if (v === undefined) {
            delete process.env[k];
          } else {
            process.env[k] = v;
          }
        }
      }
    }

    return await runtime.handle(req);
  }

  function buildRequestInit(
    method: HttpMethod,
    body?: any,
    opts?: TestRequestOptions,
  ): RequestInit {
    const headers = new Headers(opts?.headers);
    let finalBody: any = undefined;

    if (body !== undefined && body !== null) {
      if (
        typeof body === 'object' &&
        !(body instanceof Blob) &&
        !(body instanceof FormData) &&
        !(body instanceof URLSearchParams) &&
        !(body instanceof ArrayBuffer) &&
        !ArrayBuffer.isView(body) &&
        !(body instanceof ReadableStream)
      ) {
        finalBody = JSON.stringify(body);
        if (!headers.has('content-type')) {
          headers.set('content-type', 'application/json');
        }
      } else {
        finalBody = body;
      }
    }

    return {
      ...opts,
      method,
      headers,
      body: finalBody,
    };
  }

  function resolvePathWithQuery(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
  ): string {
    if (!query) return path;
    const url = new URL(path, baseOrigin);
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) {
        url.searchParams.set(k, String(v));
      }
    }
    return url.pathname + url.search;
  }

  const context: TestContext = {
    runtime,
    baseOrigin,
    fetch: dispatchFetch,
    async get(path, opts) {
      const fullPath = resolvePathWithQuery(path, opts?.query);
      return dispatchFetch(fullPath, { ...opts, method: 'GET' });
    },
    async post(path, body, opts) {
      const fullPath = resolvePathWithQuery(path, opts?.query);
      return dispatchFetch(fullPath, buildRequestInit('POST', body, opts));
    },
    async put(path, body, opts) {
      const fullPath = resolvePathWithQuery(path, opts?.query);
      return dispatchFetch(fullPath, buildRequestInit('PUT', body, opts));
    },
    async patch(path, body, opts) {
      const fullPath = resolvePathWithQuery(path, opts?.query);
      return dispatchFetch(fullPath, buildRequestInit('PATCH', body, opts));
    },
    async delete(path, opts) {
      const fullPath = resolvePathWithQuery(path, opts?.query);
      return dispatchFetch(fullPath, { ...opts, method: 'DELETE' });
    },
    dispose() {
      runtime.dispose();
    },
  };

  return context;
}
