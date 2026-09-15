import path from 'node:path';
import fs from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterAll } from 'vitest';
import { writeContainerArtifacts } from '@ranu/build';
import { createTemporaryFixture } from '../helpers/fixture.js';
import { runCommand, cleanupAllProcesses, terminateProcessTree } from '../helpers/process.js';
import { withPortRetry, releasePort } from '../helpers/ports.js';
import { waitForHttpReady, fetchText } from '../helpers/http.js';
import { isPortOccupied } from '../helpers/leak-detector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');
const cliBin = path.join(root, 'packages/cli/dist/bin/ranu.js');

describe('Phase 28 — Deployment E2E Lifecycle Consolidation', () => {
  afterAll(async () => {
    await cleanupAllProcesses();
  });

  it('Node.js Production: builds, starts runtime, handles SSR/API, and shuts down gracefully', async () => {
    const { projectDir, cleanup } = await createTemporaryFixture('build-basic', root);

    try {
      const buildRes = await runCommand(process.execPath, [cliBin, 'build'], { cwd: projectDir });
      expect(buildRes.code).toBe(0);

      // Verify production entry exists
      const entryPath = path.join(projectDir, '.ranu/build/server/entry.mjs');
      expect(fs.existsSync(entryPath)).toBe(true);

      await withPortRetry(async (port) => {
        let child: ChildProcess | undefined;

        try {
          // Spawn start server directly to test signal-driven graceful shutdown
          child = spawn(
            process.execPath,
            [cliBin, 'start', '--port', String(port), '--host', '127.0.0.1'],
            {
              cwd: projectDir,
              stdio: ['ignore', 'pipe', 'pipe'],
            },
          );

          const url = `http://127.0.0.1:${port}/`;
          await waitForHttpReady(url, { timeoutMs: 10000 });

          // Root SSR page response
          const pageRes = await fetchText(url);
          expect(pageRes.status).toBe(200);
          expect(pageRes.body).toContain('<!DOCTYPE html>');

          // API route response
          const apiRes = await fetchText(`http://127.0.0.1:${port}/api/hello`);
          expect(apiRes.status).toBe(200);
          expect(JSON.parse(apiRes.body)).toEqual({ message: 'Hello from Ranu API' });

          // Signal graceful shutdown via SIGINT/SIGTERM (on Windows, tree termination is used)
          type ExitInfo = { code: number | null; signal: NodeJS.Signals | null };
          const exitPromise = new Promise<ExitInfo>((resolve) => {
            child?.on('close', (code, signal) => resolve({ code, signal }));
          });

          if (process.platform === 'win32') {
            await terminateProcessTree(child);
          } else {
            child.kill('SIGTERM');
          }

          await exitPromise;

          // Verify server stops accepting connections after shutdown
          const occupied = await isPortOccupied(port, 1000);
          expect(occupied).toBe(false);
        } finally {
          if (child) {
            await terminateProcessTree(child);
          }
          releasePort(port);
        }
      });
    } finally {
      await cleanup();
    }
  });

  it('Container Deployment: generates production Dockerfile and container configuration without source leakage', async () => {
    const { projectDir, cleanup } = await createTemporaryFixture('build-basic', root);

    try {
      const buildRes = await runCommand(process.execPath, [cliBin, 'build'], { cwd: projectDir });
      expect(buildRes.code).toBe(0);

      // Invoke container artifact generation API
      const result = writeContainerArtifacts(projectDir, {
        nodeVersion: '22-alpine',
        packageManager: 'npm',
        port: 3000,
        nonRoot: true,
      });

      expect(result.written).toBe(true);

      // Assert Dockerfile exists and contains multi-stage production instructions
      const dockerfilePath = path.join(projectDir, 'Dockerfile');
      expect(fs.existsSync(dockerfilePath)).toBe(true);
      const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf8');

      expect(dockerfileContent).toContain('FROM node:22-alpine AS build');
      expect(dockerfileContent).toContain('FROM node:22-alpine AS runtime');
      expect(dockerfileContent).toContain('USER node');
      expect(dockerfileContent).toContain('CMD ["node", ".ranu/build/server/entry.mjs"]');

      // Assert .dockerignore exists and excludes secrets / git / local dev cache
      const dockerignorePath = path.join(projectDir, '.dockerignore');
      expect(fs.existsSync(dockerignorePath)).toBe(true);
      const dockerignoreContent = fs.readFileSync(dockerignorePath, 'utf8');
      expect(dockerignoreContent).toContain('node_modules');
      expect(dockerignoreContent).toContain('.git');
      expect(dockerignoreContent).toContain('.env');
    } finally {
      await cleanup();
    }
  });

  it('Vercel Adapter: compiles application into valid Build Output API v3 structure and function config', async () => {
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

      // Assert config.json version 3
      const vercelConfig = path.join(projectDir, '.vercel/output/config.json');
      expect(fs.existsSync(vercelConfig)).toBe(true);
      const configJson = JSON.parse(fs.readFileSync(vercelConfig, 'utf8'));
      expect(configJson.version).toBe(3);

      // Assert serverless function output configuration (.vc-config.json)
      const vcConfigPath = path.join(
        projectDir,
        '.vercel/output/functions/index.func/.vc-config.json',
      );
      expect(fs.existsSync(vcConfigPath)).toBe(true);
      const vcConfig = JSON.parse(fs.readFileSync(vcConfigPath, 'utf8'));
      expect(vcConfig.runtime).toMatch(/nodejs22/);
      expect(vcConfig.launcherType).toBe('Nodejs');
      expect(vcConfig.handler).toBe('index.mjs');
    } finally {
      await cleanup();
    }
  });
});
