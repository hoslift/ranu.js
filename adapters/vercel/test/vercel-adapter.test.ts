import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import {
  createVercelAdapter,
  adapterName,
  ADAPTER_API_VERSION,
  VERCEL_CAPABILITIES,
  isPathContained,
  copyDirectorySafe,
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
            pathname: '/',
            routeId: 'page:/',
            file: 'static/pages/index.html',
            status: 200,
          },
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
    fs.writeFileSync(
      path.join(serverDir, 'api-data.mjs'),
      'export const GET = () => Response.json({ ok: true });',
    );
    fs.writeFileSync(path.join(staticPagesDir, 'terms.html'), '<html><body>Terms</body></html>');
    fs.writeFileSync(path.join(staticPagesDir, 'index.html'), '<html><body>Home</body></html>');
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

    it('copies nested files and skips every forbidden-name form', () => {
      const source = path.join(tempDir, 'copy-source');
      const destination = path.join(tempDir, 'copy-destination');
      fs.mkdirSync(path.join(source, 'nested'), { recursive: true });
      fs.writeFileSync(path.join(source, 'nested', 'ok.txt'), 'ok');
      for (const name of ['.env', '.env.local', 'app.map', 'server', 'server-entry.js']) {
        fs.writeFileSync(path.join(source, name), 'forbidden');
      }

      expect(copyDirectorySafe(path.join(tempDir, 'absent'), destination, tempDir)).toEqual([]);
      const copied = copyDirectorySafe(source, destination, tempDir, ['.env', '.map', 'server']);
      expect(copied).toEqual([path.join(destination, 'nested', 'ok.txt')]);
      expect(fs.readFileSync(copied[0], 'utf8')).toBe('ok');
    });

    it('rejects destinations outside the root and destination symlinks', () => {
      const source = path.join(tempDir, 'copy-source');
      fs.mkdirSync(source);
      fs.writeFileSync(path.join(source, 'file.txt'), 'data');
      expect(() => copyDirectorySafe(source, path.join(tempDir, '..', 'escape'), tempDir)).toThrow(
        /Path traversal|symbolic link/,
      );

      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-copy-outside-'));
      const linkedDestination = path.join(tempDir, 'linked-destination');
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

  describe('adapt() execution', () => {
    it('fails when build descriptor is missing', async () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-empty-'));
      const adapter = createVercelAdapter();
      await expect(adapter.adapt({ projectRoot: emptyDir })).rejects.toThrow(
        /No production build found/,
      );
      fs.rmSync(emptyDir, { recursive: true, force: true });
    });

    it('rejects a non-Node build runtime', async () => {
      const descriptorPath = path.join(buildDir, 'build.json');
      const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8'));
      descriptor.runtime = 'edge';
      fs.writeFileSync(descriptorPath, JSON.stringify(descriptor));
      await expect(createVercelAdapter().adapt({ projectRoot: tempDir, buildDir })).rejects.toThrow(
        /requires build runtime target "node"/,
      );
    });

    it('uses fallback manifests, preserves output, omits optional settings, and tolerates malformed package metadata', async () => {
      fs.rmSync(path.join(buildDir, 'manifest', 'static.json'));
      fs.rmSync(path.join(buildDir, 'BUILD_ID'));
      fs.writeFileSync(path.join(tempDir, 'package.json'), '{malformed');
      const outputDir = path.join(tempDir, '.vercel', 'output');
      fs.mkdirSync(outputDir, { recursive: true });
      fs.writeFileSync(path.join(outputDir, 'retained.txt'), 'retained');

      await createVercelAdapter({ clean: false, maxDuration: 15 }).adapt({
        projectRoot: tempDir,
        buildDir,
      });

      expect(fs.readFileSync(path.join(outputDir, 'retained.txt'), 'utf8')).toBe('retained');
      const functionDir = path.join(outputDir, 'functions', 'index.func');
      const vcConfig = JSON.parse(
        fs.readFileSync(path.join(functionDir, '.vc-config.json'), 'utf8'),
      );
      expect(vcConfig).toMatchObject({ maxDuration: 15 });
      expect(vcConfig).not.toHaveProperty('regions');
      expect(vcConfig).not.toHaveProperty('memory');
      expect(fs.existsSync(path.join(functionDir, 'BUILD_ID'))).toBe(false);
      expect(
        JSON.parse(fs.readFileSync(path.join(functionDir, 'package.json'), 'utf8')).dependencies,
      ).toEqual({});
      expect(
        JSON.parse(fs.readFileSync(path.join(outputDir, 'config.json'), 'utf8')),
      ).not.toHaveProperty('overrides');
    }, 15_000);

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
      expect(config.overrides['index.html']).toEqual({
        contentType: 'text/html; charset=utf-8',
        path: '',
      });
      expect(config.overrides['terms.html']).toEqual({
        contentType: 'text/html; charset=utf-8',
        path: 'terms',
      });

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
      expect(entryCode).not.toMatch(/from ["']@ranu\//);
      await expect(import(pathToFileURL(funcEntryPath).href)).resolves.toBeDefined();

      // 4. deployment.json completion marker
      const deployMarkerPath = path.join(tempDir, '.ranu', 'deploy', 'vercel', 'deployment.json');
      expect(fs.existsSync(deployMarkerPath)).toBe(true);
      const deployMarker = JSON.parse(fs.readFileSync(deployMarkerPath, 'utf8'));
      expect(deployMarker.adapter).toBe('vercel');
      expect(deployMarker.buildId).toBe('vercel-build-456');
    }, 15_000);

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

    it('does not copy through a retained symlinked static output directory', async () => {
      const outputDir = path.join(tempDir, '.vercel', 'output');
      const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-vercel-outside-'));
      fs.mkdirSync(outputDir, { recursive: true });

      try {
        fs.symlinkSync(outsideDir, path.join(outputDir, 'static'), 'dir');
      } catch (error: unknown) {
        fs.rmSync(outsideDir, { recursive: true, force: true });
        if (
          error instanceof Error &&
          'code' in error &&
          (error.code === 'EPERM' || error.code === 'EACCES')
        ) {
          return;
        }
        throw error;
      }

      try {
        const adapter = createVercelAdapter({ outputDir, clean: false });
        await expect(adapter.adapt({ projectRoot: tempDir, buildDir })).rejects.toThrow(
          /symbolic link/,
        );
        expect(fs.readdirSync(outsideDir)).toEqual([]);
      } finally {
        fs.rmSync(outsideDir, { recursive: true, force: true });
      }
    });
  });
});
