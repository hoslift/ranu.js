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

import type { DeploymentCapabilities } from './capabilities.js';
export * from './capabilities.js';

/** Logger contract provided to deployment adapters */
export interface DeploymentLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug?(message: string): void;
  log?(message: string): void;
  [key: string]: any;
}

/** Context passed to a deployment adapter during preparation/adaptation */
export interface DeploymentAdapterContext {
  readonly projectRoot: string;
  readonly buildDir?: string;
  readonly outputDir?: string;
  readonly logger?: DeploymentLogger;
  readonly rootDir?: string;
  readonly manifest?: unknown;
  readonly config?: unknown;
}

/** Result returned by a deployment adapter */
export interface DeploymentResult {
  readonly success: boolean;
  readonly target: string;
  readonly outputDirectory: string;
  readonly files?: readonly string[] | undefined;
  readonly warnings?: readonly string[] | undefined;
  readonly diagnostics?: readonly any[] | undefined;
}

/** Deployment Adapter contract */
export interface RanuDeploymentAdapter {
  readonly name: string;
  readonly apiVersion: number;
  readonly capabilities: DeploymentCapabilities;
  adapt(context: DeploymentAdapterContext): Promise<DeploymentResult>;
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
export const HTTP_METHODS: HttpMethod[] = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
];

/** Static route parameter values */
export type StaticParamValue = string | readonly string[];

/** Static route parameter record mapping parameter names to string values or string arrays */
export type StaticParamRecord = Readonly<Record<string, StaticParamValue>>;

/** Result returned by generateStaticParams */
export type GenerateStaticParamsResult = readonly StaticParamRecord[];

/** Public function signature for generateStaticParams */
export type GenerateStaticParams = () =>
  GenerateStaticParamsResult | Promise<GenerateStaticParamsResult>;
