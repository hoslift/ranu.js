import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ADAPTER_API_VERSION } from '@ranujs/core';
import { createTemporaryFixture } from '../helpers/fixture.js';
import { runCommand, cleanupAllProcesses } from '../helpers/process.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');
const cliBin = path.join(root, 'packages/cli/dist/bin/ranu.js');
const cliEnv = { ...process.env, NODE_ENV: 'production' };

describe('Multi-Adapter Cloud Deployment Conformance', () => {
  let projectDir: string;
  let cleanupFixture: () => Promise<void>;

  beforeAll(async () => {
    const fixture = await createTemporaryFixture('build-basic', root);
    projectDir = fixture.projectDir;
    cleanupFixture = fixture.cleanup;

    // Run production build once for all adapter conformance verifications
    const buildRes = await runCommand(process.execPath, [cliBin, 'build'], {
      cwd: projectDir,
      env: cliEnv,
    });
    expect(buildRes.code).toBe(0);

    // Verify build output directory
    const buildDir = path.join(projectDir, '.ranu/build');
    expect(fs.existsSync(path.join(buildDir, 'build.json'))).toBe(true);
    expect(fs.existsSync(path.join(buildDir, 'BUILD_ID'))).toBe(true);
  }, 120000);

  afterAll(async () => {
    await cleanupAllProcesses();
    if (cleanupFixture) {
      await cleanupFixture();
    }
  });

  describe('Protocol Adherence across all 5 deployment targets', () => {
    it('verifies canonical ADAPTER_API_VERSION is exported as 1 from @ranujs/core', () => {
      expect(ADAPTER_API_VERSION).toBe(1);
    });

    it('verifies all 5 adapters export and implement ADAPTER_API_VERSION === 1', async () => {
      const [
        { createNodeAdapter, ADAPTER_API_VERSION: nodeVersion },
        { createVercelAdapter, ADAPTER_API_VERSION: vercelVersion },
        { createCloudflareAdapter, ADAPTER_API_VERSION: cfVersion },
        { createNetlifyAdapter, ADAPTER_API_VERSION: netlifyVersion },
        { createStaticAdapter, ADAPTER_API_VERSION: staticVersion },
      ] = await Promise.all([
        import('@ranujs/adapter-node'),
        import('@ranujs/adapter-vercel'),
        import('@ranujs/adapter-cloudflare'),
        import('@ranujs/adapter-netlify'),
        import('@ranujs/adapter-static'),
      ]);

      expect(nodeVersion).toBe(ADAPTER_API_VERSION);
      expect(vercelVersion).toBe(ADAPTER_API_VERSION);
      expect(cfVersion).toBe(ADAPTER_API_VERSION);
      expect(netlifyVersion).toBe(ADAPTER_API_VERSION);
      expect(staticVersion).toBe(ADAPTER_API_VERSION);

      const nodeAdapter = createNodeAdapter();
      const vercelAdapter = createVercelAdapter();
      const cfAdapter = createCloudflareAdapter();
      const netlifyAdapter = createNetlifyAdapter();
      const staticAdapter = createStaticAdapter();

      expect(nodeAdapter.apiVersion).toBe(1);
      expect(vercelAdapter.apiVersion).toBe(1);
      expect(cfAdapter.apiVersion).toBe(1);
      expect(netlifyAdapter.apiVersion).toBe(1);
      expect(staticAdapter.apiVersion).toBe(1);

      expect(nodeAdapter.name).toBe('node');
      expect(vercelAdapter.name).toBe('vercel');
      expect(cfAdapter.name).toBe('cloudflare');
      expect(netlifyAdapter.name).toBe('netlify');
      expect(staticAdapter.name).toBe('static');

      expect(typeof nodeAdapter.adapt).toBe('function');
      expect(typeof vercelAdapter.adapt).toBe('function');
      expect(typeof cfAdapter.adapt).toBe('function');
      expect(typeof netlifyAdapter.adapt).toBe('function');
      expect(typeof staticAdapter.adapt).toBe('function');

      expect(nodeAdapter.capabilities).toBeDefined();
      expect(vercelAdapter.capabilities).toBeDefined();
      expect(cfAdapter.capabilities).toBeDefined();
      expect(netlifyAdapter.capabilities).toBeDefined();
      expect(staticAdapter.capabilities).toBeDefined();
    });
  });

  describe('Target 1: Node.js Standalone Adapter (@ranujs/adapter-node)', () => {
    it('produces standalone server entrypoint, manifests, and container artifacts', async () => {
      const { createNodeAdapter } = await import('@ranujs/adapter-node');
      const adapter = createNodeAdapter();

      const outputDir = path.join(projectDir, '.ranu/deploy/node-conformance');
      const result = await adapter.adapt({
        projectRoot: projectDir,
        buildDir: path.join(projectDir, '.ranu/build'),
        outputDir,
      });

      expect(result.success).toBe(true);
      expect(result.target).toBe('node');

      // Verify server entrypoint and runtime package manifest
      const serverEntry = path.join(outputDir, 'server.mjs');
      expect(fs.existsSync(serverEntry)).toBe(true);
      const serverContent = fs.readFileSync(serverEntry, 'utf8');
      expect(serverContent).toContain('createProductionServer');

      const pkgJsonPath = path.join(outputDir, 'package.json');
      expect(fs.existsSync(pkgJsonPath)).toBe(true);
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      expect(pkgJson.type).toBe('module');
      expect(pkgJson.main).toBe('server.mjs');

      // Verify production container artifacts
      const dockerfilePath = path.join(outputDir, 'Dockerfile');
      expect(fs.existsSync(dockerfilePath)).toBe(true);
      const dockerfile = fs.readFileSync(dockerfilePath, 'utf8');
      expect(dockerfile).toContain('FROM node:22-alpine');

      const dockerignorePath = path.join(outputDir, '.dockerignore');
      expect(fs.existsSync(dockerignorePath)).toBe(true);
    });
  });

  describe('Target 2: Vercel Adapter (@ranujs/adapter-vercel)', () => {
    it('conforms to Vercel Build Output API v3 specification without cloud credentials', async () => {
      const { createVercelAdapter } = await import('@ranujs/adapter-vercel');
      const adapter = createVercelAdapter();

      const outputDir = path.join(projectDir, '.vercel/output');
      const result = await adapter.adapt({
        projectRoot: projectDir,
        buildDir: path.join(projectDir, '.ranu/build'),
        outputDir,
      });

      expect(result.success).toBe(true);
      expect(result.target).toBe('vercel');

      // Verify config.json version 3
      const configPath = path.join(outputDir, 'config.json');
      expect(fs.existsSync(configPath)).toBe(true);
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      expect(config.version).toBe(3);
      expect(Array.isArray(config.routes)).toBe(true);

      // Verify serverless function bundle (.vc-config.json and index.mjs)
      const funcDir = path.join(outputDir, 'functions/index.func');
      const vcConfigPath = path.join(funcDir, '.vc-config.json');
      expect(fs.existsSync(vcConfigPath)).toBe(true);
      const vcConfig = JSON.parse(fs.readFileSync(vcConfigPath, 'utf8'));
      expect(vcConfig.runtime).toMatch(/nodejs22/);
      expect(vcConfig.launcherType).toBe('Nodejs');
      expect(vcConfig.handler).toBe('index.mjs');

      const indexMjsPath = path.join(funcDir, 'index.mjs');
      expect(fs.existsSync(indexMjsPath)).toBe(true);
      const indexContent = fs.readFileSync(indexMjsPath, 'utf8');
      expect(indexContent).toContain('createProductionRuntime');

      // Verify static assets directory exists
      const staticDir = path.join(outputDir, 'static');
      expect(fs.existsSync(staticDir)).toBe(true);
    });
  });

  describe('Target 3: Cloudflare Adapter (@ranujs/adapter-cloudflare)', () => {
    it('conforms to Cloudflare Pages/Workers structure with bounded routes and workerd stubs', async () => {
      const { createCloudflareAdapter } = await import('@ranujs/adapter-cloudflare');
      const adapter = createCloudflareAdapter();

      const outputDir = path.join(projectDir, '.cloudflare');
      const result = await adapter.adapt({
        projectRoot: projectDir,
        buildDir: path.join(projectDir, '.ranu/build'),
        outputDir,
      });

      expect(result.success).toBe(true);
      expect(result.target).toBe('cloudflare');

      // Verify _worker.js bundle
      const workerPath = path.join(outputDir, '_worker.js');
      expect(fs.existsSync(workerPath)).toBe(true);
      const workerContent = fs.readFileSync(workerPath, 'utf8');
      expect(workerContent.length).toBeGreaterThan(100);

      // Verify _routes.json Pages routing rule limits
      const routesPath = path.join(outputDir, '_routes.json');
      expect(fs.existsSync(routesPath)).toBe(true);
      const routesConfig = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
      expect(routesConfig.version).toBe(1);
      expect(Array.isArray(routesConfig.include)).toBe(true);
      expect(Array.isArray(routesConfig.exclude)).toBe(true);
      // Cloudflare Pages strictly limits total rules to <= 100
      const totalRules = routesConfig.include.length + routesConfig.exclude.length;
      expect(totalRules).toBeLessThanOrEqual(100);

      // Verify _headers caching directives
      const headersPath = path.join(outputDir, '_headers');
      expect(fs.existsSync(headersPath)).toBe(true);
      const headersContent = fs.readFileSync(headersPath, 'utf8');
      expect(headersContent).toContain('Cache-Control');
    });
  });

  describe('Target 4: Netlify Adapter (@ranujs/adapter-netlify)', () => {
    it('produces Netlify Functions v2 handler, publish directory, and routing headers', async () => {
      const { createNetlifyAdapter } = await import('@ranujs/adapter-netlify');
      const adapter = createNetlifyAdapter();

      const outputDir = path.join(projectDir, '.netlify');
      const result = await adapter.adapt({
        projectRoot: projectDir,
        buildDir: path.join(projectDir, '.ranu/build'),
        outputDir,
      });

      expect(result.success).toBe(true);
      expect(result.target).toBe('netlify');

      // Verify publish directory and routing files
      const publishDir = path.join(outputDir, 'publish');
      expect(fs.existsSync(publishDir)).toBe(true);

      const headersPath = path.join(publishDir, '_headers');
      expect(fs.existsSync(headersPath)).toBe(true);

      const redirectsPath = path.join(publishDir, '_redirects');
      expect(fs.existsSync(redirectsPath)).toBe(true);
      const redirects = fs.readFileSync(redirectsPath, 'utf8');
      expect(redirects).toContain('/.netlify/functions/server');

      // Verify Functions v2 handler
      const serverFn = path.join(outputDir, 'functions-internal/server.mjs');
      expect(fs.existsSync(serverFn)).toBe(true);
      const fnContent = fs.readFileSync(serverFn, 'utf8');
      expect(fnContent).toContain('handler');
      expect(fnContent).toContain('preferStatic: true');

      // Verify netlify.toml
      const tomlPath = path.join(outputDir, 'netlify.toml');
      expect(fs.existsSync(tomlPath)).toBe(true);
      const tomlContent = fs.readFileSync(tomlPath, 'utf8');
      expect(tomlContent).toContain('publish');
    });
  });

  describe('Target 5: Static Adapter (@ranujs/adapter-static)', () => {
    it('produces zero-runtime static HTML pages, assets, .nojekyll, and manifest', async () => {
      const { createStaticAdapter } = await import('@ranujs/adapter-static');
      const distDir = path.join(projectDir, 'dist-static');

      const adapter = createStaticAdapter({
        outputDir: distDir,
        clean: true,
        strict: false,
        fallback: 'index.html',
      });

      const result = await adapter.adapt({
        projectRoot: projectDir,
        buildDir: path.join(projectDir, '.ranu/build'),
      });

      expect(result.success).toBe(true);
      expect(result.target).toBe('static');

      // Verify pre-rendered SSG HTML page
      const aboutPath = path.join(distDir, 'about.html');
      expect(fs.existsSync(aboutPath)).toBe(true);
      const aboutContent = fs.readFileSync(aboutPath, 'utf8');
      expect(aboutContent).toContain('<!DOCTYPE html>');
      expect(aboutContent).toContain('About Ranu.js');

      // Verify fallback index.html exists
      const indexPath = path.join(distDir, 'index.html');
      expect(fs.existsSync(indexPath)).toBe(true);

      // Verify GitHub Pages .nojekyll bypass
      const nojekyllPath = path.join(distDir, '.nojekyll');
      expect(fs.existsSync(nojekyllPath)).toBe(true);

      // Verify static manifest
      const manifestPath = path.join(distDir, 'static-manifest.json');
      expect(fs.existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(manifest.version).toBe(1);
      expect(manifest.buildId).toBeDefined();
      expect(Array.isArray(manifest.files)).toBe(true);
      expect(manifest.files.length).toBeGreaterThan(0);

      // Verify files entry metadata
      const aboutEntry = manifest.files.find((f: { path: string }) => f.path === 'about.html');
      expect(aboutEntry).toBeDefined();
      expect(aboutEntry.contentType).toBe('text/html; charset=utf-8');
      expect(aboutEntry.size).toBeGreaterThan(0);
    });
  });
});
