import type { RouteKind, RanuMode } from '@ranu/core';
import type { StaticManifest } from '@ranu/manifests';
import type { CompiledRouteRecord } from '@ranu/router';
import type {
  StaticDispatcher,
  ApiEndpointDispatcher,
  RanuRenderer,
  RuntimeMiddleware,
} from './dispatch.js';
import type { RequestContextStore } from './context.js';

export interface RanuRequestContext {
  readonly requestId: string;
  readonly request: Request;
  readonly url: URL;
  readonly params: Record<string, string | string[]>;
  readonly locals: Map<string, unknown>;
  readonly signal: AbortSignal;
  readonly responseCookies: string[];
  readonly depth?: number;
}

export interface MiddlewareContext {
  readonly requestId: string;
  readonly params: Record<string, string | string[]>;
  readonly locals: Map<string, unknown>;
  readonly signal: AbortSignal;
}

export type MiddlewareHeadersInit = Headers | string[][] | Record<string, string>;

export interface RuntimeConfig {
  readonly mode: RanuMode;
}

export interface StaticDispatchTarget {
  readonly routeId: string;
  readonly pathname: string;
}

export interface RanuServerRuntimeOptions {
  readonly routeRecords: readonly CompiledRouteRecord[];
  readonly staticManifest?: StaticManifest;
  readonly contextStore: RequestContextStore;
  readonly apiDispatcher: ApiEndpointDispatcher;
  readonly staticDispatcher: StaticDispatcher;
  readonly renderer: RanuRenderer;
  readonly middleware?: RuntimeMiddleware;
  readonly config: RuntimeConfig;
  readonly extractUpstreamId?: (request: Request) => string | undefined;
}
