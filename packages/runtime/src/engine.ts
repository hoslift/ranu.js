import type { RanuServerRuntimeOptions, RanuRequestContext, StaticDispatchTarget } from './types.js';
import type { PageRenderTarget } from './dispatch.js';
import type { CompiledRouteRecord } from '@ranu/router';
import { matchRoute } from '@ranu/router';
import { isControlSignal, RedirectSignal, NotFoundSignal } from './signals.js';
import { sanitizeErrorResponse } from './errors.js';
import { HTTP_METHODS, type RouteKind } from '@ranu/core';

export class RanuServerRuntime {
  private staticLookup = new Map<string, { routeId: string; file: string }>();

  constructor(private options: RanuServerRuntimeOptions) {
    if (options.staticManifest?.routes) {
      for (const route of options.staticManifest.routes) {
        this.staticLookup.set(route.pathname, route);
      }
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

    let pathname = url.pathname;
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
        if (extracted && extracted.length > 0 && extracted.length <= 64 && /^[A-Za-z0-9-_]+$/.test(extracted)) {
          requestId = extracted;
        }
      } catch {
        // Silently fallback to generated ID
      }
    }
    if (!requestId) {
      requestId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
    }

    // 3. Request Context creation before matching
    const locals = new Map<string, unknown>();
    const params: Record<string, string | string[]> = {};
    const context: RanuRequestContext = {
      requestId,
      request,
      url,
      params,
      locals,
      signal: request.signal,
    };

    let matchedRouteId: string | undefined;
    let matchedRouteKind: RouteKind | undefined;

    return this.options.contextStore.run(context, async () => {
      try {
        // 4. Global Middleware Hooks
        if (this.options.middleware) {
          const continuation = await this.options.middleware.run(request, context);
          if (continuation.type === 'response') {
            return continuation.response;
          }
        }

        // 5. Normalization of pathname trailing slash (pathname-first matching)
        let normalizedPathname = pathname;
        if (normalizedPathname !== '/' && normalizedPathname.endsWith('/')) {
          normalizedPathname = normalizedPathname.slice(0, -1);
        }

        // 6. Precedence check: StaticManifest exact concrete pathname match
        const staticMatch = this.staticLookup.get(normalizedPathname);
        if (staticMatch) {
          matchedRouteId = staticMatch.routeId;
          matchedRouteKind = 'page';

          // Pages only support GET and HEAD
          if (method !== 'GET' && method !== 'HEAD') {
            return new Response('Method Not Allowed', {
              status: 405,
              headers: { 'Allow': 'GET, HEAD' }
            });
          }

          const target: StaticDispatchTarget = {
            routeId: staticMatch.routeId,
            pathname: normalizedPathname,
          };

          return await this.options.staticDispatcher.dispatch(request, context, target);
        }

        // 7. Match dynamic routes
        const routeMatch = matchRoute(pathname, this.options.routeRecords as CompiledRouteRecord[]);
        if (!routeMatch) {
          return new Response('Not Found', { status: 404 });
        }

        matchedRouteId = routeMatch.routeId;
        matchedRouteKind = routeMatch.kind;

        // Populate context params in-place
        Object.assign(context.params, routeMatch.params);

        const routeRecord = this.options.routeRecords.find(r => r.routeId === routeMatch.routeId);
        if (!routeRecord) {
          return new Response('Not Found', { status: 404 });
        }

        // Static-only dynamic path miss check (absent from StaticManifest)
        if (routeRecord.kind === 'page' && (routeRecord as any).renderMode === 'static') {
          throw new NotFoundSignal();
        }

        // 8. Endpoint method decision & dispatch
        if (routeRecord.kind === 'page') {
          if (method !== 'GET' && method !== 'HEAD') {
            return new Response('Method Not Allowed', {
              status: 405,
              headers: { 'Allow': 'GET, HEAD' }
            });
          }

          const pageTarget: PageRenderTarget = {
            routeId: routeRecord.routeId,
            params: context.params,
            layouts: routeRecord.layouts,
            errors: routeRecord.errors,
            ...(routeRecord.loading !== undefined ? { loading: routeRecord.loading } : {}),
            ...(routeRecord.notFound !== undefined ? { notFound: routeRecord.notFound } : {}),
          };

          return await this.options.renderer.render(request, context, pageTarget);
        } else {
          // API Endpoint
          const hasExplicitMethod = routeRecord.methods.includes(method as any);
          const isImplicitHead = method === 'HEAD' && !routeRecord.methods.includes('HEAD') && routeRecord.methods.includes('GET');
          const isImplicitOptions = method === 'OPTIONS' && !routeRecord.methods.includes('OPTIONS');

          if (hasExplicitMethod || isImplicitHead || isImplicitOptions) {
            return await this.options.apiDispatcher.dispatch(request, context, routeRecord);
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

            return new Response('Method Not Allowed', {
              status: 405,
              headers: { 'Allow': allowed.join(', ') }
            });
          }
        }
      } catch (err: unknown) {
        if (isControlSignal(err)) {
          if (err instanceof RedirectSignal) {
            return new Response(null, {
              status: err.status,
              headers: { 'Location': err.url }
            });
          }
          if (err instanceof NotFoundSignal) {
            return new Response('Not Found', { status: 404 });
          }
        }

        // Unexpected/Execution errors: Sanitize
        return sanitizeErrorResponse(err, context.requestId, this.options.config, matchedRouteKind);
      }
    });
  }
}
