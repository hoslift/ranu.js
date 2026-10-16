import { describe, it, expect, vi } from 'vitest';
import {
  RanuServerRuntime,
  waitUntil,
  getActiveRequestContext,
  type RanuRequestContext,
  type RequestContextStore,
  type ApiEndpointDispatcher,
  type StaticDispatcher,
  type RanuRenderer,
} from '../src/index.js';
import type { CompiledRouteRecord } from '@ranu/router';

class TestRequestContextStore implements RequestContextStore {
  private currentContext: RanuRequestContext | undefined = undefined;

  run<T>(context: RanuRequestContext, callback: () => T | Promise<T>): T | Promise<T> {
    const prev = this.currentContext;
    this.currentContext = context;
    try {
      const res = callback();
      if (res instanceof Promise) {
        return res
          .then((val) => {
            this.currentContext = prev;
            return val;
          })
          .catch((err) => {
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

function createTestRuntime(options?: {
  apiDispatch?: ApiEndpointDispatcher['dispatch'];
  rendererRender?: RanuRenderer['render'];
  routes?: CompiledRouteRecord[];
}) {
  const contextStore = new TestRequestContextStore();

  const apiDispatcher: ApiEndpointDispatcher = {
    dispatch:
      options?.apiDispatch ??
      vi.fn(async (_req, ctx) => {
        return new Response(JSON.stringify({ ok: true, requestId: ctx.requestId }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
  };

  const staticDispatcher: StaticDispatcher = {
    dispatch: vi.fn(async () => new Response('static')),
  };

  const renderer: RanuRenderer = {
    render:
      options?.rendererRender ??
      vi.fn(async () => new Response('rendered page', { status: 200 })),
  };

  const routeRecords: CompiledRouteRecord[] = options?.routes ?? [
    {
      routeId: 'api:/api/track',
      kind: 'api',
      pattern: { segments: [{ kind: 'static', value: 'api' }, { kind: 'static', value: 'track' }] },
      pathnameTemplate: '/api/track',
      params: [],
      methods: ['POST', 'GET'],
      layouts: [],
      errors: [],
    } as any,
    {
      routeId: 'page:/about',
      kind: 'page',
      pattern: { segments: [{ kind: 'static', value: 'about' }] },
      pathnameTemplate: '/about',
      params: [],
      methods: ['GET'],
      layouts: [],
      errors: [],
    },
  ];

  const runtime = new RanuServerRuntime({
    routeRecords,
    contextStore,
    apiDispatcher,
    staticDispatcher,
    renderer,
    config: { mode: 'production' },
  });

  return { runtime, contextStore, apiDispatcher, renderer };
}

describe('@ranu/runtime — Background Execution Lifetime Extension (waitUntil)', () => {
  it('throws descriptive error when called outside active request lifecycle', () => {
    expect(() => waitUntil(Promise.resolve())).toThrow(
      /waitUntil\(\) was called outside a valid request lifecycle/,
    );
  });

  it('validates promise input: throws TypeError on null, undefined, or non-promise', async () => {
    let capturedContext: RanuRequestContext | undefined;

    const { runtime } = createTestRuntime({
      apiDispatch: async (_req, ctx) => {
        capturedContext = ctx;
        return new Response('ok');
      },
    });

    await runtime.handle(new Request('http://localhost/api/track'));

    expect(capturedContext).toBeDefined();
    expect(() => (capturedContext as any).waitUntil(null)).toThrow(TypeError);
    expect(() => (capturedContext as any).waitUntil(undefined)).toThrow(TypeError);
    expect(() => (capturedContext as any).waitUntil(123 as any)).toThrow(TypeError);
    expect(() => (capturedContext as any).waitUntil('not-a-promise' as any)).toThrow(TypeError);
    expect(() => (capturedContext as any).waitUntil({} as any)).toThrow(TypeError);
  });

  it('returns HTTP response immediately without awaiting background promises', async () => {
    let taskCompleted = false;
    let capturedContext: RanuRequestContext | undefined;

    const backgroundTask = new Promise<string>((resolve) => {
      setTimeout(() => {
        taskCompleted = true;
        resolve('background-done');
      }, 100);
    });

    const { runtime } = createTestRuntime({
      apiDispatch: async (_req, ctx) => {
        capturedContext = ctx;
        waitUntil(backgroundTask);
        return new Response(JSON.stringify({ status: 'dispatched' }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });

    const start = Date.now();
    const response = await runtime.handle(
      new Request('http://localhost/api/track', { method: 'POST' }),
    );
    const duration = Date.now() - start;

    // Response must return immediately (< 80ms), while task is still pending
    expect(response.status).toBe(202);
    expect(taskCompleted).toBe(false);
    expect(duration).toBeLessThan(80);

    const body = await response.json();
    expect(body.status).toBe('dispatched');

    // Context must record the background promise
    expect(capturedContext?.waitUntilPromises).toBeDefined();
    expect(capturedContext?.waitUntilPromises?.length).toBe(1);

    // After background task resolves, verify completion
    await backgroundTask;
    expect(taskCompleted).toBe(true);
  });

  it('safely catches rejected background promises without crashing or unhandled rejection', async () => {
    let capturedContext: RanuRequestContext | undefined;
    const backgroundError = new Error('Async log drain failed');

    const failingTask = new Promise((_resolve, reject) => {
      setTimeout(() => {
        reject(backgroundError);
      }, 20);
    });

    const { runtime } = createTestRuntime({
      apiDispatch: async (_req, ctx) => {
        capturedContext = ctx;
        ctx.waitUntil(failingTask);
        return new Response('accepted', { status: 200 });
      },
    });

    const response = await runtime.handle(
      new Request('http://localhost/api/track', { method: 'POST' }),
    );
    expect(response.status).toBe(200);

    expect(capturedContext?.waitUntilPromises).toBeDefined();
    expect(capturedContext?.waitUntilPromises?.length).toBe(1);

    // The wrapped promise in waitUntilPromises catches the rejection and resolves to the error
    const safePromise = capturedContext!.waitUntilPromises![0];
    const caughtResult = await safePromise;
    expect(caughtResult).toBe(backgroundError);
  });

  it('allows calling waitUntil via context method and exported helper', async () => {
    const executed: string[] = [];

    const p1 = Promise.resolve().then(() => {
      executed.push('helper');
    });
    const p2 = Promise.resolve().then(() => {
      executed.push('contextMethod');
    });

    let contextInstance: RanuRequestContext | undefined;

    const { runtime } = createTestRuntime({
      apiDispatch: async (_req, ctx) => {
        contextInstance = ctx;
        waitUntil(p1);
        ctx.waitUntil(p2);
        return new Response('all-scheduled');
      },
    });

    const response = await runtime.handle(new Request('http://localhost/api/track'));
    expect(response.status).toBe(200);

    expect(contextInstance?.waitUntilPromises?.length).toBe(2);

    await Promise.all([p1, p2]);
    expect(executed).toContain('helper');
    expect(executed).toContain('contextMethod');
  });

  it('isolates background promises across concurrent requests', async () => {
    const contexts: RanuRequestContext[] = [];

    const { runtime } = createTestRuntime({
      apiDispatch: async (req, ctx) => {
        contexts.push(ctx);
        const url = new URL(req.url);
        const count = Number(url.searchParams.get('count') ?? '1');
        for (let i = 0; i < count; i++) {
          ctx.waitUntil(Promise.resolve(`task-${i}`));
        }
        return new Response(`scheduled-${count}`);
      },
    });

    const [res1, res2] = await Promise.all([
      runtime.handle(new Request('http://localhost/api/track?count=2')),
      runtime.handle(new Request('http://localhost/api/track?count=5')),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    expect(contexts).toHaveLength(2);
    expect(contexts[0].waitUntilPromises?.length).toBe(2);
    expect(contexts[1].waitUntilPromises?.length).toBe(5);
  });
});
