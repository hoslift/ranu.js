import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createVercelAdapter,
  adapterName,
  ADAPTER_API_VERSION,
  VERCEL_CAPABILITIES,
  isPathContained,
} from '../src/index.js';

describe('@ranu/adapter-vercel', () => {
  let tempDir: string;
  let buildDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-vercel-test-'));
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
    fs.writeFileSync(path.join(buildDir, 'BUILD_ID'), 'vercel-build-456\n');

    // build.json
    fs.writeFileSync(
      path.join(buildDir, 'build.json'),
      JSON.stringify({
        schemaVersion: 1,
        buildId: 'vercel-build-456',
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
        buildId: 'vercel-build-456',
        routes: [
          { id: 'page:/', kind: 'page', pattern: '/', params: [], renderMode: 'server' },
          { id: 'page:/terms', kind: 'page', pattern: '/terms', params: [], renderMode: 'static' },
          { id: 'api:/api/data', kind: 'api', pattern: '/api/data', params: [], methods: ['GET'] },
        ],
      }),
    );

    // server.json
    fs.writeFileSync(
      path.join(manifestDir, 'server.json'),
      JSON.stringify({
        schemaVersion: 1,
        buildId: 'vercel-build-456',
        routes: [
          { routeId: 'page:/', serverEntry: 'server/page-home.mjs' },
          { routeId: 'api:/api/data', serverEntry: 'server/api-data.mjs' },
        ],
      }),
    );

    // static.json
    fs.writeFileSync(
      path.join(manifestDir, 'static.json'),
      JSON.stringify({
        schemaVersion: 1,
        buildId: 'vercel-build-456',
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

    // files
    fs.writeFileSync(path.join(serverDir, 'page-home.mjs'), 'export default () => "Home";');
    fs.writeFileSync(path.join(serverDir, 'api-data.mjs'), 'export const GET = () => Response.json({ ok: true });');
    fs.writeFileSync(path.join(staticPagesDir, 'terms.html'), '<html><body>Terms</body></html>');
    fs.writeFileSync(path.join(staticAssetsDir, 'style.123.css'), 'body { margin: 0; }');
    fs.writeFileSync(path.join(publicDir, 'favicon.ico'), 'icon-binary');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Contract and Metadata', () => {
    it('declares adapter name, API version and capabilities', () => {
      const adapter = createVercelAdapter();
      expect(adapter.name).toBe('vercel');
      expect(adapter.apiVersion).toBe(1);
      expect(adapter.capabilities.runtime).toBe('node');
      expect(adapter.capabilities.ssr).toBe(true);
      expect(adapter.capabilities.apiRoutes).toBe(true);
      expect(adapter.capabilities.middleware).toBe(true);
      expect(adapter.capabilities.streaming).toBe(true);
      expect(adapter.capabilities.writableFilesystem).toBe('temporary');
    });

    it('checks path containment correctly', () => {
      expect(isPathContained('/root/a/b', '/root')).toBe(true);
      expect(isPathContained('/outside/a', '/root')).toBe(false);
    });
  });

  describe('adapt() execution', () => {
    it('fails when build descriptor is missing', async () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-empty-'));
      const adapter = createVercelAdapter();
      await expect(adapter.adapt({ projectRoot: emptyDir })).rejects.toThrow(
        /No production build found/,
      );
      fs.rmSync(emptyDir, { recursive: true, force: true });
    });

    it('generates Vercel Build Output API v3 structure', async () => {
      const adapter = createVercelAdapter({
        runtimeVersion: 'nodejs22.x',
        regions: ['iad1'],
        memory: 1024,
      });

      const result = await adapter.adapt({
        projectRoot: tempDir,
        buildDir,
      });

      expect(result.success).toBe(true);
      expect(result.target).toBe('vercel');

      const vercelOut = path.join(tempDir, '.vercel', 'output');
      expect(fs.existsSync(vercelOut)).toBe(true);

      // 1. config.json
      const configPath = path.join(vercelOut, 'config.json');
      expect(fs.existsSync(configPath)).toBe(true);
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      expect(config.version).toBe(3);
      expect(config.routes).toBeDefined();
      expect(config.routes[0].src).toBe('^/_ranu/assets/(.*)$');
      expect(config.routes[0].headers['cache-control']).toContain('immutable');

      // 2. static files
      const staticDir = path.join(vercelOut, 'static');
      expect(fs.existsSync(path.join(staticDir, 'terms.html'))).toBe(true);
      expect(fs.existsSync(path.join(staticDir, 'favicon.ico'))).toBe(true);
      expect(fs.existsSync(path.join(staticDir, '_ranu', 'assets', 'style.123.css'))).toBe(true);

      // 3. serverless function
      const funcDir = path.join(vercelOut, 'functions', 'index.func');
      expect(fs.existsSync(funcDir)).toBe(true);

      const vcConfigPath = path.join(funcDir, '.vc-config.json');
      expect(fs.existsSync(vcConfigPath)).toBe(true);
      const vcConfig = JSON.parse(fs.readFileSync(vcConfigPath, 'utf8'));
      expect(vcConfig.runtime).toBe('nodejs22.x');
      expect(vcConfig.handler).toBe('index.mjs');
      expect(vcConfig.launcherType).toBe('Nodejs');
      expect(vcConfig.regions).toEqual(['iad1']);
      expect(vcConfig.memory).toBe(1024);

      const funcEntryPath = path.join(funcDir, 'index.mjs');
      expect(fs.existsSync(funcEntryPath)).toBe(true);
      const entryCode = fs.readFileSync(funcEntryPath, 'utf8');
      expect(entryCode).toContain('createProductionRequestHandler');
      expect(entryCode).toContain('createProductionRuntime');

      // 4. deployment.json completion marker
      const deployMarkerPath = path.join(tempDir, '.ranu', 'deploy', 'vercel', 'deployment.json');
      expect(fs.existsSync(deployMarkerPath)).toBe(true);
      const deployMarker = JSON.parse(fs.readFileSync(deployMarkerPath, 'utf8'));
      expect(deployMarker.adapter).toBe('vercel');
      expect(deployMarker.buildId).toBe('vercel-build-456');
    });

    it('protects against secret leakage and source map exposure in static assets', async () => {
      // Create sensitive files in the public directory
      fs.writeFileSync(path.join(tempDir, 'public', '.env.local'), 'SECRET_KEY=12345');
      fs.writeFileSync(path.join(tempDir, 'public', 'server.map'), 'sourcemap-data');
      fs.writeFileSync(path.join(tempDir, 'public', 'app.js.map'), 'sourcemap-data-js');

      const adapter = createVercelAdapter();
      await adapter.adapt({ projectRoot: tempDir, buildDir });

      const staticDir = path.join(tempDir, '.vercel', 'output', 'static');
      expect(fs.existsSync(path.join(staticDir, '.env.local'))).toBe(false);
      expect(fs.existsSync(path.join(staticDir, 'server.map'))).toBe(false);
      expect(fs.existsSync(path.join(staticDir, 'app.js.map'))).toBe(false);
    });

    it('rejects outputDir if it is identical to or contains projectRoot or buildDir', async () => {
      const adapter1 = createVercelAdapter({ outputDir: tempDir });
      await expect(adapter1.adapt({ projectRoot: tempDir, buildDir })).rejects.toThrow(
        /output directory cannot be equal to project root/,
      );

      const adapter2 = createVercelAdapter({ outputDir: buildDir });
      await expect(adapter2.adapt({ projectRoot: tempDir, buildDir })).rejects.toThrow(
        /output directory cannot be equal to project root or build directory/,
      );
    });
  });
});
