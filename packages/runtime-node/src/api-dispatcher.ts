import type { HttpMethod } from '@ranu/core';
import type { RanuRequestContext, ApiEndpointDispatcher, ApiDispatchTarget } from '@ranu/runtime';
import type { ServerManifest } from '@ranu/manifests';

export type ApiRouteHandler = (
  request: Request,
  context: RanuRequestContext,
) => Response | Promise<Response>;

export type ApiRouteModule = Partial<Record<HttpMethod, ApiRouteHandler>>;

export type ApiRouteModuleLoader = (
  routeId: string,
  serverEntry?: string,
) => Promise<ApiRouteModule>;

export interface NodeApiEndpointDispatcherOptions {
  readonly loadModule: ApiRouteModuleLoader;
  readonly serverManifest?: ServerManifest;
}

/**
 * Calculates the Allow header deterministically according to framework HTTP semantics:
 * 1. Takes declared route methods.
 * 2. If GET is present and HEAD is absent, adds HEAD (implicit HEAD support).
 * 3. Adds OPTIONS (automatic OPTIONS support).
 * 4. Deduplicates and sorts alphabetically.
 * 5. Joins with comma-space.
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
 * Node.js API endpoint dispatcher implementing the provider-neutral ApiEndpointDispatcher contract.
 * Loads route modules according to the compiled server manifest or custom module loader,
 * executes route methods, handles explicit/implicit HEAD and OPTIONS, and strictly validates Response returns.
 */
export class NodeApiEndpointDispatcher implements ApiEndpointDispatcher {
  private readonly serverEntryLookup = new Map<string, string>();

  constructor(private readonly options: NodeApiEndpointDispatcherOptions) {
    if (options.serverManifest?.routes) {
      for (const entry of options.serverManifest.routes) {
        this.serverEntryLookup.set(entry.routeId, entry.serverEntry);
      }
    }
  }

  async dispatch(
    request: Request,
    context: RanuRequestContext,
    target: ApiDispatchTarget,
  ): Promise<Response> {
    const serverEntry = this.serverEntryLookup.get(target.routeId);

    // 1. Load the route module
    let mod: ApiRouteModule;
    try {
      mod = await this.options.loadModule(target.routeId, serverEntry);
    } catch (err: unknown) {
      throw new Error(
        `Failed to load route module for ${target.routeId}: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }

    if (!mod || typeof mod !== 'object') {
      throw new Error(`Route module for ${target.routeId} did not export a valid module object.`);
    }

    const method = (request.method ?? 'GET').toUpperCase() as HttpMethod;

    // 2. OPTIONS handling
    if (method === 'OPTIONS') {
      if (typeof mod.OPTIONS === 'function') {
        const res = await mod.OPTIONS(request, context);
        if (!(res instanceof Response)) {
          throw new Error(`OPTIONS handler for ${target.routeId} did not return a valid Web Response.`);
        }
        return res;
      }

      // Framework-generated automatic OPTIONS response
      const allowHeader = calculateAllowHeader(target.methods);
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
          throw new Error(`HEAD handler for ${target.routeId} did not return a valid Web Response.`);
        }
        // Suppress response body while preserving metadata and status
        return new Response(null, {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
        });
      }

      // Implicit HEAD fallback using GET
      if (typeof mod.GET === 'function') {
        const res = await mod.GET(request, context);
        if (!(res instanceof Response)) {
          throw new Error(`GET handler (implicit HEAD) for ${target.routeId} did not return a valid Web Response.`);
        }
        // Suppress response body while preserving metadata and status
        return new Response(null, {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
        });
      }

      throw new Error(`Method HEAD is not supported by route module for ${target.routeId}.`);
    }

    // 4. Standard HTTP methods (GET, POST, PUT, PATCH, DELETE, etc.)
    const handler = mod[method];
    if (typeof handler !== 'function') {
      throw new Error(`Method ${method} is not implemented by route module for ${target.routeId}.`);
    }

    const res = await handler(request, context);
    if (!(res instanceof Response)) {
      throw new Error(
        `Method handler ${method} for ${target.routeId} returned invalid value (${typeof res}); expected a Web standard Response object.`,
      );
    }

    return res;
  }
}
