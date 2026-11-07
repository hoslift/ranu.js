import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { DeploymentAdapterContext } from '@ranu/core';
import {
  createStaticAdapter,
  isPathContained,
  createStaticPreviewServer,
} from '../src/index.js';

describe('@ranujs/adapter-static static adaptation pipeline', () => {
  let tmpDir: string;
  let projectRoot: string;
  let buildDir: string;

  const mockLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    log: () => {},
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-static-adapter-test-'));
    projectRoot = path.join(tmpDir, 'project');
    buildDir = path.join(projectRoot, '.ranu', 'build');

    fs.mkdirSync(path.join(buildDir, 'manifest'), { recursive: true });
    fs.mkdirSync(path.join(buildDir, 'static', 'pages'), { recursive: true });
    fs.mkdirSync(path.join(buildDir, 'static', 'assets'), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, 'public'), { recursive: true });

    // Mock build.json
    fs.writeFileSync(
      path.join(buildDir, 'build.json'),
      JSON.stringify({
        schemaVersion: 1,
        buildId: 'test-build-123',
        runtime: 'static',
      })
    );

    // Mock routes.json
    fs.writeFileSync(
      path.join(buildDir, 'manifest', 'routes.json'),
      JSON.stringify({
        schemaVersion: 2,
        buildId: 'test-build-123',
        routes: [
          { path: '/', kind: 'page', renderMode: 'static' },
          { path: '/about', kind: 'page', renderMode: 'static' },
        ],
      })
    );

    // Mock pre-rendered HTML files
    fs.writeFileSync(
      path.join(buildDir, 'static', 'pages', 'index.html'),
      '<!DOCTYPE html><html><body><h1>Home</h1></body></html>'
    );
    fs.mkdirSync(path.join(buildDir, 'static', 'pages', 'about'), { recursive: true });
    fs.writeFileSync(
      path.join(buildDir, 'static', 'pages', 'about', 'index.html'),
      '<!DOCTYPE html><html><body><h1>About</h1></body></html>'
    );

    // Mock client asset chunk
    fs.writeFileSync(
      path.join(buildDir, 'static', 'assets', 'main.abc12345.js'),
      'console.log("client");'
    );

    // Mock public asset
    fs.writeFileSync(
      path.join(projectRoot, 'public', 'robots.txt'),
      'User-agent: *\nDisallow:'
    );
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('path containment guard detects escaping paths', () => {
    expect(isPathContained('/root/project', '/root/project/dist')).toBe(true);
    expect(isPathContained('/root/project', '/root/project/dist/assets/index.js')).toBe(true);
    expect(isPathContained('/root/project', '/root/etc/passwd')).toBe(false);
    expect(isPathContained('/root/project', '/root/project/../../etc')).toBe(false);
  });

  it('fails if build.json does not exist', async () => {
    fs.rmSync(path.join(buildDir, 'build.json'));
    const adapter = createStaticAdapter();
    const ctx: DeploymentAdapterContext = {
      projectRoot,
      buildDir,
      rootDir: projectRoot,
      logger: mockLogger,
      config: {} as any,
    };

    await expect(adapter.adapt(ctx)).rejects.toThrow(
      'Build descriptor not found at'
    );
  });

  it('compiles static HTML, client bundles, public directory, and .nojekyll', async () => {
    const adapter = createStaticAdapter({ outputDir: 'dist' });
    const ctx: DeploymentAdapterContext = {
      projectRoot,
      buildDir,
      rootDir: projectRoot,
      logger: mockLogger,
      config: {} as any,
    };

    const res = await adapter.adapt(ctx);
    expect(res.success).toBe(true);

    const distDir = path.join(projectRoot, 'dist');
    expect(fs.existsSync(path.join(distDir, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(distDir, 'about', 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(distDir, '_ranu', 'assets', 'main.abc12345.js'))).toBe(true);
    expect(fs.existsSync(path.join(distDir, 'robots.txt'))).toBe(true);
    expect(fs.existsSync(path.join(distDir, '.nojekyll'))).toBe(true);
    expect(fs.existsSync(path.join(distDir, 'static-manifest.json'))).toBe(true);

    const manifest = JSON.parse(
      fs.readFileSync(path.join(distDir, 'static-manifest.json'), 'utf8')
    );
    expect(manifest.version).toBe(1);
    expect(manifest.buildId).toBe('test-build-123');
    expect(manifest.files.some((f: any) => f.path === 'index.html')).toBe(true);
  });

  it('generates SPA fallback page when configured', async () => {
    const adapter = createStaticAdapter({ outputDir: 'dist', fallback: '200.html' });
    const ctx: DeploymentAdapterContext = {
      projectRoot,
      buildDir,
      rootDir: projectRoot,
      logger: mockLogger,
      config: {} as any,
    };

    await adapter.adapt(ctx);
    const fallbackPath = path.join(projectRoot, 'dist', '200.html');
    expect(fs.existsSync(fallbackPath)).toBe(true);
    const content = fs.readFileSync(fallbackPath, 'utf8');
    expect(content).toContain('<h1>Home</h1>');
  });

  it('handles route validation in strict mode vs normal mode', async () => {
    // Add dynamic API route
    fs.writeFileSync(
      path.join(buildDir, 'manifest', 'routes.json'),
      JSON.stringify({
        schemaVersion: 2,
        buildId: 'test-build-123',
        routes: [
          { path: '/', kind: 'page', renderMode: 'static' },
          { path: '/api/user', kind: 'api' },
        ],
      })
    );

    const ctx: DeploymentAdapterContext = {
      projectRoot,
      buildDir,
      rootDir: projectRoot,
      logger: mockLogger,
      config: {} as any,
    };

    // Strict mode should reject
    const strictAdapter = createStaticAdapter({ strict: true });
    await expect(strictAdapter.adapt(ctx)).rejects.toThrow(
      '[adapter-static strict mode] Dynamic route "/api/user" (api) is not supported'
    );

    // Non-strict mode should succeed with warning
    const normalAdapter = createStaticAdapter({ strict: false });
    const res = await normalAdapter.adapt(ctx);
    expect(res.success).toBe(true);
  });

  it('serves files and handles 404/fallback through preview server', async () => {
    const adapter = createStaticAdapter({ outputDir: 'dist', fallback: '200.html' });
    const ctx: DeploymentAdapterContext = {
      projectRoot,
      buildDir,
      rootDir: projectRoot,
      logger: mockLogger,
      config: {} as any,
    };
    await adapter.adapt(ctx);

    const distDir = path.join(projectRoot, 'dist');
    const preview = createStaticPreviewServer({
      dir: distDir,
      fallback: '200.html',
    });

    const info = await preview.start();
    expect(info.port).toBeGreaterThan(0);

    try {
      const resHome = await fetch(`${info.url}/`);
      expect(resHome.status).toBe(200);
      const textHome = await resHome.text();
      expect(textHome).toContain('<h1>Home</h1>');

      const resAsset = await fetch(`${info.url}/_ranu/assets/main.abc12345.js`);
      expect(resAsset.status).toBe(200);
      expect(resAsset.headers.get('content-type')).toContain('application/javascript');

      const resUnknown = await fetch(`${info.url}/nonexistent-route`);
      expect(resUnknown.status).toBe(200); // 200 via fallback
      const textFallback = await resUnknown.text();
      expect(textFallback).toContain('<h1>Home</h1>');
    } finally {
      await preview.stop();
    }
  });
});
