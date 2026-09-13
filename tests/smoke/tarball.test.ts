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
      // 1. Pack packages/ranu
      const ranuPkgDir = path.join(root, 'packages/ranu');
      const packRes = await runCommand('pnpm', ['pack', '--pack-destination', tempDir], {
        cwd: ranuPkgDir,
      });
      expect(packRes.code).toBe(0);

      const tarballs = fs.readdirSync(tempDir).filter((f) => f.endsWith('.tgz'));
      expect(tarballs.length).toBeGreaterThanOrEqual(1);
      const ranuTarball = path.join(tempDir, tarballs[0]);

      // 2. Initialize external standalone project
      const standaloneDir = path.join(tempDir, 'standalone-app');
      fs.mkdirSync(standaloneDir, { recursive: true });

      const pkgJson = {
        name: 'smoke-test-app',
        version: '1.0.0',
        private: true,
        type: 'module',
        dependencies: {
          ranu: `file:${ranuTarball.replace(/\\\\/g, '/')}`,
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

      // Install tarball
      const installRes = await runCommand('pnpm', ['install'], {
        cwd: standaloneDir,
        timeoutMs: 60000,
      });
      expect(installRes.code).toBe(0);

      // Execute script against standalone node_modules
      const execRes = await runCommand(process.execPath, ['test-import.mjs'], {
        cwd: standaloneDir,
      });
      expect(execRes.code).toBe(0);
    } finally {
      await removeDirWithRetry(tempDir);
    }
  });
});
