import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { build } from '@ranu/build';
import { createReactRenderer } from '@ranu/react';
import type { RanuRequestContext, PageRenderTarget } from '@ranu/runtime';

describe('Integration: CSS in Server-Side Rendering (SSR)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-css-ssr-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('renders stylesheet link in SSR HTML head and matching scoped classes in body', async () => {
    const appDir = path.join(tempDir, 'app');
    fs.mkdirSync(appDir, { recursive: true });

    // Root global styles
    fs.writeFileSync(
      path.join(appDir, 'global.css'),
      'body { background-color: #fafafa; font-family: sans-serif; }'
    );

    // Root layout
    fs.writeFileSync(
      path.join(appDir, 'layout.tsx'),
      `import React from 'react';
import './global.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head></head>
      <body>{children}</body>
    </html>
  );
}`
    );

    // Page with CSS module
    fs.writeFileSync(
      path.join(appDir, 'Button.module.css'),
      '.btnPrimary { background-color: #2563eb; color: #ffffff; border-radius: 4px; }'
    );

    fs.writeFileSync(
      path.join(appDir, 'page.tsx'),
      `import React from 'react';
import styles from './Button.module.css';

export default function HomePage() {
  return (
    <main>
      <h1>SSR CSS Test</h1>
      <button className={styles.btnPrimary}>Click Me</button>
    </main>
  );
}`
    );

    const buildResult = await build({
      projectRoot: tempDir,
      mode: 'production',
    });

    expect(buildResult.success).toBe(true);

    const clientManifestPath = path.join(buildResult.outDir, 'manifest', 'client.json');
    const clientManifest = JSON.parse(fs.readFileSync(clientManifestPath, 'utf8'));

import { pathToFileURL } from 'node:url';

    // Set up ReactRenderer for SSR testing
    const compiledPagePath = path.join(buildResult.outDir, 'server', 'routes', 'page-root.mjs');
    const compiledLayoutPath = path.join(buildResult.outDir, 'server', 'layouts', 'layout.mjs');

    const loader = {
      async loadPage(_id: string) {
        return import(pathToFileURL(compiledPagePath).href);
      },
      async loadLayout(_id: string) {
        return import(pathToFileURL(compiledLayoutPath).href);
      },
      async loadLoading(_id: string) {
        return undefined;
      },
      async loadError(_id: string) {
        return undefined;
      },
      async loadNotFound(_id: string) {
        return undefined;
      },
    };

    const renderer = createReactRenderer({
      loader,
      mode: 'production',
      buildId: buildResult.buildId,
      clientAssets: clientManifest.assets,
    });

    const request = new Request('http://localhost/');
    const context: RanuRequestContext = {
      requestId: 'req-ssr-css-1',
      request,
      url: new URL('http://localhost/'),
      params: {},
      locals: new Map(),
      signal: request.signal,
      responseCookies: [],
      depth: 0,
    };

    const target: PageRenderTarget = {
      routeId: 'page:/',
      layouts: ['app/layout.tsx'],
      errors: [],
      params: {},
    };

    const response = await renderer.render(request, context, target);
    expect(response.status).toBe(200);

    const html = await response.text();

    // 1. Verify <link rel="stylesheet"> is injected in <head>
    expect(html).toContain('<link rel="stylesheet"');
    expect(html).toMatch(/href="\/_ranu\/assets\/.*\.css"/);

    // 2. Verify scoped class name in HTML body matches Button_btnPrimary__[hash]
    expect(html).toMatch(/class="Button_btnPrimary__[a-zA-Z0-9_-]{5}"/);

    // 3. Verify page content
    expect(html).toContain('SSR CSS Test');
    expect(html).toContain('Click Me');
  });
});
