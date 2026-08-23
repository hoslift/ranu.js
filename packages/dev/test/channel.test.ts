import { describe, it, expect, vi } from 'vitest';
import { DevReloadChannel } from '../src/channel.js';

function createMockRes(
  written: string[],
  options?: { failWrite?: boolean; closeHandlers?: Array<() => void> },
) {
  const mockRes: any = {
    writeHead: () => {},
    write: (data: string) => {
      if (options?.failWrite) {
        throw new Error('client socket destroyed');
      }
      written.push(data);
    },
    flushHeaders: () => {},
    on: (event: string, handler: () => void) => {
      if (event === 'close') {
        options?.closeHandlers?.push(handler);
      }
    },
    end: () => {},
  };
  return mockRes;
}

describe('DevReloadChannel SSE Transport', () => {
  it('manages client connections and broadcasts reload events', () => {
    const channel = new DevReloadChannel();
    expect(channel.clientCount).toBe(0);

    const written: string[] = [];
    const mockRes: any = {
      writeHead: () => {},
      write: (data: string) => {
        written.push(data);
      },
      flushHeaders: () => {},
      on: () => {},
      end: () => {},
    };

    channel.handleConnection({} as any, mockRes, 'dev-build-1');
    expect(channel.clientCount).toBe(1);
    expect(written[0]).toContain('event: connected');
    expect(written[0]).toContain('dev-build-1');

    channel.broadcastReload({ buildId: 'dev-build-2', reason: 'rebuild' });
    expect(written.length).toBe(2);
    expect(written[1]).toContain('event: reload');
    expect(written[1]).toContain('dev-build-2');

    channel.close();
    expect(channel.clientCount).toBe(0);
  });

  it('broadcasts diagnostics to all clients via the build-error event', () => {
    const channel = new DevReloadChannel();
    const written: string[] = [];
    const mockRes = createMockRes(written);

    channel.handleConnection({} as any, mockRes, 'dev-build-1');
    written.length = 0; // discard the initial "connected" event payload

    channel.broadcastError([
      { code: 'RANU_TEST_ERROR', severity: 'error', message: 'Something broke' },
    ]);

    expect(written.length).toBe(1);
    expect(written[0]).toContain('event: build-error');
    expect(written[0]).toContain('RANU_TEST_ERROR');
    expect(written[0]).toContain('Something broke');

    channel.close();
  });

  it('broadcasts to every connected client, not just the first', () => {
    const channel = new DevReloadChannel();
    const writtenA: string[] = [];
    const writtenB: string[] = [];

    channel.handleConnection({} as any, createMockRes(writtenA), 'dev-build-1');
    channel.handleConnection({} as any, createMockRes(writtenB), 'dev-build-1');
    expect(channel.clientCount).toBe(2);

    writtenA.length = 0;
    writtenB.length = 0;

    channel.broadcastReload({ buildId: 'dev-build-2' });

    expect(writtenA.length).toBe(1);
    expect(writtenB.length).toBe(1);
    expect(writtenA[0]).toContain('dev-build-2');
    expect(writtenB[0]).toContain('dev-build-2');

    channel.close();
  });

  it('removes a client from the registry when its connection closes', () => {
    const channel = new DevReloadChannel();
    const written: string[] = [];
    const closeHandlers: Array<() => void> = [];
    const mockRes = createMockRes(written, { closeHandlers });

    channel.handleConnection({} as any, mockRes, 'dev-build-1');
    expect(channel.clientCount).toBe(1);

    // Simulate the underlying socket firing its 'close' event.
    closeHandlers.forEach((handler) => handler());
    expect(channel.clientCount).toBe(0);

    channel.close();
  });

  it('drops a client whose write() throws instead of crashing the broadcast', () => {
    const channel = new DevReloadChannel();
    const writtenGood: string[] = [];
    const writtenBad: string[] = [];
    const badClientOptions = { failWrite: false };

    channel.handleConnection({} as any, createMockRes(writtenBad, badClientOptions), 'dev-build-1');
    channel.handleConnection({} as any, createMockRes(writtenGood), 'dev-build-1');
    expect(channel.clientCount).toBe(2);

    badClientOptions.failWrite = true;
    writtenGood.length = 0;

    expect(() => channel.broadcastReload({ buildId: 'dev-build-2' })).not.toThrow();

    // The failing client is pruned; the healthy client still gets the event.
    expect(channel.clientCount).toBe(1);
    expect(writtenGood.length).toBe(1);

    channel.close();
  });

  it('rejects new connections with 503 once the channel has been closed', () => {
    const channel = new DevReloadChannel();
    channel.close();

    let statusCode = 0;
    let body = '';
    const mockRes: any = {
      writeHead: (code: number) => {
        statusCode = code;
      },
      end: (data?: string) => {
        body = data ?? '';
      },
    };

    channel.handleConnection({} as any, mockRes, 'dev-build-1');
    expect(statusCode).toBe(503);
    expect(body).toContain('shutting down');
    expect(channel.clientCount).toBe(0);
  });

  it('is a no-op to broadcast when there are no connected clients', () => {
    const channel = new DevReloadChannel();
    expect(() => channel.broadcastReload({ buildId: 'x' })).not.toThrow();
    expect(() => channel.broadcastError([])).not.toThrow();
    channel.close();
  });

  it('close() is idempotent and ends all remaining clients exactly once', () => {
    const channel = new DevReloadChannel();
    let endCount = 0;
    const mockRes: any = {
      writeHead: () => {},
      write: () => {},
      flushHeaders: () => {},
      on: () => {},
      end: () => {
        endCount++;
      },
    };

    channel.handleConnection({} as any, mockRes, 'dev-build-1');
    expect(channel.clientCount).toBe(1);

    channel.close();
    channel.close(); // second call should be a no-op, not double-end the client

    expect(endCount).toBe(1);
    expect(channel.clientCount).toBe(0);
  });

  it('sends periodic keep-alive comments in the SSE comment format', () => {
    const channel = new DevReloadChannel();
    const written: string[] = [];
    channel.handleConnection({} as any, createMockRes(written), 'dev-build-1');
    written.length = 0;

    // Exercise the heartbeat payload logic directly rather than waiting on
    // the real 15s interval.
    (channel as unknown as { broadcastComment(comment: string): void }).broadcastComment('ping');

    expect(written.length).toBe(1);
    expect(written[0]).toBe(': ping\n\n');

    channel.close();
  });

  it('runs the heartbeat timer and prunes clients that reject keep-alive writes', () => {
    vi.useFakeTimers();
    const channel = new DevReloadChannel();
    const written: string[] = [];
    const options = { failWrite: false };

    try {
      channel.handleConnection({} as any, createMockRes(written, options), 'dev-build-1');
      written.length = 0;
      options.failWrite = true;

      vi.advanceTimersByTime(15_000);

      expect(channel.clientCount).toBe(0);
    } finally {
      channel.close();
      vi.useRealTimers();
    }
  });

  it('ignores client end failures while closing the channel', () => {
    const channel = new DevReloadChannel();
    const mockRes: any = {
      writeHead: () => {},
      write: () => {},
      flushHeaders: () => {},
      on: () => {},
      end: () => {
        throw new Error('socket already closed');
      },
    };

    channel.handleConnection({} as any, mockRes, 'dev-build-1');

    expect(() => channel.close()).not.toThrow();
    expect(channel.clientCount).toBe(0);
  });
});
