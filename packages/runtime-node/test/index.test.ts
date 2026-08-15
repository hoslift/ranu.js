import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import {
  buildRequestUrl,
  toWebRequest,
  writeWebResponse,
  NodeRequestContextStore,
  NodeApiEndpointDispatcher,
  createNodeRequestHandler,
} from '../src/index.js';
import type { HttpMethod } from '@ranu/core';
import type { RanuRequestContext } from '@ranu/runtime';
import { RanuServerRuntime } from '@ranu/runtime';

// Helper to mock IncomingMessage
class MockIncomingMessage extends Readable {
  method = 'GET';
  url = '/';
  headers: Record<string, string | string[] | undefined> = {};
  complete = false;
  socket = new EventEmitter();

  constructor() {
    super();
  }

  _read() {
    this.push(new TextEncoder().encode('test body'));
    this.push(null);
  }
}

// Helper to mock ServerResponse
class MockServerResponse extends EventEmitter {
  statusCode = 200;
  statusMessage = '';
  headers: Record<string, any> = {};
  headersSent = false;
  writableFinished = false;
  writableEnded = false;
  destroyed = false;

  setHeader(name: string, value: any) {
    this.headers[name.toLowerCase()] = value;
  }

  write(chunk: any) {
    if (this.destroyed || this.writableEnded) {
      throw new Error('write after end');
    }
    return true; // Return true to indicate no backpressure by default
  }

  end() {
    this.writableFinished = true;
    this.writableEnded = true;
    this.emit('finish');
  }

  destroy() {
    this.destroyed = true;
    this.emit('close');
  }
}

