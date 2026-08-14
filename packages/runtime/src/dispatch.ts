import type { RanuRequestContext, StaticDispatchTarget } from './types.js';
import type { CompiledApiRouteRecord } from '@ranu/router';

export interface ApiEndpointDispatcher {
  dispatch(
    request: Request,
    context: RanuRequestContext,
    route: CompiledApiRouteRecord
  ): Promise<Response>;
}

export interface StaticDispatcher {
  dispatch(
    request: Request,
    context: RanuRequestContext,
    target: StaticDispatchTarget
  ): Promise<Response>;
}

export interface PageRenderTarget {
  readonly routeId: string;
  readonly params: Record<string, string | string[]>;
  readonly layouts: readonly string[];
  readonly loading?: string;
  readonly errors: readonly string[];
  readonly notFound?: readonly string[];
}

export interface RanuRenderer {
  render(
    request: Request,
    context: RanuRequestContext,
    target: PageRenderTarget
  ): Promise<Response>;
}

export type MiddlewareContinuation =
  | { readonly type: 'next' }
  | { readonly type: 'response'; readonly response: Response };

export interface RuntimeMiddleware {
  run(request: Request, context: RanuRequestContext): Promise<MiddlewareContinuation>;
}
