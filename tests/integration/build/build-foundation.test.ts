import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from '@ranu/build';
import {
  validateBuildDescriptor,
  validateRouteManifest,
  validateServerManifest,
  validateClientManifest,
  validateStaticManifest,
} from '@ranu/manifests';
import { ReactRenderer } from '@ranu/react';
import type { PageRenderTarget } from '@ranu/runtime';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixtureRoot = path.resolve(__dirname, '../../../fixtures/build-basic');
const buildOutDir = path.join(fixtureRoot, '.ranu', 'build');

describe('Phase 11 — Build System Foundation Integration', () => {
  let buildResult: any;

  beforeAll(async () => {
    // Clean any prior build artifacts
    const dotRanu = path.join(fixtureRoot, '.ranu');
    if (fs.existsSync(dotRanu)) {
      fs.rmSync(dotRanu, { recursive: true, force: true });
    }

    buildResult = await build({
      projectRoot: fixtureRoot,
      sourceMaps: 'hidden',
    });
  });

  afterAll(() => {
    // Cleanup generated build directory
    const dotRanu = path.join(fixtureRoot, '.ranu');
    if (fs.existsSync(dotRanu)) {
      fs.rmSync(dotRanu, { recursive: true, force: true });
    }
  });

  it('completes build with success: true and zero error diagnostics', () => {
    expect(buildResult.success).toBe(true);
    expect(buildResult.diagnostics.filter((d: any) => d.severity === 'error')).toHaveLength(0);
    expect(typeof buildResult.buildId).toBe('string');
    expect(buildResult.buildId.length).toBe(29);
  });

  it('generates canonical .ranu/build/ output structure', () => {
    expect(fs.existsSync(buildOutDir)).toBe(true);
    expect(fs.existsSync(path.join(buildOutDir, 'BUILD_ID'))).toBe(true);
    expect(fs.existsSync(path.join(buildOutDir, 'build.json'))).toBe(true);
    expect(fs.existsSync(path.join(buildOutDir, 'manifest', 'routes.json'))).toBe(true);
    expect(fs.existsSync(path.join(buildOutDir, 'manifest', 'server.json'))).toBe(true);
    expect(fs.existsSync(path.join(buildOutDir, 'manifest', 'client.json'))).toBe(true);
    expect(fs.existsSync(path.join(buildOutDir, 'manifest', 'static.json'))).toBe(true);
    expect(fs.existsSync(path.join(buildOutDir, 'server', 'entry.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(buildOutDir, 'server', 'routes'))).toBe(true);
  });

  it('produces valid BuildDescriptor and sub-manifests with matching buildId', () => {
    const buildDescriptor = JSON.parse(
      fs.readFileSync(path.join(buildOutDir, 'build.json'), 'utf8')
    );
    const routeManifest = JSON.parse(
      fs.readFileSync(path.join(buildOutDir, 'manifest', 'routes.json'), 'utf8')
    );
    const serverManifest = JSON.parse(
      fs.readFileSync(path.join(buildOutDir, 'manifest', 'server.json'), 'utf8')
    );
    const clientManifest = JSON.parse(
      fs.readFileSync(path.join(buildOutDir, 'manifest', 'client.json'), 'utf8')
    );
    const staticManifest = JSON.parse(
      fs.readFileSync(path.join(buildOutDir, 'manifest', 'static.json'), 'utf8')
    );

    const buildId = buildResult.buildId;

    // Validate using @ranu/manifests validators
    const descVal = validateBuildDescriptor(buildDescriptor);
    expect(descVal.success).toBe(true);
    expect(descVal.diagnostics).toHaveLength(0);

    const routeVal = validateRouteManifest(routeManifest, buildId);
    expect(routeVal.success).toBe(true);
    expect(routeVal.diagnostics).toHaveLength(0);

    const serverVal = validateServerManifest(serverManifest, buildId);
    expect(serverVal.success).toBe(true);
    expect(serverVal.diagnostics).toHaveLength(0);

    const clientVal = validateClientManifest(clientManifest, buildId);
    expect(clientVal.success).toBe(true);
    expect(clientVal.diagnostics).toHaveLength(0);

    const staticVal = validateStaticManifest(staticManifest, buildId);
    expect(staticVal.success).toBe(true);
    expect(staticVal.diagnostics).toHaveLength(0);

    // Verify all manifests share exact same build ID
    expect(buildDescriptor.buildId).toBe(buildId);
    expect(routeManifest.buildId).toBe(buildId);
    expect(serverManifest.buildId).toBe(buildId);
    expect(clientManifest.buildId).toBe(buildId);
    expect(staticManifest.buildId).toBe(buildId);

    // Verify BUILD_ID file matches
    const buildIdFile = fs.readFileSync(path.join(buildOutDir, 'BUILD_ID'), 'utf8').trim();
    expect(buildIdFile).toBe(buildId);
  });

  it('correctly discovers and compiles page and API routes', () => {
    const routeManifest = JSON.parse(
      fs.readFileSync(path.join(buildOutDir, 'manifest', 'routes.json'), 'utf8')
    );

    const homeRoute = routeManifest.routes.find((r: any) => r.id === 'page:/');
    expect(homeRoute).toBeDefined();
    expect(homeRoute.kind).toBe('page');
    expect(homeRoute.renderMode).toBe('server');

    const aboutRoute = routeManifest.routes.find((r: any) => r.id === 'page:/about');
    expect(aboutRoute).toBeDefined();
    expect(aboutRoute.kind).toBe('page');
    expect(aboutRoute.renderMode).toBe('static');

    const apiRoute = routeManifest.routes.find((r: any) => r.id === 'api:/api/hello');
    expect(apiRoute).toBeDefined();
    expect(apiRoute.kind).toBe('api');
    expect(apiRoute.methods).toContain('GET');
    expect(apiRoute.methods).toContain('POST');
  });

  it('generates loadable production server entry (.ranu/build/server/entry.mjs)', async () => {
    const entryPath = path.join(buildOutDir, 'server', 'entry.mjs');
    const entryUrl = pathToFileURL(entryPath).href;
    const entryModule = await import(entryUrl);

    expect(entryModule.buildId).toBe(buildResult.buildId);
    expect(entryModule.buildDescriptor).toBeDefined();
    expect(entryModule.routeManifest).toBeDefined();
    expect(entryModule.serverManifest).toBeDefined();
    expect(typeof entryModule.moduleLoader.loadRouteEntry).toBe('function');

    // Test loading compiled route module via entry loader
    const homeModule = await entryModule.moduleLoader.loadRouteEntry('page:/');
    expect(homeModule.default).toBeDefined();
    expect(typeof homeModule.default).toBe('function');
  });

  it('renders compiled page through ReactRenderer SSR pipeline', async () => {
    const entryPath = path.join(buildOutDir, 'server', 'entry.mjs');
    const entryUrl = `file://${entryPath.replace(/\\/g, '/')}`;
    const entryModule = await import(entryUrl);

    const compiledRootPath = path.resolve(buildOutDir, 'server/routes/page-root.mjs');

    // Create module loader that loads compiled files
    const renderer = new ReactRenderer({
      moduleLoader: {
        async loadPage(p: string) {
          const mod = await import(`file://${p.replace(/\\/g, '/')}`);
          return mod;
        },
        async loadLayout(p: string) {
          const mod = await import(`file://${p.replace(/\\/g, '/')}`);
          return mod;
        },
        async loadLoading() {
          return undefined;
        },
        async loadError() {
          return undefined;
        },
        async loadNotFound() {
          return undefined;
        },
      },
    });

    const target: PageRenderTarget = {
      routeId: 'page:/',
      pagePath: compiledRootPath,
      layoutPaths: [],
      params: {},
      renderMode: 'server',
      stream: false,
    };

    const requestContext = {
      routeId: 'page:/',
      pathname: '/',
      params: {},
      query: {},
      headers: new Headers(),
      cookies: {
        get: () => undefined,
        getAll: () => ({}),
        has: () => false,
        set: () => {},
        delete: () => {},
      },
      mode: 'production' as const,
      signal: new AbortController().signal,
    };

    const renderResult = await renderer.render(target, requestContext);
    expect(renderResult.status).toBe(200);

    const text = await new Response(renderResult.body).text();
    expect(text).toContain('Welcome to Ranu.js');
    expect(text).toContain('Production Build Test Page');
  });
});
