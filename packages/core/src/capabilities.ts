/**
 * @ranu/core capabilities
 *
 * Universal framework and deployment capability contracts.
 */

/** Core framework capability flags (used by deployment adapters to verify compatibility) */
export interface FrameworkCapabilities {
  /** Supports streaming server responses */
  streaming: boolean;
  /** Supports route-level middleware execution */
  middleware: boolean;
  /** Supports full Node.js API set */
  nodejsBuiltins: boolean;
}

/** Deployment target capabilities declared by adapters */
export interface DeploymentCapabilities {
  readonly runtime: 'node' | 'edge' | 'workerd' | 'bun' | 'deno' | 'static';
  readonly ssr: boolean;
  readonly apiRoutes: boolean;
  readonly middleware: boolean;
  readonly streaming: boolean;
  readonly staticFiles: boolean;
  readonly runtimeEnvironment: boolean;
  readonly writableFilesystem: 'none' | 'temporary' | 'persistent';
  readonly longLivedProcess: boolean;
  /** Declares background execution lifetime capability (ctx.waitUntil) */
  readonly supportsWaitUntil?: boolean | undefined;
  /** Declares serverless / runtime database connection pooling concurrency limits */
  readonly maxDatabaseConnections?: number | undefined;
}
