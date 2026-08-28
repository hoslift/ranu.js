import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import {
  createProductionRuntime,
  createProductionRequestHandler,
  createProductionServer,
  compileManifestRoutes,
  getMimeType,
  isPathContained,
  serveStaticFile,
} from '../src/index.js';

describe('@ranu/runtime-node — Production Server & Static Handling', () => {
  let tempDir: string;
  let buildDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-prod-test-'));
    buildDir = path.join(tempDir, '.ranu', 'build');
    const serverDir = path.join(buildDir, 'server');
    const manifestDir = path.join(buildDir, 'manifest');
    const staticPagesDir = path.join(buildDir, 'static', 'pages');
    const staticAssetsDir = path.join(buildDir, 'static', 'assets');
    const publicDir = path.join(tempDir, 'public');

    fs.mkdirSync(serverDir, { recursive: true });
    fs.mkdirSync(manifestDir, { recursive: true });
    fs.mkdirSync(staticPagesDir, { recursive: true });
    fs.mkdirSync(staticAssetsDir, { recursive: true });
    fs.mkdirSync(publicDir, { recursive: true });

    // BUILD_ID
    fs.writeFileSync(path.join(buildDir, 'BUILD_ID'), 'test-build-123\n');

    // build.json
    fs.writeFileSync(
      path.join(buildDir, 'build.json'),
      JSON.stringify({
        schemaVersion: 1,
        buildId: 'test-build-123',
        frameworkVersion: '0.0.0',
        runtime: 'node',
        manifests: {
          routes: 'manifest/routes.json',
          server: 'manifest/server.json',
          client: 'manifest/client.json',
          static: 'manifest/static.json',
        },
      }),
    );

    // routes.json
    fs.writeFileSync(
      path.join(manifestDir, 'routes.json'),
      JSON.stringify({
        schemaVersion: 2,
        buildId: 'test-build-123',
        routes: [
          {
            id: 'page:/',
            kind: 'page',
            pattern: '/',
            params: [],
            renderMode: 'server',
          },
          {
            id: 'page:/about',
            kind: 'page',
            pattern: '/about',
            params: [],
            renderMode: 'static',
          },
          {
            id: 'api:/api/status',
            kind: 'api',
            pattern: '/api/status',
            params: [],
            methods: ['GET'],
          },
        ],
      }),
    );

    // server.json
    fs.writeFileSync(
      path.join(manifestDir, 'server.json'),
      JSON.stringify({
        schemaVersion: 1,
        buildId: 'test-build-123',
        routes: [
          {
            routeId: 'page:/',
            serverEntry: 'server/page-home.mjs',
          },
          {
            routeId: 'page:/about',
            serverEntry: 'server/page-about.mjs',
          },
          {
            routeId: 'api:/api/status',
            serverEntry: 'server/api-status.mjs',
          },
        ],
      }),
    );

    // client.json
    fs.writeFileSync(
      path.join(manifestDir, 'client.json'),
      JSON.stringify({
        schemaVersion: 1,
        buildId: 'test-build-123',
        assets: {
          'page:/': { js: ['/_ranu/assets/client-home.js'], css: [] },
        },
      }),
    );

    // static.json
    fs.writeFileSync(
      path.join(manifestDir, 'static.json'),
      JSON.stringify({
        schemaVersion: 1,
        buildId: 'test-build-123',
        routes: [
          {
            pathname: '/about',
            routeId: 'page:/about',
            file: 'static/pages/about.html',
            status: 200,
          },
        ],
      }),
    );

    // Compiled modules
    fs.writeFileSync(
      path.join(serverDir, 'page-home.mjs'),
      `export default function HomePage() {
  return 'Production Home Page';
}`,
    );

    fs.writeFileSync(
      path.join(serverDir, 'api-status.mjs'),
      `export async function GET(req, ctx) {
  return Response.json({ status: 'healthy', build: 'test-build-123' });
}`,
    );

    fs.writeFileSync(
      path.join(staticPagesDir, 'about.html'),
      `<!DOCTYPE html><html><body><h1>Static About Page</h1></body></html>`,
    );

    // Static assets
    fs.writeFileSync(path.join(staticAssetsDir, 'main.css'), `body { background: #fff; }`);

    fs.writeFileSync(path.join(publicDir, 'robots.txt'), `User-agent: *\nDisallow:`);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Static Path & Mime Type Utilities', () => {
    it('compiles static, dynamic, catch-all, and optional catch-all manifest routes', () => {
      const routes = compileManifestRoutes({
        schemaVersion: 2,
        buildId: 'test',
        routes: [
          { id: 'page:s', kind: 'page', pattern: '/docs', params: [] },
          { id: 'page:d', kind: 'page', pattern: '/blog/[slug]', params: ['slug'] },
          { id: 'api:c', kind: 'api', pattern: '/api/[...parts]', params: ['parts'] },
          { id: 'page:o', kind: 'page', pattern: '/shop/[[...parts]]', params: ['parts'] },
        ],
      } as any);

      expect(routes.map((route) => route.pattern.segments.at(-1)?.kind)).toEqual([
        'static',
        'dynamic',
        'catch-all',
        'optional-catch-all',
      ]);
      expect(routes[0]).toMatchObject({ layouts: [], errors: [] });
      expect(routes[2]).toMatchObject({ methods: [], layouts: [], errors: [] });
    });

    it('handles static-file traversal, absence, directories, HEAD, and custom caching', () => {
      const root = path.join(tempDir, 'public');
      const response = () =>
        Object.assign(new EventEmitter(), {
          destroyed: false,
          writeHead: vi.fn(),
          end: vi.fn(),
          destroy: vi.fn(),
        });

      const forbidden = response();
      expect(
        serveStaticFile(path.join(root, '..', 'secret'), root, {} as any, forbidden as any),
      ).toBe(true);
      expect(forbidden.writeHead).toHaveBeenCalledWith(403, expect.anything());
      expect(serveStaticFile(path.join(root, 'missing'), root, {} as any, response() as any)).toBe(
        false,
      );
      expect(serveStaticFile(root, root, {} as any, response() as any)).toBe(false);

      const head = response();
      expect(
        serveStaticFile(
          path.join(root, 'robots.txt'),
          root,
          { method: 'HEAD' } as any,
          head as any,
          'private',
        ),
      ).toBe(true);
      expect(head.writeHead).toHaveBeenCalledWith(
        200,
        expect.objectContaining({ 'Cache-Control': 'private' }),
      );
      expect(head.end).toHaveBeenCalledOnce();
    });

    it('rejects static-file symlinks outside the authorized root', () => {
      const root = path.join(tempDir, 'public');
      const outside = path.join(tempDir, 'outside.txt');
      const link = path.join(root, 'outside.txt');
      fs.writeFileSync(outside, 'secret');
      fs.symlinkSync(outside, link);
      const res = Object.assign(new EventEmitter(), { writeHead: vi.fn(), end: vi.fn() });
      expect(serveStaticFile(link, root, {} as any, res as any)).toBe(true);
      expect(res.writeHead).toHaveBeenCalledWith(403, expect.anything());
    });
    it('determines correct MIME types', () => {
      expect(getMimeType('style.css')).toBe('text/css; charset=utf-8');
      expect(getMimeType('app.js')).toBe('text/javascript; charset=utf-8');
      expect(getMimeType('doc.html')).toBe('text/html; charset=utf-8');
      expect(getMimeType('data.json')).toBe('application/json; charset=utf-8');
      expect(getMimeType('logo.svg')).toBe('image/svg+xml');
      expect(getMimeType('image.png')).toBe('image/png');
      expect(getMimeType('unknown.xyz')).toBe('application/octet-stream');
    });

    it('validates path containment correctly', () => {
      const root = path.join(tempDir, 'root');
      expect(isPathContained(path.join(root, 'a', 'b.txt'), root)).toBe(true);
      expect(isPathContained(path.join(root, '..', 'escape.txt'), root)).toBe(false);
    });

    it('handles read errors and destroys the stream when the response closes', () => {
      const filePath = path.join(tempDir, 'public', 'robots.txt');
      const stream = new EventEmitter() as EventEmitter & {
        destroyed: boolean;
        destroy: ReturnType<typeof vi.fn>;
        pipe: ReturnType<typeof vi.fn>;
      };
      stream.destroyed = false;
      stream.destroy = vi.fn(() => {
        stream.destroyed = true;
      });
      stream.pipe = vi.fn();
      vi.spyOn(fs, 'createReadStream').mockReturnValue(
        stream as unknown as ReturnType<typeof fs.createReadStream>,
      );

      const response = Object.assign(new EventEmitter(), {
        destroyed: false,
        writeHead: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
      });
      expect(
        serveStaticFile(filePath, path.join(tempDir, 'public'), {} as any, response as any),
      ).toBe(true);

      const readError = new Error('read failed');
      stream.emit('error', readError);
      expect(response.destroy).toHaveBeenCalledWith(readError);

      response.emit('close');
      expect(stream.destroy).toHaveBeenCalledOnce();
    });
  });

  describe('createProductionRuntime', () => {
    it('fails when build.json is missing', async () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-empty-'));
      await expect(createProductionRuntime({ projectRoot: emptyDir })).rejects.toThrow(
        /No production build found/,
      );
      fs.rmSync(emptyDir, { recursive: true, force: true });
    });

    it('reports compiled middleware import failures', async () => {
      fs.writeFileSync(
        path.join(buildDir, 'server', 'middleware.mjs'),
        'throw new Error("broken middleware");',
      );

      await expect(createProductionRuntime({ projectRoot: tempDir, buildDir })).rejects.toThrow(
        /Failed to load compiled middleware/,
      );
    });

    it.each(['routes.json', 'server.json'])(
      'rejects a missing required %s manifest',
      async (name) => {
        fs.rmSync(path.join(buildDir, 'manifest', name));
        await expect(createProductionRuntime({ projectRoot: tempDir, buildDir })).rejects.toThrow(
          /missing required route or server manifests/,
        );
      },
    );

    it('uses empty client and static manifest fallbacks', async () => {
      fs.rmSync(path.join(buildDir, 'manifest', 'client.json'));
      fs.rmSync(path.join(buildDir, 'manifest', 'static.json'));
      const runtime = await createProductionRuntime({ projectRoot: tempDir, buildDir });
      expect((await runtime.handle(new Request('http://localhost/about'))).status).toBe(404);
      expect((await runtime.handle(new Request('http://localhost/'))).status).toBe(200);
      runtime.dispose();
    });

    it('honors non-default static status and rejects escaping static files', async () => {
      const manifestPath = path.join(buildDir, 'manifest', 'static.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.routes[0].status = 203;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest));
      let runtime = await createProductionRuntime({ projectRoot: tempDir, buildDir });
      expect((await runtime.handle(new Request('http://localhost/about'))).status).toBe(203);
      runtime.dispose();

      manifest.routes[0].file = '../outside.html';
      fs.writeFileSync(manifestPath, JSON.stringify(manifest));
      runtime = await createProductionRuntime({ projectRoot: tempDir, buildDir });
      expect((await runtime.handle(new Request('http://localhost/about'))).status).toBe(404);
      runtime.dispose();
    });

    it('rejects server module paths that escape the build directory', async () => {
      const manifestPath = path.join(buildDir, 'manifest', 'server.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.routes[0].serverEntry = '../outside.mjs';
      fs.writeFileSync(manifestPath, JSON.stringify(manifest));
      const runtime = await createProductionRuntime({ projectRoot: tempDir, buildDir });
      const response = await runtime.handle(new Request('http://localhost/'));
      expect(response.status).toBe(500);
      runtime.dispose();
    });

    it('creates working production runtime for SSR, SSG, and API endpoints', async () => {
      const runtime = await createProductionRuntime({
        projectRoot: tempDir,
        buildDir,
      });

      // 1. SSR Home Page
      const resHome = await runtime.handle(new Request('http://localhost/'));
      expect(resHome.status).toBe(200);
      const htmlHome = await resHome.text();
      expect(htmlHome).toContain('Production Home Page');

      // 2. Static Pre-rendered Page
      const resAbout = await runtime.handle(new Request('http://localhost/about'));
      expect(resAbout.status).toBe(200);
      const htmlAbout = await resAbout.text();
      expect(htmlAbout).toContain('Static About Page');

      // 3. API Endpoint
      const resApi = await runtime.handle(new Request('http://localhost/api/status'));
      expect(resApi.status).toBe(200);
      const data = await resApi.json();
      expect(data).toEqual({ status: 'healthy', build: 'test-build-123' });

      // 4. Nonexistent route returns 404
      const res404 = await runtime.handle(new Request('http://localhost/nonexistent'));
      expect(res404.status).toBe(404);

      runtime.dispose();
    });
  });

  describe('createProductionRequestHandler', () => {
    const makeResponse = () =>
      Object.assign(new EventEmitter(), {
        writableEnded: false,
        destroyed: false,
        writeHead: vi.fn(),
        setHeader: vi.fn(),
        headersSent: false,
        statusCode: 200,
        write: vi.fn(() => true),
        end: vi.fn(),
        destroy: vi.fn(),
      });

    it('ignores ended responses and rejects malformed URI encoding', async () => {
      const runtime = { handle: vi.fn().mockResolvedValue(new Response('delegated')) } as any;
      const handler = createProductionRequestHandler(runtime, { projectRoot: tempDir, buildDir });
      const ended = makeResponse();
      ended.writableEnded = true;
      await handler({ url: '/' } as any, ended as any);
      expect(runtime.handle).not.toHaveBeenCalled();

      const malformed = makeResponse();
      await handler({ url: '/bad%E0%A4%A', headers: {} } as any, malformed as any);
      expect(malformed.writeHead).toHaveBeenCalledWith(400, expect.anything());
      expect(malformed.end).toHaveBeenCalledWith('Bad Request');
    }, 15_000);

    it('serves framework and public assets and falls back when framework assets are absent', async () => {
      const runtime = { handle: vi.fn().mockResolvedValue(new Response('delegated')) } as any;
      const handler = createProductionRequestHandler(runtime, { projectRoot: tempDir, buildDir });
      for (const url of ['/_ranu/assets/main.css', '/robots.txt']) {
        const res = makeResponse();
        await handler({ url, method: 'HEAD', headers: {} } as any, res as any);
        expect(res.writeHead).toHaveBeenCalledWith(200, expect.anything());
      }

      const missing = makeResponse();
      const missingReq = Object.assign(new EventEmitter(), {
        url: '/_ranu/assets/missing.css',
        method: 'GET',
        headers: {},
        socket: {},
      });
      await handler(missingReq as any, missing as any);
      expect(runtime.handle).toHaveBeenCalledOnce();
    });
  });

  describe('createProductionServer', () => {
    it('starts listening, serves static assets and dispatches requests', async () => {
      const server = await createProductionServer({
        projectRoot: tempDir,
        buildDir,
        port: 0,
        host: '127.0.0.1',
      });

      const addr = await server.listen(0, '127.0.0.1');
      expect(addr.port).toBeGreaterThan(0);

      try {
        // Test 1: SSR Route
        const homeRes = await fetch(`http://127.0.0.1:${addr.port}/`);
        expect(homeRes.status).toBe(200);
        expect(await homeRes.text()).toContain('Production Home Page');

        // Test 2: Static Page
        const aboutRes = await fetch(`http://127.0.0.1:${addr.port}/about`);
        expect(aboutRes.status).toBe(200);
        expect(await aboutRes.text()).toContain('Static About Page');

        // Test 3: API Route
        const apiRes = await fetch(`http://127.0.0.1:${addr.port}/api/status`);
        expect(apiRes.status).toBe(200);
        const apiData = await apiRes.json();
        expect(apiData.status).toBe('healthy');

        // Test 4: Static framework asset (/_ranu/assets/*) with immutable cache headers
        const assetRes = await fetch(`http://127.0.0.1:${addr.port}/_ranu/assets/main.css`);
        expect(assetRes.status).toBe(200);
        expect(assetRes.headers.get('content-type')).toContain('text/css');
        expect(assetRes.headers.get('cache-control')).toContain('immutable');
        expect(await assetRes.text()).toContain('body { background: #fff; }');

        // Test 5: Public directory file (/robots.txt)
        const publicRes = await fetch(`http://127.0.0.1:${addr.port}/robots.txt`);
        expect(publicRes.status).toBe(200);
        expect(await publicRes.text()).toContain('User-agent: *');
      } finally {
        await server.close();
      }
    });
  });
});
