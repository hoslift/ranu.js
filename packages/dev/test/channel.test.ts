import { describe, it, expect } from 'vitest';
import { DevReloadChannel } from '../src/channel.js';

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
});
