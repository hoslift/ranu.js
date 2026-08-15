import { describe, it, expect } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { RanuServerRuntime } from '../../packages/runtime/src/index.js';
import {
  createNodeRequestHandler,
  NodeRequestContextStore,
  NodeApiEndpointDispatcher,
} from '../../packages/runtime-node/src/index.js';

describe('Integration Tests (Phase 7 Node Runtime)', () => {
  it('should verify core contracts dispatch logic', async () => {
    // 1. Construct context store and API dispatcher
    const contextStore = new NodeRequestContextStore();
    const apiDispatcher = new NodeApiEndpointDispatcher({
      loadModule: async (routeId) => {
        if (routeId === 'api:/api/hello') {
          return {
            GET: async (req, ctx) => {
              return new Response(
                JSON.stringify({
                  message: 'Hello World',
                  requestId: ctx.requestId,
                  paramName: ctx.params.name,
                }),
                {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' },
                },
              );
            },
            POST: async (req, ctx) => {
              const text = await req.text();
              return new Response(`Echo: ${text}`, { status: 201 });
            },
          };
        }
        throw new Error(`Unknown routeId: ${routeId}`);
      },
    });

    // 2. Setup mock page renderer and static dispatcher (excluded from Phase 7)
    const mockRenderer = {
      render: async () => new Response('Rendered Page', { status: 200 }),
    };

    const mockStaticDispatcher = {
      dispatch: async () => new Response('Static Content', { status: 200 }),
    };

    // 3. Composed RanuServerRuntime with registered dynamic API route
    const runtime = new RanuServerRuntime({
      routeRecords: [
        {
          routeId: 'api:/api/hello',
          kind: 'api',
          pattern: {
            segments: [
              { kind: 'static', value: 'api' },
              { kind: 'dynamic', param: 'name' },
            ],
          },
          pathnameTemplate: '/api/[name]',
          params: ['name'],
          methods: ['GET', 'POST'],
          layouts: [],
          errors: [],
        } as any,
      ],
      contextStore,
      apiDispatcher,
      staticDispatcher: mockStaticDispatcher,
      renderer: mockRenderer,
      config: { mode: 'development' },
    });

    // 4. Composition: Create Node HTTP bridge request handler
    const handler = createNodeRequestHandler(runtime);

    // 5. Spin up a real Node.js HTTP server
    const server = http.createServer(handler);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address() as AddressInfo;
    const baseUrl = `http://${address.address}:${address.port}`;

    try {
      // Test A: GET Request and parameter extraction/context propagation
      const resA = await fetch(`${baseUrl}/api/john`);
      expect(resA.status).toBe(200);
      expect(resA.headers.get('content-type')).toBe('application/json');
      const dataA = await resA.json();
      expect(dataA.message).toBe('Hello World');
      expect(dataA.paramName).toBe('john');
      expect(dataA.requestId).toBeDefined();

      // Test B: POST Request with streaming body
      const resB = await fetch(`${baseUrl}/api/john`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'Ranu.js',
      });
      expect(resB.status).toBe(201);
      const textB = await resB.text();
      expect(textB).toBe('Echo: Ranu.js');

      // Test C: OPTIONS Request (implicitly generated)
      const resC = await fetch(`${baseUrl}/api/john`, {
        method: 'OPTIONS',
      });
      expect(resC.status).toBe(204);
      expect(resC.headers.get('Allow')).toBe('GET, HEAD, OPTIONS, POST');

      // Test D: HEAD Request (implicit GET execution with body suppression)
      const resD = await fetch(`${baseUrl}/api/john`, {
        method: 'HEAD',
      });
      expect(resD.status).toBe(200);
      expect(resD.headers.get('content-type')).toBe('application/json');
      const textD = await resD.text();
      expect(textD).toBe(''); // Body must be suppressed

      // Test E: Unsupported Method (405)
      const resE = await fetch(`${baseUrl}/api/john`, {
        method: 'PUT',
      });
      expect(resE.status).toBe(405);
    } finally {
      // 6. Tear down server
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  it.todo('should match filesystem routes to routing tree');
});
