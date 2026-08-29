import http from 'node:http';
import type { Socket } from 'node:net';
import type { RanuServerRuntime } from '@ranu/runtime';
import { createNodeRequestHandler } from './handler.js';
import type { NodeRequestHandlerOptions } from './handler.js';

export interface NodeServerOptions extends NodeRequestHandlerOptions {
  readonly runtime: RanuServerRuntime;
  readonly port?: number | undefined;
  readonly host?: string | undefined;
  readonly requestTimeout?: number | undefined;
  readonly shutdownTimeout?: number | undefined;
}

export interface NodeServerAddress {
  readonly port: number;
  readonly host: string;
}

/** Default graceful shutdown timeout: 5000ms */
export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5000;

/**
 * Encapsulates the Node.js HTTP server runtime lifecycle.
 * Manages server startup, active socket tracking, connection draining, and bounded graceful shutdown.
 */
export class NodeServer {
  readonly httpServer: http.Server;
  private readonly connections = new Set<Socket>();
  private requestHandler: ReturnType<typeof createNodeRequestHandler>;
  private isShuttingDown = false;
  private closePromise: Promise<void> | undefined;

  constructor(private readonly options: NodeServerOptions) {
    this.requestHandler = createNodeRequestHandler(options.runtime, {
      defaultHost: options.defaultHost,
      trustProxy: options.trustProxy,
      bodyLimit: options.bodyLimit,
    });

    this.httpServer = http.createServer((req, res) => {
      res.once('finish', () => {
        if (this.isShuttingDown) {
          req.socket.destroySoon();
        }
      });
      void this.requestHandler(req, res);
    });

    if (typeof options.requestTimeout === 'number' && options.requestTimeout > 0) {
      this.httpServer.requestTimeout = options.requestTimeout;
    }

    // Track active connection sockets for graceful shutdown draining
    this.httpServer.on('connection', (socket: Socket) => {
      this.connections.add(socket);
      socket.once('close', () => {
        this.connections.delete(socket);
      });
    });
  }

  /** Replaces the default runtime handler while preserving lifecycle tracking. */
  setRequestHandler(handler: ReturnType<typeof createNodeRequestHandler>): void {
    this.requestHandler = handler;
  }

  /**
   * Starts listening on the configured or specified host and port.
   */
  async listen(port?: number, host?: string): Promise<NodeServerAddress> {
    const targetPort = port ?? this.options.port ?? 3000;
    const targetHost = host ?? this.options.host ?? 'localhost';

    return new Promise<NodeServerAddress>((resolve, reject) => {
      const onError = (err: Error) => {
        this.httpServer.off('listening', onListening);
        reject(err);
      };

      const onListening = () => {
        this.httpServer.off('error', onError);
        const addr = this.httpServer.address();
        let boundPort = targetPort;
        let boundHost = targetHost;

        if (addr && typeof addr === 'object') {
          boundPort = addr.port;
          boundHost =
            addr.address === '::' || addr.address === '0.0.0.0' || addr.address === ''
              ? '127.0.0.1'
              : addr.address;
        }

        resolve({
          port: boundPort,
          host: boundHost,
        });
      };

      this.httpServer.once('error', onError);
      this.httpServer.once('listening', onListening);

      this.httpServer.listen(targetPort, targetHost);
    });
  }

  /**
   * Gracefully shuts down the Node.js HTTP server.
   * 1. Stops accepting new incoming connections.
   * 2. Closes idle keep-alive connections.
   * 3. Waits for in-flight requests to complete within the bounded timeout.
   * 4. Forcefully destroys any remaining sockets when the timeout expires.
   */
  async close(shutdownTimeoutMs?: number): Promise<void> {
    if (this.closePromise) {
      return this.closePromise;
    }
    this.isShuttingDown = true;

    const timeout =
      shutdownTimeoutMs ?? this.options.shutdownTimeout ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;

    this.closePromise = new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        try {
          if (typeof this.options.runtime.dispose === 'function') {
            this.options.runtime.dispose();
          }
        } catch {
          // Ignore disposal errors during teardown
        }
        if (err) reject(err);
        else resolve();
      };

      // 1. Forceful timeout timer
      const timer = setTimeout(() => {
        for (const socket of this.connections) {
          socket.destroy();
        }
        this.connections.clear();
        this.httpServer.closeAllConnections();
        finish();
      }, timeout);

      // Node.js timer unref to not prevent event loop exit if server closes early
      if (typeof timer.unref === 'function') {
        timer.unref();
      }

      // Stop server from accepting new incoming connections and drain in-flight requests
      this.httpServer.close((err) => {
        clearTimeout(timer);
        finish(err);
      });

      // A keep-alive client may leave an already-idle socket open after its
      // response. It is safe to close those sockets immediately; sockets with
      // active requests continue draining through the close callback above.
      this.httpServer.closeIdleConnections();
    });

    return this.closePromise;
  }
}

/**
 * Factory helper to create a configured NodeServer instance.
 */
export function createNodeServer(options: NodeServerOptions): NodeServer {
  return new NodeServer(options);
}
