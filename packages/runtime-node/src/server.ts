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
  private isShuttingDown = false;

  constructor(private readonly options: NodeServerOptions) {
    const handler = createNodeRequestHandler(options.runtime, {
      defaultHost: options.defaultHost,
      trustProxy: options.trustProxy,
      bodyLimit: options.bodyLimit,
    });

    this.httpServer = http.createServer(handler);

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
          boundHost = addr.address;
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
    if (this.isShuttingDown) {
      return;
    }
    this.isShuttingDown = true;

    const timeout = shutdownTimeoutMs ?? this.options.shutdownTimeout ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;

    return new Promise<void>((resolve, reject) => {
      // 1. Forceful timeout timer
      const timer = setTimeout(() => {
        for (const socket of this.connections) {
          socket.destroy();
        }
        this.connections.clear();
      }, timeout);

      // Node.js timer unref to not prevent event loop exit if server closes early
      if (typeof timer.unref === 'function') {
        timer.unref();
      }

      // Stop server from accepting new incoming connections and drain in-flight requests
      this.httpServer.close((err) => {
        clearTimeout(timer);
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

/**
 * Factory helper to create a configured NodeServer instance.
 */
export function createNodeServer(options: NodeServerOptions): NodeServer {
  return new NodeServer(options);
}
