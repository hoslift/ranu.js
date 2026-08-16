import { describe, it, expect } from 'vitest';
import React from 'react';
import { ReactRenderer } from '../src/renderer.js';
import type { ComponentModuleLoader, PageModule, LayoutModule, LoadingModule, NotFoundModule } from '../src/types.js';
import type { RanuRequestContext, PageRenderTarget, RequestContextStore } from '@ranu/runtime';
import {
  registerRequestContextStore,
  RedirectSignal,
  NotFoundSignal,
} from '@ranu/runtime';

class TestContextStore implements RequestContextStore {
  private activeCtx?: RanuRequestContext;
  async run<T>(context: RanuRequestContext, callback: () => T | Promise<T>): Promise<T> {
    const prev = this.activeCtx;
    this.activeCtx = context;
    try {
      return await callback();
    } finally {
      this.activeCtx = prev;
    }
  }
  get(): RanuRequestContext | undefined {
    return this.activeCtx;
  }
}

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  return result;
}

describe('ReactRenderer Integration Unit Tests', () => {
  const contextStore = new TestContextStore();
  registerRequestContextStore(contextStore);

  function createTestContext(urlStr: string = 'http://localhost/test', params: Record<string, string> = {}): RanuRequestContext {
    const url = new URL(urlStr);
    const request = new Request(url, {
      headers: {
        'User-Agent': 'RanuTestClient',
        Cookie: 'session_id=sess_abc123',
      },
    });

    return {
      requestId: 'test-req-1',
      request,
      url,
      params,
      locals: new Map(),
      signal: request.signal,
      responseCookies: [],
      depth: 1,
    };
  }

  it('renders a basic page with root layout into valid HTML response', async () => {
    const pageModule: PageModule = {
      default: ({ params, searchParams }: any) => {
        return React.createElement('main', null, [
          React.createElement('h1', { key: 'h1' }, `Welcome ${params.name}`),
          React.createElement('p', { key: 'p' }, `Query: ${searchParams.query}`),
        ]);
      },
      metadata: {
        title: 'Home Page',
        description: 'Welcome to Ranu',
      },
    };

    const rootLayout: LayoutModule = {
      default: ({ children }: any) => {
        return React.createElement('html', { lang: 'en' }, [
          React.createElement('head', { key: 'head' }),
          React.createElement('body', { key: 'body' }, children),
        ]);
      },
    };

    const loader: ComponentModuleLoader = {
      loadPage: async () => pageModule,
      loadLayout: async () => rootLayout,
      loadLoading: async () => undefined,
      loadError: async () => undefined,
      loadNotFound: async () => undefined,
    };

    const renderer = new ReactRenderer({ loader, mode: 'development' });
    const context = createTestContext('http://localhost/users/alice?query=ranu', { name: 'alice' });

    const target: PageRenderTarget = {
      routeId: 'app/users/[name]/page.tsx',
      params: context.params,
      layouts: ['app/layout.tsx'],
      errors: [],
    };

    const response = await contextStore.run(context, async () => {
      return renderer.render(context.request, context, target);
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');

    const html = await streamToString(response.body as ReadableStream<Uint8Array>);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<title>Home Page</title>');
    expect(html).toContain('Welcome alice');
    expect(html).toContain('Query: ranu');
  });

  it('executes async components with context propagation', async () => {
    const asyncPageModule: PageModule = {
      default: async () => {
        // Access current context through store
        const currentCtx = contextStore.get();
        const userAgent = currentCtx?.request.headers.get('user-agent');
        const cookieHeader = currentCtx?.request.headers.get('cookie');

        // Push response cookie
        currentCtx?.responseCookies.push('visited=true; Path=/');

        return React.createElement('div', null, [
          React.createElement('span', { key: 'ua' }, `UA: ${userAgent}`),
          React.createElement('span', { key: 'cookie' }, `Cookie: ${cookieHeader}`),
          React.createElement('span', { key: 'rid' }, `ReqId: ${currentCtx?.requestId}`),
        ]);
      },
    };

    const rootLayout: LayoutModule = {
      default: ({ children }: any) => React.createElement('html', null, React.createElement('body', null, children)),
    };

    const loader: ComponentModuleLoader = {
      loadPage: async () => asyncPageModule,
      loadLayout: async () => rootLayout,
      loadLoading: async () => undefined,
      loadError: async () => undefined,
      loadNotFound: async () => undefined,
    };

    const renderer = new ReactRenderer({ loader });
    const context = createTestContext();

    const target: PageRenderTarget = {
      routeId: 'app/page.tsx',
      params: {},
      layouts: ['app/layout.tsx'],
      errors: [],
    };

    const response = await contextStore.run(context, async () => {
      return renderer.render(context.request, context, target);
    });

    expect(response.status).toBe(200);
    const html = await streamToString(response.body as ReadableStream<Uint8Array>);
    expect(html).toContain('UA: RanuTestClient');
    expect(html).toContain('Cookie: session_id=sess_abc123');
    expect(html).toContain('ReqId: test-req-1');

    // Verify response cookie was recorded
    expect(context.responseCookies).toContain('visited=true; Path=/');
  });

  it('handles redirect control signal returning HTTP 307 with Location header', async () => {
    const redirectPage: PageModule = {
      default: () => {
        throw new RedirectSignal('/login', 307);
      },
    };

    const loader: ComponentModuleLoader = {
      loadPage: async () => redirectPage,
      loadLayout: async () => ({ default: ({ children }: any) => children }),
      loadLoading: async () => undefined,
      loadError: async () => undefined,
      loadNotFound: async () => undefined,
    };

    const renderer = new ReactRenderer({ loader });
    const context = createTestContext();

    const target: PageRenderTarget = {
      routeId: 'app/dashboard/page.tsx',
      params: {},
      layouts: ['app/layout.tsx'],
      errors: [],
    };

    const response = await contextStore.run(context, async () => {
      return renderer.render(context.request, context, target);
    });

    expect(response.status).toBe(307);
    expect(response.headers.get('Location')).toBe('/login');
  });

  it('handles notFound control signal returning HTTP 404 with custom not-found UI and parent layout', async () => {
    const notFoundPage: PageModule = {
      default: () => {
        throw new NotFoundSignal();
      },
    };

    const rootLayout: LayoutModule = {
      default: ({ children }: any) => React.createElement('html', null, React.createElement('body', { id: 'root-layout' }, children)),
    };

    const customNotFound: NotFoundModule = {
      default: () => React.createElement('div', { id: 'custom-404' }, 'Item could not be found.'),
    };

    const loader: ComponentModuleLoader = {
      loadPage: async () => notFoundPage,
      loadLayout: async () => rootLayout,
      loadLoading: async () => undefined,
      loadError: async () => undefined,
      loadNotFound: async () => customNotFound,
    };

    const renderer = new ReactRenderer({ loader });
    const context = createTestContext();

    const target: PageRenderTarget = {
      routeId: 'app/products/[id]/page.tsx',
      params: { id: '999' },
      layouts: ['app/layout.tsx'],
      errors: [],
      notFound: ['app/products/not-found.tsx'],
    };

    const response = await contextStore.run(context, async () => {
      return renderer.render(context.request, context, target);
    });

    expect(response.status).toBe(404);
    const html = await streamToString(response.body as ReadableStream<Uint8Array>);
    expect(html).toContain('id="root-layout"');
    expect(html).toContain('id="custom-404"');
    expect(html).toContain('Item could not be found.');
  });

  it('catches pre-stream render errors and returns sanitized HTTP 500 in production', async () => {
    const crashingPage: PageModule = {
      default: () => {
        throw new Error('Database password failed: SECRET_KEY_123');
      },
    };

    const loader: ComponentModuleLoader = {
      loadPage: async () => crashingPage,
      loadLayout: async () => ({ default: ({ children }: any) => children }),
      loadLoading: async () => undefined,
      loadError: async () => undefined,
      loadNotFound: async () => undefined,
    };

    const renderer = new ReactRenderer({ loader, mode: 'production' });
    const context = createTestContext();

    const target: PageRenderTarget = {
      routeId: 'app/broken/page.tsx',
      params: {},
      layouts: [],
      errors: [],
    };

    const response = await contextStore.run(context, async () => {
      return renderer.render(context.request, context, target);
    });

    expect(response.status).toBe(500);
    const html = await streamToString(response.body as ReadableStream<Uint8Array>);
    expect(html).toContain('500 — Server Error');
    expect(html).toContain('Internal Server Error');
    expect(html).not.toContain('SECRET_KEY_123');
    expect(html).toContain('test-req-1');
  });
});
