import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import {
  createDenoAdapter,
  denoAdapter,
  adapterName,
  ADAPTER_API_VERSION,
  DENO_CAPABILITIES,
  isPathContained,
  assertNoDestinationSymlink,
  copyDirectorySafe,
  generateDenoConfig,
} from '../src/index.js';

function setupTestFixture(targetDir: string, targetBuildDir: string): void {
  const serverDir = path.join(targetBuildDir, 'server');
  const manifestDir = path.join(targetBuildDir, 'manifest');
  const staticPagesDir = path.join(targetBuildDir, 'static', 'pages');
  const staticAssetsDir = path.join(targetBuildDir, 'static', 'assets');
  const publicDir = path.join(targetDir, 'public');

  fs.mkdirSync(serverDir, { recursive: true });
  fs.mkdirSync(manifestDir, { recursive: true });
  fs.mkdirSync(staticPagesDir, { recursive: true });
  fs.mkdirSync(staticAssetsDir, { recursive: true });
  fs.mkdirSync(publicDir, { recursive: true });

  // BUILD_ID
  fs.writeFileSync(path.join(targetBuildDir, 'BUILD_ID'), 'deno-build-789\n', 'utf8');

  // build.json
  fs.writeFileSync(
    path.join(targetBuildDir, 'build.json'),
    JSON.stringify({
      schemaVersion: 1,
      buildId: 'deno-build-789',
      frameworkVersion: '0.0.0',
      runtime: 'node',
      manifests: {
        routes: 'manifest/routes.json',
        server: 'manifest/server.json',
        client: 'manifest/client.json',
        static: 'manifest/static.json',
      },
    }),
    'utf8',
  );

  // routes.json
  fs.writeFileSync(
    path.join(manifestDir, 'routes.json'),
    JSON.stringify({
      schemaVersion: 2,
      buildId: 'deno-build-789',
      routes: [
        { id: 'page:/', kind: 'page', pattern: '/', params: [], renderMode: 'server' },
        { id: 'page:/about', kind: 'page', pattern: '/about', params: [], renderMode: 'static' },
        {
          id: 'api:/api/echo',
          kind: 'api',
          pattern: '/api/echo',
          params: [],
          methods: ['GET', 'POST'],
        },
        {
          id: 'api:/api/stream',
          kind: 'api',
          pattern: '/api/stream',
          params: [],
          methods: ['GET'],
        },
      ],
    }),
    'utf8',
  );

  // server.json
  fs.writeFileSync(
    path.join(manifestDir, 'server.json'),
    JSON.stringify({
      schemaVersion: 1,
      buildId: 'deno-build-789',
      routes: [
        { routeId: 'page:/', serverEntry: 'server/page-home.mjs' },
        { routeId: 'api:/api/echo', serverEntry: 'server/api-echo.mjs' },
        { routeId: 'api:/api/stream', serverEntry: 'server/api-stream.mjs' },
      ],
    }),
    'utf8',
  );

  // client.json
  fs.writeFileSync(
    path.join(manifestDir, 'client.json'),
    JSON.stringify({
      schemaVersion: 1,
      buildId: 'deno-build-789',
      assets: {
        'page:/': {
          js: ['/_ranu/assets/app.js'],
          css: ['/_ranu/assets/app.css'],
        },
      },
    }),
    'utf8',
  );

  // static.json
  fs.writeFileSync(
    path.join(manifestDir, 'static.json'),
    JSON.stringify({
      schemaVersion: 1,
      buildId: 'deno-build-789',
      routes: [
        {
          pathname: '/about',
          routeId: 'page:/about',
          file: 'static/pages/about.html',
          status: 200,
        },
      ],
    }),
    'utf8',
  );

  // static/pages/about.html
  fs.writeFileSync(
    path.join(staticPagesDir, 'about.html'),
    '<!DOCTYPE html><html><body><h1>About Ranu on Deno</h1></body></html>',
    'utf8',
  );

  // static/assets/app.js
  fs.writeFileSync(
    path.join(staticAssetsDir, 'app.js'),
    'console.log("ranu client bundle on deno");',
    'utf8',
  );

  // public/robots.txt
  fs.writeFileSync(path.join(publicDir, 'robots.txt'), 'User-agent: *\nDisallow: /private\n', 'utf8');

  // server components
  fs.writeFileSync(
    path.join(serverDir, 'page-home.mjs'),
    `export default function HomePage() {
  return {
    type: 'div',
    props: {
      children: 'Welcome to Ranu Deno Production'
    }
  };
}
`,
    'utf8',
  );

  fs.writeFileSync(
    path.join(serverDir, 'api-echo.mjs'),
    `export async function POST(request) {
  const body = await request.json();
  return new Response(JSON.stringify({ echoed: body, ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export async function GET() {
  return new Response(JSON.stringify({ message: 'api-echo ready on deno' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
`,
    'utf8',
  );

  fs.writeFileSync(
    path.join(serverDir, 'api-stream.mjs'),
    `export async function GET() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('deno-1;'));
      controller.enqueue(encoder.encode('deno-2;'));
      controller.enqueue(encoder.encode('deno-3'));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
`,
    'utf8',
  );
}

