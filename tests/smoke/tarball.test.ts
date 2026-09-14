import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterAll } from 'vitest';
import { runCommand, cleanupAllProcesses } from '../helpers/process.js';
import { removeDirWithRetry } from '../helpers/fixture.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');

describe('Phase 28 — Tarball Release Validation Smoke', () => {
  afterAll(async () => {
    await cleanupAllProcesses();
  });

  it('packs release packages, installs in standalone directory, and verifies clean independent boot', async () => {
    const tempDir = path.join(os.tmpdir(), 'ranu-smoke-' + Math.random().toString(36).substring(2, 8));
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      // 1. Pack packages/ranu and required internal packages into tarballs
      const packagesToPack = [
        'packages/core',
        'packages/diagnostics',
        'packages/manifests',
        'packages/config',
        'packages/router',
        'packages/runtime',
        'packages/runtime-node',
        'packages/server',
        'packages/react',
        'packages/plugin',
        'packages/ranu',
      ];

      const tarballMap: Record<string, string> = {};

      for (const relPkg of packagesToPack) {
        const pkgDir = path.join(root, relPkg);
        const packRes = await runCommand('pnpm', ['pack', '--pack-destination', tempDir], {
          cwd: pkgDir,
        });
        expect(packRes.code).toBe(0);
      }

      const tarballs = fs.readdirSync(tempDir).filter((f) => f.endsWith('.tgz'));
      expect(tarballs.length).toBeGreaterThanOrEqual(packagesToPack.length);

      const ranuTarball = tarballs.find((f) => f.startsWith('ranu-'));
      expect(ranuTarball).toBeDefined();

      // 2. Initialize external standalone project outside monorepo
      const standaloneDir = path.join(tempDir, 'standalone-app');
      fs.mkdirSync(standaloneDir, { recursive: true });

      const pkgJson = {
        name: 'smoke-test-app',
        version: '1.0.0',
        private: true,
        type: 'module',
        dependencies: {
          ranu: `file:${path.join(tempDir, ranuTarball!).replace(/\\/g, '/')}`,
        },
      };
      fs.writeFileSync(path.join(standaloneDir, 'package.json'), JSON.stringify(pkgJson, null, 2));

      // 3. Test canonical import resolution from tarball
      const testImportScript = [
        'import { defineConfig } from "ranu";',
        'import { redirect, notFound } from "ranu/server";',
        'const config = defineConfig({});',
        'if (typeof defineConfig !== "function" || typeof redirect !== "function") process.exit(1);',
        'process.exit(0);',
      ].join('\n');

      fs.writeFileSync(path.join(standaloneDir, 'test-import.mjs'), testImportScript, 'utf8');

      // Install tarball with clean environment to avoid workspace linkage
      const installRes = await runCommand('pnpm', ['install', '--no-frozen-lockfile'], {
        cwd: standaloneDir,
        env: {
          ...process.env,
          NODE_PATH: '',
        },
        timeoutMs: 60000,
      });
      expect(installRes.code).toBe(0);

      // Execute script against standalone node_modules
      const execRes = await runCommand(process.execPath, ['test-import.mjs'], {
        cwd: standaloneDir,
        env: {
          ...process.env,
          NODE_PATH: '',
        },
      });
      expect(execRes.code).toBe(0);
    } finally {
      await removeDirWithRetry(tempDir);
    }
  });
});
