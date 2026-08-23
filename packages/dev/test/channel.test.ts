import { describe, it, expect } from 'vitest';
import { DevReloadChannel } from '../src/channel.js';
import { DEV_CLIENT_SCRIPT } from '../src/client.js';

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

    channel.broadcastError([{ code: 'RANU_TEST', severity: 'error', message: 'failed' }]);
    expect(written.length).toBe(3);
    expect(written[2]).toContain('event: build-error');
    expect(written[2]).not.toContain('event: error');

    channel.close();
    expect(channel.clientCount).toBe(0);
  });

  it('keeps build diagnostics separate from connection failures in the browser client', () => {
    expect(DEV_CLIENT_SCRIPT).toContain("addEventListener('build-error'");
    expect(DEV_CLIENT_SCRIPT).toContain('payload.diagnostics');
    expect(DEV_CLIENT_SCRIPT).toContain("addEventListener('error'");
  });
});
