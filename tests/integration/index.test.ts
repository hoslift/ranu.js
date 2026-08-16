import { describe, it, expect } from 'vitest';
import { RanuServerRuntime, type StaticDispatcher, type RanuRenderer } from '@ranu/runtime';
import {
  createNodeServer,
  NodeRequestContextStore,
  NodeApiEndpointDispatcher,
  type ApiRouteModule,
} from '@ranu/runtime-node';
import type { CompiledApiRouteRecord } from '@ranu/router';

const dummyStaticDispatcher: StaticDispatcher = {
  dispatch: async () => new Response('static'),
};

const dummyRenderer: RanuRenderer = {
  render: async () => new Response('page'),
};

describe('Phase 7 Integration Tests (Node Runtime HTTP End-to-End)', () => {
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
});
