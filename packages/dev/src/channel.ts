import type http from 'node:http';
import type { RanuDiagnostic } from '@ranu/diagnostics';
import type {
  HmrUpdateMessage,
  HmrReloadMessage,
  HmrRecoveredMessage,
} from './hmr/types.js';

export class DevReloadChannel {
  private readonly clients = new Set<http.ServerResponse>();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isClosed = false;

  constructor() {
    this.startHeartbeat();
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.broadcastComment('ping');
    }, 15000);

    if (typeof this.heartbeatInterval.unref === 'function') {
      this.heartbeatInterval.unref();
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }

  /**
   * Handles an incoming SSE connection request at /_ranu/dev-reload (and /_ranu/hmr).
   */
  handleConnection(
    _req: http.IncomingMessage,
    res: http.ServerResponse,
    currentBuildId: string,
    currentGeneration = 0
  ): void {
    if (this.isClosed) {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('Dev server is shutting down');
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.flushHeaders?.();

    this.clients.add(res);

    res.on('close', () => {
      this.clients.delete(res);
    });

    // Send initial connected event with generation
    this.sendTo(res, 'connected', {
      buildId: currentBuildId,
      generation: currentGeneration,
    });
  }

  private sendTo(res: http.ServerResponse, event: string, data: unknown): void {
    try {
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      res.write(`event: ${event}\ndata: ${payload}\n\n`);
    } catch {
      this.clients.delete(res);
    }
  }

  private broadcastComment(comment: string): void {
    if (this.isClosed || this.clients.size === 0) return;
    for (const client of this.clients) {
      try {
        client.write(`: ${comment}\n\n`);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  /**
   * Broadcasts a hot module replacement (HMR) update event to connected clients.
   */
  broadcastUpdate(message: HmrUpdateMessage): void {
    if (this.isClosed || this.clients.size === 0) return;
    for (const client of this.clients) {
      this.sendTo(client, 'update', message);
    }
  }

  /**
   * Broadcasts a full page reload signal to all connected browser clients.
   */
  broadcastReload(message: HmrReloadMessage): void {
    if (this.isClosed || this.clients.size === 0) return;
    for (const client of this.clients) {
      this.sendTo(client, 'reload', message);
    }
  }

  /**
   * Broadcasts build diagnostics error event to connected clients.
   */
  broadcastError(diagnostics: readonly RanuDiagnostic[]): void {
    if (this.isClosed || this.clients.size === 0) return;
    for (const client of this.clients) {
      this.sendTo(client, 'error', { diagnostics });
    }
  }

  /**
   * Broadcasts recovery event after fixing a build error.
   */
  broadcastRecovered(message: HmrRecoveredMessage): void {
    if (this.isClosed || this.clients.size === 0) return;
    for (const client of this.clients) {
      this.sendTo(client, 'recovered', message);
    }
  }

  close(): void {
    if (this.isClosed) return;
    this.isClosed = true;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    for (const client of this.clients) {
      try {
        client.end();
      } catch {
        // Ignore client end error
      }
    }
    this.clients.clear();
  }
}
