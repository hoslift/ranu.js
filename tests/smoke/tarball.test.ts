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
      // 1. Pack packages/ranu and required internal workspace packages into tarballs
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

      for (const relPkg of packagesToPack) {
        const pkgDir = path.join(root, relPkg);
        const packRes = await runCommand('pnpm', ['pack', '--pack-destination', tempDir], {
          cwd: pkgDir,
        });
        expect(packRes.code).toBe(0);
      }

      const tarballs = fs.readdirSync(tempDir).filter((f) => f.endsWith('.tgz'));
      expect(tarballs.length).toBeGreaterThanOrEqual(packagesToPack.length);

      const tarballPaths: Record<string, string> = {};
      for (const f of tarballs) {
        const fullPath = path.join(tempDir, f);
        if (f.startsWith('ranu-core-')) tarballPaths['@ranu/core'] = fullPath;
        else if (f.startsWith('ranu-diagnostics-')) tarballPaths['@ranu/diagnostics'] = fullPath;
        else if (f.startsWith('ranu-manifests-')) tarballPaths['@ranu/manifests'] = fullPath;
        else if (f.startsWith('ranu-config-')) tarballPaths['@ranu/config'] = fullPath;
        else if (f.startsWith('ranu-router-')) tarballPaths['@ranu/router'] = fullPath;
        else if (f.startsWith('ranu-runtime-node-')) tarballPaths['@ranu/runtime-node'] = fullPath;
        else if (f.startsWith('ranu-runtime-')) tarballPaths['@ranu/runtime'] = fullPath;
        else if (f.startsWith('ranu-server-')) tarballPaths['@ranu/server'] = fullPath;
        else if (f.startsWith('ranu-react-')) tarballPaths['@ranu/react'] = fullPath;
        else if (f.startsWith('ranu-plugin-')) tarballPaths['@ranu/plugin'] = fullPath;
        else if (f.startsWith('ranu-')) tarballPaths['ranu'] = fullPath;
      }

      expect(tarballPaths['ranu']).toBeDefined();
      expect(tarballPaths['@ranu/server']).toBeDefined();
      expect(tarballPaths['@ranu/core']).toBeDefined();

      // 2. Initialize external standalone project outside monorepo
      const standaloneDir = path.join(tempDir, 'standalone-app');
      fs.mkdirSync(standaloneDir, { recursive: true });

      const pkgJson = {
        name: 'smoke-test-app',
        version: '1.0.0',
        private: true,
        type: 'module',
        dependencies: {
          ranu: `file:${tarballPaths['ranu'].replace(/\\/g, '/')}`,
        },
      };
      fs.writeFileSync(path.join(standaloneDir, 'package.json'), JSON.stringify(pkgJson, null, 2));

      // 3. Configure .pnpmfile.cjs in standalone directory to hook dependency resolution
      // and redirect all internal @ranu/* workspace dependencies to local packed tarballs
      const pnpmfileContent = `
module.exports = {
  hooks: {
    readPackage(pkg) {
      const map = ${JSON.stringify(tarballPaths)};
      if (pkg.dependencies) {
        for (const [dep, file] of Object.entries(map)) {
          if (pkg.dependencies[dep]) {
            pkg.dependencies[dep] = 'file:' + file.replace(/\\\\/g, '/');
          }
        }
      }
      return pkg;
    }
  }
};
`;
      fs.writeFileSync(path.join(standaloneDir, '.pnpmfile.cjs'), pnpmfileContent);

      // 4. Install standalone app using only local packed tarballs without monorepo resolution
      const installRes = await runCommand('pnpm', ['install', '--no-frozen-lockfile'], {
        cwd: standaloneDir,
        env: {
          ...process.env,
          NODE_PATH: '',
        },
        timeoutMs: 120000,
      });
      expect(installRes.code).toBe(0);

      // Verify node_modules contains installed package tarballs
      const nodeModules = path.join(standaloneDir, 'node_modules');
      expect(fs.existsSync(path.join(nodeModules, 'ranu'))).toBe(true);
      expect(fs.existsSync(path.join(nodeModules, '@ranu/server'))).toBe(true);
      expect(fs.existsSync(path.join(nodeModules, '@ranu/core'))).toBe(true);

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
    } finally {
      await removeDirWithRetry(tempDir);
    }
  });
});
