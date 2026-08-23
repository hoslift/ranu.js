import { describe, it, expect } from 'vitest';
import { DEV_CLIENT_SCRIPT } from '../src/client.js';

describe('DEV_CLIENT_SCRIPT browser injection payload', () => {
  it('is a non-empty string of JavaScript', () => {
    expect(typeof DEV_CLIENT_SCRIPT).toBe('string');
    expect(DEV_CLIENT_SCRIPT.length).toBeGreaterThan(0);
  });

  it('guards against non-browser environments before wiring anything up', () => {
    expect(DEV_CLIENT_SCRIPT).toContain("typeof window === 'undefined'");
    expect(DEV_CLIENT_SCRIPT).toContain("typeof EventSource === 'undefined'");
  });

  it('connects to the canonical dev-reload SSE endpoint', () => {
    expect(DEV_CLIENT_SCRIPT).toContain("/_ranu/dev-reload");
    expect(DEV_CLIENT_SCRIPT).toContain('new EventSource(reloadEndpoint)');
  });

  it('registers connected, reload, and error SSE listeners', () => {
    expect(DEV_CLIENT_SCRIPT).toContain("addEventListener('connected'");
    expect(DEV_CLIENT_SCRIPT).toContain("addEventListener('reload'");
    expect(DEV_CLIENT_SCRIPT).toContain("addEventListener('error'");
  });

  it('triggers a full page reload when a reload event is received', () => {
    expect(DEV_CLIENT_SCRIPT).toContain('window.location.reload()');
  });

  it('schedules a reconnect attempt on connection error', () => {
    expect(DEV_CLIENT_SCRIPT).toContain('source.close()');
    expect(DEV_CLIENT_SCRIPT).toContain('setTimeout(function()');
    expect(DEV_CLIENT_SCRIPT).toContain('1500');
  });

  it('is syntactically valid standalone JavaScript', () => {
    // Executing the script body should not throw even without a browser
    // `window`/`EventSource` global, since it early-returns in that case.
    expect(() => new Function(DEV_CLIENT_SCRIPT)()).not.toThrow();
  });
});