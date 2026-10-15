import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import {
  createNetlifyAdapter,
  netlifyAdapter,
  adapterName,
  ADAPTER_API_VERSION,
  NETLIFY_CAPABILITIES,
  isPathContained,
  assertNoDestinationSymlink,
  copyDirectorySafe,
  validateHeaderSafety,
  generateHeaders,
  generateRedirects,
  generateNetlifyToml,
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
  fs.writeFileSync(path.join(targetBuildDir, 'BUILD_ID'), 'netlify-build-789\n', 'utf8');

  // build.json
  fs.writeFileSync(
    path.join(targetBuildDir, 'build.json'),
    JSON.stringify({
      schemaVersion: 1,
      buildId: 'netlify-build-789',
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
      buildId: 'netlify-build-789',
      routes: [
        { id: 'page:/', kind: 'page', pattern: '/', params: [], renderMode: 'server' },
        { id: 'page:/about', kind: 'page', pattern: '/about', params: [], renderMode: 'static' },
        {
          id: 'api:/api/data',
          kind: 'api',
          pattern: '/api/data',
          params: [],
          methods: ['GET', 'POST'],
        },
        {
          id: 'api:/api/cookies',
          kind: 'api',
          pattern: '/api/cookies',
          params: [],
          methods: ['GET'],
        },
        {
          id: 'api:/api/crlf',
          kind: 'api',
          pattern: '/api/crlf',
          params: [],
          methods: ['GET'],
        },
        {
          id: 'api:/api/context',
          kind: 'api',
          pattern: '/api/context',
          params: [],
          methods: ['GET'],
        },
        {
          id: 'api:/api/boom',
          kind: 'api',
          pattern: '/api/boom',
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
      buildId: 'netlify-build-789',
      routes: [
        { routeId: 'page:/', serverEntry: 'server/page-home.mjs' },
        { routeId: 'api:/api/data', serverEntry: 'server/api-data.mjs' },
        { routeId: 'api:/api/cookies', serverEntry: 'server/api-cookies.mjs' },
        { routeId: 'api:/api/crlf', serverEntry: 'server/api-crlf.mjs' },
        { routeId: 'api:/api/context', serverEntry: 'server/api-context.mjs' },
        { routeId: 'api:/api/boom', serverEntry: 'server/api-boom.mjs' },
      ],
    }),
    'utf8',
  );

  // static.json
  fs.writeFileSync(
    path.join(manifestDir, 'static.json'),
    JSON.stringify({
      schemaVersion: 1,
      buildId: 'netlify-build-789',
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
      buildId: 'netlify-build-789',
      assets: {},
    }),
    'utf8',
  );

  // server implementations
  fs.writeFileSync(
    path.join(serverDir, 'page-home.mjs'),
    'export default () => "Hello from Netlify Functions v2 SSR!";\n',
    'utf8',
  );

  fs.writeFileSync(
    path.join(serverDir, 'api-data.mjs'),
    `export const GET = () => Response.json({ ok: true, runtime: 'netlify' });
export const POST = async (req) => Response.json({ received: await req.json() });
`,
    'utf8',
  );

  fs.writeFileSync(
    path.join(serverDir, 'api-cookies.mjs'),
    `export const GET = () => {
  const headers = new Headers();
  headers.append('Set-Cookie', 'sessionId=secret123; Path=/; HttpOnly');
  headers.append('Set-Cookie', 'theme=dark; Path=/; Secure');
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify({ cookiesSet: true }), { headers });
};
`,
    'utf8',
  );

  fs.writeFileSync(
    path.join(serverDir, 'api-crlf.mjs'),
    `export const GET = () => {
  const headers = new Headers();
  headers.set('X-Custom-Injected', 'bad\\r\\ninjection');
  return new Response(JSON.stringify({ attacked: true }), { headers });
};
`,
    'utf8',
  );

  fs.writeFileSync(
    path.join(serverDir, 'api-context.mjs'),
    `import { getActiveRequestContext } from '@ranu/runtime';
export const GET = () => {
  const ctx = getActiveRequestContext();
  const netlify = ctx?.locals.get('netlify');
  const geo = ctx?.locals.get('geo');
  const ip = ctx?.locals.get('ip');
  return Response.json({
    ok: true,
    geoCountry: geo?.country,
    clientIp: ip,
    siteId: netlify?.site?.id,
  });
};
`,
    'utf8',
  );

  fs.writeFileSync(
    path.join(serverDir, 'api-boom.mjs'),
    'export const GET = () => { throw new Error("Unhandled exception in route"); };\n',
    'utf8',
  );

  // static files
  fs.writeFileSync(
    path.join(staticPagesDir, 'about.html'),
    '<!DOCTYPE html><html><body><h1>About Netlify App</h1></body></html>\n',
    'utf8',
  );

  fs.writeFileSync(
    path.join(staticAssetsDir, 'app.123.js'),
    'console.log("netlify client bundle");\n',
    'utf8',
  );

  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), 'ico-content\n', 'utf8');
}

