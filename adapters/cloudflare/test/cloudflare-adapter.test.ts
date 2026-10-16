import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import {
  createCloudflareAdapter,
  cloudflareAdapter,
  adapterName,
  ADAPTER_API_VERSION,
  CLOUDFLARE_CAPABILITIES,
  isPathContained,
  copyDirectorySafe,
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
  fs.writeFileSync(path.join(targetBuildDir, 'BUILD_ID'), 'cloudflare-build-789\n');

  // build.json
  fs.writeFileSync(
    path.join(targetBuildDir, 'build.json'),
    JSON.stringify({
      schemaVersion: 1,
      buildId: 'cloudflare-build-789',
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
      buildId: 'cloudflare-build-789',
      routes: [
        { id: 'page:/', kind: 'page', pattern: '/', params: [], renderMode: 'server' },
        { id: 'page:/terms', kind: 'page', pattern: '/terms', params: [], renderMode: 'static' },
        { id: 'api:/api/data', kind: 'api', pattern: '/api/data', params: [], methods: ['GET', 'POST'] },
        { id: 'api:/api/background', kind: 'api', pattern: '/api/background', params: [], methods: ['GET'] },
        { id: 'api:/api/invalid-wait', kind: 'api', pattern: '/api/invalid-wait', params: [], methods: ['GET'] },
        { id: 'api:/api/node-shim', kind: 'api', pattern: '/api/node-shim', params: [], methods: ['GET'] },
        { id: 'api:/api/child-process', kind: 'api', pattern: '/api/child-process', params: [], methods: ['GET'] },
        { id: 'api:/api/boom', kind: 'api', pattern: '/api/boom', params: [], methods: ['GET'] },
      ],
    }),
  );

  // server.json
  fs.writeFileSync(
    path.join(manifestDir, 'server.json'),
    JSON.stringify({
      schemaVersion: 1,
      buildId: 'cloudflare-build-789',
      routes: [
        { routeId: 'page:/', serverEntry: 'server/page-home.mjs' },
        { routeId: 'api:/api/data', serverEntry: 'server/api-data.mjs' },
        { routeId: 'api:/api/background', serverEntry: 'server/api-background.mjs' },
        { routeId: 'api:/api/invalid-wait', serverEntry: 'server/api-invalid-wait.mjs' },
        { routeId: 'api:/api/node-shim', serverEntry: 'server/api-node-shim.mjs' },
        { routeId: 'api:/api/child-process', serverEntry: 'server/api-child-process.mjs' },
        { routeId: 'api:/api/boom', serverEntry: 'server/api-boom.mjs' },
      ],
    }),
  );

  // static.json
  fs.writeFileSync(
    path.join(manifestDir, 'static.json'),
    JSON.stringify({
      schemaVersion: 1,
      buildId: 'cloudflare-build-789',
      routes: [
        {
          pathname: '/terms',
          routeId: 'page:/terms',
          file: 'static/pages/terms.html',
          status: 200,
        },
      ],
    }),
  );

  // client.json
  fs.writeFileSync(
    path.join(manifestDir, 'client.json'),
    JSON.stringify({
      schemaVersion: 1,
      buildId: 'cloudflare-build-789',
      assets: {},
    }),
  );

  // Server route modules
  fs.writeFileSync(
    path.join(serverDir, 'page-home.mjs'),
    'export default () => "Hello from Cloudflare Worker SSR!";',
  );
  fs.writeFileSync(
    path.join(serverDir, 'api-data.mjs'),
    'export const GET = () => Response.json({ ok: true });\nexport const POST = async (req) => Response.json({ received: await req.json() });',
  );
  fs.writeFileSync(
    path.join(serverDir, 'api-background.mjs'),
    `import { getActiveRequestContext } from '@ranu/runtime';
export const GET = () => {
  const ctx = getActiveRequestContext();
  const env = ctx?.locals.get('env');
  const cf = ctx?.locals.get('cf');
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(Promise.resolve('background-task-done'));
  }
  return Response.json({ ok: true, envVal: env?.MY_BINDING, country: cf?.country });
};`,
  );
  fs.writeFileSync(
    path.join(serverDir, 'api-invalid-wait.mjs'),
    `import { getActiveRequestContext } from '@ranu/runtime';
export const GET = () => {
  const ctx = getActiveRequestContext();
  ctx.waitUntil('not-a-promise-string');
  return Response.json({ ok: true });
};`,
  );
  fs.writeFileSync(
    path.join(serverDir, 'api-node-shim.mjs'),
    `import fs from 'node:fs';
export const GET = () => {
  try {
    fs.readFileSync('anything');
    return Response.json({ ok: false });
  } catch (err) {
    return Response.json({ ok: true, message: err.message });
  }
};`,
  );
  fs.writeFileSync(
    path.join(serverDir, 'api-child-process.mjs'),
    `import cp from 'node:child_process';
export const GET = () => {
  try {
    cp.execSync('anything');
    return Response.json({ ok: false });
  } catch (err) {
    return Response.json({ ok: true, message: err.message });
  }
};`,
  );
  fs.writeFileSync(
    path.join(serverDir, 'api-boom.mjs'),
    'export const GET = () => { throw new Error("Unhandled route exception"); };',
  );

  // Static files
  fs.writeFileSync(path.join(staticPagesDir, 'terms.html'), '<html><body>Terms of Service</body></html>');
  fs.writeFileSync(path.join(staticAssetsDir, 'style.abc.css'), 'body { background: #fafafa; }');
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), 'icon-content');
}

