import { describe, it, expect } from 'vitest';
import { createTestContext } from '../src/harness.js';
import { expectStatus, expectJson, expectHeader } from '../src/assertions.js';

describe('@ranu/testing createTestContext', () => {
  it('dispatches GET requests in-memory under 50ms', async () => {
    const t0 = performance.now();

    const app = createTestContext({
      routes: {
        '/api/health': {
          GET: () => Response.json({ status: 'ok', uptime: 100 }),
        },
      },
    });

    const res = await app.get('/api/health');
    const elapsed = performance.now() - t0;

    expectStatus(res, 200);
    expectHeader(res, 'content-type', 'application/json');

    const data = await expectJson<{ status: string; uptime: number }>(res, {
      status: 'ok',
    });
    expect(data.uptime).toBe(100);
    expect(elapsed).toBeLessThan(100);

    app.dispose();
  });

  it('handles POST requests with JSON payload and returns 201', async () => {
    const app = createTestContext({
      routes: {
        '/api/items': {
          POST: async (req) => {
            const body = await req.json();
            return Response.json({ id: 'item_123', ...body }, { status: 201 });
          },
        },
      },
    });

    const res = await app.post('/api/items', { name: 'Widget', price: 42 });
    expectStatus(res, 201);

    const body = await expectJson<{ id: string; name: string; price: number }>(res);
    expect(body.id).toBe('item_123');
    expect(body.name).toBe('Widget');
    expect(body.price).toBe(42);

    app.dispose();
  });

  it('handles route parameters like [id]', async () => {
    const app = createTestContext({
      routes: {
        '/api/users/[id]': {
          GET: (req, ctx) => {
            return Response.json({ userId: ctx.params.id });
          },
        },
      },
    });

    const res = await app.get('/api/users/user_999');
    expectStatus(res, 200);

    const data = await expectJson<{ userId: string }>(res);
    expect(data.userId).toBe('user_999');

    app.dispose();
  });

  it('supports query parameters', async () => {
    const app = createTestContext({
      routes: {
        '/api/search': {
          GET: (req) => {
            const url = new URL(req.url);
            return Response.json({ q: url.searchParams.get('q'), limit: url.searchParams.get('limit') });
          },
        },
      },
    });

    const res = await app.get('/api/search', { query: { q: 'ranu', limit: 10 } });
    expectStatus(res, 200);

    const data = await expectJson<{ q: string; limit: string }>(res);
    expect(data.q).toBe('ranu');
    expect(data.limit).toBe('10');

    app.dispose();
  });

  it('supports custom middleware', async () => {
    const app = createTestContext({
      middleware: (req) => {
        if (!req.headers.has('authorization')) {
          return new Response('Unauthorized', { status: 401 });
        }
      },
      routes: {
        '/api/secure': {
          GET: () => Response.json({ secret: 'classified' }),
        },
      },
    });

    const unauthRes = await app.get('/api/secure');
    expectStatus(unauthRes, 401);

    const authRes = await app.get('/api/secure', {
      headers: { authorization: 'Bearer token123' },
    });
    expectStatus(authRes, 200);

    app.dispose();
  });

  it('returns 405 Method Not Allowed when method is missing', async () => {
    const app = createTestContext({
      routes: {
        '/api/only-get': {
          GET: () => new Response('ok'),
        },
      },
    });

    const postRes = await app.post('/api/only-get', {});
    expectStatus(postRes, 405);

    app.dispose();
  });

  it('returns 404 for unrouted paths', async () => {
    const app = createTestContext({
      routes: {},
    });

    const res = await app.get('/api/does-not-exist');
    expectStatus(res, 404);

    app.dispose();
  });
});
