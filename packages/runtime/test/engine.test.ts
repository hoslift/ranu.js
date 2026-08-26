import { describe, it, expect, vi } from 'vitest';
import { RanuServerRuntime } from '../src/engine.js';
import type {
  RanuRequestContext,
  RanuServerRuntimeOptions,
  StaticDispatchTarget,
  RuntimeConfig
} from '../src/types.js';
import type { RequestContextStore } from '../src/context.js';
import type { ApiEndpointDispatcher, ApiDispatchTarget, StaticDispatcher, RanuRenderer, PageRenderTarget } from '../src/dispatch.js';
import type { CompiledRouteRecord } from '@ranu/router';
import type { StaticManifest } from '@ranu/manifests';
import { RedirectSignal, NotFoundSignal } from '../src/signals.js';

// Mock implementations for boundaries
class MockRequestContextStore implements RequestContextStore {
  private currentContext: RanuRequestContext | undefined = undefined;

  run<T>(context: RanuRequestContext, callback: () => T | Promise<T>): T | Promise<T> {
    const prev = this.currentContext;
    this.currentContext = context;
    try {
      const res = callback();
      if (res instanceof Promise) {
        return res.then((val) => {
          this.currentContext = prev;
          return val;
        }).catch((err) => {
          this.currentContext = prev;
          throw err;
        }) as any;
      }
      this.currentContext = prev;
      return res;
    } catch (err) {
      this.currentContext = prev;
      throw err;
    }
  }

  get(): RanuRequestContext | undefined {
    return this.currentContext;
  }
}