describe('@ranujs/adapter-cloudflare', () => {
  let tempDir: string;
  let buildDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-cloudflare-test-'));
    buildDir = path.join(tempDir, '.ranu', 'build');
    setupTestFixture(tempDir, buildDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Contract and Metadata', () => {
    it('declares adapter name, API version and capabilities', () => {
      const adapter = createCloudflareAdapter();
      expect(adapter.name).toBe('cloudflare');
      expect(adapter.apiVersion).toBe(1);
      expect(adapterName).toBe('cloudflare');
      expect(ADAPTER_API_VERSION).toBe(1);
      expect(cloudflareAdapter).toBe(createCloudflareAdapter);

      expect(CLOUDFLARE_CAPABILITIES.runtime).toBe('workerd');
      expect(CLOUDFLARE_CAPABILITIES.ssr).toBe(true);
      expect(CLOUDFLARE_CAPABILITIES.apiRoutes).toBe(true);
      expect(CLOUDFLARE_CAPABILITIES.middleware).toBe(false);
      expect(CLOUDFLARE_CAPABILITIES.streaming).toBe(true);
      expect(CLOUDFLARE_CAPABILITIES.staticFiles).toBe(true);
      expect(CLOUDFLARE_CAPABILITIES.runtimeEnvironment).toBe(true);
      expect(CLOUDFLARE_CAPABILITIES.writableFilesystem).toBe('none');
      expect(CLOUDFLARE_CAPABILITIES.longLivedProcess).toBe(false);
      expect(CLOUDFLARE_CAPABILITIES.supportsWaitUntil).toBe(true);
    });

    it('checks path containment correctly', () => {
      expect(isPathContained('/root/a/b', '/root')).toBe(true);
      expect(isPathContained('/outside/a', '/root')).toBe(false);
    });

    it('copies nested files and skips forbidden sensitive files', () => {
      const source = path.join(tempDir, 'copy-source');
      const destination = path.join(tempDir, 'copy-dest');
      fs.mkdirSync(path.join(source, 'nested'), { recursive: true });
      fs.writeFileSync(path.join(source, 'nested', 'valid.txt'), 'valid');
      for (const name of ['.env', '.env.production', 'bundle.map', 'server', 'server-chunk.js']) {
        fs.writeFileSync(path.join(source, name), 'forbidden');
      }

      const copied = copyDirectorySafe(source, destination, tempDir, ['.env', '.map', 'server']);
      expect(copied).toEqual([path.join(destination, 'nested', 'valid.txt')]);
      expect(fs.readFileSync(copied[0], 'utf8')).toBe('valid');
    });

    it('rejects destinations outside the authorized root and destination symlinks', () => {
      const source = path.join(tempDir, 'copy-source');
      fs.mkdirSync(source);
      fs.writeFileSync(path.join(source, 'data.txt'), 'data');

      expect(() => copyDirectorySafe(source, path.join(tempDir, '..', 'escape'), tempDir)).toThrow(
        /Path traversal|symbolic link/,
      );

      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-cf-outside-'));
      const linkedDestination = path.join(tempDir, 'linked-dest');
      fs.symlinkSync(outside, linkedDestination, 'dir');
      try {
        expect(() => copyDirectorySafe(source, linkedDestination, tempDir)).toThrow(
          /symbolic link/,
        );
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });
  });

  describe('Validation & Safety', () => {
    it('fails when build descriptor is missing', async () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-empty-'));
      const adapter = createCloudflareAdapter();
      await expect(adapter.adapt({ projectRoot: emptyDir })).rejects.toThrow(
        /No production build found/,
      );
      fs.rmSync(emptyDir, { recursive: true, force: true });
    });

    it('rejects an incompatible build runtime target', async () => {
      const descriptorPath = path.join(buildDir, 'build.json');
      const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8'));
      descriptor.runtime = 'edge';
      fs.writeFileSync(descriptorPath, JSON.stringify(descriptor));

      await expect(
        createCloudflareAdapter().adapt({ projectRoot: tempDir, buildDir }),
      ).rejects.toThrow(/requires build runtime target/);
    });

    it('rejects outputDir if it is identical to or contains projectRoot or buildDir', async () => {
      const adapter1 = createCloudflareAdapter({ outputDir: tempDir });
      await expect(adapter1.adapt({ projectRoot: tempDir, buildDir })).rejects.toThrow(
        /output directory cannot be equal to project root/,
      );

      const adapter2 = createCloudflareAdapter({ outputDir: buildDir });
      await expect(adapter2.adapt({ projectRoot: tempDir, buildDir })).rejects.toThrow(
        /output directory cannot be equal to project root or build directory/,
      );

      const projectParent = path.dirname(tempDir);
      await expect(
        createCloudflareAdapter({ outputDir: projectParent }).adapt({
          projectRoot: tempDir,
          buildDir,
        }),
      ).rejects.toThrow(/output directory cannot contain the project root/);
    });

    it('protects against secret leakage and source map exposure in static assets', async () => {
      fs.writeFileSync(path.join(tempDir, 'public', '.env.local'), 'SECRET=xyz');
      fs.writeFileSync(path.join(tempDir, 'public', 'server.map'), 'sourcemap-data');
      fs.writeFileSync(path.join(tempDir, 'public', 'app.js.map'), 'sourcemap-data-js');

      const adapter = createCloudflareAdapter();
      await adapter.adapt({ projectRoot: tempDir, buildDir });

      const cfOut = path.join(tempDir, '.cloudflare');
      expect(fs.existsSync(path.join(cfOut, '.env.local'))).toBe(false);
      expect(fs.existsSync(path.join(cfOut, 'server.map'))).toBe(false);
      expect(fs.existsSync(path.join(cfOut, 'app.js.map'))).toBe(false);
    });

    it('rejects manifest paths that escape the build directory', async () => {
      const descriptorPath = path.join(buildDir, 'build.json');
      const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8'));
      descriptor.manifests.routes = '../../escaped-routes.json';
      fs.writeFileSync(descriptorPath, JSON.stringify(descriptor));

      await expect(
        createCloudflareAdapter().adapt({ projectRoot: tempDir, buildDir }),
      ).rejects.toThrow(/escapes build directory/);
    });
  });

  describe('Artifact Generation', () => {
    it('generates Cloudflare Pages and Workers bundle structure', async () => {
      const adapter = createCloudflareAdapter();
      const result = await adapter.adapt({
        projectRoot: tempDir,
        buildDir,
      });

      expect(result.success).toBe(true);
      expect(result.target).toBe('cloudflare');

      const cfOut = path.join(tempDir, '.cloudflare');
      expect(fs.existsSync(cfOut)).toBe(true);

      // 1. _worker.js bundle
      const workerPath = path.join(cfOut, '_worker.js');
      expect(fs.existsSync(workerPath)).toBe(true);
      const workerCode = fs.readFileSync(workerPath, 'utf8');
      expect(workerCode).toContain('export');
      expect(workerCode).toContain('fetch');

      // 2. _headers
      const headersPath = path.join(cfOut, '_headers');
      expect(fs.existsSync(headersPath)).toBe(true);
      const headersContent = fs.readFileSync(headersPath, 'utf8');
      expect(headersContent).toContain('/_ranu/assets/*');
      expect(headersContent).toContain('immutable');

      // 3. _routes.json
      const routesJsonPath = path.join(cfOut, '_routes.json');
      expect(fs.existsSync(routesJsonPath)).toBe(true);
      const routesJson = JSON.parse(fs.readFileSync(routesJsonPath, 'utf8'));
      expect(routesJson.version).toBe(1);
      expect(routesJson.include).toEqual(['/*']);
      expect(routesJson.exclude).toContain('/_ranu/assets/*');
      expect(routesJson.exclude).toContain('/terms');
      expect(routesJson.exclude).toContain('/favicon.ico');

      // 4. static files
      expect(fs.existsSync(path.join(cfOut, 'terms.html'))).toBe(true);
      expect(fs.existsSync(path.join(cfOut, 'favicon.ico'))).toBe(true);
      expect(fs.existsSync(path.join(cfOut, '_ranu', 'assets', 'style.abc.css'))).toBe(true);

      // 5. deployment.json completion marker
      const deployMarkerPath = path.join(tempDir, '.ranu', 'deploy', 'cloudflare', 'deployment.json');
      expect(fs.existsSync(deployMarkerPath)).toBe(true);
      const deployMarker = JSON.parse(fs.readFileSync(deployMarkerPath, 'utf8'));
      expect(deployMarker.adapter).toBe('cloudflare');
      expect(deployMarker.target).toBe('cloudflare');
      expect(deployMarker.buildId).toBe('cloudflare-build-789');
      expect(deployMarker.routesCount).toBe(8);
      expect(deployMarker.serverRoutesCount).toBe(7);
      expect(deployMarker.staticRoutesCount).toBe(1);
    }, 15_000);

    it('bounds _routes.json to less than 100 rules when many static pages exist', async () => {
      const staticManifestPath = path.join(buildDir, 'manifest', 'static.json');
      const staticPagesDir = path.join(buildDir, 'static', 'pages');
      const manyRoutes = [];
      for (let i = 0; i < 120; i++) {
        const pName = `/page-${i}`;
        const fName = `static/pages/page-${i}.html`;
        fs.writeFileSync(path.join(staticPagesDir, `page-${i}.html`), `Page ${i}`);
        manyRoutes.push({ pathname: pName, routeId: `page:${pName}`, file: fName, status: 200 });
      }
      fs.writeFileSync(
        staticManifestPath,
        JSON.stringify({ schemaVersion: 1, buildId: 'cloudflare-build-789', routes: manyRoutes }),
      );

      const adapter = createCloudflareAdapter();
      await adapter.adapt({ projectRoot: tempDir, buildDir });

      const routesJsonPath = path.join(tempDir, '.cloudflare', '_routes.json');
      const routesJson = JSON.parse(fs.readFileSync(routesJsonPath, 'utf8'));
      const totalRules = routesJson.include.length + routesJson.exclude.length;
      expect(totalRules).toBeLessThan(100);
    }, 15_000);

    it('bounds _routes.json rules when include rules count is high', async () => {
      const manyIncludes = Array.from({ length: 98 }, (_, i) => `/route-${i}/*`);
      const adapter = createCloudflareAdapter({
        routesJson: {
          include: manyIncludes,
          exclude: ['/static-1', '/static-2', '/static-3'],
        },
      });
      await adapter.adapt({ projectRoot: tempDir, buildDir });

      const routesJsonPath = path.join(tempDir, '.cloudflare', '_routes.json');
      const routesJson = JSON.parse(fs.readFileSync(routesJsonPath, 'utf8'));
      const totalRules = routesJson.include.length + routesJson.exclude.length;
      expect(totalRules).toBeLessThanOrEqual(99);
      expect(routesJson.include.length).toBe(98);
      expect(routesJson.exclude.length).toBeLessThanOrEqual(1);
    }, 15_000);

    it('suppresses _routes.json when routesJson option is false', async () => {
      const adapter = createCloudflareAdapter({ routesJson: false });
      await adapter.adapt({ projectRoot: tempDir, buildDir });

      const routesJsonPath = path.join(tempDir, '.cloudflare', '_routes.json');
      expect(fs.existsSync(routesJsonPath)).toBe(false);
    }, 15_000);

    it('cleans the output directory by default and retains it when clean is false', async () => {
      const outputDir = path.join(tempDir, '.cloudflare');
      fs.mkdirSync(outputDir, { recursive: true });
      const sentinel = path.join(outputDir, 'sentinel.txt');
      fs.writeFileSync(sentinel, 'keep me');

      await createCloudflareAdapter({ clean: false }).adapt({ projectRoot: tempDir, buildDir });
      expect(fs.existsSync(sentinel)).toBe(true);

      await createCloudflareAdapter({ clean: true }).adapt({ projectRoot: tempDir, buildDir });
      expect(fs.existsSync(sentinel)).toBe(false);
    }, 15_000);
  });

  describe('Runtime Execution & Dispatch Bridge', () => {
    let bridgeDir: string;
    let bridgeBuildDir: string;
    let workerModule: any;

    beforeAll(async () => {
      bridgeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-cf-bridge-'));
      bridgeBuildDir = path.join(bridgeDir, '.ranu', 'build');
      setupTestFixture(bridgeDir, bridgeBuildDir);

      const adapter = createCloudflareAdapter();
      await adapter.adapt({ projectRoot: bridgeDir, buildDir: bridgeBuildDir });
      const workerPath = path.join(bridgeDir, '.cloudflare', '_worker.js');
      workerModule = await import(pathToFileURL(workerPath).href);
    }, 60_000);

    afterAll(() => {
      fs.rmSync(bridgeDir, { recursive: true, force: true });
    });

    it('dispatches API route requests (GET and POST)', async () => {
      const worker = workerModule.default;
      expect(worker).toBeDefined();
      expect(typeof worker.fetch).toBe('function');

      // GET /api/data
      const getReq = new Request('https://example.com/api/data', { method: 'GET' });
      const getRes = await worker.fetch(getReq);
      expect(getRes.status).toBe(200);
      expect(await getRes.json()).toEqual({ ok: true });

      // POST /api/data
      const postReq = new Request('https://example.com/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hello: 'workerd' }),
      });
      const postRes = await worker.fetch(postReq);
      expect(postRes.status).toBe(200);
      expect(await postRes.json()).toEqual({ received: { hello: 'workerd' } });
    });

    it('handles OPTIONS and HEAD requests on API routes', async () => {
      const worker = workerModule.default;

      // OPTIONS /api/data
      const optReq = new Request('https://example.com/api/data', { method: 'OPTIONS' });
      const optRes = await worker.fetch(optReq);
      expect(optRes.status).toBe(204);
      expect(optRes.headers.get('Allow')).toContain('GET');
      expect(optRes.headers.get('Allow')).toContain('POST');

      // HEAD /api/data
      const headReq = new Request('https://example.com/api/data', { method: 'HEAD' });
      const headRes = await worker.fetch(headReq);
      expect(headRes.status).toBe(200);
      expect(headRes.body).toBeNull();
    });

    it('renders React SSR pages streaming response', async () => {
      const worker = workerModule.default;

      const pageReq = new Request('https://example.com/', { method: 'GET' });
      const pageRes = await worker.fetch(pageReq);
      expect(pageRes.status).toBe(200);
      expect(pageRes.headers.get('Content-Type')).toContain('text/html');
      const html = await pageRes.text();
      expect(html).toContain('Hello from Cloudflare Worker SSR!');
    });

    it('serves pre-rendered static HTML fallback', async () => {
      const worker = workerModule.default;

      const termsReq = new Request('https://example.com/terms', { method: 'GET' });
      const termsRes = await worker.fetch(termsReq);
      expect(termsRes.status).toBe(200);
      expect(termsRes.headers.get('Content-Type')).toContain('text/html');
      const html = await termsRes.text();
      expect(html).toContain('Terms of Service');
    });

    it('delegates to env.ASSETS when bound and asset exists', async () => {
      const worker = workerModule.default;

      const mockAssetFetch = vi.fn().mockResolvedValue(
        new Response('Asset Body', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
      );

      const env = {
        ASSETS: {
          fetch: mockAssetFetch,
        },
      };

      const req = new Request('https://example.com/style.abc.css');
      const res = await worker.fetch(req, env);

      expect(mockAssetFetch).toHaveBeenCalled();
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('Asset Body');
    });

    it('falls through to SSR/API when env.ASSETS returns 404', async () => {
      const worker = workerModule.default;

      const mockAssetFetch = vi.fn().mockResolvedValue(
        new Response('Not Found', { status: 404 }),
      );

      const env = {
        ASSETS: {
          fetch: mockAssetFetch,
        },
      };

      const req = new Request('https://example.com/api/data');
      const res = await worker.fetch(req, env);

      expect(mockAssetFetch).toHaveBeenCalled();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    });

    it('bridges context.waitUntil and injects env and cf bindings', async () => {
      const worker = workerModule.default;

      const mockWaitUntil = vi.fn();
      const ctx = {
        waitUntil: mockWaitUntil,
      };

      const env = {
        MY_BINDING: 'secret-kv-value',
      };

      const req = new Request('https://example.com/api/background', { method: 'GET' });
      (req as any).cf = { country: 'LK', city: 'Colombo' };

      const res = await worker.fetch(req, env, ctx);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({
        ok: true,
        envVal: 'secret-kv-value',
        country: 'LK',
      });

      expect(mockWaitUntil).toHaveBeenCalledWith(expect.any(Promise));
    });

    it('throws TypeError when non-promise is passed to waitUntil', async () => {
      const worker = workerModule.default;

      const req = new Request('https://example.com/api/invalid-wait', { method: 'GET' });
      const res = await worker.fetch(req);
      // Uncaught exception in route handler returns 500 error
      expect(res.status).toBe(500);
    });

    it('handles Node built-in shimming safely without crashing bundle execution', async () => {
      const worker = workerModule.default;

      const req = new Request('https://example.com/api/node-shim', { method: 'GET' });
      const res = await worker.fetch(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.message).toContain('workerd runtime');
    });

    it('catches uncaught handler exceptions and returns 500 response', async () => {
      const worker = workerModule.default;

      const req = new Request('https://example.com/api/boom', { method: 'GET' });
      const res = await worker.fetch(req);
      expect(res.status).toBe(500);
      expect(await res.text()).toContain('Internal Server Error');
    });

    it('bypasses env.ASSETS on POST requests even if asset fetcher is bound', async () => {
      const worker = workerModule.default;

      const mockAssetFetch = vi.fn().mockResolvedValue(
        new Response('Asset Body', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
      );

      const env = {
        ASSETS: {
          fetch: mockAssetFetch,
        },
      };

      const postReq = new Request('https://example.com/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ping: 'pong' }),
      });
      const res = await worker.fetch(postReq, env);

      expect(mockAssetFetch).not.toHaveBeenCalled();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: { ping: 'pong' } });
    });

    it('accurately attributes unsupported module name in error message', async () => {
      const worker = workerModule.default;

      const req = new Request('https://example.com/api/child-process', { method: 'GET' });
      const res = await worker.fetch(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.message).toContain('node:child_process');
      expect(data.message).not.toContain('node:fs');
    });
  });
});
