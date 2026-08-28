import { describe, it, expect, vi } from 'vitest';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import {
  buildRequestUrl,
  toWebRequest,
  writeWebResponse,
  isBodylessStatus,
  NodeRequestContextStore,
  NodeApiEndpointDispatcher,
  calculateAllowHeader,
  createNodeRequestHandler,
  NodeServer,
  createNodeServer,
  parseBodyLimit,
  PayloadTooLargeError,
  type ApiRouteModule,
} from '../src/index.js';
import type { RanuRequestContext, StaticDispatcher, RanuRenderer } from '@ranu/runtime';
import { RanuServerRuntime } from '@ranu/runtime';
import type { CompiledRouteRecord } from '@ranu/router';

// Helper mock static & renderer dispatchers
const mockStaticDispatcher: StaticDispatcher = {
  dispatch: async () => new Response('static'),
};

const mockRenderer: RanuRenderer = {
  render: async () => new Response('page'),
};

describe('@ranu/runtime-node', () => {
  describe('Body Limit Parsing & Error', () => {
    it('parses numeric and string body limits', () => {
      expect(parseBodyLimit(undefined)).toBe(1024 * 1024);
      expect(parseBodyLimit(5000)).toBe(5000);
      expect(parseBodyLimit('512kb')).toBe(512 * 1024);
      expect(parseBodyLimit('2mb')).toBe(2 * 1024 * 1024);
      expect(parseBodyLimit('1gb')).toBe(1024 * 1024 * 1024);
      expect(parseBodyLimit('invalid')).toBe(1024 * 1024);
    });

    it('PayloadTooLargeError has status 413', () => {
      const err = new PayloadTooLargeError();
      expect(err.status).toBe(413);
      expect(err.name).toBe('PayloadTooLargeError');
    });
  });

  describe('Request URL Construction & Proxy Trust', () => {
    it('constructs absolute URL with default host and direct transport protocol', () => {
      const req = {
        url: '/api/items?q=test',
        headers: { host: 'example.com:8080' },
        socket: { encrypted: false },
      };
      expect(buildRequestUrl(req)).toBe('http://example.com:8080/api/items?q=test');
    });

    it('detects https from direct socket encryption', () => {
      const req = {
        url: '/secure',
        headers: { host: 'secure.com' },
        socket: { encrypted: true },
      };
      expect(buildRequestUrl(req)).toBe('https://secure.com/secure');
    });

    it('ignores forwarded headers by default (trustProxy disabled)', () => {
      const req = {
        url: '/test',
        headers: {
          host: 'direct.com',
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'spoofed.com',
        },
        socket: { encrypted: false },
      };
      expect(buildRequestUrl(req, { trustProxy: false })).toBe('http://direct.com/test');
    });

    it('honors forwarded headers when trustProxy is explicitly enabled', () => {
      const req = {
        url: '/test',
        headers: {
          host: 'direct.com',
          'x-forwarded-proto': 'https, http',
          'x-forwarded-host': 'actual-domain.com, proxy.com',
        },
        socket: { encrypted: false },
      };
      expect(buildRequestUrl(req, { trustProxy: true })).toBe('https://actual-domain.com/test');
    });

    it('uses the first array-valued forwarded host when trustProxy is enabled', () => {
      const req = {
        url: '/test',
        headers: {
          host: 'direct.com',
          'x-forwarded-host': ['first.example', 'second.example'],
        },
        socket: { encrypted: false },
      };

      expect(buildRequestUrl(req, { trustProxy: true })).toBe('http://first.example/test');
    });

    it('uses a forwarded HTTPS protocol without a forwarded host', () => {
      const req = {
        url: '/secure',
        headers: {
          host: 'direct.example',
          'x-forwarded-proto': 'https',
        },
        socket: { encrypted: false },
      };
      expect(buildRequestUrl(req, { trustProxy: true })).toBe('https://direct.example/secure');
    });
  });

  describe('toWebRequest Conversion & Body Limits', () => {
    it('converts IncomingMessage headers and method into Web Request', () => {
      const readable = new Readable({
        read() {
          this.push(null);
        },
      });
      const req = Object.assign(readable, {
        method: 'GET',
        url: '/api/test',
        headers: {
          host: 'localhost:3000',
          authorization: 'Bearer token123',
          accept: ['application/json', 'text/plain'],
        },
      }) as unknown as IncomingMessage;

      const abortController = new AbortController();
      const webReq = toWebRequest(req, abortController.signal);

      expect(webReq.method).toBe('GET');
      expect(webReq.url).toBe('http://localhost:3000/api/test');
      expect(webReq.headers.get('authorization')).toBe('Bearer token123');
      expect(webReq.headers.get('accept')).toContain('application/json');
      expect(webReq.body).toBeNull();
    });

    it('immediately rejects requests exceeding Content-Length with 413 PayloadTooLargeError', () => {
      const readable = new Readable({
        read() {
          this.push(null);
        },
      });
      const req = Object.assign(readable, {
        method: 'POST',
        url: '/upload',
        headers: {
          host: 'localhost',
          'content-length': '2097152', // 2MB
        },
      }) as unknown as IncomingMessage;

      const abortController = new AbortController();
      expect(() => {
        toWebRequest(req, abortController.signal, { bodyLimit: '1mb' });
      }).toThrow(PayloadTooLargeError);
    });

    it('streams request body and aborts if consumed stream bytes exceed limit', async () => {
      const readable = new Readable({
        read() {
          this.push(Buffer.alloc(600, 'a'));
          this.push(Buffer.alloc(600, 'b'));
          this.push(null);
        },
      });
      const req = Object.assign(readable, {
        method: 'POST',
        url: '/stream-upload',
        headers: { host: 'localhost' },
      }) as unknown as IncomingMessage;

      const abortController = new AbortController();
      const webReq = toWebRequest(req, abortController.signal, { bodyLimit: 1000 }); // limit 1000 bytes, stream provides 1200

      await expect(async () => {
        await webReq.text();
      }).rejects.toThrow();
    });
  });

  describe('writeWebResponse & HTTP Protocol Rules', () => {
    it('sets status, headers, and body on ServerResponse', async () => {
      const webResponse = new Response('Hello World', {
        status: 201,
        statusText: 'Created',
        headers: { 'X-Custom': 'value1' },
      });

      let written = '';
      const res = {
        statusCode: 200,
        statusMessage: '',
        headers: {} as Record<string, string | string[]>,
        setHeader(k: string, v: string | string[]) {
          this.headers[k.toLowerCase()] = v;
        },
        write(chunk: Uint8Array) {
          written += Buffer.from(chunk).toString();
          return true;
        },
        end() {
          this.writableEnded = true;
          this.writableFinished = true;
        },
        writableEnded: false,
        writableFinished: false,
        destroyed: false,
      } as unknown as ServerResponse;

      const signal = new AbortController().signal;
      await writeWebResponse(webResponse, res, { signal });

      expect(res.statusCode).toBe(201);
      expect(res.statusMessage).toBe('Created');
      expect((res as any).headers['x-custom']).toBe('value1');
      expect(written).toBe('Hello World');
    });

    it('preserves multiple Set-Cookie headers without comma joining', async () => {
      const webResponse = new Response('ok', {
        headers: [
          ['Set-Cookie', 'a=1; Path=/; HttpOnly'],
          ['Set-Cookie', 'b=2; Path=/; Secure'],
        ],
      });

      const headersSet: Record<string, any> = {};
      const res = {
        setHeader(k: string, v: any) {
          headersSet[k.toLowerCase()] = v;
        },
        write() {
          return true;
        },
        end() {
          this.writableEnded = true;
        },
        writableEnded: false,
        destroyed: false,
      } as unknown as ServerResponse;

      const signal = new AbortController().signal;
      await writeWebResponse(webResponse, res, { signal });

      expect(headersSet['set-cookie']).toEqual(['a=1; Path=/; HttpOnly', 'b=2; Path=/; Secure']);
    });

    it('suppresses response body for 204, 304, and isBodylessStatus', async () => {
      expect(isBodylessStatus(204)).toBe(true);
      expect(isBodylessStatus(304)).toBe(true);
      expect(isBodylessStatus(100)).toBe(true);
      expect(isBodylessStatus(200)).toBe(false);

      const webResponse = new Response(null, { status: 204 });
      let written = false;
      const res = {
        statusCode: 200,
        setHeader() {},
        write() {
          written = true;
          return true;
        },
        end() {
          this.writableEnded = true;
        },
        writableEnded: false,
        destroyed: false,
      } as unknown as ServerResponse;

      await writeWebResponse(webResponse, res, { signal: new AbortController().signal });
      expect(res.statusCode).toBe(204);
      expect(written).toBe(false);
    });

    it('suppresses response body when suppressBody is true (HEAD requests)', async () => {
      const webResponse = new Response('large body', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
      let written = false;
      const res = {
        statusCode: 200,
        setHeader() {},
        write() {
          written = true;
          return true;
        },
        end() {
          this.writableEnded = true;
        },
        writableEnded: false,
        destroyed: false,
      } as unknown as ServerResponse;

      await writeWebResponse(webResponse, res, {
        signal: new AbortController().signal,
        suppressBody: true,
      });
      expect(written).toBe(false);
    });
  });

  describe('NodeRequestContextStore AsyncLocalStorage Context Isolation', () => {
    it('isolates context across concurrent asynchronous executions', async () => {
      const store = new NodeRequestContextStore();

      const createMockContext = (id: string): RanuRequestContext => {
        const req = new Request(`http://localhost/req-${id}`);
        return {
          requestId: id,
          request: req,
          url: new URL(req.url),
          params: { id },
          locals: new Map<string, unknown>(),
          signal: req.signal,
        };
      };

      const results = await Promise.all(
        Array.from({ length: 25 }, async (_, i) => {
          const ctx = createMockContext(String(i));
          return store.run(ctx, async () => {
            await new Promise((r) => setTimeout(r, Math.random() * 20));
            const current = store.get();
            return current?.requestId;
          });
        }),
      );

      expect(results).toEqual(Array.from({ length: 25 }, (_, i) => String(i)));
    });
  });

  describe('NodeApiEndpointDispatcher', () => {
    it('calculates deterministic Allow header', () => {
      expect(calculateAllowHeader(['GET', 'POST'])).toBe('GET, HEAD, OPTIONS, POST');
      expect(calculateAllowHeader(['HEAD', 'POST'])).toBe('HEAD, OPTIONS, POST');
      expect(calculateAllowHeader(['DELETE', 'GET', 'PUT'])).toBe(
        'DELETE, GET, HEAD, OPTIONS, PUT',
      );
    });

    it('executes API GET and validates Response return', async () => {
      const mockModule: ApiRouteModule = {
        GET: async (req, ctx) => {
          return Response.json({ success: true, id: ctx.params.id });
        },
      };

      const dispatcher = new NodeApiEndpointDispatcher({
        loadModule: async () => mockModule,
      });

      const req = new Request('http://localhost/api/users/42', { method: 'GET' });
      const ctx: RanuRequestContext = {
        requestId: 'test-1',
        request: req,
        url: new URL(req.url),
        params: { id: '42' },
        locals: new Map(),
        signal: req.signal,
      };

      const res = await dispatcher.dispatch(req, ctx, {
        routeId: 'api:/api/users/[id]',
        params: { id: '42' },
        methods: ['GET'],
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ success: true, id: '42' });
    });

    it('throws error when API handler returns a non-Response object', async () => {
      const mockModule = {
        GET: async () => ({ bad: 'return' }) as any,
      };

      const dispatcher = new NodeApiEndpointDispatcher({
        loadModule: async () => mockModule as any,
      });

      const req = new Request('http://localhost/api/bad');
      const ctx: RanuRequestContext = {
        requestId: 'test-bad',
        request: req,
        url: new URL(req.url),
        params: {},
        locals: new Map(),
        signal: req.signal,
      };

      await expect(
        dispatcher.dispatch(req, ctx, {
          routeId: 'api:/api/bad',
          params: {},
          methods: ['GET'],
        }),
      ).rejects.toThrow(/expected a Web standard Response object/);
    });

    it('handles implicit HEAD via GET while suppressing body', async () => {
      const mockModule: ApiRouteModule = {
        GET: async () => {
          return new Response('Large body content', {
            status: 200,
            headers: { 'Content-Type': 'text/plain', 'X-Custom': 'meta' },
          });
        },
      };

      const dispatcher = new NodeApiEndpointDispatcher({
        loadModule: async () => mockModule,
      });

      const req = new Request('http://localhost/api/data', { method: 'HEAD' });
      const ctx: RanuRequestContext = {
        requestId: 'test-head',
        request: req,
        url: new URL(req.url),
        params: {},
        locals: new Map(),
        signal: req.signal,
      };

      const res = await dispatcher.dispatch(req, ctx, {
        routeId: 'api:/api/data',
        params: {},
        methods: ['GET'],
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('x-custom')).toBe('meta');
      expect(res.body).toBeNull();
    });

    it('generates automatic OPTIONS response with 204 and Allow header', async () => {
      const mockModule: ApiRouteModule = {
        GET: async () => Response.json({ ok: true }),
        POST: async () => Response.json({ ok: true }),
      };

      const dispatcher = new NodeApiEndpointDispatcher({
        loadModule: async () => mockModule,
      });

      const req = new Request('http://localhost/api/items', { method: 'OPTIONS' });
      const ctx: RanuRequestContext = {
        requestId: 'test-opt',
        request: req,
        url: new URL(req.url),
        params: {},
        locals: new Map(),
        signal: req.signal,
      };

      const res = await dispatcher.dispatch(req, ctx, {
        routeId: 'api:/api/items',
        params: {},
        methods: ['GET', 'POST'],
      });

      expect(res.status).toBe(204);
      expect(res.headers.get('allow')).toBe('GET, HEAD, OPTIONS, POST');
    });
  });

  describe('NodeServer Startup & Graceful Shutdown', () => {
    it('preserves wildcard bind addresses', async () => {
      const server = createNodeServer({
        runtime: new RanuServerRuntime({
          routeRecords: [],
          contextStore: new NodeRequestContextStore(),
          apiDispatcher: new NodeApiEndpointDispatcher({ loadModule: async () => ({}) }),
          staticDispatcher: mockStaticDispatcher,
          renderer: mockRenderer,
          config: { mode: 'production' },
        }),
        port: 0,
        host: '0.0.0.0',
      });

      try {
        await expect(server.listen()).resolves.toMatchObject({ host: '0.0.0.0' });
      } finally {
        await server.close();
      }
    });

    it('boots Node HTTP server and executes API request through RanuServerRuntime', async () => {
      const mockModule: ApiRouteModule = {
        GET: async (req, ctx) =>
          Response.json({ message: 'Hello from Node runtime!', id: ctx.params.id }),
      };

      const apiDispatcher = new NodeApiEndpointDispatcher({
        loadModule: async () => mockModule,
      });

      const store = new NodeRequestContextStore();

      const routeRecords: CompiledRouteRecord[] = [
        {
          routeId: 'api:/api/items/[id]',
          kind: 'api',
          pattern: {
            segments: [
              { kind: 'static', value: 'api' },
              { kind: 'static', value: 'items' },
              { kind: 'dynamic', param: 'id' },
            ],
          },
          pathnameTemplate: '/api/items/[id]',
          params: ['id'],
          methods: ['GET'],
          layouts: [],
          errors: [],
        } as any,
      ];

      const runtime = new RanuServerRuntime({
        routeRecords,
        contextStore: store,
        apiDispatcher,
        staticDispatcher: mockStaticDispatcher,
        renderer: mockRenderer,
        config: { mode: 'production' },
      });

      const server = createNodeServer({
        runtime,
        port: 0, // Random available port
        host: '127.0.0.1',
      });

      const addr = await server.listen();
      expect(addr.port).toBeGreaterThan(0);

      try {
        const url = `http://127.0.0.1:${addr.port}/api/items/99`;
        const res = await fetch(url);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json).toEqual({ message: 'Hello from Node runtime!', id: '99' });
      } finally {
        await server.close();
      }
    });

    it('gracefully drains in-flight requests during server.close()', async () => {
      let isSlowRequestFinished = false;
      let resolveStarted!: () => void;
      const startedPromise = new Promise<void>((r) => {
        resolveStarted = r;
      });

      const mockModule: ApiRouteModule = {
        GET: async () => {
          resolveStarted();
          await new Promise((r) => setTimeout(r, 60));
          isSlowRequestFinished = true;
          return Response.json({ slow: true });
        },
      };

      const apiDispatcher = new NodeApiEndpointDispatcher({
        loadModule: async () => mockModule,
      });

      const routeRecords: CompiledRouteRecord[] = [
        {
          routeId: 'api:/api/slow',
          kind: 'api',
          pattern: {
            segments: [
              { kind: 'static', value: 'api' },
              { kind: 'static', value: 'slow' },
            ],
          },
          pathnameTemplate: '/api/slow',
          params: [],
          methods: ['GET'],
          layouts: [],
          errors: [],
        } as any,
      ];

      const server = new NodeServer({
        runtime: new RanuServerRuntime({
          routeRecords,
          contextStore: new NodeRequestContextStore(),
          apiDispatcher,
          staticDispatcher: mockStaticDispatcher,
          renderer: mockRenderer,
          config: { mode: 'production' },
        }),
        port: 0,
        host: '127.0.0.1',
        shutdownTimeout: 2000,
      });

      const addr = await server.listen();

      // Launch in-flight request
      const fetchPromise = fetch(`http://127.0.0.1:${addr.port}/api/slow`);

      // Wait until the server-side request handler actually starts executing
      await startedPromise;

      // Initiate graceful shutdown while request is running
      const closePromise = server.close();

      const [fetchRes] = await Promise.all([fetchPromise, closePromise]);
      expect(fetchRes.status).toBe(200);
      expect(isSlowRequestFinished).toBe(true);
      const data = await fetchRes.json();
      expect(data).toEqual({ slow: true });
    });
  });
});
