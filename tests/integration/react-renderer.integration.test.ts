import { describe, it, expect } from 'vitest';
import React from 'react';
import {
  RanuServerRuntime,
  type StaticDispatcher,
  type ApiEndpointDispatcher,
} from '@ranu/runtime';
import {
  createNodeServer,
  NodeRequestContextStore,
} from '@ranu/runtime-node';
import { ReactRenderer, createDefaultModuleLoader, type RawModuleLoader } from '@ranu/react';
import { cookies, headers, redirect, notFound, getRequestContext } from '@ranu/server';
import type { CompiledPageRouteRecord } from '@ranu/router';

const dummyStaticDispatcher: StaticDispatcher = {
  dispatch: async () => new Response('static'),
};

const dummyApiDispatcher: ApiEndpointDispatcher = {
  dispatch: async () => new Response('api'),
};

describe('Phase 9–10 React Renderer Integration Tests (End-to-End Node HTTP)', () => {
  it('serves full React SSR streaming lifecycle through real Node server', async () => {
    const rawModules: Record<string, unknown> = {
      'app/layout.tsx': {
        default: ({ children }: any) => {
          return React.createElement('html', { lang: 'en' }, [
            React.createElement('head', { key: 'head' }),
            React.createElement('body', { key: 'body', id: 'app-body' }, children),
          ]);
        },
        metadata: {
          title: { default: 'Ranu Framework', template: '%s | Ranu Framework' },
        },
      },

      'app/users/[name]/page.tsx': {
        default: async ({ params, searchParams }: any) => {
          const reqHeaders = headers();
          const cookieStore = cookies();

          const clientAgent = reqHeaders.get('x-client-app') ?? 'unknown';
          const session = cookieStore.get('auth_session')?.value ?? 'none';

          // Set response cookie during component rendering
          cookieStore.set('visited_profile', params.name, { path: '/' });
          cookieStore.set('visit_time', '2026-08-16', { path: '/' });

          const ctx = getRequestContext();

          return React.createElement('div', { id: 'profile-card' }, [
            React.createElement('h1', { key: 'h1' }, `User: ${params.name}`),
            React.createElement('p', { key: 'tab' }, `Tab: ${searchParams.tab ?? 'default'}`),
            React.createElement('p', { key: 'agent' }, `Client: ${clientAgent}`),
            React.createElement('p', { key: 'sess' }, `Session: ${session}`),
            React.createElement('p', { key: 'req' }, `RequestId: ${ctx?.requestId}`),
          ]);
        },
        generateMetadata: async ({ params }: any) => ({
          title: `Profile of ${params.name}`,
          description: `User profile page for ${params.name}`,
        }),
      },

      'app/redirect/page.tsx': {
        default: () => {
          cookies().set('redirect_trail', 'started', { path: '/' });
          redirect('/destination', 307);
        },
      },

      'app/items/[id]/page.tsx': {
        default: ({ params }: any) => {
          if (params.id === 'missing') {
            notFound();
          }
          return React.createElement('h1', null, `Item ${params.id}`);
        },
      },

      'app/items/not-found.tsx': {
        default: () => React.createElement('div', { id: 'item-404' }, 'Item was not found in catalog.'),
      },

      'app/broken/page.tsx': {
        default: () => {
          throw new Error('Database connection secret: DB_PASS_XYZ');
        },
      },
    };

    const rawLoader: RawModuleLoader = {
      loadRaw: async (path: string) => {
        const mod = rawModules[path];
        if (!mod) {
          throw new Error(`Module not found: ${path}`);
        }
        return mod;
      },
    };

    const loader = createDefaultModuleLoader(rawLoader);
    const renderer = new ReactRenderer({ loader, mode: 'production' });

    const routeRecords: CompiledPageRouteRecord[] = [
      {
        routeId: 'app/users/[name]/page.tsx',
        kind: 'page',
        pattern: {
          segments: [
            { kind: 'static', value: 'users' },
            { kind: 'dynamic', param: 'name' },
          ],
        },
        pathnameTemplate: '/users/[name]',
        params: ['name'],
        layouts: ['app/layout.tsx'],
        loading: undefined,
        errors: [],
        notFound: undefined,
        methods: ['GET', 'HEAD'],
      },
      {
        routeId: 'app/redirect/page.tsx',
        kind: 'page',
        pattern: {
          segments: [{ kind: 'static', value: 'redirect' }],
        },
        pathnameTemplate: '/redirect',
        params: [],
        layouts: ['app/layout.tsx'],
        loading: undefined,
        errors: [],
        notFound: undefined,
        methods: ['GET', 'HEAD'],
      },
      {
        routeId: 'app/items/[id]/page.tsx',
        kind: 'page',
        pattern: {
          segments: [
            { kind: 'static', value: 'items' },
            { kind: 'dynamic', param: 'id' },
          ],
        },
        pathnameTemplate: '/items/[id]',
        params: ['id'],
        layouts: ['app/layout.tsx'],
        loading: undefined,
        errors: [],
        notFound: ['app/items/not-found.tsx'],
        methods: ['GET', 'HEAD'],
      },
      {
        routeId: 'app/broken/page.tsx',
        kind: 'page',
        pattern: {
          segments: [{ kind: 'static', value: 'broken' }],
        },
        pathnameTemplate: '/broken',
        params: [],
        layouts: ['app/layout.tsx'],
        loading: undefined,
        errors: [],
        notFound: undefined,
        methods: ['GET', 'HEAD'],
      },
    ];

    const runtime = new RanuServerRuntime({
      routeRecords,
      contextStore: new NodeRequestContextStore(),
      apiDispatcher: dummyApiDispatcher,
      staticDispatcher: dummyStaticDispatcher,
      renderer,
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
      // 1. Full SSR GET request
      const getRes = await fetch(`${baseUrl}/users/alice?tab=settings`, {
        headers: {
          'x-client-app': 'RanuTestSuite',
          Cookie: 'auth_session=token_987xyz',
        },
      });

      expect(getRes.status).toBe(200);
      expect(getRes.headers.get('Content-Type')).toBe('text/html; charset=utf-8');

      // Verify Set-Cookie preservation (multiple cookies set)
      const setCookies = getRes.headers.getSetCookie();
      expect(setCookies.length).toBeGreaterThanOrEqual(2);
      expect(setCookies.some((c) => c.includes('visited_profile=alice'))).toBe(true);
      expect(setCookies.some((c) => c.includes('visit_time=2026-08-16'))).toBe(true);

      const html = await getRes.text();
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('<title>Profile of alice | Ranu Framework</title>');
      expect(html).toContain('User: alice');
      expect(html).toContain('Tab: settings');
      expect(html).toContain('Client: RanuTestSuite');
      expect(html).toContain('Session: token_987xyz');

      // 2. HEAD Request (Body must be completely suppressed)
      const headRes = await fetch(`${baseUrl}/users/alice`, {
        method: 'HEAD',
      });
      expect(headRes.status).toBe(200);
      expect(headRes.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
      const headBody = await headRes.text();
      expect(headBody).toBe('');

      // 3. Pre-stream redirect() with cookies attached
      const redirectRes = await fetch(`${baseUrl}/redirect`, {
        redirect: 'manual',
      });
      expect(redirectRes.status).toBe(307);
      expect(redirectRes.headers.get('Location')).toBe('/destination');
      const redirectCookies = redirectRes.headers.getSetCookie();
      expect(redirectCookies.some((c) => c.includes('redirect_trail=started'))).toBe(true);

      // 4. Pre-stream notFound() with nearest not-found boundary
      const notFoundRes = await fetch(`${baseUrl}/items/missing`);
      expect(notFoundRes.status).toBe(404);
      const notFoundHtml = await notFoundRes.text();
      expect(notFoundHtml).toContain('id="app-body"'); // Preserved parent layout
      expect(notFoundHtml).toContain('id="item-404"');
      expect(notFoundHtml).toContain('Item was not found in catalog.');

      // 5. Pre-stream render error sanitized in production
      const brokenRes = await fetch(`${baseUrl}/broken`);
      expect(brokenRes.status).toBe(500);
      const brokenHtml = await brokenRes.text();
      expect(brokenHtml).toContain('500 — Server Error');
      expect(brokenHtml).toContain('Internal Server Error');
      expect(brokenHtml).not.toContain('DB_PASS_XYZ'); // Secrets strictly suppressed
    } finally {
      await server.close();
    }
  });
});