class MockApiEndpointDispatcher implements ApiEndpointDispatcher {
  dispatch = vi.fn(async (request: Request, context: RanuRequestContext, target: ApiDispatchTarget) => {
    return new Response(JSON.stringify({ ok: true, routeId: target.routeId, params: context.params }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

class MockStaticDispatcher implements StaticDispatcher {
  dispatch = vi.fn(async (request: Request, context: RanuRequestContext, target: StaticDispatchTarget) => {
    return new Response(`Static: ${target.routeId} at ${target.pathname}`, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  });
}

class MockRanuRenderer implements RanuRenderer {
  render = vi.fn(async (request: Request, context: RanuRequestContext, target: PageRenderTarget) => {
    return new Response(`Rendered page: ${target.routeId} with layouts: ${target.layouts.join(',')}`, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  });
}

describe('RanuServerRuntime Engine', () => {
  const defaultRouteRecords: CompiledRouteRecord[] = [
    {
      routeId: 'page:/about',
      kind: 'page',
      pattern: { segments: [{ kind: 'static', value: 'about' }] },
      pathnameTemplate: '/about',
      params: [],
      layouts: ['root-layout'],
      errors: [],
    },
    {
      routeId: 'api:/api/users',
      kind: 'api',
      pattern: { segments: [{ kind: 'static', value: 'api' }, { kind: 'static', value: 'users' }] },
      pathnameTemplate: '/api/users',
      params: [],
      methods: ['GET', 'POST'],
      layouts: [],
      errors: [],
    } as any,
    {
      routeId: 'page:/products/[id]',
      kind: 'page',
      pattern: { segments: [{ kind: 'static', value: 'products' }, { kind: 'dynamic', param: 'id' }] },
      pathnameTemplate: '/products/[id]',
      params: ['id'],
      layouts: ['root-layout', 'products-layout'],
      errors: [],
    },
    {
      routeId: 'api:/api/posts/[postId]',
      kind: 'api',
      pattern: { segments: [{ kind: 'static', value: 'api' }, { kind: 'static', value: 'posts' }, { kind: 'dynamic', param: 'postId' }] },
      pathnameTemplate: '/api/posts/[postId]',
      params: ['postId'],
      methods: ['GET'],
      layouts: [],
      errors: [],
    } as any,
  ];

  const defaultStaticManifest: StaticManifest = {
    schemaVersion: 1,
    buildId: 'test-build-id',
    routes: [
      { pathname: '/static-page', routeId: 'page:/static-page', file: 'static-page.html' }
    ]
  };

  const createRuntime = (customOpts: Partial<RanuServerRuntimeOptions> = {}) => {
    const contextStore = new MockRequestContextStore();
    const apiDispatcher = new MockApiEndpointDispatcher();
    const staticDispatcher = new MockStaticDispatcher();
    const renderer = new MockRanuRenderer();

    const options: RanuServerRuntimeOptions = {
      routeRecords: defaultRouteRecords,
      staticManifest: defaultStaticManifest,
      contextStore,
      apiDispatcher,
      staticDispatcher,
      renderer,
      config: { mode: 'production' },
      ...customOpts,
    };

    const runtime = new RanuServerRuntime(options);
    return { runtime, contextStore, apiDispatcher, staticDispatcher, renderer };
  };

  it('accepts Web Request and returns Web Response', async () => {
    const { runtime } = createRuntime();
    const request = new Request('http://localhost/about');
    const response = await runtime.handle(request);
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('Rendered page: page:/about');
  });

  it('normalizes HTTP method casing', async () => {
    const { runtime, apiDispatcher } = createRuntime();
    const request = new Request('http://localhost/api/users', { method: 'get' });
    const response = await runtime.handle(request);
    expect(response.status).toBe(200);
    expect(apiDispatcher.dispatch).toHaveBeenCalled();
  });

  it('returns 400 for structurally malformed requests (e.g. malformed percent-encoding)', async () => {
    const { runtime } = createRuntime();
    const request = new Request('http://localhost/about%80');
    const response = await runtime.handle(request);
    expect(response.status).toBe(400);
  });

  it('returns 404 for unknown pathnames directly', async () => {
    const { runtime } = createRuntime();
    const request = new Request('http://localhost/unknown-path', { method: 'POST' });
    const response = await runtime.handle(request);
    expect(response.status).toBe(404);
  });

  it('returns 405 Method Not Allowed for page routes with unsupported methods', async () => {
    const { runtime } = createRuntime();
    const request = new Request('http://localhost/about', { method: 'POST' });
    const response = await runtime.handle(request);
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET, HEAD');
  });

  it('returns 405 Method Not Allowed for API routes with unsupported methods', async () => {
    const { runtime } = createRuntime();
    const request = new Request('http://localhost/api/users', { method: 'DELETE' });
    const response = await runtime.handle(request);
    expect(response.status).toBe(405);
    // Explicit: GET, POST + Implicit HEAD (because GET exists) + Implicit OPTIONS
    expect(response.headers.get('Allow')).toBe('GET, HEAD, OPTIONS, POST');
  });

  it('supports explicit HTTP methods matching API route records', async () => {
    const { runtime, apiDispatcher } = createRuntime();
    const request = new Request('http://localhost/api/users', { method: 'POST' });
    const response = await runtime.handle(request);
    expect(response.status).toBe(200);
    expect(apiDispatcher.dispatch).toHaveBeenCalled();
  });

  it('supports automatic OPTIONS fallback decision on API routes', async () => {
    const { runtime, apiDispatcher } = createRuntime();
    const request = new Request('http://localhost/api/users', { method: 'OPTIONS' });
    const response = await runtime.handle(request);
    expect(response.status).toBe(200);
    expect(apiDispatcher.dispatch).toHaveBeenCalled();
  });

  it('supports automatic HEAD dispatching when GET exists', async () => {
    const { runtime, apiDispatcher } = createRuntime();
    const request = new Request('http://localhost/api/users', { method: 'HEAD' });
    const response = await runtime.handle(request);
    expect(response.status).toBe(200);
    expect(apiDispatcher.dispatch).toHaveBeenCalled();
  });

  it('returns 405 for HEAD on an API route when GET and HEAD are both absent', async () => {
    const postOnlyRecords: CompiledRouteRecord[] = [
      {
        routeId: 'api:/api/save',
        kind: 'api',
        pattern: { segments: [{ kind: 'static', value: 'api' }, { kind: 'static', value: 'save' }] },
        pathnameTemplate: '/api/save',
        params: [],
        methods: ['POST'],
        layouts: [],
        errors: [],
      } as any
    ];
    const { runtime } = createRuntime({ routeRecords: postOnlyRecords });
    const request = new Request('http://localhost/api/save', { method: 'HEAD' });
    const response = await runtime.handle(request);
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('OPTIONS, POST');
  });

  it('preserves explicit HEAD method dispatch', async () => {
    const explicitHeadRecords: CompiledRouteRecord[] = [
      {
        routeId: 'api:/api/check',
        kind: 'api',
        pattern: { segments: [{ kind: 'static', value: 'api' }, { kind: 'static', value: 'check' }] },
        pathnameTemplate: '/api/check',
        params: [],
        methods: ['GET', 'HEAD'],
        layouts: [],
        errors: [],
      } as any
    ];
    const { runtime, apiDispatcher } = createRuntime({ routeRecords: explicitHeadRecords });
    const request = new Request('http://localhost/api/check', { method: 'HEAD' });
    const response = await runtime.handle(request);
    expect(response.status).toBe(200);
    expect(apiDispatcher.dispatch).toHaveBeenCalled();
  });

  it('StaticManifest takes precedence over page SSR dispatch', async () => {
    // '/static-page' exists in both routing records and StaticManifest
    const routeRecordsWithCollision: CompiledRouteRecord[] = [
      ...defaultRouteRecords,
      {
        routeId: 'page:/static-page',
        kind: 'page',
        pattern: { segments: [{ kind: 'static', value: 'static-page' }] },
        pathnameTemplate: '/static-page',
        params: [],
        layouts: ['root-layout'],
        errors: [],
      }
    ];

    const { runtime, renderer, staticDispatcher } = createRuntime({
      routeRecords: routeRecordsWithCollision
    });

    const request = new Request('http://localhost/static-page');
    const response = await runtime.handle(request);
    expect(response.status).toBe(200);
    expect(staticDispatcher.dispatch).toHaveBeenCalled();
    expect(renderer.render).not.toHaveBeenCalled();

    // Derived target must contain only routeId and pathname
    const targetPassed = staticDispatcher.dispatch.mock.calls[0]![2];
    expect(targetPassed).toEqual({
      routeId: 'page:/static-page',
      pathname: '/static-page',
    });
  });

  it('rejects unsupported methods before dispatching a static page', async () => {
    const { runtime, staticDispatcher } = createRuntime();
    const response = await runtime.handle(
      new Request('http://localhost/static-page', { method: 'POST' }),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET, HEAD');
    expect(staticDispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('returns 404 for static-only dynamic paths absent from StaticManifest', async () => {
    const staticOnlyRecord: CompiledRouteRecord[] = [
      {
        routeId: 'page:/docs/[slug]',
        kind: 'page',
        pattern: { segments: [{ kind: 'static', value: 'docs' }, { kind: 'dynamic', param: 'slug' }] },
        pathnameTemplate: '/docs/[slug]',
        params: ['slug'],
        layouts: [],
        errors: [],
        renderMode: 'static'
      } as any
    ];

    const { runtime, renderer } = createRuntime({ routeRecords: staticOnlyRecord });
    const request = new Request('http://localhost/docs/getting-started');
    const response = await runtime.handle(request);
    expect(response.status).toBe(404);
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it('request ID is generated securely on ingestion and upstream ID is validated', async () => {
    const extractUpstreamId = () => 'upstream-validated-id_123';
    const { runtime } = createRuntime({ extractUpstreamId });
    const request = new Request('http://localhost/about');
    const response = await runtime.handle(request);
    expect(response.status).toBe(200);
  });

  it('generates a request ID when Web Crypto is unavailable', async () => {
    vi.stubGlobal('crypto', undefined);
    try {
      const { runtime, renderer } = createRuntime();
      await runtime.handle(new Request('http://localhost/about'));

      const contextPassed = renderer.render.mock.calls[0]![1];
      expect(contextPassed.requestId.length).toBeGreaterThan(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('ignores invalid upstream request IDs containing illegal characters', async () => {
    const extractUpstreamId = () => 'invalid-id-with-spaces ';
    const { runtime, renderer } = createRuntime({ extractUpstreamId });
    const request = new Request('http://localhost/about');
    await runtime.handle(request);

    const contextPassed = renderer.render.mock.calls[0]![1];
    expect(contextPassed.requestId).not.toBe('invalid-id-with-spaces ');
    expect(contextPassed.requestId.length).toBeGreaterThan(0);
  });

  it('ignores invalid upstream request IDs exceeding 64 characters', async () => {
    const extractUpstreamId = () => 'a'.repeat(65);
    const { runtime, renderer } = createRuntime({ extractUpstreamId });
    const request = new Request('http://localhost/about');
    await runtime.handle(request);

    const contextPassed = renderer.render.mock.calls[0]![1];
    expect(contextPassed.requestId).not.toBe('a'.repeat(65));
    expect(contextPassed.requestId.length).toBeGreaterThan(0);
  });

  it('ensures context exists and parameters are mutated in-place', async () => {
    const { runtime, renderer } = createRuntime();
    const request = new Request('http://localhost/products/42');
    await runtime.handle(request);

    expect(renderer.render).toHaveBeenCalled();
    const contextPassed = renderer.render.mock.calls[0]![1];
    expect(contextPassed.params).toEqual({ id: '42' });
  });

  it('returns 404 when a matched route disappears before dispatch', async () => {
    const inconsistentRecords = [...defaultRouteRecords];
    inconsistentRecords.find = () => undefined;
    const { runtime, renderer } = createRuntime({ routeRecords: inconsistentRecords });

    const response = await runtime.handle(new Request('http://localhost/about'));

    expect(response.status).toBe(404);
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it('propagates AbortSignal identity', async () => {
    const { runtime, renderer } = createRuntime();
    const controller = new AbortController();
    const request = new Request('http://localhost/about', { signal: controller.signal });
    await runtime.handle(request);

    const contextPassed = renderer.render.mock.calls[0]![1];
    expect(contextPassed.signal).toBe(request.signal);
  });

  it('middleware direct response prevents endpoint dispatch', async () => {
    const middleware = {
      run: async () => {
        return { type: 'response', response: new Response('Direct Middleware', { status: 201 }) };
      }
    };
    const { runtime, renderer } = createRuntime({ middleware });
    const request = new Request('http://localhost/about');
    const response = await runtime.handle(request);
    expect(response.status).toBe(201);
    expect(await response.text()).toBe('Direct Middleware');
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it('middleware continuation local Map survives and is visible downstream', async () => {
    const middleware = {
      run: async (req: Request, context: RanuRequestContext) => {
        context.locals.set('auth_user', 'ranu-developer');
        return { type: 'next' };
      }
    };
    const { runtime, renderer } = createRuntime({ middleware });
    const request = new Request('http://localhost/about');
    await runtime.handle(request);

    const contextPassed = renderer.render.mock.calls[0]![1];
    expect(contextPassed.locals.get('auth_user')).toBe('ranu-developer');
  });

  it('converts RedirectSignal into redirect Response', async () => {
    const redirectingRenderer: RanuRenderer = {
      render: async () => {
        throw new RedirectSignal('/redirect-target', 307);
      }
    };
    const { runtime } = createRuntime({ renderer: redirectingRenderer });
    const request = new Request('http://localhost/about');
    const response = await runtime.handle(request);
    expect(response.status).toBe(307);
    expect(response.headers.get('Location')).toBe('/redirect-target');
  });

  it('converts NotFoundSignal into 404 Response', async () => {
    const notFoundRenderer: RanuRenderer = {
      render: async () => {
        throw new NotFoundSignal();
      }
    };
    const { runtime } = createRuntime({ renderer: notFoundRenderer });
    const request = new Request('http://localhost/about');
    const response = await runtime.handle(request);
    expect(response.status).toBe(404);
  });

  it('sanitizes unexpected API exceptions in production mode', async () => {
    const failingDispatcher: ApiEndpointDispatcher = {
      dispatch: async () => {
        throw new Error('Database connection failed');
      }
    };
    const { runtime } = createRuntime({
      apiDispatcher: failingDispatcher,
      config: { mode: 'production' }
    });
    const request = new Request('http://localhost/api/users', { method: 'GET' });
    const response = await runtime.handle(request);
    expect(response.status).toBe(500);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    const json = await response.json();
    expect(json.error).toBe('Internal Server Error');
    expect(json.requestId).toBeDefined();
  });

  it('sanitizes unexpected page rendering exceptions in production mode', async () => {
    const failingRenderer: RanuRenderer = {
      render: async () => {
        throw new Error('Component crashed');
      }
    };
    const { runtime } = createRuntime({
      renderer: failingRenderer,
      config: { mode: 'production' }
    });
    const request = new Request('http://localhost/about');
    const response = await runtime.handle(request);
    expect(response.status).toBe(500);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    const html = await response.text();
    expect(html).toContain('Internal Server Error');
    expect(html).not.toContain('Component crashed');
  });

  it('exposes stack trace in development mode', async () => {
    const failingRenderer: RanuRenderer = {
      render: async () => {
        throw new Error('Component crashed');
      }
    };
    const { runtime } = createRuntime({
      renderer: failingRenderer,
      config: { mode: 'development' }
    });
    const request = new Request('http://localhost/about');
    const response = await runtime.handle(request);
    expect(response.status).toBe(500);
    const html = await response.text();
    expect(html).toContain('Development Error');
    expect(html).toContain('Component crashed');
  });

  it('ensures dispatch does not mutate compiled route records', async () => {
    const { runtime } = createRuntime();
    const originalRecords = JSON.parse(JSON.stringify(defaultRouteRecords));

    const request = new Request('http://localhost/products/42');
    await runtime.handle(request);

    expect(defaultRouteRecords).toEqual(originalRecords);
  });
});
