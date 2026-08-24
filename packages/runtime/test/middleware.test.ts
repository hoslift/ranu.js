import { describe, it, expect } from 'vitest';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  RanuServerRuntime,
  createRuntimeMiddleware,
  compileMatcherPattern,
  matchPathPattern,
  RewriteSignal,
  MiddlewareNextSignal,
  type RanuRequestContext,
} from '../src/index.js';

class TestRequestContextStore {
  private storage = new AsyncLocalStorage<RanuRequestContext>();
  run<T>(context: RanuRequestContext, callback: () => T | Promise<T>): T | Promise<T> {
    return this.storage.run(context, callback);
  }
  get(): RanuRequestContext | undefined {
    return this.storage.getStore();
  }
}

describe('Middleware Pattern Matcher', () => {
  it('matches exact paths', () => {
    expect(matchPathPattern('/dashboard', '/dashboard')).toBe(true);
    expect(matchPathPattern('/dashboard', '/dashboard/')).toBe(false);
    expect(matchPathPattern('/dashboard', '/other')).toBe(false);
  });

  it('matches single param segments', () => {
    expect(matchPathPattern('/users/:id', '/users/123')).toBe(true);
    expect(matchPathPattern('/users/:id', '/users/abc')).toBe(true);
    expect(matchPathPattern('/users/:id', '/users/123/profile')).toBe(false);
    expect(matchPathPattern('/users/:id', '/users')).toBe(false);
  });

  it('matches catch-all segments (:path*)', () => {
    expect(matchPathPattern('/dashboard/:path*', '/dashboard')).toBe(true);
    expect(matchPathPattern('/dashboard/:path*', '/dashboard/analytics')).toBe(true);
    expect(matchPathPattern('/dashboard/:path*', '/dashboard/a/b/c')).toBe(true);
    expect(matchPathPattern('/dashboard/:path*', '/api')).toBe(false);
  });

  it('matches wildcard segments (*)', () => {
    expect(matchPathPattern('/api/*', '/api/users')).toBe(true);
    expect(matchPathPattern('/api/*', '/api/v1/posts')).toBe(true);
    expect(matchPathPattern('/api/*', '/web/users')).toBe(false);
  });
});

