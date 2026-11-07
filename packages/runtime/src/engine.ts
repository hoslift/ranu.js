import type {
  MiddlewareHeadersInit,
  RanuServerRuntimeOptions,
  RanuRequestContext,
  StaticDispatchTarget,
} from './types.js';
import type { PageRenderTarget, ApiDispatchTarget } from './dispatch.js';
import type { CompiledRouteRecord } from '@ranu/router';
import { matchRoute } from '@ranu/router';
import { isControlSignal, RedirectSignal, NotFoundSignal } from './signals.js';
import { sanitizeErrorResponse } from './errors.js';
import { registerRequestContextStore, setActiveCacheStore } from './context.js';
import { RouteCacheManager } from './cache/route-cache.js';
import type { CacheStore } from './cache/types.js';
import type { RouteKind } from '@ranu/core';
import { trace, context as otelContext, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { extractTraceContext, getTracer } from './telemetry/tracer.js';
import { getMetrics } from './telemetry/metrics.js';

let globalRequestSequence = 0;
const MAX_REWRITE_DEPTH = 5;

function validateHeaders(headersInit?: MiddlewareHeadersInit): void {
  if (!headersInit) return;
  if (
    typeof headersInit === 'object' &&
    !(headersInit instanceof Headers) &&
    !Array.isArray(headersInit)
  ) {
    for (const [key, value] of Object.entries(headersInit)) {
      if (/[\r\n]/.test(key) || (typeof value === 'string' && /[\r\n]/.test(value))) {
        throw new Error(
          `Invalid header characters in middleware header "${key}" (CRLF injection prevention)`,
        );
      }
    }
  }
}

function finalizeResponse(
  response: Response,
  context: RanuRequestContext,
  middlewareHeaders?: MiddlewareHeadersInit,
): Response {
  const needsProcessing =
    middlewareHeaders ||
    context.responseCookies.length > 0 ||
    (context.requestId && !response.headers.has('x-request-id'));

  if (!needsProcessing) {
    return response;
  }
  const finalizedResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
  if (middlewareHeaders) {
    validateHeaders(middlewareHeaders);
    const entries = new Headers(middlewareHeaders);
    entries.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') {
        finalizedResponse.headers.append('Set-Cookie', value);
      } else if (!finalizedResponse.headers.has(key)) {
        finalizedResponse.headers.set(key, value);
      }
    });
  }

  if (context.responseCookies.length > 0) {
    for (const cookieHeader of context.responseCookies) {
      finalizedResponse.headers.append('Set-Cookie', cookieHeader);
    }
  }

  if (context.requestId && !finalizedResponse.headers.has('x-request-id')) {
    finalizedResponse.headers.set('x-request-id', context.requestId);
  }

  return finalizedResponse;
}

export class RanuServerRuntime {
  private staticLookup = new Map<string, { routeId: string; file: string }>();
  private unregisterStore: (() => void) | undefined;
  private routeCache: RouteCacheManager | undefined;
  private cacheStore: CacheStore | undefined;

  constructor(private options: RanuServerRuntimeOptions) {
    this.unregisterStore = registerRequestContextStore(options.contextStore);
    if (options.staticManifest?.routes) {
      for (const route of options.staticManifest.routes) {
        this.staticLookup.set(route.pathname, route);
      }
    }
    this.cacheStore = options.cacheStore;
    if (options.routeCache) {
      this.routeCache = options.routeCache;
    } else if (options.cacheStore) {
      this.routeCache = new RouteCacheManager(options.cacheStore);
    }
    if (this.cacheStore) {
      setActiveCacheStore(this.cacheStore);
    }
  }

  getCacheStore(): CacheStore | undefined {
    return this.cacheStore;
  }

  getRouteCache(): RouteCacheManager | undefined {
    return this.routeCache;
  }

  /**
   * Disposes the runtime instance and cleans up its context store registration
   * to prevent stale references in long-running processes.
   */
  dispose(): void {
    if (this.unregisterStore) {
      this.unregisterStore();
      this.unregisterStore = undefined;
    }
  }

  async handle(request: Request): Promise<Response> {
    // 1. Structural request validation
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return new Response('Bad Request', { status: 400 });
    }

