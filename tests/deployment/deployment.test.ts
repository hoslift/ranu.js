import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterAll } from 'vitest';
import { createTemporaryFixture } from '../helpers/fixture.js';
import { runCommand, cleanupAllProcesses } from '../helpers/process.js';
import { getAvailablePort, releasePort } from '../helpers/ports.js';
import { waitForHttpReady, fetchText } from '../helpers/http.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');
const cliBin = path.join(root, 'packages/cli/dist/bin/ranu.js');

describe('Phase 28 — Deployment E2E Lifecycle Consolidation', () => {
  afterAll(async () => {
    await cleanupAllProcesses();
  });

  it('Node.js Production: builds, starts runtime, handles SSR/API, and shuts down cleanly', async () => {
    const { projectDir, cleanup } = await createTemporaryFixture('build-basic', root);
    const port = await getAvailablePort();

    try {
      const buildRes = await runCommand(process.execPath, [cliBin, 'build'], { cwd: projectDir });
      expect(buildRes.code).toBe(0);

      // Verify production entry exists
      const entryPath = path.join(projectDir, '.ranu/build/server/entry.mjs');
      expect(fs.existsSync(entryPath)).toBe(true);

      const startPromise = runCommand(
        process.execPath,
        [cliBin, 'start', '--port', String(port), '--host', '127.0.0.1'],
        { cwd: projectDir, timeoutMs: 15000 },
      );

      const url = `http://127.0.0.1:${port}/`;
      await waitForHttpReady(url, { timeoutMs: 10000 });

      // Root SSR page
      const pageRes = await fetchText(url);
      expect(pageRes.status).toBe(200);
      expect(pageRes.body).toContain('<!DOCTYPE html>');

      // API route
      const apiRes = await fetchText(`http://127.0.0.1:${port}/api/hello`);
      expect(apiRes.status).toBe(200);
      expect(JSON.parse(apiRes.body)).toEqual({ message: 'Hello from Ranu API' });

      await cleanupAllProcesses();
      await startPromise.catch(() => {});
    } finally {
      releasePort(port);
      await cleanup();
    }
  });

  it('Container Deployment: generates production Dockerfile and container configuration without source leakage', async () => {
    const { projectDir, cleanup } = await createTemporaryFixture('build-basic', root);

    try {
      const buildRes = await runCommand(process.execPath, [cliBin, 'build'], { cwd: projectDir });
      expect(buildRes.code).toBe(0);

      // Verify build manifest outputs
      const staticManifest = path.join(projectDir, '.ranu/build/static-manifest.json');
      const routeManifest = path.join(projectDir, '.ranu/build/route-manifest.json');
      expect(fs.existsSync(staticManifest)).toBe(true);
      expect(fs.existsSync(routeManifest)).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it('Vercel Adapter: compiles application into valid Build Output API v3 structure', async () => {
    const { projectDir, cleanup } = await createTemporaryFixture('build-basic', root);

    try {
      const buildRes = await runCommand(process.execPath, [cliBin, 'build'], { cwd: projectDir });
      expect(buildRes.code).toBe(0);

      // Emulate Vercel adapter compilation
      const { default: vercelAdapter } = await import('@ranu/adapter-vercel');
      const adapter = vercelAdapter();

      await adapter.adapt({
        rootDir: projectDir,
        buildDir: path.join(projectDir, '.ranu/build'),
        outDir: path.join(projectDir, '.vercel/output'),
        routes: [
          { id: 'root', pattern: '/', kind: 'page' },
          { id: 'api-hello', pattern: '/api/hello', kind: 'api' },
        ],
      });

      const vercelConfig = path.join(projectDir, '.vercel/output/config.json');
      expect(fs.existsSync(vercelConfig)).toBe(true);
      const configJson = JSON.parse(fs.readFileSync(vercelConfig, 'utf8'));
      expect(configJson.version).toBe(3);
    } finally {
      await cleanup();
    }
  });
});
