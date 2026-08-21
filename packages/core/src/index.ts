/**
 * @ranu/core
 *
 * Shared foundational framework contracts and types.
 * Internal package — not public application API.
 */

/** Ranu.js framework version */
export const RANU_VERSION = '0.0.0';

/** Ranu.js default build directory name */
export const DEFAULT_OUT_DIR = '.ranu';

/** Ranu.js framework modes */
export type RanuMode = 'development' | 'production';

/** ranu CLI commands */
export type RanuCommand = 'dev' | 'build' | 'start' | 'create' | 'deploy' | 'help' | 'version';

/** Route kinds supported by the framework */
export type RouteKind = 'page' | 'api';

/** Rendering modes supported by the framework */
export type RenderMode = 'server' | 'static' | 'client';

/** Core framework capability flags (used by deployment adapters to verify compat) */
export interface FrameworkCapabilities {
  /** Supports streaming server responses */
  streaming: boolean;
  /** Supports route-level middleware execution */
  middleware: boolean;
  /** Supports full Node.js API set */
  nodejsBuiltins: boolean;
}

/** Normalized version compatibility helper */
export interface VersionCompatibility {
  frameworkVersion: string;
  schemaVersion: number;
  compatible: boolean;
}

/** Canonical HTTP methods supported by the framework */
export type HttpMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

/** Supported HTTP method array */
export const HTTP_METHODS: HttpMethod[] = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

/** Static route parameter values */
export type StaticParamValue = string | readonly string[];

/** Static route parameter record mapping parameter names to string values or string arrays */
export type StaticParamRecord = Readonly<Record<string, StaticParamValue>>;

/** Result returned by generateStaticParams */
export type GenerateStaticParamsResult = readonly StaticParamRecord[];

/** Public function signature for generateStaticParams */
export type GenerateStaticParams = () =>
  | GenerateStaticParamsResult
  | Promise<GenerateStaticParamsResult>;

