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

/** Deployment target capabilities declared by adapters */
export interface DeploymentCapabilities {
  readonly runtime: 'node' | 'edge' | 'static' | 'workerd' | 'bun' | 'deno';
  readonly ssr: boolean;
  readonly apiRoutes: boolean;
  readonly middleware: boolean;
  readonly streaming: boolean;
  readonly staticFiles: boolean;
  readonly runtimeEnvironment: boolean;
  readonly writableFilesystem: 'none' | 'temporary' | 'persistent';
  readonly longLivedProcess: boolean;
  readonly supportsWaitUntil?: boolean | undefined;
  readonly maxDatabaseConnections?: number | undefined;
}

/**
 * Error thrown when acquiring a connection from the database connection pool times out.
 */
export class ConnectionPoolTimeoutError extends Error {
  readonly code = 'CONNECTION_POOL_TIMEOUT';
  readonly status = 503;

  constructor(message = 'Database connection pool timed out while waiting for an available connection.') {
    super(message);
    this.name = 'ConnectionPoolTimeoutError';
  }
}

/**
 * Options for configuring database connection pool.
 */
export interface ConnectionPoolOptions {
  maxConnections: number;
  poolTimeout: number; // in milliseconds
}

/**
 * Database connection pool with concurrency storm protection, queueing, and timeouts.
 */
export class ConnectionPool<T = unknown> {
  private activeCount = 0;
  private peakActive = 0;
  private totalAcquisitions = 0;
  private totalReleases = 0;
  private queue: Array<{
    resolve: (conn: T) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  constructor(
    private readonly options: ConnectionPoolOptions,
    private readonly factory: () => Promise<T> | T = () => ({} as T)
  ) {
    if (options.maxConnections < 1 || !Number.isInteger(options.maxConnections)) {
      throw new Error('ConnectionPool maxConnections must be a positive integer.');
    }
    if (options.poolTimeout < 0) {
      throw new Error('ConnectionPool poolTimeout must be a non-negative number.');
    }
  }

  get activeConnections(): number {
    return this.activeCount;
  }

  get peakConnections(): number {
    return this.peakActive;
  }

  get waitingCount(): number {
    return this.queue.length;
  }

  get totalAcquired(): number {
    return this.totalAcquisitions;
  }

  get totalReleased(): number {
    return this.totalReleases;
  }

  async acquire(): Promise<{ connection: T; release: () => void }> {
    if (this.activeCount < this.options.maxConnections) {
      this.activeCount++;
      if (this.activeCount > this.peakActive) {
        this.peakActive = this.activeCount;
      }
      this.totalAcquisitions++;
      const conn = await this.factory();
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        this.releaseConnection();
      };
      return { connection: conn, release };
    }

    // Capacity reached - queue with timeout
    return new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        const idx = this.queue.findIndex((entry) => entry.timer === timer);
        if (idx !== -1) {
          this.queue.splice(idx, 1);
          rejectPromise(new ConnectionPoolTimeoutError());
        }
      }, this.options.poolTimeout);

      this.queue.push({
        resolve: (conn: T) => {
          clearTimeout(timer);
          let released = false;
          const release = () => {
            if (released) return;
            released = true;
            this.releaseConnection();
          };
          resolvePromise({ connection: conn, release });
        },
        reject: (err: Error) => {
          clearTimeout(timer);
          rejectPromise(err);
        },
        timer,
      });
    });
  }

  async withConnection<R>(fn: (connection: T) => Promise<R> | R): Promise<R> {
    const { connection, release } = await this.acquire();
    try {
      return await fn(connection);
    } finally {
      release();
    }
  }

  private async releaseConnection(): Promise<void> {
    this.totalReleases++;
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      this.totalAcquisitions++;
      try {
        const conn = await this.factory();
        next.resolve(conn);
      } catch (err: any) {
        next.reject(err);
        this.activeCount--;
      }
    } else {
      this.activeCount = Math.max(0, this.activeCount - 1);
    }
  }
}

/** Context passed to a deployment adapter during preparation/adaptation */
export interface DeploymentAdapterContext {
  readonly projectRoot: string;
  readonly buildDir?: string | undefined;
  readonly outputDir?: string | undefined;
  readonly logger?: any;
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

