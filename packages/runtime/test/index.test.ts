import { describe, it, expect } from 'vitest';
import type { RanuRequestContext, ApiDispatchTarget, PageRenderTarget, StaticDispatchTarget } from '../src/index.js';
import { RanuServerRuntime, RedirectSignal, NotFoundSignal, isControlSignal } from '../src/index.js';

describe('@ranu/runtime', () => {
  it('exports core contracts and signal classes', () => {
    expect(typeof RanuServerRuntime).toBe('function');
    expect(typeof RedirectSignal).toBe('function');
    expect(typeof NotFoundSignal).toBe('function');
    expect(typeof isControlSignal).toBe('function');
  });

  it('verifies RanuRequestContext and target shapes', () => {
    const req = new Request('http://localhost:3000/api/users');
    const ctx: RanuRequestContext = {
      requestId: 'req-123',
      request: req,
      url: new URL(req.url),
      params: { id: '42' },
      locals: new Map<string, unknown>(),
      signal: req.signal,
    };
    expect(ctx.requestId).toBe('req-123');
    expect(ctx.params.id).toBe('42');

    const apiTarget: ApiDispatchTarget = {
      routeId: 'api:/api/users',
      params: { id: '42' },
      methods: ['GET', 'POST'],
    };
    expect(apiTarget.methods).toContain('GET');

    const pageTarget: PageRenderTarget = {
      routeId: 'page:/about',
      params: {},
      layouts: ['root'],
      errors: [],
    };
    expect(pageTarget.layouts).toEqual(['root']);

    const staticTarget: StaticDispatchTarget = {
      routeId: 'page:/about',
      pathname: '/about',
    };
    expect(staticTarget.pathname).toBe('/about');
  });
});