describe('@ranujs/adapter-netlify', () => {
  let tempDir: string;
  let buildDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-netlify-test-'));
    buildDir = path.join(tempDir, '.ranu', 'build');
    setupTestFixture(tempDir, buildDir);
  });

  describe('Contract and Metadata', () => {
    it('creates adapter with correct metadata and capabilities', () => {
      const adapter = createNetlifyAdapter();
      expect(adapter.name).toBe('netlify');
      expect(adapter.apiVersion).toBe(1);
      expect(adapterName).toBe('netlify');
      expect(ADAPTER_API_VERSION).toBe(1);
      expect(netlifyAdapter).toBe(createNetlifyAdapter);

      expect(adapter.capabilities).toEqual(NETLIFY_CAPABILITIES);
      expect(NETLIFY_CAPABILITIES).toEqual({
        runtime: 'edge',
        ssr: true,
        apiRoutes: true,
        middleware: false,
        streaming: true,
        staticFiles: true,
        runtimeEnvironment: true,
        writableFilesystem: 'none',
        longLivedProcess: false,
        supportsWaitUntil: false,
      });
    });
  });

  describe('Security and Path Traversal Defense', () => {
    it('isPathContained correctly validates containment', () => {
      const base = path.resolve(tempDir);
      expect(isPathContained(path.join(base, 'child'), base)).toBe(true);
      expect(isPathContained(path.join(base, 'nested', 'deep', 'file.txt'), base)).toBe(true);
      expect(isPathContained(path.resolve(base, '..'), base)).toBe(false);
      expect(isPathContained(path.resolve(base, '../outside'), base)).toBe(false);
    });

    it('assertNoDestinationSymlink detects and rejects symbolic links', () => {
      const symlinkSrc = path.join(tempDir, 'symlink-src');
      const symlinkDest = path.join(tempDir, 'symlink-dest');
      fs.mkdirSync(symlinkSrc, { recursive: true });

      try {
        fs.symlinkSync(symlinkSrc, symlinkDest, 'dir');
        expect(() => assertNoDestinationSymlink(symlinkDest, tempDir)).toThrow(
          /Refusing to copy through symbolic link/,
        );
      } catch (err: any) {
        if (err.code !== 'EPERM') throw err;
      }
    });

    it('copyDirectorySafe filters sensitive and forbidden files', () => {
      const srcDir = path.join(tempDir, 'test-src');
      const destDir = path.join(tempDir, 'test-dest');
      fs.mkdirSync(srcDir, { recursive: true });

      fs.writeFileSync(path.join(srcDir, '.env'), 'SECRET=abc', 'utf8');
      fs.writeFileSync(path.join(srcDir, '.env.production'), 'SECRET=def', 'utf8');
      fs.writeFileSync(path.join(srcDir, '.DS_Store'), 'junk', 'utf8');
      fs.writeFileSync(path.join(srcDir, 'bundle.js.map'), 'map', 'utf8');
      fs.writeFileSync(path.join(srcDir, 'server.chunk.js'), 'chunk', 'utf8');
      fs.writeFileSync(path.join(srcDir, 'public.txt'), 'allowed', 'utf8');

      const copied = copyDirectorySafe(srcDir, destDir, tempDir, [
        '.env',
        '.git',
        '.DS_Store',
        '.map',
        'server',
      ]);

      expect(fs.existsSync(path.join(destDir, 'public.txt'))).toBe(true);
      expect(fs.existsSync(path.join(destDir, '.env'))).toBe(false);
      expect(fs.existsSync(path.join(destDir, '.env.production'))).toBe(false);
      expect(fs.existsSync(path.join(destDir, '.DS_Store'))).toBe(false);
      expect(fs.existsSync(path.join(destDir, 'bundle.js.map'))).toBe(false);
      expect(fs.existsSync(path.join(destDir, 'server.chunk.js'))).toBe(false);
      expect(copied).toHaveLength(1);
    });

    it('validateHeaderSafety throws on CRLF injection in header name or value', () => {
      expect(() => validateHeaderSafety({ 'X-Good': 'CleanValue' })).not.toThrow();
      expect(() => validateHeaderSafety({ 'X-Bad\r\n': 'Value' })).toThrow(/CRLF injection/);
      expect(() => validateHeaderSafety({ 'X-Bad': 'Value\r\nInject: 1' })).toThrow(/CRLF injection/);
      expect(() => validateHeaderSafety({ 'X-Bad': 'Value\nBreak' })).toThrow(/CRLF injection/);

      const h = new Headers();
      h.set('X-Good', 'Clean');
      expect(() => validateHeaderSafety(h)).not.toThrow();
    });
  });

  describe('Validation and Error Handling', () => {
    it('throws when production build (build.json) is missing', async () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-netlify-'));
      const adapter = createNetlifyAdapter();

      await expect(
        adapter.adapt({
          projectRoot: emptyDir,
          buildDir: path.join(emptyDir, '.ranu', 'build'),
          outputDir: path.join(emptyDir, '.netlify'),
        }),
      ).rejects.toThrow(/No production build found/);

      fs.rmSync(emptyDir, { recursive: true, force: true });
    });

    it('throws when build runtime is incompatible with Netlify adapter', async () => {
      fs.writeFileSync(
        path.join(buildDir, 'build.json'),
        JSON.stringify({
          schemaVersion: 1,
          buildId: 'test-incompatible',
          runtime: 'workerd',
          manifests: { routes: 'manifest/routes.json', server: 'manifest/server.json' },
        }),
        'utf8',
      );

      const adapter = createNetlifyAdapter();
      await expect(
        adapter.adapt({
          projectRoot: tempDir,
          buildDir,
          outputDir: path.join(tempDir, '.netlify'),
        }),
      ).rejects.toThrow(
        /Netlify adapter requires build runtime target "node" or "edge", but received "workerd"/,
      );
    });

    it('throws when output directory equals project root or build directory', async () => {
      const adapter = createNetlifyAdapter();
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
      const adapter = createNetlifyAdapter({ outputDir: parentDir });
      await expect(
        adapter.adapt({
          projectRoot: tempDir,
          buildDir,
        }),
      ).rejects.toThrow(/output directory cannot contain the project root/);
    });

    it('throws when manifest path escapes build directory', async () => {
      const descPath = path.join(buildDir, 'build.json');
      const desc = JSON.parse(fs.readFileSync(descPath, 'utf8'));
      desc.manifests.routes = '../../escaped-routes.json';
      fs.writeFileSync(descPath, JSON.stringify(desc), 'utf8');

      const adapter = createNetlifyAdapter();
      await expect(
        adapter.adapt({
          projectRoot: tempDir,
          buildDir,
          outputDir: path.join(tempDir, '.netlify'),
        }),
      ).rejects.toThrow(/Manifest path for "routes" escapes build directory/);
    });
  });

  describe('Configuration Generators', () => {
    it('generates valid _headers with default and custom rules', () => {
      const headers = generateHeaders([
        {
          for: '/custom/*',
          values: { 'X-Custom-Header': 'CustomValue' },
        },
      ]);

      expect(headers).toContain('/_ranu/assets/*');
      expect(headers).toContain('Cache-Control: public, max-age=31536000, immutable');
      expect(headers).toContain('/custom/*');
      expect(headers).toContain('X-Custom-Header: CustomValue');
    });

    it('generates valid _redirects with static passthrough and function fallback', () => {
      const redirects = generateRedirects('my-func', [
        { from: '/old-path', to: '/new-path', status: 301, force: true },
      ]);

      expect(redirects).toContain('/_ranu/assets/*  /_ranu/assets/:splat  200!');
      expect(redirects).toContain('/old-path  /new-path  301!');
      expect(redirects).toContain('/*  /.netlify/functions/my-func  200');
    });

    it('generates valid netlify.toml with build, headers, and redirects', () => {
      const toml = generateNetlifyToml('.netlify/publish', '.netlify/functions-internal', 'server');

      expect(toml).toContain('[build]');
      expect(toml).toContain('publish = ".netlify/publish"');
      expect(toml).toContain('functions = ".netlify/functions-internal"');
      expect(toml).toContain('[[headers]]');
      expect(toml).toContain('for = "/_ranu/assets/*"');
      expect(toml).toContain('[[redirects]]');
      expect(toml).toContain('to = "/.netlify/functions/server"');
    });
  });

  describe('Artifact Generation', () => {
    it('generates complete Netlify deployment artifact structure', async () => {
      const outputDir = path.join(tempDir, '.netlify');
      const adapter = createNetlifyAdapter({ outputDir });

      const result = await adapter.adapt({
        projectRoot: tempDir,
        buildDir,
      });

      expect(result.success).toBe(true);
      expect(result.target).toBe('netlify');
      expect(result.outputDirectory).toBe(outputDir);

      // Verify netlify.toml
      const tomlPath = path.join(outputDir, 'netlify.toml');
      expect(fs.existsSync(tomlPath)).toBe(true);
      const toml = fs.readFileSync(tomlPath, 'utf8');
      expect(toml).toContain('[build]');
      expect(toml).toContain('publish =');
      expect(toml).toContain('functions =');

      // Verify _headers and _redirects
      const publishDir = path.join(outputDir, 'publish');
      expect(fs.existsSync(path.join(publishDir, '_headers'))).toBe(true);
      expect(fs.existsSync(path.join(publishDir, '_redirects'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, '_headers'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, '_redirects'))).toBe(true);

      // Verify Netlify Functions v2 handler and alias
      const functionsDir = path.join(outputDir, 'functions-internal');
      expect(fs.existsSync(path.join(functionsDir, 'server.mjs'))).toBe(true);
      expect(fs.existsSync(path.join(functionsDir, 'ranu-ssr.mjs'))).toBe(true);

      const serverSource = fs.readFileSync(path.join(functionsDir, 'server.mjs'), 'utf8');
      expect(serverSource).toContain('handler');
      expect(serverSource).toContain('preferStatic: true');

      // Verify static assets & pages copied to publishDir
      expect(fs.existsSync(path.join(publishDir, 'about.html'))).toBe(true);
      expect(fs.existsSync(path.join(publishDir, '_ranu', 'assets', 'app.123.js'))).toBe(true);
      expect(fs.existsSync(path.join(publishDir, 'favicon.ico'))).toBe(true);

      // Verify deployment descriptor
      const deployPath = path.join(tempDir, '.ranu', 'deploy', 'netlify', 'deployment.json');
      expect(fs.existsSync(deployPath)).toBe(true);
      const deployMarker = JSON.parse(fs.readFileSync(deployPath, 'utf8'));
      expect(deployMarker.schemaVersion).toBe(1);
      expect(deployMarker.adapter).toBe('netlify');
      expect(deployMarker.buildId).toBe('netlify-build-789');
      expect(deployMarker.entrypoint).toBe('server.mjs');
      expect(deployMarker.routesCount).toBe(7);
      expect(deployMarker.serverRoutesCount).toBe(6);
      expect(deployMarker.staticRoutesCount).toBe(1);
    });

    it('cleans output directory by default and retains sentinel when clean is false', async () => {
      const outputDir = path.join(tempDir, '.netlify');
      fs.mkdirSync(outputDir, { recursive: true });
      const sentinel = path.join(outputDir, 'sentinel.txt');
      fs.writeFileSync(sentinel, 'preserve me', 'utf8');

      await createNetlifyAdapter({ outputDir, clean: false }).adapt({
        projectRoot: tempDir,
        buildDir,
      });
      expect(fs.existsSync(sentinel)).toBe(true);

      await createNetlifyAdapter({ outputDir, clean: true }).adapt({
        projectRoot: tempDir,
        buildDir,
      });
      expect(fs.existsSync(sentinel)).toBe(false);
    });
  });

  describe('HTTP Request Dispatch Bridge Integration', () => {
    let bridgeDir: string;
    let bridgeBuildDir: string;
    let handlerModule: any;
    let aliasModule: any;

    beforeAll(async () => {
      bridgeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-netlify-bridge-'));
      bridgeBuildDir = path.join(bridgeDir, '.ranu', 'build');
      setupTestFixture(bridgeDir, bridgeBuildDir);

      const adapter = createNetlifyAdapter();
      await adapter.adapt({ projectRoot: bridgeDir, buildDir: bridgeBuildDir });

      const handlerPath = path.join(bridgeDir, '.netlify', 'functions-internal', 'server.mjs');
      const aliasPath = path.join(bridgeDir, '.netlify', 'functions-internal', 'ranu-ssr.mjs');

      handlerModule = await import(pathToFileURL(handlerPath).href);
      aliasModule = await import(pathToFileURL(aliasPath).href);
    }, 60_000);

    afterAll(() => {
      fs.rmSync(bridgeDir, { recursive: true, force: true });
    });

    it('exports default handler and config object', () => {
      expect(typeof handlerModule.default).toBe('function');
      expect(typeof handlerModule.handler).toBe('function');
      expect(handlerModule.config).toEqual({
        path: '/*',
        preferStatic: true,
      });
    });

    it('dispatches API route requests (GET and POST)', async () => {
      const handler = handlerModule.default;

      // GET /api/data
      const getReq = new Request('https://example.com/api/data', { method: 'GET' });
      const getRes = await handler(getReq);
      expect(getRes.status).toBe(200);
      expect(await getRes.json()).toEqual({ ok: true, runtime: 'netlify' });

      // POST /api/data
      const postReq = new Request('https://example.com/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'from netlify test' }),
      });
      const postRes = await handler(postReq);
      expect(postRes.status).toBe(200);
      expect(await postRes.json()).toEqual({ received: { message: 'from netlify test' } });
    });

    it('handles OPTIONS and HEAD requests on API routes', async () => {
      const handler = handlerModule.default;

      // OPTIONS /api/data
      const optReq = new Request('https://example.com/api/data', { method: 'OPTIONS' });
      const optRes = await handler(optReq);
      expect(optRes.status).toBe(204);
      expect(optRes.headers.get('Allow')).toContain('GET');
      expect(optRes.headers.get('Allow')).toContain('POST');

      // HEAD /api/data
      const headReq = new Request('https://example.com/api/data', { method: 'HEAD' });
      const headRes = await handler(headReq);
      expect(headRes.status).toBe(200);
      expect(headRes.body).toBeNull();
    });

    it('renders React SSR pages streaming response', async () => {
      const handler = handlerModule.default;

      const pageReq = new Request('https://example.com/', { method: 'GET' });
      const pageRes = await handler(pageReq);
      expect(pageRes.status).toBe(200);
      expect(pageRes.headers.get('Content-Type')).toContain('text/html');
      const html = await pageRes.text();
      expect(html).toContain('Hello from Netlify Functions v2 SSR!');
    });

    it('serves pre-rendered static HTML page fallback', async () => {
      const handler = handlerModule.default;

      const aboutReq = new Request('https://example.com/about', { method: 'GET' });
      const aboutRes = await handler(aboutReq);
      expect(aboutRes.status).toBe(200);
      expect(aboutRes.headers.get('Content-Type')).toContain('text/html');
      const html = await aboutRes.text();
      expect(html).toContain('About Netlify App');
    });

    it('preserves multiple distinct Set-Cookie headers (RFC 6265)', async () => {
      const handler = handlerModule.default;

      const cookieReq = new Request('https://example.com/api/cookies', { method: 'GET' });
      const cookieRes = await handler(cookieReq);
      expect(cookieRes.status).toBe(200);

      const cookies = cookieRes.headers.getSetCookie();
      expect(cookies).toHaveLength(2);
      expect(cookies.some((c: string) => c.includes('sessionId=secret123'))).toBe(true);
      expect(cookies.some((c: string) => c.includes('theme=dark'))).toBe(true);
    });

    it('defends against CRLF header injection attacks', async () => {
      const handler = handlerModule.default;

      const crlfReq = new Request('https://example.com/api/crlf', { method: 'GET' });
      const crlfRes = await handler(crlfReq);
      expect(crlfRes.status).toBe(500);
      const text = await crlfRes.text();
      expect(text).toContain('Internal Server Error');
    });

    it('injects Netlify Context (geo, ip, site) into request context', async () => {
      const handler = handlerModule.default;

      const netlifyContext = {
        geo: { country: 'LK', city: 'Colombo' },
        ip: '203.0.113.42',
        site: { id: 'site_netlify_123', name: 'my-app' },
      };

      const ctxReq = new Request('https://example.com/api/context', { method: 'GET' });
      const ctxRes = await handler(ctxReq, netlifyContext);
      expect(ctxRes.status).toBe(200);
      const data = await ctxRes.json();
      expect(data).toEqual({
        ok: true,
        geoCountry: 'LK',
        clientIp: '203.0.113.42',
        siteId: 'site_netlify_123',
      });
    });

    it('catches uncaught route exception and returns 500 response', async () => {
      const handler = handlerModule.default;

      const boomReq = new Request('https://example.com/api/boom', { method: 'GET' });
      const boomRes = await handler(boomReq);
      expect(boomRes.status).toBe(500);
      const text = await boomRes.text();
      expect(text).toContain('Internal Server Error');
    });

    it('executes identically through ranu-ssr.mjs alias', async () => {
      const aliasHandler = aliasModule.default;
      const req = new Request('https://example.com/api/data', { method: 'GET' });
      const res = await aliasHandler(req);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, runtime: 'netlify' });
    });
  });
});