describe('Middleware Runtime Execution & Signals', () => {
  const contextStore = new TestRequestContextStore();

  const dummyRenderer = {
    render: async (_req: Request, ctx: RanuRequestContext, target: any) => {
      const user = ctx.locals.get('user');
      const body = `<html><body>Route: ${target.routeId}${user ? `, User: ${user}` : ''}</body></html>`;
      return new Response(body, {
        headers: { 'Content-Type': 'text/html' },
      });
    },
  };

  const dummyApiDispatcher = {
    dispatch: async (_req: Request, ctx: RanuRequestContext, target: any) => {
      const user = ctx.locals.get('user');
      return Response.json({
        routeId: target.routeId,
        user: user ?? null,
      });
    },
  };

  const dummyStaticDispatcher = {
    dispatch: async (_req: Request, _ctx: RanuRequestContext, target: any) => {
      return new Response(`<html>Static: ${target.routeId}</html>`, {
        headers: { 'Content-Type': 'text/html' },
      });
    },
  };

  const routeRecords: any[] = [
    {
      routeId: 'page-home',
      kind: 'page',
      pattern: { segments: [] },
      pathnameTemplate: '/',
      params: [],
      layouts: [],
      errors: [],
      methods: ['GET', 'HEAD'],
    },
    {
      routeId: 'page-dashboard',
      kind: 'page',
      pattern: { segments: [{ kind: 'static', value: 'dashboard' }] },
      pathnameTemplate: '/dashboard',
      params: [],
      layouts: [],
      errors: [],
      methods: ['GET', 'HEAD'],
    },
    {
      routeId: 'page-admin',
      kind: 'page',
      pattern: { segments: [{ kind: 'static', value: 'admin' }] },
      pathnameTemplate: '/admin',
      params: [],
      layouts: [],
      errors: [],
      methods: ['GET', 'HEAD'],
    },
    {
      routeId: 'api-users',
      kind: 'api',
      pattern: {
        segments: [
          { kind: 'static', value: 'api' },
          { kind: 'static', value: 'users' },
        ],
      },
      pathnameTemplate: '/api/users',
      params: [],
      methods: ['GET'],
      layouts: [],
      errors: [],
    },
  ];

  it('runs middleware with next() and allows request to proceed', async () => {
    let middlewareRan = false;
    const middleware = createRuntimeMiddleware({
      default: async (_req: Request, ctx: any) => {
        middlewareRan = true;
        ctx.locals.set('user', 'alice');
        return new MiddlewareNextSignal({
          'x-middleware-ran': 'true',
        });
      },
    });

    const runtime = new RanuServerRuntime({
      routeRecords,
      contextStore,
      apiDispatcher: dummyApiDispatcher,
      staticDispatcher: dummyStaticDispatcher,
      renderer: dummyRenderer,
      middleware,
      config: { mode: 'production' },
    });

    const req = new Request('http://localhost:3000/dashboard');
    const res = await runtime.handle(req);

    expect(res.status).toBe(200);
    expect(middlewareRan).toBe(true);
    expect(res.headers.get('x-middleware-ran')).toBe('true');
    const text = await res.text();
    expect(text).toContain('User: alice');
  });

  it('merges middleware headers into a fetched Response with immutable headers', async () => {
    const middleware = createRuntimeMiddleware({
      default: async () => new MiddlewareNextSignal({ 'x-middleware-ran': 'true' }),
    });
    const runtime = new RanuServerRuntime({
      routeRecords,
      contextStore,
      apiDispatcher: {
        dispatch: async () => fetch('data:text/plain,ok'),
      },
      staticDispatcher: dummyStaticDispatcher,
      renderer: dummyRenderer,
      middleware,
      config: { mode: 'production' },
    });

    const response = await runtime.handle(new Request('http://localhost:3000/api/users'));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-ran')).toBe('true');
    expect(await response.text()).toBe('ok');
  });

  it.each([{ type: 'response' }, { type: 'rewrite', url: '' }, { type: 'next', headers: 42 }])(
    'rejects malformed middleware continuation %#',
    async (continuation) => {
      const middleware = createRuntimeMiddleware({
        default: async () => continuation,
      });
      const runtime = new RanuServerRuntime({
        routeRecords,
        contextStore,
        apiDispatcher: dummyApiDispatcher,
        staticDispatcher: dummyStaticDispatcher,
        renderer: dummyRenderer,
        middleware,
        config: { mode: 'production' },
      });

      const response = await runtime.handle(new Request('http://localhost:3000/dashboard'));
      expect(response.status).toBe(500);
    },
  );

  it('middleware can return direct Response, terminating downstream route', async () => {
    const middleware = createRuntimeMiddleware({
      default: async (req: Request) => {
        if (req.url.includes('/admin')) {
          return new Response('Unauthorized from Middleware', {
            status: 401,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
      },
    });

    const runtime = new RanuServerRuntime({
      routeRecords,
      contextStore,
      apiDispatcher: dummyApiDispatcher,
      staticDispatcher: dummyStaticDispatcher,
      renderer: dummyRenderer,
      middleware,
      config: { mode: 'production' },
    });

    const req = new Request('http://localhost:3000/admin');
    const res = await runtime.handle(req);

    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).toBe('Unauthorized from Middleware');
  });

  it('middleware can trigger redirect with 307 or 308', async () => {
    const middleware = createRuntimeMiddleware({
      default: async (req: Request) => {
        if (req.url.includes('/old-admin')) {
          return new Response(null, {
            status: 307,
            headers: { Location: '/admin' },
          });
        }
      },
    });

    const runtime = new RanuServerRuntime({
      routeRecords,
      contextStore,
      apiDispatcher: dummyApiDispatcher,
      staticDispatcher: dummyStaticDispatcher,
      renderer: dummyRenderer,
      middleware,
      config: { mode: 'production' },
    });

    const req = new Request('http://localhost:3000/old-admin');
    const res = await runtime.handle(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('Location')).toBe('/admin');
  });

  it('middleware can rewrite URL and merge query parameters', async () => {
    const middleware = createRuntimeMiddleware({
      default: async (req: Request) => {
        const url = new URL(req.url);
        if (url.pathname === '/legacy') {
          return new RewriteSignal('/dashboard?rewritten=true');
        }
      },
    });

    const runtime = new RanuServerRuntime({
      routeRecords,
      contextStore,
      apiDispatcher: dummyApiDispatcher,
      staticDispatcher: dummyStaticDispatcher,
      renderer: dummyRenderer,
      middleware,
      config: { mode: 'production' },
    });

    const req = new Request('http://localhost:3000/legacy?original=true');
    const res = await runtime.handle(req);

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('Route: page-dashboard');
  });

  it('detects rewrite loops and terminates with a deterministic error', async () => {
    const middleware = createRuntimeMiddleware({
      default: async (req: Request) => {
        const url = new URL(req.url);
        if (url.pathname === '/loop-a') {
          return new RewriteSignal('/loop-b');
        }
        if (url.pathname === '/loop-b') {
          return new RewriteSignal('/loop-a');
        }
      },
    });

    const runtime = new RanuServerRuntime({
      routeRecords,
      contextStore,
      apiDispatcher: dummyApiDispatcher,
      staticDispatcher: dummyStaticDispatcher,
      renderer: dummyRenderer,
      middleware,
      config: { mode: 'production' },
    });

    const req = new Request('http://localhost:3000/loop-a');
    const res = await runtime.handle(req);

    expect(res.status).toBe(500);
  });

  it('bypasses /_ranu/ internal framework assets', async () => {
    let middlewareRan = false;
    const middleware = createRuntimeMiddleware({
      default: async () => {
        middlewareRan = true;
        return new Response('Blocked', { status: 403 });
      },
    });

    const runtime = new RanuServerRuntime({
      routeRecords,
      contextStore,
      apiDispatcher: dummyApiDispatcher,
      staticDispatcher: dummyStaticDispatcher,
      renderer: dummyRenderer,
      middleware,
      config: { mode: 'production' },
    });

    const req = new Request('http://localhost:3000/_ranu/dev-client.js');
    const res = await runtime.handle(req);

    expect(middlewareRan).toBe(false);
    expect(res.status).toBe(404);
  });

  it('respects matcher configuration', async () => {
    let matcherExecutionCount = 0;
    const middleware = createRuntimeMiddleware({
      config: {
        matcher: ['/dashboard/:path*'],
      },
      default: async () => {
        matcherExecutionCount++;
      },
    });

    const runtime = new RanuServerRuntime({
      routeRecords,
      contextStore,
      apiDispatcher: dummyApiDispatcher,
      staticDispatcher: dummyStaticDispatcher,
      renderer: dummyRenderer,
      middleware,
      config: { mode: 'production' },
    });

    // Request not matching matcher -> bypasses middleware
    await runtime.handle(new Request('http://localhost:3000/admin'));
    expect(matcherExecutionCount).toBe(0);

    // Request matching matcher -> executes middleware
    await runtime.handle(new Request('http://localhost:3000/dashboard'));
    expect(matcherExecutionCount).toBe(1);
  });

  it('isolates request locals across concurrent requests', async () => {
    const middleware = createRuntimeMiddleware({
      default: async (req: Request, ctx: any) => {
        const id = new URL(req.url).searchParams.get('id');
        ctx.locals.set('id', id);
        await new Promise((resolve) => setTimeout(resolve, 10));
      },
    });

    const runtime = new RanuServerRuntime({
      routeRecords,
      contextStore,
      apiDispatcher: dummyApiDispatcher,
      staticDispatcher: dummyStaticDispatcher,
      renderer: {
        render: async (_req: Request, ctx: RanuRequestContext) => {
          return new Response(`ID: ${ctx.locals.get('id')}`);
        },
      },
      middleware,
      config: { mode: 'production' },
    });

    const [res1, res2] = await Promise.all([
      runtime.handle(new Request('http://localhost:3000/dashboard?id=1')),
      runtime.handle(new Request('http://localhost:3000/dashboard?id=2')),
    ]);

    expect(await res1.text()).toBe('ID: 1');
    expect(await res2.text()).toBe('ID: 2');
  });

  it('rejects CRLF header injection in middleware response headers', async () => {
    const middleware = createRuntimeMiddleware({
      default: async () => {
        return new MiddlewareNextSignal({
          'x-bad-header\r\ninjected': 'true',
        });
      },
    });

    const runtime = new RanuServerRuntime({
      routeRecords,
      contextStore,
      apiDispatcher: dummyApiDispatcher,
      staticDispatcher: dummyStaticDispatcher,
      renderer: dummyRenderer,
      middleware,
      config: { mode: 'production' },
    });

    const res = await runtime.handle(new Request('http://localhost:3000/dashboard'));
    expect(res.status).toBe(500);
  });
});
