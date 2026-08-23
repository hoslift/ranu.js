import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runStaticGenerationStage, type RouteEntryInfo, type BuildContext } from '../src/index.js';
import type { ComponentModuleLoader } from '@ranu/react';
import { notFound, redirect, cookies } from '@ranu/server';

describe('Phase 15 Stage 15C: Static Generation Stage & Manifest Integration', () => {
  let tempDir: string;
  let mockContext: BuildContext;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-stage-static-test-'));
    fs.mkdirSync(path.join(tempDir, 'static', 'pages'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'manifest'), { recursive: true });

    mockContext = {
      config: { projectRoot: tempDir },
      resolvedConfig: {
        root: tempDir,
        mode: 'production',
        plugins: [],
        build: { sourceMaps: false, minify: false },
        server: { host: '0.0.0.0', port: 3000, trustProxy: false },
        routing: { trailingSlash: 'never' },
        rendering: { defaultMode: 'server' },
        deployment: {},
      },
      buildId: 'test-static-build-123',
      projectRoot: tempDir,
      outDir: path.join(tempDir, 'out'),
      tempOutDir: tempDir,
      serverOutDir: path.join(tempDir, 'server'),
      staticOutDir: path.join(tempDir, 'static'),
      manifestOutDir: path.join(tempDir, 'manifest'),
      diagnostics: [],
    };
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function createMockLoader(moduleMap: Record<string, any>): ComponentModuleLoader {
    return {
      async loadPage(routeId: string) {
        return moduleMap[routeId];
      },
      async loadLayout() {
        return {
          default: ({ children }: { children: React.ReactNode }) =>
            React.createElement(
              'html',
              null,
              React.createElement('head'),
              React.createElement('body', null, children),
            ),
        };
      },
      async loadNotFound() {
        return {
          default: () => React.createElement('div', { id: 'not-found' }, '404 - Not Found'),
        };
      },
      async loadLoading() {
        return undefined;
      },
      async loadError() {
        return undefined;
      },
    };
  }

  it('skips server routes and renders literal and dynamic static routes', async () => {
    const routes: RouteEntryInfo[] = [
      {
        routeId: 'page:/',
        kind: 'page',
        pathnameTemplate: '/',
        params: [],
        renderMode: 'server',
        methods: [],
        sourceFile: 'app/page.tsx',
        layouts: ['app/layout.tsx'],
        errors: [],
        outputRelativePath: 'server/routes/page-root.mjs',
      },
      {
        routeId: 'page:/about',
        kind: 'page',
        pathnameTemplate: '/about',
        params: [],
        renderMode: 'static',
        methods: [],
        sourceFile: 'app/about/page.tsx',
        layouts: ['app/layout.tsx'],
        errors: [],
        outputRelativePath: 'server/routes/page-about.mjs',
      },
      {
        routeId: 'page:/posts/[slug]',
        kind: 'page',
        pathnameTemplate: '/posts/[slug]',
        params: ['slug'],
        renderMode: 'static',
        methods: [],
        sourceFile: 'app/posts/[slug]/page.tsx',
        layouts: ['app/layout.tsx'],
        errors: [],
        outputRelativePath: 'server/routes/page-posts-slug.mjs',
      },
    ];

    const loader = createMockLoader({
      'page:/about': {
        default: () => React.createElement('h1', null, 'About Page'),
      },
      'page:/posts/[slug]': {
        generateStaticParams: async () => [{ slug: 'hello' }, { slug: 'world' }],
        default: ({ params }: { params: { slug: string } }) =>
          React.createElement('h1', null, `Post: ${params.slug}`),
      },
    });

    const clientAssets = {
      bootstrap: {
        js: [],
        css: ['/_ranu/assets/global-test.css'],
      },
    };
    const result = await runStaticGenerationStage(mockContext, routes, loader, clientAssets);

    expect(result.success).toBe(true);
    expect(result.diagnostics).toEqual([]);

    // Should contain: /404, /about, /posts/hello, /posts/world (deterministically sorted by pathname)
    const pathnames = result.staticRoutes.map((r) => r.pathname);
    expect(pathnames).toEqual(['/404', '/about', '/posts/hello', '/posts/world']);

    // Check physical file generation
    expect(fs.existsSync(path.join(tempDir, 'static', 'pages', '404.html'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'static', 'pages', 'about.html'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'static', 'pages', 'posts', 'hello.html'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'static', 'pages', 'posts', 'world.html'))).toBe(true);

    const fallback404Html = fs.readFileSync(
      path.join(tempDir, 'static', 'pages', '404.html'),
      'utf8',
    );
    expect(fallback404Html).toContain('href="/_ranu/assets/global-test.css"');

    // / (server route) should NOT have static page generated
    expect(fs.existsSync(path.join(tempDir, 'static', 'pages', 'index.html'))).toBe(false);
  });

  it('fails with RANU_SSG_MISSING_GENERATOR when dynamic static route lacks generateStaticParams', async () => {
    const routes: RouteEntryInfo[] = [
      {
        routeId: 'page:/items/[id]',
        kind: 'page',
        pathnameTemplate: '/items/[id]',
        params: ['id'],
        renderMode: 'static',
        methods: [],
        sourceFile: 'app/items/[id]/page.tsx',
        layouts: ['app/layout.tsx'],
        errors: [],
        outputRelativePath: 'server/routes/page-items-id.mjs',
      },
    ];

    const loader = createMockLoader({
      'page:/items/[id]': {
        default: () => React.createElement('h1', null, 'Item'),
      },
    });

    const result = await runStaticGenerationStage(mockContext, routes, loader);

    expect(result.success).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'RANU_SSG_MISSING_GENERATOR')).toBe(true);
  });

  it('propagates Stage 15B dynamic access errors and fails the stage', async () => {
    const routes: RouteEntryInfo[] = [
      {
        routeId: 'page:/bad-static',
        kind: 'page',
        pathnameTemplate: '/bad-static',
        params: [],
        renderMode: 'static',
        methods: [],
        sourceFile: 'app/bad-static/page.tsx',
        layouts: ['app/layout.tsx'],
        errors: [],
        outputRelativePath: 'server/routes/page-bad-static.mjs',
      },
    ];

    const loader = createMockLoader({
      'page:/bad-static': {
        default: () => {
          cookies().get('session');
          return React.createElement('h1', null, 'Bad');
        },
      },
    });

    const result = await runStaticGenerationStage(mockContext, routes, loader);

    expect(result.success).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'RANU_SSG_DYNAMIC_ACCESS')).toBe(true);
  });

  it('propagates redirect rejection with RANU_SSG_REDIRECT_UNSUPPORTED', async () => {
    const routes: RouteEntryInfo[] = [
      {
        routeId: 'page:/redirecting',
        kind: 'page',
        pathnameTemplate: '/redirecting',
        params: [],
        renderMode: 'static',
        methods: [],
        sourceFile: 'app/redirecting/page.tsx',
        layouts: ['app/layout.tsx'],
        errors: [],
        outputRelativePath: 'server/routes/page-redirecting.mjs',
      },
    ];

    const loader = createMockLoader({
      'page:/redirecting': {
        default: () => {
          redirect('/other');
        },
      },
    });

    const result = await runStaticGenerationStage(mockContext, routes, loader);

    expect(result.success).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'RANU_SSG_REDIRECT_UNSUPPORTED')).toBe(true);
  });

  it('correctly marks notFound() routes with status: 404 in StaticManifest entries', async () => {
    const routes: RouteEntryInfo[] = [
      {
        routeId: 'page:/products/[id]',
        kind: 'page',
        pathnameTemplate: '/products/[id]',
        params: ['id'],
        renderMode: 'static',
        methods: [],
        sourceFile: 'app/products/[id]/page.tsx',
        layouts: ['app/layout.tsx'],
        errors: [],
        outputRelativePath: 'server/routes/page-products-id.mjs',
      },
    ];

    const loader = createMockLoader({
      'page:/products/[id]': {
        generateStaticParams: async () => [{ id: 'found' }, { id: 'missing' }],
        default: ({ params }: { params: { id: string } }) => {
          if (params.id === 'missing') {
            notFound();
          }
          return React.createElement('h1', null, `Product: ${params.id}`);
        },
      },
    });

    const result = await runStaticGenerationStage(mockContext, routes, loader);

    expect(result.success).toBe(true);
    const missingEntry = result.staticRoutes.find((r) => r.pathname === '/products/missing');
    expect(missingEntry).toBeDefined();
    expect(missingEntry?.status).toBe(404);

    const foundEntry = result.staticRoutes.find((r) => r.pathname === '/products/found');
    expect(foundEntry).toBeDefined();
    expect(foundEntry?.status).toBeUndefined(); // 200 OK omits status
  });

  it('keeps a failed global 404 render non-fatal', async () => {
    const routes: RouteEntryInfo[] = [
      {
        routeId: 'page:/about',
        kind: 'page',
        pathnameTemplate: '/about',
        params: [],
        renderMode: 'static',
        methods: [],
        sourceFile: 'app/about/page.tsx',
        layouts: ['app/layout.tsx'],
        errors: [],
        outputRelativePath: 'server/routes/page-about.mjs',
      },
    ];

    const loader = createMockLoader({
      'page:/about': {
        default: () => React.createElement('h1', null, 'About Page'),
      },
    });
    let layoutLoadCount = 0;
    loader.loadLayout = async () => {
      layoutLoadCount += 1;
      if (layoutLoadCount > 1) {
        throw new Error('global 404 layout failed');
      }
      return {
        default: ({ children }: { children: React.ReactNode }) =>
          React.createElement('html', null, React.createElement('body', null, children)),
      };
    };

    const result = await runStaticGenerationStage(mockContext, routes, loader);

    expect(result.success).toBe(true);
    expect(result.staticRoutes.map((route) => route.pathname)).toEqual(['/about']);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'RANU_SSG_404_SKIPPED',
        severity: 'warning',
      }),
    ]);
  });
});