describe('@ranujs/adapter-deno', () => {
  let tempDir: string;
  let buildDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-deno-test-'));
    buildDir = path.join(tempDir, '.ranu', 'build');
    setupTestFixture(tempDir, buildDir);
  });

  describe('Factory and Capabilities', () => {
    it('creates an adapter with correct metadata', () => {
      const adapter = createDenoAdapter();
      expect(adapter.name).toBe('deno');
      expect(adapter.apiVersion).toBe(1);
      expect(adapter.capabilities).toEqual(DENO_CAPABILITIES);
    });

    it('exports denoAdapter and default createDenoAdapter', () => {
      expect(denoAdapter).toBe(createDenoAdapter);
      expect(adapterName).toBe('deno');
      expect(ADAPTER_API_VERSION).toBe(1);
    });

    it('declares exact DENO_CAPABILITIES matrix', () => {
      expect(DENO_CAPABILITIES).toEqual({
        runtime: 'deno',
        ssr: true,
        apiRoutes: true,
        middleware: false,
        streaming: true,
        staticFiles: true,
        runtimeEnvironment: true,
        writableFilesystem: 'temporary',
        longLivedProcess: true,
        supportsWaitUntil: false,
      });
    });
  });

  describe('Security and Path Traversal Guards', () => {
    it('isPathContained correctly checks containment', () => {
      const base = path.resolve(tempDir);
      expect(isPathContained(path.join(base, 'child'), base)).toBe(true);
      expect(isPathContained(path.join(base, 'sub', 'file.txt'), base)).toBe(true);
      expect(isPathContained(path.resolve(base, '..'), base)).toBe(false);
      expect(isPathContained(path.resolve(base, '../other'), base)).toBe(false);
    });

    it('copyDirectorySafe filters sensitive and forbidden files', () => {
      const srcDir = path.join(tempDir, 'sensitive-src');
      const destDir = path.join(tempDir, 'sensitive-dest');
      fs.mkdirSync(srcDir, { recursive: true });

      fs.writeFileSync(path.join(srcDir, '.env'), 'SECRET=123', 'utf8');
      fs.writeFileSync(path.join(srcDir, '.env.production'), 'SECRET=456', 'utf8');
      fs.writeFileSync(path.join(srcDir, '.DS_Store'), 'junk', 'utf8');
      fs.writeFileSync(path.join(srcDir, 'bundle.js.map'), 'map', 'utf8');
      fs.writeFileSync(path.join(srcDir, 'server.key'), 'key', 'utf8');
      fs.writeFileSync(path.join(srcDir, 'allowed.txt'), 'hello', 'utf8');

      const copied = copyDirectorySafe(srcDir, destDir, tempDir, [
        '.env',
        '.git',
        '.DS_Store',
        '.map',
        'server',
      ]);

      expect(fs.existsSync(path.join(destDir, 'allowed.txt'))).toBe(true);
      expect(fs.existsSync(path.join(destDir, '.env'))).toBe(false);
      expect(fs.existsSync(path.join(destDir, '.env.production'))).toBe(false);
      expect(fs.existsSync(path.join(destDir, '.DS_Store'))).toBe(false);
      expect(fs.existsSync(path.join(destDir, 'bundle.js.map'))).toBe(false);
      expect(fs.existsSync(path.join(destDir, 'server.key'))).toBe(false);
      expect(copied).toHaveLength(1);
    });

    it('assertNoDestinationSymlink prevents writing through symlinks', () => {
      const symlinkSrc = path.join(tempDir, 'sym-target');
      const symlinkDest = path.join(tempDir, 'sym-link');
      fs.mkdirSync(symlinkSrc, { recursive: true });

      try {
        fs.symlinkSync(symlinkSrc, symlinkDest, 'dir');
        expect(() => assertNoDestinationSymlink(symlinkDest, tempDir)).toThrow(
          /Refusing to copy through symbolic link/,
        );
      } catch (err: any) {
        if (err.code !== 'EPERM') {
          throw err;
        }
      }
    });
  });

  describe('Validation and Error Handling', () => {
    it('throws when production build (build.json) is missing', async () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-deno-'));
      const adapter = createDenoAdapter();

      await expect(
        adapter.adapt({
          projectRoot: emptyDir,
          buildDir: path.join(emptyDir, '.ranu', 'build'),
          outputDir: path.join(emptyDir, 'dist'),
        }),
      ).rejects.toThrow(/No production build found/);
    });

    it('throws when build runtime is incompatible with deno target', async () => {
      fs.writeFileSync(
        path.join(buildDir, 'build.json'),
        JSON.stringify({
          schemaVersion: 1,
          buildId: 'test',
          runtime: 'workerd',
          manifests: { routes: 'manifest/routes.json', server: 'manifest/server.json' },
        }),
        'utf8',
      );

      const adapter = createDenoAdapter();
      await expect(
        adapter.adapt({
          projectRoot: tempDir,
          buildDir,
          outputDir: path.join(tempDir, 'dist'),
        }),
      ).rejects.toThrow(/Deno adapter requires build runtime target "node", but received "workerd"/);
    });

    it('throws when output directory equals project root or build directory', async () => {
      const adapter = createDenoAdapter();
      await expect(
        adapter.adapt({
          projectRoot: tempDir,
          buildDir,
          outputDir: tempDir,
        }),
      ).rejects.toThrow(/output directory cannot be equal to project root/);

      await expect(
        adapter.adapt({
          projectRoot: tempDir,
          buildDir,
          outputDir: buildDir,
        }),
      ).rejects.toThrow(/output directory cannot be equal to project root/);
    });

    it('throws when output directory contains project root', async () => {
      const parentDir = path.resolve(tempDir, '..');
      const adapter = createDenoAdapter({ outputDir: parentDir });
      await expect(
        adapter.adapt({
          projectRoot: tempDir,
          buildDir,
        }),
      ).rejects.toThrow(/output directory cannot contain the project root/);
    });
  });

  describe('Deno Configuration Generation and Sandbox Permissions', () => {
    it('generates deno.json enforcing principle of least privilege', () => {
      const configJson = generateDenoConfig();
      const parsed = JSON.parse(configJson);

      expect(parsed.tasks.start).toContain('--allow-net');
      expect(parsed.tasks.start).toContain('--allow-read');
      expect(parsed.tasks.start).toContain('--allow-env');
      expect(parsed.tasks.start).toContain('server.mjs');

      // Verify zero forbidden privileges
      expect(parsed.tasks.start).not.toContain('--allow-run');
      expect(parsed.tasks.start).not.toContain('--allow-write');
      expect(parsed.tasks.start).not.toContain('--allow-ffi');
      expect(parsed.tasks.start).not.toContain('--allow-all');
      expect(parsed.tasks.start).not.toContain('-A');
    });

    it('skips deno.json generation when options.denoConfig is false', async () => {
      const outputDir = path.join(tempDir, 'dist-no-config');
      const adapter = createDenoAdapter({ denoConfig: false, outputDir });

      const result = await adapter.adapt({
        projectRoot: tempDir,
        buildDir,
      });

      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'deno.json'))).toBe(false);
    });
  });

  describe('Artifact Emission and File Structure', () => {
    it('emits standalone Deno server and complete distribution directory', async () => {
      const outputDir = path.join(tempDir, 'dist-deno');
      const adapter = createDenoAdapter({ outputDir, port: 4000 });

      const result = await adapter.adapt({
        projectRoot: tempDir,
        buildDir,
      });

      expect(result.success).toBe(true);
      expect(result.target).toBe('deno');
      expect(result.outputDirectory).toBe(outputDir);

      // Verify file presence
      expect(fs.existsSync(path.join(outputDir, 'server.mjs'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'index.mjs'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'package.json'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'build.json'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'BUILD_ID'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'deno.json'))).toBe(true);

      // Verify package.json
      const pkg = JSON.parse(fs.readFileSync(path.join(outputDir, 'package.json'), 'utf8'));
      expect(pkg.type).toBe('module');
      expect(pkg.main).toBe('server.mjs');
      expect(pkg.scripts.start).toBe('deno task start');

      // Verify static assets
      expect(fs.existsSync(path.join(outputDir, 'static', 'assets', 'app.js'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, '_ranu', 'assets', 'app.js'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'static', 'pages', 'about.html'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'public', 'robots.txt'))).toBe(true);

      // Verify server bundles & manifests
      expect(fs.existsSync(path.join(outputDir, 'server', 'page-home.mjs'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'manifest', 'routes.json'))).toBe(true);

      // Verify deployment descriptor
      const deploymentPath = path.join(tempDir, '.ranu', 'deploy', 'deno', 'deployment.json');
      expect(fs.existsSync(deploymentPath)).toBe(true);
      const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
      expect(deployment.schemaVersion).toBe(1);
      expect(deployment.adapter).toBe('deno');
      expect(deployment.buildId).toBe('deno-build-789');
      expect(deployment.entrypoint).toBe('server.mjs');
      expect(deployment.routesCount).toBe(4);
      expect(deployment.serverRoutesCount).toBe(3);
      expect(deployment.staticRoutesCount).toBe(1);
    });
  });

  describe('In-Process Request Dispatching and Static Streaming via W3C Web Standards', () => {
    let handler: (req: Request) => Promise<Response>;
    let outputDir: string;

    beforeAll(async () => {
      const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-deno-req-test-'));
      const fixtureBuildDir = path.join(fixtureRoot, '.ranu', 'build');
      outputDir = path.join(fixtureRoot, 'dist-deno');
      setupTestFixture(fixtureRoot, fixtureBuildDir);

      const adapter = createDenoAdapter({
        outputDir,
        bundle: false,
      });

      await adapter.adapt({
        projectRoot: fixtureRoot,
        buildDir: fixtureBuildDir,
      });

      const serverModulePath = path.join(outputDir, 'server.mjs');
      const serverModule = await import(pathToFileURL(serverModulePath).href);

      handler = serverModule.createDenoHandler({
        projectRoot: outputDir,
        buildDir: outputDir,
      });
    });

    it('serves pre-rendered static HTML page with correct headers', async () => {
      const req = new Request('http://localhost:3000/about');
      const res = await handler(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      expect(res.headers.get('cache-control')).toContain('must-revalidate');
      const text = await res.text();
      expect(text).toContain('<h1>About Ranu on Deno</h1>');
    });

    it('serves immutable framework client assets with long-term cache headers', async () => {
      const req = new Request('http://localhost:3000/_ranu/assets/app.js');
      const res = await handler(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('javascript');
      expect(res.headers.get('cache-control')).toContain('immutable');
      const text = await res.text();
      expect(text).toContain('ranu client bundle on deno');
    });

    it('serves public assets as fallback', async () => {
      const req = new Request('http://localhost:3000/robots.txt');
      const res = await handler(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toContain('public');
      const text = await res.text();
      expect(text).toContain('Disallow: /private');
    });

    it('dispatches API POST route with JSON body', async () => {
      const req = new Request('http://localhost:3000/api/echo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hello: 'deno', count: 100 }),
      });

      const res = await handler(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');
      const data = await res.json();
      expect(data).toEqual({
        echoed: { hello: 'deno', count: 100 },
        ok: true,
      });
    });

    it('dispatches streaming API route', async () => {
      const req = new Request('http://localhost:3000/api/stream');
      const res = await handler(req);

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe('deno-1;deno-2;deno-3');
    });

    it('blocks path traversal attempts', async () => {
      const req = {
        url: 'http://localhost:3000/../../../etc/passwd',
        method: 'GET',
        headers: new Headers(),
      } as unknown as Request;
      const res = await handler(req);
      expect([400, 403]).toContain(res.status);
    });

    it('blocks dotfile access attempts', async () => {
      const req = new Request('http://localhost:3000/.env');
      const res = await handler(req);
      expect(res.status).toBe(403);
    });
  });

  describe('Standalone Server Execution via HTTP Socket (Node Fallback in Vitest)', () => {
    let serverInstance: any;
    let baseUrl: string;

    beforeAll(async () => {
      const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-deno-exec-test-'));
      const fixtureBuildDir = path.join(fixtureRoot, '.ranu', 'build');
      const fixtureOutputDir = path.join(fixtureRoot, 'dist-server');
      setupTestFixture(fixtureRoot, fixtureBuildDir);

      const adapter = createDenoAdapter({
        outputDir: fixtureOutputDir,
        bundle: false,
      });

      await adapter.adapt({
        projectRoot: fixtureRoot,
        buildDir: fixtureBuildDir,
      });

      const serverModulePath = path.join(fixtureOutputDir, 'server.mjs');
      const serverModule = await import(pathToFileURL(serverModulePath).href);

      serverInstance = await serverModule.startServer({
        port: 0,
        host: '127.0.0.1',
        projectRoot: fixtureOutputDir,
        buildDir: fixtureOutputDir,
      });

      const addr = serverInstance.address;
      baseUrl = `http://${addr.host}:${addr.port}`;
    });

    afterAll(async () => {
      if (serverInstance && typeof serverInstance.close === 'function') {
        await serverInstance.close();
      }
    });

    it('responds to HTTP GET for static pages', async () => {
      const res = await fetch(`${baseUrl}/about`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('About Ranu on Deno');
    });

    it('responds to HTTP POST for API routes', async () => {
      const res = await fetch(`${baseUrl}/api/echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'deno-http-test' }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.echoed.message).toBe('deno-http-test');
    });
  });
});
