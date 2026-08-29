import { describe, it, expect } from 'vitest';
import {
  RanuServerRuntime,
  getRegisteredStoresCount,
  type StaticDispatcher,
  type RanuRenderer,
} from '@ranu/runtime';
import {
  createNodeServer,
  NodeRequestContextStore,
  NodeApiEndpointDispatcher,
  type ApiRouteModule,
} from '@ranu/runtime-node';
import { cookies, headers, redirect, notFound } from '@ranu/server';
import type { CompiledApiRouteRecord } from '@ranu/router';

const dummyStaticDispatcher: StaticDispatcher = {
  dispatch: async () => new Response('static'),
};

const dummyRenderer: RanuRenderer = {
  render: async () => new Response('page'),
};

describe('Phase 7 & 8 Integration Tests (Node Runtime & Server Helpers End-to-End)', () => {
  it('serves full HTTP API lifecycle through real Node server', async () => {
    const apiModules: Record<string, ApiRouteModule> = {
      'api:/api/users/[id]': {
        GET: async (req, ctx) => {
          return Response.json({ user: ctx.params.id, query: ctx.url.searchParams.get('format') });
        },
        POST: async (req, ctx) => {
          const body = await req.json();
          return Response.json({ created: true, id: ctx.params.id, body }, { status: 201 });
        },
      },
    };

    const routeRecords: CompiledApiRouteRecord[] = [
      {
        routeId: 'api:/api/users/[id]',
        kind: 'api',
        pattern: {
          segments: [
            { kind: 'static', value: 'api' },
            { kind: 'static', value: 'users' },
            { kind: 'dynamic', param: 'id' },
          ],
        },
        pathnameTemplate: '/api/users/[id]',
        params: ['id'],
        methods: ['GET', 'POST'],
        layouts: [],
        loading: undefined,
        errors: [],
        notFound: undefined,
      },
    ];

    const apiDispatcher = new NodeApiEndpointDispatcher({
      loadModule: async (routeId) => {
        const mod = apiModules[routeId];
        if (!mod) throw new Error(`Not found: ${routeId}`);
        return mod;
      },
    });

    const runtime = new RanuServerRuntime({
      routeRecords,
      contextStore: new NodeRequestContextStore(),
      apiDispatcher,
      staticDispatcher: dummyStaticDispatcher,
      renderer: dummyRenderer,
      config: { mode: 'production' },
    });

    const server = createNodeServer({
      runtime,
      port: 0,
      host: '127.0.0.1',
    });

    const addr = await server.listen();
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      // 1. Test GET /api/users/42?format=full
      const getRes = await fetch(`${baseUrl}/api/users/42?format=full`);
      expect(getRes.status).toBe(200);
      const getData = await getRes.json();
      expect(getData).toEqual({ user: '42', query: 'full' });

      // 2. Test POST /api/users/42
      const postRes = await fetch(`${baseUrl}/api/users/42`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Alice' }),
      });
      expect(postRes.status).toBe(201);
      const postData = await postRes.json();
      expect(postData).toEqual({ created: true, id: '42', body: { name: 'Alice' } });

      // 3. Test 404 Route Miss
      const missRes = await fetch(`${baseUrl}/api/unknown`);
      expect(missRes.status).toBe(404);

      // 4. Test 405 Method Not Allowed & Allow header
      const deleteRes = await fetch(`${baseUrl}/api/users/42`, { method: 'DELETE' });
      expect(deleteRes.status).toBe(405);
      expect(deleteRes.headers.get('allow')).toBe('GET, HEAD, OPTIONS, POST');
    } finally {
      await server.close();
    }
  });

  it('exercises Phase 8 server helpers (headers, cookies, redirect, notFound) in live HTTP request lifecycle', async () => {
    const apiModules: Record<string, ApiRouteModule> = {
      'api:/api/helpers/headers': {
        GET: async () => {
          const reqHeaders = headers();
          return Response.json({
            tenant: reqHeaders.get('x-tenant-id'),
            custom: reqHeaders.get('x-custom-key'),
          });
        },
      },
      'api:/api/helpers/cookies': {
        GET: async () => {
          const c = cookies();
          const session = c.get('session_id')?.value;
          c.set('last_visit', 'now', { path: '/api', httpOnly: true });
          c.set('pref', 'dark', { path: '/', sameSite: 'lax', maxAge: 86400 });
          return Response.json({ session });
        },
      },
      'api:/api/helpers/redirect': {
        GET: async () => {
          redirect('/auth/login', 307);
        },
      },
      'api:/api/helpers/not-found': {
        GET: async () => {
          notFound();
        },
      },
    };

    const routeRecords: CompiledApiRouteRecord[] = [
      {
        routeId: 'api:/api/helpers/headers',
        kind: 'api',
        pattern: {
          segments: [
            { kind: 'static', value: 'api' },
            { kind: 'static', value: 'helpers' },
            { kind: 'static', value: 'headers' },
          ],
        },
        pathnameTemplate: '/api/helpers/headers',
        params: [],
        methods: ['GET'],
        layouts: [],
        loading: undefined,
        errors: [],
        notFound: undefined,
      },
      {
        routeId: 'api:/api/helpers/cookies',
        kind: 'api',
        pattern: {
          segments: [
            { kind: 'static', value: 'api' },
            { kind: 'static', value: 'helpers' },
            { kind: 'static', value: 'cookies' },
          ],
        },
        pathnameTemplate: '/api/helpers/cookies',
        params: [],
        methods: ['GET'],
        layouts: [],
        loading: undefined,
        errors: [],
        notFound: undefined,
      },
      {
        routeId: 'api:/api/helpers/redirect',
        kind: 'api',
        pattern: {
          segments: [
            { kind: 'static', value: 'api' },
            { kind: 'static', value: 'helpers' },
            { kind: 'static', value: 'redirect' },
          ],
        },
        pathnameTemplate: '/api/helpers/redirect',
        params: [],
        methods: ['GET'],
        layouts: [],
        loading: undefined,
        errors: [],
        notFound: undefined,
      },
      {
        routeId: 'api:/api/helpers/not-found',
        kind: 'api',
        pattern: {
          segments: [
            { kind: 'static', value: 'api' },
            { kind: 'static', value: 'helpers' },
            { kind: 'static', value: 'not-found' },
          ],
        },
        pathnameTemplate: '/api/helpers/not-found',
        params: [],
        methods: ['GET'],
        layouts: [],
        loading: undefined,
        errors: [],
        notFound: undefined,
      },
    ];

    const apiDispatcher = new NodeApiEndpointDispatcher({
      loadModule: async (routeId) => {
        const mod = apiModules[routeId];
        if (!mod) throw new Error(`Not found: ${routeId}`);
        return mod;
      },
    });

    const runtime = new RanuServerRuntime({
      routeRecords,
      contextStore: new NodeRequestContextStore(),
      apiDispatcher,
      staticDispatcher: dummyStaticDispatcher,
      renderer: dummyRenderer,
      config: { mode: 'production' },
    });

    const server = createNodeServer({
      runtime,
      port: 0,
      host: '127.0.0.1',
    });

    const addr = await server.listen();
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    try {
      // 1. headers() helper test
      const hRes = await fetch(`${baseUrl}/api/helpers/headers`, {
        headers: {
          'X-Tenant-Id': 'tenant_abc_123',
          'X-Custom-Key': 'key_val_999',
        },
      });
      expect(hRes.status).toBe(200);
      const hData = await hRes.json();
      expect(hData).toEqual({
        tenant: 'tenant_abc_123',
        custom: 'key_val_999',
      });

      // 2. cookies() read + set() multiple Set-Cookie output test
      const cRes = await fetch(`${baseUrl}/api/helpers/cookies`, {
        headers: {
          cookie: 'session_id=user_sess_789',
        },
      });
      expect(cRes.status).toBe(200);
      const cData = await cRes.json();
      expect(cData).toEqual({ session: 'user_sess_789' });

      const setCookies = cRes.headers.getSetCookie();
      expect(setCookies).toHaveLength(2);
      expect(setCookies[0]).toContain('last_visit=now');
      expect(setCookies[0]).toContain('Path=/api');
      expect(setCookies[0]).toContain('HttpOnly');
      expect(setCookies[1]).toContain('pref=dark');
      expect(setCookies[1]).toContain('Path=/');
      expect(setCookies[1]).toContain('Max-Age=86400');
      expect(setCookies[1]).toContain('SameSite=Lax');

      // 3. redirect() helper test (with redirect: manual to inspect 307 + Location)
      const rRes = await fetch(`${baseUrl}/api/helpers/redirect`, { redirect: 'manual' });
      expect(rRes.status).toBe(307);
      expect(rRes.headers.get('location')).toBe('/auth/login');

      // 4. notFound() helper test
      const nfRes = await fetch(`${baseUrl}/api/helpers/not-found`);
      expect(nfRes.status).toBe(404);
      expect(await nfRes.text()).toBe('Not Found');
    } finally {
      await server.close();
    }
  });

  it('automatically unregisters RequestContextStore when NodeServer closes across multiple create/start/close cycles', async () => {
    const initialRegisteredCount = getRegisteredStoresCount();

    for (let cycle = 0; cycle < 5; cycle++) {
      const runtime = new RanuServerRuntime({
        routeRecords: [],
        contextStore: new NodeRequestContextStore(),
        apiDispatcher: new NodeApiEndpointDispatcher({ loadModule: async () => ({}) }),
        staticDispatcher: dummyStaticDispatcher,
        renderer: dummyRenderer,
        config: { mode: 'production' },
      });

      // While runtime is active, registered count has increased
      expect(getRegisteredStoresCount()).toBe(initialRegisteredCount + 1);

      const server = createNodeServer({
        runtime,
        port: 0,
        host: '127.0.0.1',
      });

      await server.listen();

      // Gracefully close server
      await server.close();

      // After server closes, runtime.dispose() was automatically invoked and store count returned to baseline
      expect(getRegisteredStoresCount()).toBe(initialRegisteredCount);

      // Verify helpers outside request fail deterministically
      expect(() => headers()).toThrowError(/getRequestContext\(\) was called outside a valid request lifecycle/);
      expect(() => cookies()).toThrowError(/getRequestContext\(\) was called outside a valid request lifecycle/);
    }
  });
});