describe('@ranu/runtime-node unit tests', () => {
  describe('buildRequestUrl', () => {
    it('builds request URL from host header', () => {
      const url = buildRequestUrl(
        { url: '/about?q=1', headers: { host: 'example.com' } },
        'localhost',
      );
      expect(url).toBe('http://example.com/about?q=1');
    });

    it('falls back to defaultHost when host header is missing', () => {
      const url = buildRequestUrl({ url: '/', headers: {} }, 'localhost');
      expect(url).toBe('http://localhost/');
    });

    it('handles host array headers correctly', () => {
      const url = buildRequestUrl(
        { url: '/foo', headers: { host: ['example.org', 'ignored.org'] } },
        'localhost',
      );
      expect(url).toBe('http://example.org/foo');
    });

    it('detects x-forwarded-proto https protocol', () => {
      const url = buildRequestUrl(
        {
          url: '/secure',
          headers: { host: 'example.com', 'x-forwarded-proto': 'https' },
        },
        'localhost',
      );
      expect(url).toBe('https://example.com/secure');
    });
  });

  describe('toWebRequest', () => {
    it('converts a GET request without body', () => {
      const mockReq = new MockIncomingMessage() as any;
      mockReq.method = 'GET';
      mockReq.url = '/test';
      mockReq.headers = { host: 'example.com', 'x-test-header': 'value' };

      const controller = new AbortController();
      const webReq = toWebRequest(mockReq, controller.signal);

      expect(webReq.method).toBe('GET');
      expect(webReq.url).toBe('http://example.com/test');
      expect(webReq.headers.get('x-test-header')).toBe('value');
      expect(webReq.body).toBeNull();
    });

    it('converts a POST request with body and duplex half', async () => {
      const mockReq = new MockIncomingMessage() as any;
      mockReq.method = 'POST';
      mockReq.url = '/submit';
      mockReq.headers = { host: 'example.com', 'content-type': 'text/plain' };

      const controller = new AbortController();
      const webReq = toWebRequest(mockReq, controller.signal);

      expect(webReq.method).toBe('POST');
      expect(webReq.url).toBe('http://example.com/submit');
      expect(webReq.headers.get('content-type')).toBe('text/plain');
      expect(webReq.body).not.toBeNull();

      // Read mock stream body
      const text = await webReq.text();
      expect(text).toBe('test body');
    });
  });

  describe('writeWebResponse', () => {
    it('writes status, headers, and body correctly', async () => {
      const mockRes = new MockServerResponse() as any;
      const response = new Response('hello world', {
        status: 201,
        headers: { 'x-response-header': 'ok' },
      });

      const signal = new AbortController().signal;
      await writeWebResponse(response, mockRes, { signal });

      expect(mockRes.statusCode).toBe(201);
      expect(mockRes.headers['x-response-header']).toBe('ok');
      expect(mockRes.writableFinished).toBe(true);
    });

    it('handles multiple Set-Cookie headers using getSetCookie', async () => {
      const mockRes = new MockServerResponse() as any;
      const headers = new Headers();
      headers.append('Set-Cookie', 'cookie1=a');
      headers.append('Set-Cookie', 'cookie2=b');
      const response = new Response('body', { headers });

      const signal = new AbortController().signal;
      await writeWebResponse(response, mockRes, { signal });

      expect(mockRes.headers['set-cookie']).toEqual(['cookie1=a', 'cookie2=b']);
    });

    it('suppresses body when suppressBody is set', async () => {
      const mockRes = new MockServerResponse() as any;
      const response = new Response('suppressed body');

      const signal = new AbortController().signal;
      await writeWebResponse(response, mockRes, { signal, suppressBody: true });

      expect(mockRes.writableFinished).toBe(true);
      // Ensure write was not called (can spy on res.write)
      const writeSpy = vi.spyOn(mockRes, 'write');
      expect(writeSpy).not.toHaveBeenCalled();
    });

    it('aborts response streaming on signal abort', async () => {
      const mockRes = new MockServerResponse() as any;
      const controller = new AbortController();

      // Infinite stream
      const infiniteStream = new ReadableStream({
        async start(c) {
          c.enqueue(new Uint8Array([1, 2, 3]));
        },
      });
      const response = new Response(infiniteStream);

      const writePromise = writeWebResponse(response, mockRes, {
        signal: controller.signal,
      });

      // Abort immediately
      controller.abort();

      await expect(writePromise).rejects.toThrow();
      expect(mockRes.destroyed).toBe(true);
    });
  });

  describe('NodeRequestContextStore', () => {
    it('isolates context across concurrent request paths', async () => {
      const store = new NodeRequestContextStore();
      const ctx1 = { requestId: 'req-1' } as any;
      const ctx2 = { requestId: 'req-2' } as any;

      const p1 = store.run(ctx1, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(store.get()).toBe(ctx1);
        expect(store.get()?.requestId).toBe('req-1');
      });

      const p2 = store.run(ctx2, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        expect(store.get()).toBe(ctx2);
        expect(store.get()?.requestId).toBe('req-2');
      });

      await Promise.all([p1, p2]);
      expect(store.get()).toBeUndefined();
    });
  });

  describe('NodeApiEndpointDispatcher', () => {
    it('executes target HTTP methods correctly', async () => {
      const getHandler = vi.fn(async () => new Response('get response'));
      const mockLoader = async () => ({ GET: getHandler });

      const dispatcher = new NodeApiEndpointDispatcher({ loadModule: mockLoader });
      const request = new Request('http://localhost/api', { method: 'GET' });
      const context = { requestId: 'id' } as any;
      const route = { routeId: 'api:/api', methods: ['GET'] } as any;

      const res = await dispatcher.dispatch(request, context, route);
      expect(getHandler).toHaveBeenCalledWith(request, context);
      expect(await res.text()).toBe('get response');
    });

    it('handles generated OPTIONS responses deterministically', async () => {
      const mockLoader = async () => ({ GET: async () => new Response() });
      const dispatcher = new NodeApiEndpointDispatcher({ loadModule: mockLoader });

      const request = new Request('http://localhost/api', { method: 'OPTIONS' });
      const context = { requestId: 'id' } as any;

      // 1. GET only
      const route1 = { routeId: 'api:/1', methods: ['GET'] } as any;
      const res1 = await dispatcher.dispatch(request, context, route1);
      expect(res1.status).toBe(204);
      expect(res1.headers.get('Allow')).toBe('GET, HEAD, OPTIONS');

      // 2. POST only
      const route2 = { routeId: 'api:/2', methods: ['POST'] } as any;
      const res2 = await dispatcher.dispatch(request, context, route2);
      expect(res2.headers.get('Allow')).toBe('OPTIONS, POST');

      // 3. GET and POST
      const route3 = { routeId: 'api:/3', methods: ['GET', 'POST'] } as any;
      const res3 = await dispatcher.dispatch(request, context, route3);
      expect(res3.headers.get('Allow')).toBe('GET, HEAD, OPTIONS, POST');
    });

    it('executes explicit OPTIONS handler if defined', async () => {
      const explicitOptions = vi.fn(async () => new Response('explicit options'));
      const mockLoader = async () => ({ OPTIONS: explicitOptions });
      const dispatcher = new NodeApiEndpointDispatcher({ loadModule: mockLoader });

      const request = new Request('http://localhost/api', { method: 'OPTIONS' });
      const context = { requestId: 'id' } as any;
      const route = { routeId: 'api:/1', methods: ['GET'] } as any;

      const res = await dispatcher.dispatch(request, context, route);
      expect(explicitOptions).toHaveBeenCalled();
      expect(await res.text()).toBe('explicit options');
    });

    it('executes explicit HEAD handler if defined', async () => {
      const explicitHead = vi.fn(
        async () =>
          new Response('head body', { headers: { 'x-head': 'yes' } }),
      );
      const mockLoader = async () => ({ HEAD: explicitHead });
      const dispatcher = new NodeApiEndpointDispatcher({ loadModule: mockLoader });

      const request = new Request('http://localhost/api', { method: 'HEAD' });
      const context = { requestId: 'id' } as any;
      const route = { routeId: 'api:/1', methods: ['HEAD'] } as any;

      const res = await dispatcher.dispatch(request, context, route);
      expect(explicitHead).toHaveBeenCalled();
      expect(res.body).toBeNull(); // Verifies response body is suppressed
      expect(res.headers.get('x-head')).toBe('yes');
    });

    it('falls back to GET handler for implicit HEAD and suppresses body', async () => {
      const getHandler = vi.fn(
        async () =>
          new Response('get body', { headers: { 'x-shared': 'yes' } }),
      );
      const mockLoader = async () => ({ GET: getHandler });
      const dispatcher = new NodeApiEndpointDispatcher({ loadModule: mockLoader });

      const request = new Request('http://localhost/api', { method: 'HEAD' });
      const context = { requestId: 'id' } as any;
      const route = { routeId: 'api:/1', methods: ['GET'] } as any;

      const res = await dispatcher.dispatch(request, context, route);
      expect(getHandler).toHaveBeenCalled();
      expect(res.body).toBeNull();
      expect(res.headers.get('x-shared')).toBe('yes');
    });

    it('throws error if loader fails or loader result is invalid', async () => {
      const mockLoader = async () => {
        throw new Error('load err');
      };
      const dispatcher = new NodeApiEndpointDispatcher({ loadModule: mockLoader });

      const request = new Request('http://localhost/api', { method: 'GET' });
      const context = {} as any;
      const route = { routeId: 'api:/1', methods: ['GET'] } as any;

      await expect(
        dispatcher.dispatch(request, context, route),
      ).rejects.toThrow('Failed to load route module');
    });
  });

  describe('createNodeRequestHandler & Abort Lifecycle', () => {
    const mockContextStore = {
      run: (ctx: any, cb: any) => cb(),
      get: () => undefined,
    } as any;

    const mockApiDispatcher = {
      dispatch: async () => new Response('api response'),
    } as any;

    const mockStaticDispatcher = {
      dispatch: async () => new Response('static response'),
    } as any;

    const mockRenderer = {
      render: async () => new Response('page response'),
    } as any;

    const createRuntime = (routeRecords: any[] = []) => {
      return new RanuServerRuntime({
        routeRecords,
        contextStore: mockContextStore,
        apiDispatcher: mockApiDispatcher,
        staticDispatcher: mockStaticDispatcher,
        renderer: mockRenderer,
        config: { mode: 'development' },
      });
    };

    it('does not abort signal on normal completed request', async () => {
      const runtime = createRuntime([
        {
          routeId: 'api:/api',
          kind: 'api',
          pattern: { segments: [{ kind: 'static', value: 'api' }] },
          pathnameTemplate: '/api',
          params: [],
          methods: ['GET'],
          layouts: [],
          errors: [],
        } as any,
      ]);

      const handler = createNodeRequestHandler(runtime);

      const mockReq = new MockIncomingMessage() as any;
      mockReq.method = 'GET';
      mockReq.url = '/api';
      mockReq.complete = true;

      const mockRes = new MockServerResponse() as any;
      mockRes.writableFinished = true;

      // Wrap handle in runtime mock to inspect abort signal
      const handleSpy = vi.spyOn(runtime, 'handle');

      await handler(mockReq, mockRes);

      expect(handleSpy).toHaveBeenCalled();
      const passedRequest = handleSpy.mock.calls[0][0];
      expect(passedRequest.signal.aborted).toBe(false);

      // Verify that closing events now do not trigger abort since it completed
      mockReq.emit('close');
      mockRes.emit('close');
      expect(passedRequest.signal.aborted).toBe(false);
    });

    it('aborts on client prematurely disconnecting (req close with complete === false)', async () => {
      const runtime = createRuntime([
        {
          routeId: 'api:/api',
          kind: 'api',
          pattern: { segments: [{ kind: 'static', value: 'api' }] },
          pathnameTemplate: '/api',
          params: [],
          methods: ['GET'],
          layouts: [],
          errors: [],
        } as any,
      ]);

      const handler = createNodeRequestHandler(runtime);

      const mockReq = new MockIncomingMessage() as any;
      mockReq.method = 'GET';
      mockReq.url = '/api';
      mockReq.complete = false; // client disconnected prematurely

      const mockRes = new MockServerResponse() as any;
      mockRes.writableFinished = false;

      // Mock writeWebResponse to hang or simulate wait
      const originalHandle = runtime.handle.bind(runtime);
      let capturedSignal: AbortSignal | undefined;
      vi.spyOn(runtime, 'handle').mockImplementation(async (req) => {
        capturedSignal = req.signal;
        // Wait for connection close event to trigger
        await new Promise((resolve) => setTimeout(resolve, 50));
        return originalHandle(req);
      });

      const handlerPromise = handler(mockReq, mockRes);

      // Trigger premature request socket close
      setTimeout(() => {
        mockReq.emit('close');
      }, 10);

      await handlerPromise;

      expect(capturedSignal).toBeDefined();
      expect(capturedSignal?.aborted).toBe(true);
    });

    it('aborts on response prematurely closing (res close with writableFinished === false)', async () => {
      const runtime = createRuntime([
        {
          routeId: 'api:/api',
          kind: 'api',
          pattern: { segments: [{ kind: 'static', value: 'api' }] },
          pathnameTemplate: '/api',
          params: [],
          methods: ['GET'],
          layouts: [],
          errors: [],
        } as any,
      ]);

      const handler = createNodeRequestHandler(runtime);

      const mockReq = new MockIncomingMessage() as any;
      mockReq.method = 'GET';
      mockReq.url = '/api';
      mockReq.complete = true;

      const mockRes = new MockServerResponse() as any;
      mockRes.writableFinished = false; // socket closed before finish

      let capturedSignal: AbortSignal | undefined;
      vi.spyOn(runtime, 'handle').mockImplementation(async (req) => {
        capturedSignal = req.signal;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return new Response('res');
      });

      const handlerPromise = handler(mockReq, mockRes);

      setTimeout(() => {
        mockRes.emit('close');
      }, 10);

      await handlerPromise;

      expect(capturedSignal).toBeDefined();
      expect(capturedSignal?.aborted).toBe(true);
    });
  });
});