    const pathname = url.pathname;
    try {
      decodeURIComponent(pathname);
    } catch {
      return new Response('Bad Request', { status: 400 });
    }

    // Normalize HTTP method
    const rawMethod = request.method;
    const method = rawMethod.toUpperCase();

    // 2. Request ID Generation and validation
    let requestId = '';
    if (this.options.extractUpstreamId) {
      try {
        const extracted = this.options.extractUpstreamId(request);
        if (
          extracted &&
          extracted.length > 0 &&
          extracted.length <= 64 &&
          /^[A-Za-z0-9-_]+$/.test(extracted)
        ) {
          requestId = extracted;
        }
      } catch {
        // Silently fallback to generated ID
      }
    }
    if (!requestId) {
      const headerId = request.headers.get('x-request-id');
      if (
        headerId &&
        headerId.length > 0 &&
        headerId.length <= 64 &&
        /^[A-Za-z0-9-_]+$/.test(headerId)
      ) {
        requestId = headerId;
      }
    }
    if (!requestId) {
      requestId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2) + Date.now().toString(36);
    }

    // Direct /metrics endpoint check
    const metricsConfig = this.options.metrics;
    const metricsEndpoint = metricsConfig?.endpoint ?? '/metrics';
    if (
      method === 'GET' &&
      pathname === metricsEndpoint &&
      metricsConfig?.enabled !== false
    ) {
      const metricsProvider = metricsConfig?.provider ?? getMetrics();
      const metricsText = await metricsProvider.getMetricsText();
      return new Response(metricsText, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
          'Cache-Control': 'no-store',
          'x-request-id': requestId,
        },
      });
    }

    const extractedCtx = extractTraceContext(request.headers);
    const tracer = getTracer();
    const metricsProvider = this.options.metrics?.provider ?? getMetrics();
    metricsProvider.increment('ranu_http_requests_active', 1);
    const requestStartTime = performance.now();

    const rootSpan = tracer.startSpan(
      `HTTP ${method} ${pathname}`,
      {
        kind: SpanKind.SERVER,
        attributes: {
          'http.method': method,
          'http.url': request.url,
          'http.target': pathname,
          'http.request_id': requestId,
          'http.user_agent': request.headers.get('user-agent') ?? undefined,
        },
      },
      extractedCtx,
    );

    const spanCtx = rootSpan.spanContext();
    const traceId =
      spanCtx?.traceId && spanCtx.traceId !== '00000000000000000000000000000000'
        ? spanCtx.traceId
        : undefined;
    const spanId =
      spanCtx?.spanId && spanCtx.spanId !== '0000000000000000'
        ? spanCtx.spanId
        : undefined;

    // 3. Request Context creation before matching
    const locals = new Map<string, unknown>();
    const params: Record<string, string | string[]> = {};
    const responseCookies: string[] = [];
    const depth = ++globalRequestSequence;
    const backgroundPromises: Promise<unknown>[] = [];

    const waitUntil = (promise: Promise<unknown>): void => {
      if (!promise || typeof (promise as any).then !== 'function') {
        throw new TypeError('waitUntil() requires a valid Promise instance as its argument');
      }
      const safePromise = Promise.resolve(promise).catch((err) => {
        return err;
      });
      backgroundPromises.push(safePromise);
    };

    if (this.cacheStore) {
      locals.set('__ranu_cache_store__', this.cacheStore);
    }

    const context: RanuRequestContext = {
      requestId,
      traceId,
      spanId,
      request,
      url,
      params,
      locals,
      signal: request.signal,
      responseCookies,
      depth,
      waitUntil,
      waitUntilPromises: backgroundPromises,
    };

    let matchedRouteId: string | undefined;
    let matchedRouteKind: RouteKind | undefined;
    let middlewareHeaders: MiddlewareHeadersInit | undefined;
    let finalResponse: Response | undefined;

    const activeWithRoot = trace.setSpan(extractedCtx, rootSpan);
    return otelContext.with(activeWithRoot, async () => {
      try {
        finalResponse = await this.options.contextStore.run(context, async () => {
      try {
        let currentUrl = url;
        let currentRequest = request;
        let rewriteDepth = 0;

        // 4. Middleware execution with rewrite loop protection
        while (true) {
          const currentPathname = currentUrl.pathname;

          // Framework internal assets bypass middleware
          if (!currentPathname.startsWith('/_ranu/') && this.options.middleware) {
            const mwSpan = tracer.startSpan('ranu.middleware', {
              kind: SpanKind.INTERNAL,
              attributes: {
                'ranu.middleware.pathname': currentPathname,
                'ranu.middleware.rewrite_depth': rewriteDepth,
              },
            });
            let continuation;
            try {
              continuation = await otelContext.with(
                trace.setSpan(otelContext.active(), mwSpan),
                () => this.options.middleware!.run(currentRequest, context),
              );
              mwSpan.setAttribute('ranu.middleware.outcome', continuation.type);
              mwSpan.setStatus({ code: SpanStatusCode.OK });
            } catch (mwErr: unknown) {
              mwSpan.recordException(mwErr instanceof Error ? mwErr : new Error(String(mwErr)));
              mwSpan.setStatus({ code: SpanStatusCode.ERROR });
              throw mwErr;
            } finally {
              mwSpan.end();
            }
            if (continuation.type === 'response') {
              return finalizeResponse(continuation.response, context, middlewareHeaders);
            }
            if (continuation.type === 'rewrite') {
              rewriteDepth++;
              if (rewriteDepth > MAX_REWRITE_DEPTH) {
                const loopError = new Error(
                  `Middleware rewrite loop detected: exceeded maximum rewrite depth of ${MAX_REWRITE_DEPTH}.`,
                );
                (loopError as any).code = 'RANU_REWRITE_LOOP';
                throw loopError;
              }
              const targetUrl = new URL(continuation.url, currentUrl);
              const mergedParams = new URLSearchParams(currentUrl.searchParams);
              targetUrl.searchParams.forEach((val, key) => {
                mergedParams.set(key, val);
              });
              targetUrl.search = mergedParams.toString() ? `?${mergedParams.toString()}` : '';
              currentUrl = targetUrl;
              currentRequest = new Request(currentUrl.href, currentRequest);
              (context as any).url = currentUrl;
              (context as any).request = currentRequest;
              continue;
            }

            if (continuation.type === 'next') {
              if (continuation.headers) {
                validateHeaders(continuation.headers);
                middlewareHeaders = continuation.headers;
              }
              break;
            }
          }
          break;
        }

        const effectivePathname = currentUrl.pathname;

        // 5. Normalization of pathname trailing slash (pathname-first matching)
        let normalizedPathname = effectivePathname;
        if (normalizedPathname !== '/' && normalizedPathname.endsWith('/')) {
          normalizedPathname = normalizedPathname.slice(0, -1);
        }

        // 5b. Server Action wire protocol endpoint check: POST /_ranu/action/:actionId
        if (normalizedPathname.startsWith('/_ranu/action/')) {
          const actionId = normalizedPathname.slice('/_ranu/action/'.length);
          if (method !== 'POST') {
            return finalizeResponse(
              new Response('Method Not Allowed', {
                status: 405,
                headers: { Allow: 'POST' },
              }),
              context,
              middlewareHeaders,
            );
          }

          if (this.options.actionDispatcher) {
            const res = await this.options.actionDispatcher(actionId, currentRequest, context);
            return finalizeResponse(res, context, middlewareHeaders);
          }

          return finalizeResponse(
            new Response(
              JSON.stringify({
                success: false,
                errors: {},
                formErrors: ['Server Action dispatcher not configured'],
              }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json; charset=utf-8' },
              },
            ),
            context,
            middlewareHeaders,
          );
        }

        // 6. Precedence check: StaticManifest exact concrete pathname match
        const staticMatch = this.staticLookup.get(normalizedPathname);
        if (staticMatch) {
          matchedRouteId = staticMatch.routeId;
          matchedRouteKind = 'page';

          // Pages only support GET and HEAD
          if (method !== 'GET' && method !== 'HEAD') {
            return finalizeResponse(
              new Response('Method Not Allowed', {
                status: 405,
                headers: { Allow: 'GET, HEAD' },
              }),
              context,
              middlewareHeaders,
            );
          }

          const target: StaticDispatchTarget = {
            routeId: staticMatch.routeId,
            pathname: normalizedPathname,
          };

          const res = await this.options.staticDispatcher.dispatch(currentRequest, context, target);
          return finalizeResponse(res, context, middlewareHeaders);
        }

        // 7. Match dynamic routes
        const routeMatch = matchRoute(
          normalizedPathname,
          this.options.routeRecords as CompiledRouteRecord[],
        );
        if (!routeMatch) {
          return finalizeResponse(
            new Response('Not Found', { status: 404 }),
            context,
            middlewareHeaders,
          );
        }

        matchedRouteId = routeMatch.routeId;
        matchedRouteKind = routeMatch.kind;

        // Populate context params in-place
        Object.assign(context.params, routeMatch.params);

        const routeRecord = this.options.routeRecords.find((r) => r.routeId === routeMatch.routeId);
        if (!routeRecord) {
          return finalizeResponse(
            new Response('Not Found', { status: 404 }),
            context,
            middlewareHeaders,
          );
        }

        // Static-only dynamic path miss check (absent from StaticManifest)
        if (routeRecord.kind === 'page' && (routeRecord as any).renderMode === 'static') {
          throw new NotFoundSignal();
        }

        // 8. Endpoint method decision & dispatch
        if (routeRecord.kind === 'page') {
          if (method !== 'GET' && method !== 'HEAD') {
            return finalizeResponse(
              new Response('Method Not Allowed', {
                status: 405,
                headers: { Allow: 'GET, HEAD' },
              }),
              context,
              middlewareHeaders,
            );
          }

          const pageTarget: PageRenderTarget = {
            routeId: routeRecord.routeId,
            params: context.params,
            layouts: routeRecord.layouts,
            errors: routeRecord.errors,
            ...(routeRecord.loading !== undefined ? { loading: routeRecord.loading } : {}),
            ...(routeRecord.notFound !== undefined ? { notFound: routeRecord.notFound } : {}),
          };

          const renderWithSsrSpan = async (): Promise<Response> => {
            const ssrSpan = tracer.startSpan('ranu.ssr', {
              kind: SpanKind.INTERNAL,
              attributes: {
                'ranu.route_id': pageTarget.routeId,
              },
            });
            const ssrStart = performance.now();
            try {
              const renderRes = await otelContext.with(
                trace.setSpan(otelContext.active(), ssrSpan),
                () => this.options.renderer.render(currentRequest, context, pageTarget),
              );
              ssrSpan.setStatus({ code: SpanStatusCode.OK });
              metricsProvider.increment('ranu_ssr_renders_total', 1, {
                route: pageTarget.routeId,
                status: String(renderRes.status),
              });
              return renderRes;
            } catch (err: unknown) {
              ssrSpan.recordException(err instanceof Error ? err : new Error(String(err)));
              ssrSpan.setStatus({ code: SpanStatusCode.ERROR });
              metricsProvider.increment('ranu_ssr_renders_total', 1, {
                route: pageTarget.routeId,
                status: '500',
              });
              throw err;
            } finally {
              const ssrDurationSec = (performance.now() - ssrStart) / 1000;
              metricsProvider.record('ranu_ssr_render_duration_seconds', ssrDurationSec, {
                route: pageTarget.routeId,
              });
              ssrSpan.end();
            }
          };

          const isrTtl =
            typeof (routeRecord as any).revalidate === 'number'
              ? (routeRecord as any).revalidate
              : 0;

          if (this.routeCache && isrTtl > 0) {
            const routeKey = `route:${normalizedPathname}`;
            const tags: string[] = Array.isArray((routeRecord as any).tags)
              ? (routeRecord as any).tags
              : [];

            const { result: cached, isStale, isHit } = await this.routeCache.getOrRevalidate(
              routeKey,
              isrTtl,
              tags,
              async () => {
                const renderRes = await renderWithSsrSpan();
                const bodyText = await renderRes.text();
                const headersList: [string, string][] = [];
                renderRes.headers.forEach((v, k) => headersList.push([k, v]));
                return {
                  body: bodyText,
                  status: renderRes.status,
                  statusText: renderRes.statusText,
                  headers: headersList,
                };
              },
            );

            const resHeaders = new Headers(cached.headers);
            resHeaders.set('x-ranu-cache', isHit ? (isStale ? 'STALE' : 'HIT') : 'MISS');
            const res = new Response(cached.body, {
              status: cached.status,
              statusText: cached.statusText,
              headers: resHeaders,
            });
            return finalizeResponse(res, context, middlewareHeaders);
          }

          const res = await renderWithSsrSpan();
          return finalizeResponse(res, context, middlewareHeaders);
        } else {
          // API Endpoint
          const hasExplicitMethod = routeRecord.methods.includes(method as any);
          const isImplicitHead =
            method === 'HEAD' &&
            !routeRecord.methods.includes('HEAD') &&
            routeRecord.methods.includes('GET');
          const isImplicitOptions =
            method === 'OPTIONS' && !routeRecord.methods.includes('OPTIONS');

          if (hasExplicitMethod || isImplicitHead || isImplicitOptions) {
            const apiTarget: ApiDispatchTarget = {
              routeId: routeRecord.routeId,
              params: context.params,
              methods: routeRecord.methods,
            };
            const apiSpan = tracer.startSpan('ranu.api', {
              kind: SpanKind.INTERNAL,
              attributes: {
                'ranu.route_id': apiTarget.routeId,
                'http.method': method,
              },
            });
            let res: Response;
            try {
              res = await otelContext.with(
                trace.setSpan(otelContext.active(), apiSpan),
                () => this.options.apiDispatcher.dispatch(currentRequest, context, apiTarget),
              );
              apiSpan.setStatus({ code: SpanStatusCode.OK });
            } catch (err: unknown) {
              apiSpan.recordException(err instanceof Error ? err : new Error(String(err)));
              apiSpan.setStatus({ code: SpanStatusCode.ERROR });
              throw err;
            } finally {
              apiSpan.end();
            }
            return finalizeResponse(res, context, middlewareHeaders);
          } else {
            // Compute effective allowed methods
            const allowed = [...routeRecord.methods];
            if (allowed.includes('GET' as any) && !allowed.includes('HEAD' as any)) {
              allowed.push('HEAD' as any);
            }
            if (!allowed.includes('OPTIONS' as any)) {
              allowed.push('OPTIONS' as any);
            }
            // Sort to make Allow deterministic
            allowed.sort();

            return finalizeResponse(
              new Response('Method Not Allowed', {
                status: 405,
                headers: { Allow: allowed.join(', ') },
              }),
              context,
              middlewareHeaders,
            );
          }
        }
      } catch (err: unknown) {
        if (isControlSignal(err)) {
          if (err instanceof RedirectSignal) {
            return finalizeResponse(
              new Response(null, {
                status: err.status,
                headers: { Location: err.url },
              }),
              context,
              middlewareHeaders,
            );
          }
          if (err instanceof NotFoundSignal) {
            return finalizeResponse(
              new Response('Not Found', { status: 404 }),
              context,
              middlewareHeaders,
            );
          }
        }

        // Unexpected/Execution errors: Sanitize
        const errRes = sanitizeErrorResponse(
          err,
          context.requestId,
          this.options.config,
          matchedRouteKind,
        );
        return finalizeResponse(errRes, context, middlewareHeaders);
      }
    });
    return finalResponse!;
  } finally {
    metricsProvider.increment('ranu_http_requests_active', -1);
    const durationMs = performance.now() - requestStartTime;
    const durationSec = durationMs / 1000;
    const finalStatus = finalResponse ? finalResponse.status : 500;
    metricsProvider.increment('ranu_http_requests_total', 1, {
      method,
      status: String(finalStatus),
      route: matchedRouteId ?? pathname,
    });
    metricsProvider.record('ranu_http_request_duration_seconds', durationSec, {
      method,
      route: matchedRouteId ?? pathname,
    });
    rootSpan.setAttribute('http.status_code', finalStatus);
    rootSpan.setStatus({
      code: finalStatus >= 500 ? SpanStatusCode.ERROR : SpanStatusCode.OK,
    });
    rootSpan.end();
  }
});
  }
}
