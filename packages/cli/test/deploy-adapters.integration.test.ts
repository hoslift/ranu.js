import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadBunAdapter,
  loadDenoAdapter,
  loadVercelAdapter,
  loadCloudflareAdapter,
  loadNodeAdapter,
  loadNetlifyAdapter,
  runDeployCommand,
} from '../src/commands/deploy.js';
import { createCliLogger } from '../src/logger.js';

function createMinimalBuildFixture(dir: string, buildId = 'test-build-123'): void {
  const buildDir = path.join(dir, '.ranu', 'build');
  const manifestDir = path.join(buildDir, 'manifest');
  const serverDir = path.join(buildDir, 'server');
  const staticPagesDir = path.join(buildDir, 'static', 'pages');

  fs.mkdirSync(manifestDir, { recursive: true });
  fs.mkdirSync(serverDir, { recursive: true });
  fs.mkdirSync(staticPagesDir, { recursive: true });

  fs.writeFileSync(path.join(buildDir, 'BUILD_ID'), `${buildId}\n`, 'utf8');

  fs.writeFileSync(
    path.join(buildDir, 'build.json'),
    JSON.stringify({
      schemaVersion: 1,
      buildId,
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

  fs.writeFileSync(
    path.join(manifestDir, 'routes.json'),
    JSON.stringify({
      schemaVersion: 2,
      buildId,
      routes: [{ id: 'page:/', kind: 'page', pattern: '/', params: [], renderMode: 'server' }],
    }),
    'utf8',
  );

  fs.writeFileSync(
    path.join(manifestDir, 'server.json'),
    JSON.stringify({
      schemaVersion: 1,
      buildId,
      routes: [{ routeId: 'page:/', serverEntry: 'server/page-home.mjs' }],
    }),
    'utf8',
  );

  fs.writeFileSync(
    path.join(manifestDir, 'client.json'),
    JSON.stringify({ schemaVersion: 1, buildId, assets: {} }),
    'utf8',
  );

  fs.writeFileSync(
    path.join(manifestDir, 'static.json'),
    JSON.stringify({ schemaVersion: 1, buildId, routes: [] }),
    'utf8',
  );

  fs.writeFileSync(
    path.join(serverDir, 'page-home.mjs'),
    'export default function Page() { return null; }\n',
    'utf8',
  );
}

describe('@ranu/cli unmocked adapter deployment integration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-cli-unmocked-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Unmocked Dynamic Module Resolution', () => {
    it('resolves real @ranujs/adapter-bun without mocks and verifies contract', async () => {
      const bunMod = await loadBunAdapter();
      expect(bunMod).toBeDefined();
      expect(typeof bunMod.createBunAdapter).toBe('function');
      expect(typeof bunMod.default).toBe('function');
      expect(bunMod.bunAdapter).toBe(bunMod.createBunAdapter);
      expect(bunMod.adapterName).toBe('bun');
      expect(bunMod.ADAPTER_API_VERSION).toBe(1);
      expect(bunMod.BUN_CAPABILITIES).toEqual(
        expect.objectContaining({
          runtime: 'bun',
          ssr: true,
          apiRoutes: true,
          streaming: true,
          staticFiles: true,
          longLivedProcess: true,
        }),
      );

      const adapter = bunMod.createBunAdapter();
      expect(adapter.name).toBe('bun');
      expect(typeof adapter.adapt).toBe('function');
    });

    it('resolves real @ranujs/adapter-deno without mocks and verifies contract', async () => {
      const denoMod = await loadDenoAdapter();
      expect(denoMod).toBeDefined();
      expect(typeof denoMod.createDenoAdapter).toBe('function');
      expect(typeof denoMod.default).toBe('function');
      expect(denoMod.denoAdapter).toBe(denoMod.createDenoAdapter);
      expect(denoMod.adapterName).toBe('deno');
      expect(denoMod.ADAPTER_API_VERSION).toBe(1);
      expect(denoMod.DENO_CAPABILITIES).toEqual(
        expect.objectContaining({
          runtime: 'deno',
          ssr: true,
          apiRoutes: true,
          streaming: true,
          staticFiles: true,
          longLivedProcess: true,
        }),
      );

      const adapter = denoMod.createDenoAdapter();
      expect(adapter.name).toBe('deno');
      expect(typeof adapter.adapt).toBe('function');
    });

    it('resolves real @ranujs/adapter-vercel without mocks', async () => {
      const vercelMod = await loadVercelAdapter();
      expect(vercelMod).toBeDefined();
      const factory = (vercelMod as any).createVercelAdapter ?? (vercelMod as any).default;
      expect(typeof factory).toBe('function');
    });

    it('resolves real @ranujs/adapter-cloudflare without mocks and verifies contract', async () => {
      const cfMod = (await loadCloudflareAdapter()) as any;
      expect(cfMod).toBeDefined();
      expect(typeof cfMod.createCloudflareAdapter).toBe('function');
      expect(typeof cfMod.default).toBe('function');
      expect(cfMod.cloudflareAdapter).toBe(cfMod.createCloudflareAdapter);
      expect(cfMod.adapterName).toBe('cloudflare');
      expect(cfMod.ADAPTER_API_VERSION).toBe(1);
      expect(cfMod.CLOUDFLARE_CAPABILITIES).toEqual(
        expect.objectContaining({
          runtime: 'workerd',
          ssr: true,
          apiRoutes: true,
          streaming: true,
          staticFiles: true,
        }),
      );
    });

    it('resolves real @ranujs/adapter-node without mocks and verifies contract', async () => {
      const nodeMod = (await loadNodeAdapter()) as any;
      expect(nodeMod).toBeDefined();
      expect(typeof nodeMod.createNodeAdapter).toBe('function');
      expect(typeof nodeMod.default).toBe('function');
      expect(nodeMod.nodeAdapter).toBe(nodeMod.createNodeAdapter);
      expect(nodeMod.adapterName).toBe('node');
      expect(nodeMod.ADAPTER_API_VERSION).toBe(1);
      expect(nodeMod.NODE_CAPABILITIES).toEqual(
        expect.objectContaining({
          runtime: 'node',
          ssr: true,
          apiRoutes: true,
          streaming: true,
          staticFiles: true,
          longLivedProcess: true,
        }),
      );
    });

    it('resolves real @ranujs/adapter-netlify without mocks and verifies contract', async () => {
      const netlifyMod = (await loadNetlifyAdapter()) as any;
      expect(netlifyMod).toBeDefined();
      expect(typeof netlifyMod.createNetlifyAdapter).toBe('function');
      expect(typeof netlifyMod.default).toBe('function');
      expect(netlifyMod.netlifyAdapter).toBe(netlifyMod.createNetlifyAdapter);
      expect(netlifyMod.adapterName).toBe('netlify');
      expect(netlifyMod.ADAPTER_API_VERSION).toBe(1);
      expect(netlifyMod.NETLIFY_CAPABILITIES).toEqual(
        expect.objectContaining({
          runtime: 'edge',
          ssr: true,
          apiRoutes: true,
          streaming: true,
          staticFiles: true,
        }),
      );
    });
  });

  describe('Unmocked runDeployCommand with Real Adapters on Unbuilt Directory', () => {
    it('loads real Bun adapter and reaches adapter.adapt() failing on missing build', async () => {
      const logger = createCliLogger({ quiet: true });
      const errorSpy = vi.spyOn(logger, 'error');
      const jsonSpy = vi.spyOn(logger, 'json');

      const code = await runDeployCommand({ args: [], root: tempDir, adapter: 'bun' }, logger);
      expect(code).toBe(1);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Deployment adaptation failed: No production build found'),
      );
      expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('Failed to load adapter'));

      const jsonCode = await runDeployCommand(
        { args: [], root: tempDir, adapter: 'bun', json: true },
        logger,
      );
      expect(jsonCode).toBe(1);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('No production build found'),
          adapter: 'bun',
        }),
      );
    });

    it('loads real Deno adapter and reaches adapter.adapt() failing on missing build', async () => {
      const logger = createCliLogger({ quiet: true });
      const errorSpy = vi.spyOn(logger, 'error');
      const jsonSpy = vi.spyOn(logger, 'json');

      const code = await runDeployCommand({ args: [], root: tempDir, adapter: 'deno' }, logger);
      expect(code).toBe(1);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Deployment adaptation failed: No production build found'),
      );
      expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('Failed to load adapter'));

      const jsonCode = await runDeployCommand(
        { args: [], root: tempDir, adapter: 'deno', json: true },
        logger,
      );
      expect(jsonCode).toBe(1);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('No production build found'),
          adapter: 'deno',
        }),
      );
    });
  });

  describe('Unmocked runDeployCommand with Real Adapters on Valid Production Build', () => {
    it('deploys successfully using real Bun adapter', async () => {
      createMinimalBuildFixture(tempDir, 'bun-fixture-build');
      const logger = createCliLogger({ quiet: true });
      const logSpy = vi.spyOn(logger, 'log');

      const code = await runDeployCommand({ args: [], root: tempDir, adapter: 'bun' }, logger);
      expect(code).toBe(0);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Output:'));

      // Assert physical emission of Bun adapter artifacts
      const distDir = path.join(tempDir, 'dist');
      expect(fs.existsSync(path.join(distDir, 'server.mjs'))).toBe(true);
      expect(fs.existsSync(path.join(distDir, 'Dockerfile'))).toBe(true);
      expect(fs.existsSync(path.join(distDir, 'package.json'))).toBe(true);

      const deployJsonPath = path.join(tempDir, '.ranu', 'deploy', 'bun', 'deployment.json');
      expect(fs.existsSync(deployJsonPath)).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(deployJsonPath, 'utf8'));
      expect(manifest.adapter).toBe('bun');
      expect(manifest.buildId).toBe('bun-fixture-build');
    });

    it('deploys successfully using real Deno adapter with full package name', async () => {
      createMinimalBuildFixture(tempDir, 'deno-fixture-build');
      const logger = createCliLogger({ quiet: true });
      const jsonSpy = vi.spyOn(logger, 'json');

      const code = await runDeployCommand(
        { args: [], root: tempDir, adapter: '@ranujs/adapter-deno', json: true },
        logger,
      );
      expect(code).toBe(0);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          adapter: 'deno',
          outputDirectory: path.join(tempDir, 'dist'),
        }),
      );

      // Assert physical emission of Deno adapter artifacts
      const distDir = path.join(tempDir, 'dist');
      expect(fs.existsSync(path.join(distDir, 'server.mjs'))).toBe(true);
      expect(fs.existsSync(path.join(distDir, 'deno.json'))).toBe(true);

      const deployJsonPath = path.join(tempDir, '.ranu', 'deploy', 'deno', 'deployment.json');
      expect(fs.existsSync(deployJsonPath)).toBe(true);
    });
  });
});
