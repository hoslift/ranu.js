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
      // 1. Pack packages/ranu into tarball
      const ranuPkgDir = path.join(root, 'packages/ranu');
      const packRes = await runCommand('pnpm', ['pack', '--pack-destination', tempDir], {
        cwd: ranuPkgDir,
      });
      expect(packRes.code).toBe(0);

      const tarballs = fs.readdirSync(tempDir).filter((f) => f.endsWith('.tgz'));
      const ranuTarball = tarballs.find((f) => f.startsWith('hoslift-ranu-') || f.startsWith('ranu-'));
      expect(ranuTarball).toBeDefined();
      const ranuTarballPath = path.join(tempDir, ranuTarball!);

      // 2. Initialize external standalone project outside monorepo
      const standaloneDir = path.join(tempDir, 'standalone-app');
      fs.mkdirSync(standaloneDir, { recursive: true });

      const pkgJson = {
        name: 'smoke-test-app',
        version: '1.0.0',
        private: true,
        type: 'module',
        dependencies: {
          ranu: `file:${ranuTarballPath.replace(/\\/g, '/')}`,
        },
      };
      fs.writeFileSync(path.join(standaloneDir, 'package.json'), JSON.stringify(pkgJson, null, 2));

      // 3. Configure pnpm-workspace.yaml & .npmrc for pnpm 11 build scripts
      fs.writeFileSync(
        path.join(standaloneDir, 'pnpm-workspace.yaml'),
        'allowBuilds:\n  esbuild: true\n',
      );
      fs.writeFileSync(
        path.join(standaloneDir, '.npmrc'),
        'enable-pre-post-scripts=true\n',
      );

      // 4. Install standalone app using self-contained packed tarball
      const installRes = await runCommand('pnpm', ['install', '--no-frozen-lockfile'], {
        cwd: standaloneDir,
        env: {
          ...process.env,
          NODE_PATH: '',
        },
        timeoutMs: 120000,
      });
      if (installRes.code !== 0) {
        console.error('INSTALL FAILED:', installRes.stdout, installRes.stderr);
      }
      expect(installRes.code).toBe(0);

      // Verify node_modules contains installed package tarball
      const nodeModules = path.join(standaloneDir, 'node_modules');
      expect(fs.existsSync(path.join(nodeModules, 'ranu')) || fs.existsSync(path.join(nodeModules, '@hoslift', 'ranu'))).toBe(true);

      // 5. Test canonical import resolution from installed standalone package
      const testImportScript = [
        'import { defineConfig } from "ranu";',
        'import { redirect, notFound } from "ranu/server";',
        'const config = defineConfig({});',
        'if (typeof defineConfig !== "function" || typeof redirect !== "function" || typeof notFound !== "function") process.exit(1);',
        'process.exit(0);',
      ].join('\n');

      fs.writeFileSync(path.join(standaloneDir, 'test-import.mjs'), testImportScript, 'utf8');

      // Execute script against standalone node_modules
      const execRes = await runCommand(process.execPath, ['test-import.mjs'], {
        cwd: standaloneDir,
        env: {
          ...process.env,
          NODE_PATH: '',
        },
      });
      expect(execRes.code).toBe(0);

      // 6. Test CLI binary invocation from installed standalone package
      const cliBinPath = fs.existsSync(path.join(standaloneDir, 'node_modules', 'ranu', 'dist', 'bin', 'ranu.js'))
        ? path.join(standaloneDir, 'node_modules', 'ranu', 'dist', 'bin', 'ranu.js')
        : path.join(standaloneDir, 'node_modules', '@hoslift', 'ranu', 'dist', 'bin', 'ranu.js');
      expect(fs.existsSync(cliBinPath)).toBe(true);

      const cliRes = await runCommand(process.execPath, [cliBinPath, '--help'], {
        cwd: standaloneDir,
        env: {
          ...process.env,
          NODE_ENV: 'production',
        },
      });
      expect(cliRes.code).toBe(0);
      expect(cliRes.stdout).toContain('Ranu.js');
    } finally {
      await removeDirWithRetry(tempDir);
    }
  });
});
