import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import React from 'react';
import { build } from '@ranu/build';
import { ReactRenderer } from '@ranu/react';
import type { RanuRequestContext, PageRenderTarget } from '@ranu/runtime';
import type { RouteManifest, ClientManifest, StaticManifest } from '@ranu/manifests';

describe('Phase 16: Full Client Rendering Mode Integration Test', () => {
  let tempProjectDir: string;
  let buildResult: any;

  beforeAll(async () => {
    tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-client-render-integration-'));

    // Create package.json
    fs.writeFileSync(
      path.join(tempProjectDir, 'package.json'),
      JSON.stringify(
        {
          name: 'ranu-client-render-fixture',
          version: '0.0.0',
          type: 'module',
        },
        null,
        2,
      ),
    );

    // Create ranu.config.ts
    fs.writeFileSync(
      path.join(tempProjectDir, 'ranu.config.ts'),
      `export default {
  routing: {
    trailingSlash: 'never',
  },
  build: {
    sourceMaps: false,
    minify: false,
  },
};`,
    );

    const appDir = path.join(tempProjectDir, 'app');
    const dashboardDir = path.join(appDir, 'dashboard');
    const aboutDir = path.join(appDir, 'about');

    fs.mkdirSync(dashboardDir, { recursive: true });
    fs.mkdirSync(aboutDir, { recursive: true });

    // Root Layout (shared)
    fs.writeFileSync(
      path.join(appDir, 'layout.tsx'),
      `import React from 'react';
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>App Shell</title>
      </head>
      <body>
        <nav id="main-nav">Navigation</nav>
        <main>{children}</main>
      </body>
    </html>
  );
}`,
    );

    // Home Page (Server SSR mode default)
    fs.writeFileSync(
      path.join(appDir, 'page.tsx'),
      `import React from 'react';
export const render = 'server';
export default function HomePage() {
  return <div id="home-content">Home Server Page</div>;
}`,
    );

    // About Page (Static mode)
    fs.writeFileSync(
      path.join(aboutDir, 'page.tsx'),
      `import React from 'react';
export const render = 'static';
export default function AboutPage() {
  return <div id="about-content">About Static Page</div>;
}`,
    );

    // Dashboard Page (Client render mode!)
    fs.writeFileSync(
      path.join(dashboardDir, 'page.tsx'),
      `import React, { useState } from 'react';
export const render = 'client';
export const metadata = {
  title: 'Dashboard Client App',
  description: 'Interactive client dashboard',
};
export default function DashboardPage() {
  const [count, setCount] = useState(0);
  return (
    <div id="dashboard-client-container">
      <h1>Client Dashboard</h1>
      <button id="count-btn" onClick={() => setCount(c => c + 1)}>Count: {count}</button>
    </div>
  );
}`,
    );

    // Execute full framework production build
    buildResult = await build({
      projectRoot: tempProjectDir,
    });
  }, 60_000);

  afterAll(() => {
    if (fs.existsSync(tempProjectDir)) {
      fs.rmSync(tempProjectDir, { recursive: true, force: true });
    }
  });

  it('completes production build with success: true and zero error diagnostics', () => {
    expect(buildResult.diagnostics.filter((d: any) => d.severity === 'error')).toEqual([]);
    expect(buildResult.success).toBe(true);
  });

  it('correctly classifies renderMode = "client" in RouteManifest', () => {
    const routeManifestPath = path.join(
      tempProjectDir,
      '.ranu',
      'build',
      'manifest',
      'routes.json',
    );
    expect(fs.existsSync(routeManifestPath)).toBe(true);

    const routeManifest: RouteManifest = JSON.parse(fs.readFileSync(routeManifestPath, 'utf8'));
    const dashboardRoute = routeManifest.routes.find((r) => r.id === 'page:/dashboard');

    expect(dashboardRoute).toBeDefined();
    expect(dashboardRoute?.kind).toBe('page');
    if (dashboardRoute?.kind === 'page') {
      expect(dashboardRoute.renderMode).toBe('client');
    }
  });

  it('compiles browser client assets for the client route and registers them in ClientManifest', () => {
    const clientManifestPath = path.join(
      tempProjectDir,
      '.ranu',
      'build',
      'manifest',
      'client.json',
    );
    expect(fs.existsSync(clientManifestPath)).toBe(true);

    const clientManifest: ClientManifest = JSON.parse(fs.readFileSync(clientManifestPath, 'utf8'));

    // Check entry in assets by file path or routeId
    const dashboardAssets =
      clientManifest.assets['app/dashboard/page.tsx'] ?? clientManifest.assets['page:/dashboard'];

    expect(dashboardAssets).toBeDefined();
    expect(dashboardAssets.js.length).toBeGreaterThan(0);
    expect(dashboardAssets.js[0]).toMatch(/^\/_ranu\/assets\/c_/);

    // Check physical JS asset file exists on disk
    const assetRelative = dashboardAssets.js[0].replace(/^\/_ranu\//, '');
    const physicalAssetPath = path.join(tempProjectDir, '.ranu', 'build', 'static', assetRelative);
    expect(fs.existsSync(physicalAssetPath)).toBe(true);
  });

  it('excludes client-rendered route from StaticManifest', () => {
    const staticManifestPath = path.join(
      tempProjectDir,
      '.ranu',
      'build',
      'manifest',
      'static.json',
    );
    expect(fs.existsSync(staticManifestPath)).toBe(true);

    const staticManifest: StaticManifest = JSON.parse(fs.readFileSync(staticManifestPath, 'utf8'));

    // Static route (/about) should be present
    expect(staticManifest.routes.some((r) => r.pathname === '/about')).toBe(true);

    // Client route (/dashboard) MUST NOT be present in static manifest
    expect(staticManifest.routes.some((r) => r.pathname === '/dashboard')).toBe(false);
  });

  it('server renders a complete document shell with mount point and payload for client route without rendering server page body', async () => {
    const serverEntryPath = path.join(tempProjectDir, '.ranu', 'build', 'server', 'entry.mjs');
    expect(fs.existsSync(serverEntryPath)).toBe(true);

    const loader = {
      loadPage: async (routeId: string) => {
        if (routeId === 'page:/dashboard') {
          return {
            render: 'client' as const,
            metadata: { title: 'Dashboard Client App' },
            default: () => null,
          };
        }
        return { default: () => null };
      },
      loadLayout: async () => ({
        default: ({ children }: any) =>
          React.createElement(
            'html',
            { lang: 'en' },
            React.createElement('head', null, React.createElement('title', null, 'App Shell')),
            React.createElement(
              'body',
              null,
              React.createElement('div', { id: 'layout-shell' }, children),
            ),
          ),
      }),
      loadLoading: async () => undefined,
      loadError: async () => undefined,
      loadNotFound: async () => undefined,
    };

    const clientManifest: ClientManifest = JSON.parse(
      fs.readFileSync(
        path.join(tempProjectDir, '.ranu', 'build', 'manifest', 'client.json'),
        'utf8',
      ),
    );
    const renderer = new ReactRenderer({
      loader,
      mode: 'production',
      buildId: buildResult.buildId,
      publicEnv: {},
      clientAssets: clientManifest.assets,
    });

    const request = new Request('http://localhost:3000/dashboard');
    const context: RanuRequestContext = {
      requestId: 'req-test-client',
      request,
      url: new URL('http://localhost:3000/dashboard'),
      params: {},
      locals: new Map(),
      signal: request.signal,
      responseCookies: [],
    };

    const target: PageRenderTarget = {
      routeId: 'page:/dashboard',
      params: {},
      layouts: ['app/layout.tsx'],
      errors: [],
    };

    const response = await renderer.render(request, context, target);
    const html = await response.text();
    expect(response.status, html).toBe(200);

    // Document shell
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('<body');
    expect(html).toContain('Dashboard Client App');
    expect(html).toContain('layout-shell');

    // Mount root for client React tree
    expect(html).toContain('id="ranu-client-root"');

    // Inert hydration payload script
    expect(html).toContain('id="__ranu_data__"');
    expect(html).toContain('"routeId":"page:/dashboard"');
    expect(html).toContain('"pathname":"/dashboard"');
    expect(html).toContain('"renderMode":"client"');
    expect(html).toContain('/_ranu/assets/c_dashboard-page-');
    expect(html).toContain('/_ranu/assets/c_bootstrap-');
  });
});
