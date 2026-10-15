import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import {
  createNodeAdapter,
  nodeAdapter,
  adapterName,
  ADAPTER_API_VERSION,
  NODE_CAPABILITIES,
  isPathContained,
  assertNoDestinationSymlink,
  copyDirectorySafe,
  generateDockerfile,
  generateDockerignore,
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
  fs.writeFileSync(path.join(targetBuildDir, 'BUILD_ID'), 'node-build-789\n', 'utf8');

  // build.json
  fs.writeFileSync(
    path.join(targetBuildDir, 'build.json'),
    JSON.stringify({
      schemaVersion: 1,
      buildId: 'node-build-789',
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
      buildId: 'node-build-789',
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
        {
          id: 'api:/api/slow',
          kind: 'api',
          pattern: '/api/slow',
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
      buildId: 'node-build-789',
      routes: [
        { routeId: 'page:/', serverEntry: 'server/page-home.mjs' },
        { routeId: 'api:/api/echo', serverEntry: 'server/api-echo.mjs' },
        { routeId: 'api:/api/stream', serverEntry: 'server/api-stream.mjs' },
        { routeId: 'api:/api/slow', serverEntry: 'server/api-slow.mjs' },
      ],
    }),
    'utf8',
  );

  // static.json
  fs.writeFileSync(
    path.join(manifestDir, 'static.json'),
    JSON.stringify({
      schemaVersion: 1,
      buildId: 'node-build-789',
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

  // client.json
  fs.writeFileSync(
    path.join(manifestDir, 'client.json'),
    JSON.stringify({
      schemaVersion: 1,
      buildId: 'node-build-789',
      assets: {
        'page:/': { js: ['/_ranu/assets/app.js'], css: [] },
      },
    }),
    'utf8',
  );

  // static files
  fs.writeFileSync(
    path.join(staticPagesDir, 'about.html'),
    '<!DOCTYPE html><html><body><h1>About Ranu</h1></body></html>',
    'utf8',
  );
  fs.writeFileSync(
    path.join(staticAssetsDir, 'app.js'),
    'console.log("ranu client bundle");',
    'utf8',
  );
  fs.writeFileSync(path.join(publicDir, 'robots.txt'), 'User-agent: *\nDisallow:', 'utf8');

  // server route implementations
  fs.writeFileSync(
    path.join(serverDir, 'page-home.mjs'),
    `export default function HomePage() {
  return {
    type: 'div',
    props: {
      children: 'Welcome to Ranu Node Production'
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
  return new Response(JSON.stringify({ message: 'api-echo ready' }), {
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
      controller.enqueue(encoder.encode('part-one;'));
      controller.enqueue(encoder.encode('part-two;'));
      controller.enqueue(encoder.encode('part-three'));
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

  fs.writeFileSync(
    path.join(serverDir, 'api-slow.mjs'),
    `export async function GET() {
  await new Promise((resolve) => setTimeout(resolve, 200));
  return new Response('slow-response-completed', {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
`,
    'utf8',
  );
}

describe('@ranujs/adapter-node', () => {
  let tempDir: string;
  let buildDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-node-test-'));
    buildDir = path.join(tempDir, '.ranu', 'build');
    setupTestFixture(tempDir, buildDir);
  });

  describe('Factory and Capabilities', () => {
    it('creates an adapter with correct metadata', () => {
      const adapter = createNodeAdapter();
      expect(adapter.name).toBe('node');
      expect(adapter.apiVersion).toBe(1);
      expect(adapter.capabilities).toEqual(NODE_CAPABILITIES);
    });

    it('exports nodeAdapter and default createNodeAdapter', () => {
      expect(nodeAdapter).toBe(createNodeAdapter);
      expect(adapterName).toBe('node');
      expect(ADAPTER_API_VERSION).toBe(1);
    });

    it('declares exact NODE_CAPABILITIES matrix', () => {
      expect(NODE_CAPABILITIES).toEqual({
        runtime: 'node',
        ssr: true,
        apiRoutes: true,
        middleware: false,
        streaming: true,
        staticFiles: true,
        runtimeEnvironment: true,
        writableFilesystem: 'persistent',
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
        // Skip on Windows environments if non-elevated symlinks not permitted
        if (err.code !== 'EPERM') {
          throw err;
        }
      }
    });
  });

  describe('Validation and Error Handling', () => {
    it('throws when production build (build.json) is missing', async () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-ranu-'));
      const adapter = createNodeAdapter();

      await expect(
        adapter.adapt({
          projectRoot: emptyDir,
          buildDir: path.join(emptyDir, '.ranu', 'build'),
          outputDir: path.join(emptyDir, 'dist'),
        }),
      ).rejects.toThrow(/No production build found/);
    });

    it('throws when build runtime is incompatible with node target', async () => {
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

      const adapter = createNodeAdapter();
      await expect(
        adapter.adapt({
          projectRoot: tempDir,
          buildDir,
          outputDir: path.join(tempDir, 'dist'),
        }),
      ).rejects.toThrow(/Node adapter requires build runtime target "node", but received "workerd"/);
    });

    it('throws when output directory equals project root or build directory', async () => {
      const adapter = createNodeAdapter();
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
      const adapter = createNodeAdapter({ outputDir: parentDir });
      await expect(
        adapter.adapt({
          projectRoot: tempDir,
          buildDir,
        }),
      ).rejects.toThrow(/output directory cannot contain the project root/);
    });
  });

  describe('Container Artifacts Generation', () => {
    it('generates Dockerfile and .dockerignore with default configuration', () => {
      const dockerfile = generateDockerfile();
      expect(dockerfile).toContain('FROM node:22-alpine AS runner');
      expect(dockerfile).toContain('ENV NODE_ENV=production');
      expect(dockerfile).toContain('ENV PORT=3000');
      expect(dockerfile).toContain('EXPOSE 3000');
      expect(dockerfile).toContain('USER ranuuser');
      expect(dockerfile).toContain('CMD ["node", "server.mjs"]');

      const dockerignore = generateDockerignore();
      expect(dockerignore).toContain('.git');
      expect(dockerignore).toContain('node_modules');
      expect(dockerignore).toContain('.env');
      expect(dockerignore).toContain('.env.*');
    });

    it('generates customized Dockerfile when options are provided', () => {
      const dockerfile = generateDockerfile({ nodeVersion: '20-alpine', port: 8080 });
      expect(dockerfile).toContain('FROM node:20-alpine AS runner');
      expect(dockerfile).toContain('ENV PORT=8080');
      expect(dockerfile).toContain('EXPOSE 8080');
    });

    it('skips Dockerfile generation when options.dockerfile is false', async () => {
      const outputDir = path.join(tempDir, 'dist-no-docker');
      const adapter = createNodeAdapter({ dockerfile: false, outputDir });

      const result = await adapter.adapt({
        projectRoot: tempDir,
        buildDir,
      });

      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'Dockerfile'))).toBe(false);
      expect(fs.existsSync(path.join(outputDir, '.dockerignore'))).toBe(false);
    });
  });

  describe('Artifact Emission and File Structure', () => {
    it('emits standalone server and complete distribution directory', async () => {
      const outputDir = path.join(tempDir, 'dist-node');
      const adapter = createNodeAdapter({ outputDir, port: 4000 });

      const result = await adapter.adapt({
        projectRoot: tempDir,
        buildDir,
      });

      expect(result.success).toBe(true);
      expect(result.target).toBe('node');
      expect(result.outputDirectory).toBe(outputDir);

      // Verify file presence
      expect(fs.existsSync(path.join(outputDir, 'server.mjs'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'index.mjs'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'package.json'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'build.json'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'BUILD_ID'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'Dockerfile'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, '.dockerignore'))).toBe(true);

      // Verify package.json
      const pkg = JSON.parse(fs.readFileSync(path.join(outputDir, 'package.json'), 'utf8'));
      expect(pkg.type).toBe('module');
      expect(pkg.main).toBe('server.mjs');

      // Verify static assets
      expect(fs.existsSync(path.join(outputDir, 'static', 'assets', 'app.js'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, '_ranu', 'assets', 'app.js'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'static', 'pages', 'about.html'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'public', 'robots.txt'))).toBe(true);

      // Verify server bundles & manifests
      expect(fs.existsSync(path.join(outputDir, 'server', 'page-home.mjs'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'manifest', 'routes.json'))).toBe(true);

      // Verify deployment descriptor
      const deploymentPath = path.join(tempDir, '.ranu', 'deploy', 'node', 'deployment.json');
      expect(fs.existsSync(deploymentPath)).toBe(true);
      const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
      expect(deployment.schemaVersion).toBe(1);
      expect(deployment.adapter).toBe('node');
      expect(deployment.buildId).toBe('node-build-789');
      expect(deployment.entrypoint).toBe('server.mjs');
      expect(deployment.routesCount).toBe(5);
      expect(deployment.serverRoutesCount).toBe(4);
      expect(deployment.staticRoutesCount).toBe(1);
    });
  });

  describe('Standalone Server Execution and HTTP Dispatch Integration', () => {
    let serverInstance: any;
    let baseUrl: string;

    beforeAll(async () => {
      const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-exec-test-'));
      const fixtureBuildDir = path.join(fixtureRoot, '.ranu', 'build');
      const fixtureOutputDir = path.join(fixtureRoot, 'dist-server');
      setupTestFixture(fixtureRoot, fixtureBuildDir);

      const adapter = createNodeAdapter({
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
        dontExit: true,
      });

      const addr = serverInstance.address;
      baseUrl = `http://${addr.host}:${addr.port}`;
    });

    afterAll(async () => {
      if (serverInstance && typeof serverInstance.close === 'function') {
        await serverInstance.close(1000);
      }
    });

    it('serves pre-rendered static HTML page with correct headers', async () => {
      const res = await fetch(`${baseUrl}/about`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      const body = await res.text();
      expect(body).toContain('<h1>About Ranu</h1>');
    });

    it('serves immutable framework static assets with long-term cache headers', async () => {
      const res = await fetch(`${baseUrl}/_ranu/assets/app.js`);
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toContain('immutable');
      const body = await res.text();
      expect(body).toContain('ranu client bundle');
    });

    it('serves public directory assets as fallback', async () => {
      const res = await fetch(`${baseUrl}/robots.txt`);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('Disallow:');
    });

    it('dispatches API POST route with JSON request body and receives JSON response', async () => {
      const res = await fetch(`${baseUrl}/api/echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ping: 'pong', timestamp: 12345 }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');
      const json = await res.json();
      expect(json).toEqual({
        echoed: { ping: 'pong', timestamp: 12345 },
        ok: true,
      });
    });

    it('streams response chunks with backpressure-aware streaming', async () => {
      const res = await fetch(`${baseUrl}/api/stream`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/plain');

      const body = await res.text();
      expect(body).toBe('part-one;part-two;part-three');
    });

    it('supports graceful shutdown with active in-flight request completion', async () => {
      // Start in-flight slow request
      const inFlightPromise = fetch(`${baseUrl}/api/slow`).then((r) => r.text());

      // Small delay to ensure request is dispatched and in-flight
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Trigger server close
      await serverInstance.close(2000);

      // Verify in-flight request successfully completed
      const slowBody = await inFlightPromise;
      expect(slowBody).toBe('slow-response-completed');

      // Subsequent requests to the server should be rejected as server is closed
      await expect(fetch(`${baseUrl}/about`)).rejects.toThrow();
    });
  });
});
