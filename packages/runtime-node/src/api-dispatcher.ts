import type { HttpMethod } from '@ranu/core';
import type { RanuRequestContext, ApiEndpointDispatcher } from '@ranu/runtime';
import type { CompiledApiRouteRecord } from '@ranu/router';

export type ApiRouteHandler = (
  request: Request,
  context: RanuRequestContext,
) => Response | Promise<Response>;

export type ApiRouteModule = Partial<Record<HttpMethod, ApiRouteHandler>>;

export type ApiRouteModuleLoader = (routeId: string) => Promise<ApiRouteModule>;

/**
 * Calculates the Allow header deterministically following Phase 6/7 rules:
 * 1. Start with route.methods.
 * 2. If GET exists and HEAD does not exist, add HEAD.
 * 3. If OPTIONS does not exist, ALWAYS add OPTIONS.
 * 4. Remove duplicates.
 * 5. Sort alphabetically.
 * 6. Join deterministically for the Allow header.
 */
export function calculateAllowHeader(methods: readonly HttpMethod[]): string {
  const allowed = new Set<string>(methods);
  if (allowed.has('GET') && !allowed.has('HEAD')) {
    allowed.add('HEAD');
  }
  allowed.add('OPTIONS');
  return Array.from(allowed).sort().join(', ');
}

/**
 * Node.js API dispatcher implementing the Ranu.js API dispatch contract.
 * Loads route modules dynamically via a custom ApiRouteModuleLoader.
 * Implements HTTP HEAD/OPTIONS semantics and validates response returns.
 */
export class NodeApiEndpointDispatcher implements ApiEndpointDispatcher {
  constructor(
    private readonly options: {
      readonly loadModule: ApiRouteModuleLoader;
    },
  ) {}

  async dispatch(
    request: Request,
    context: RanuRequestContext,
    route: CompiledApiRouteRecord,
  ): Promise<Response> {
    // 1. Load module
    let mod: ApiRouteModule;
    try {
      mod = await this.options.loadModule(route.routeId);
    } catch (err: unknown) {
      throw new Error(
        `Failed to load route module for ${route.routeId}: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }

    if (!mod || typeof mod !== 'object') {
      throw new Error(`Route module for ${route.routeId} did not export a valid module object.`);
    }

    const method = request.method.toUpperCase() as HttpMethod;

    // 2. OPTIONS handling
    if (method === 'OPTIONS') {
      if (typeof mod.OPTIONS === 'function') {
        const res = await mod.OPTIONS(request, context);
        if (!(res instanceof Response)) {
          throw new Error(`OPTIONS handler for ${route.routeId} did not return a valid Response.`);
        }
        return res;
      }

      // Framework-generated OPTIONS response
      const allowHeader = calculateAllowHeader(route.methods);
      return new Response(null, {
        status: 204,
        headers: {
          'Allow': allowHeader,
        },
      });
    }

    // 3. HEAD handling
    if (method === 'HEAD') {
      if (typeof mod.HEAD === 'function') {
        const res = await mod.HEAD(request, context);
        if (!(res instanceof Response)) {
          throw new Error(`HEAD handler for ${route.routeId} did not return a valid Response.`);
        }
        // Suppress response body in web Response object returned
        return new Response(null, {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
        });
      }

      if (typeof mod.GET === 'function') {
        const res = await mod.GET(request, context);
        if (!(res instanceof Response)) {
          throw new Error(`GET handler (implicit HEAD) for ${route.routeId} did not return a valid Response.`);
        }
        // Suppress response body in web Response object returned
        return new Response(null, {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
        });
      }

      throw new Error(`Method HEAD not supported by route module for ${route.routeId}.`);
    }

    // 4. Other HTTP methods (GET, POST, etc.)
    const handler = mod[method];
    if (typeof handler !== 'function') {
      throw new Error(`Method ${method} is not implemented by route module for ${route.routeId}.`);
    }

    const res = await handler(request, context);
    if (!(res instanceof Response)) {
      throw new Error(`${method} handler for ${route.routeId} did not return a valid Response.`);
    }

    return res;
  }
}
