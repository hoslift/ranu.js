import { describe, it, expect } from 'vitest';
import React from 'react';
import { composeComponentTree } from '../src/composition.js';
import { ReactRenderer } from '../src/renderer.js';
import type { PageModule, LayoutModule, ComponentModuleLoader } from '../src/types.js';
import type { RanuRequestContext, PageRenderTarget } from '@ranu/runtime';

describe('Phase 16: Client-Side Rendering Mode in @ranu/react', () => {
  const dummyPage: PageModule = {
    render: 'client',
    default: () => <div id="page-content">Server Page Content</div>,
  };

  const dummyLayout: LayoutModule = {
    default: ({ children }) => (
      <html>
        <head>
          <title>Test Shell</title>
        </head>
        <body>
          <div id="layout-wrapper">{children}</div>
        </body>
      </html>
    ),
  };

  it('composes component tree in client mode without rendering server page body', () => {
    const tree = composeComponentTree({
      page: dummyPage,
      layouts: [dummyLayout],
      metadata: { title: 'Client Route Title' },
      pageProps: { params: { id: '123' }, searchParams: {} },
      renderMode: 'client',
      hydrationPayload: {
        buildId: 'bld_client_1',
        routeId: 'page:/client-route',
        pathname: '/client-route',
        params: { id: '123' },
        searchParams: {},
        publicEnv: {},
        assets: { js: ['/_ranu/assets/client-bundle.js'], css: [] },
        renderMode: 'client',
      },
    });

    expect(tree).toBeDefined();
  });

  it('ReactRenderer produces standalone document shell with payload and empty mount point for client route', async () => {
    const loader: ComponentModuleLoader = {
      loadPage: async () => dummyPage,
      loadLayout: async () => dummyLayout,
      loadLoading: async () => undefined,
      loadError: async () => undefined,
      loadNotFound: async () => undefined,
    };

    const renderer = new ReactRenderer({
      loader,
      mode: 'production',
      buildId: 'bld_client_renderer',
      publicEnv: { RANU_PUBLIC_APP_NAME: 'Client Test' },
      clientAssets: {
        'page:/dashboard': {
          js: ['/_ranu/assets/c_dashboard.js'],
          css: ['/_ranu/assets/c_dashboard.css'],
        },
        bootstrap: {
          js: ['/_ranu/assets/c_bootstrap.js'],
          css: [],
        },
      },
    });

    const request = new Request('http://localhost:3000/dashboard');
    const context: RanuRequestContext = {
      requestId: 'req-1',
      request,
      url: new URL('http://localhost:3000/dashboard'),
      params: { id: '123' },
      locals: new Map(),
      signal: request.signal,
      responseCookies: [],
    };

    const target: PageRenderTarget = {
      routeId: 'page:/dashboard',
      params: { id: '123' },
      layouts: ['app/layout.tsx'],
      errors: [],
    };

    const response = await renderer.render(request, context, target);
    expect(response.status).toBe(200);

    const html = await response.text();

    // Must contain document structure
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('<body');
    expect(html).toContain('Test Shell');

    // Must contain client mount root
    expect(html).toContain('id="ranu-client-root"');

    // Must contain the complete bootstrap payload and both route/bootstrap assets
    expect(html).toContain('id="__ranu_data__"');
    expect(html).toContain('"buildId":"bld_client_renderer"');
    expect(html).toContain('"routeId":"page:/dashboard"');
    expect(html).toContain('"pathname":"/dashboard"');
    expect(html).toContain('"RANU_PUBLIC_APP_NAME":"Client Test"');
    expect(html).toContain('src="/_ranu/assets/c_dashboard.js"');
    expect(html).toContain('src="/_ranu/assets/c_bootstrap.js"');

    // Must NOT contain server page body content
    expect(html).not.toContain('Server Page Content');
  });
});
