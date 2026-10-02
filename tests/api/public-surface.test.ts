import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

describe('Phase 27 — Public API Conformance & Boundary Hardening', () => {
  describe('1. Canonical Public Entrypoints and Convenience Re-Exports', () => {
    it('resolves root "ranu" with version and convenience defineConfig re-export', async () => {
      const ranu = await import('ranu');
      const ranuConfig = await import('ranu/config');

      expect(ranu.RANU_VERSION).toBe('0.0.0');
      expect(ranu.defineConfig).toBeTypeOf('function');
      expect(ranu.defineConfig).toBe(ranuConfig.defineConfig);

      const resolved = ranu.defineConfig({
        server: { port: 8080 },
      });
      expect(resolved).toEqual({ server: { port: 8080 } });
    });

    it('resolves canonical "ranu/config" configuration helper', async () => {
      const { defineConfig } = await import('ranu/config');
      expect(defineConfig).toBeTypeOf('function');

      const fnConfig = defineConfig((ctx) => ({
        mode: ctx.mode,
      }));
      expect(typeof fnConfig).toBe('function');
    });

    it('resolves "ranu/react" client components and navigation hooks', async () => {
      const reactApi = await import('ranu/react');
      expect(reactApi.Link).toBeDefined();
      expect(reactApi.useRouter).toBeTypeOf('function');
      expect(reactApi.usePathname).toBeTypeOf('function');
      expect(reactApi.useSearchParams).toBeTypeOf('function');
    });

    it('resolves "ranu/server" server helpers and navigation utilities', async () => {
      const serverApi = await import('ranu/server');
      expect(serverApi.cookies).toBeTypeOf('function');
      expect(serverApi.headers).toBeTypeOf('function');
      expect(serverApi.redirect).toBeTypeOf('function');
      expect(serverApi.notFound).toBeTypeOf('function');
      expect(serverApi.next).toBeTypeOf('function');
      expect(serverApi.rewrite).toBeTypeOf('function');
      expect(serverApi.getRequestContext).toBeTypeOf('function');
    });

    it('resolves "ranu/plugin" plugin authoring API', async () => {
      const pluginApi = await import('ranu/plugin');
      expect(pluginApi.definePlugin).toBeTypeOf('function');

      const plugin = pluginApi.definePlugin({
        name: 'test-public-plugin',
        apiVersion: 1,
        version: '1.0.0',
        setup: () => {},
      });
      expect(plugin.name).toBe('test-public-plugin');
    });

    it('resolves "ranu/server-only" technical export safely', async () => {
      const serverOnly = await import('ranu/server-only');
      expect(serverOnly).toBeDefined();
    });
  });

  describe('2. Package Export Map & Deep Import Blocking', () => {
    it('defines exact canonical and technical subpaths in packages/ranu/package.json', () => {
      const pkgPath = path.join(rootDir, 'packages/ranu/package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

      expect(pkg.exports).toBeDefined();
      const exportKeys = Object.keys(pkg.exports);

      // Canonical and technical subpaths per 11_PUBLIC_API_SPECIFICATION.md §10
      const expectedExports = ['.', './config', './plugin', './react', './server', './server-only'];

      expect(exportKeys.sort()).toEqual(expectedExports.sort());
    });

    it('blocks unexported deep imports at package export map boundary', () => {
      const pkgPath = path.join(rootDir, 'packages/ranu/package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

      const invalidSubpaths = [
        './dist/index.js',
        './src/index.ts',
        './internal',
        './core',
        './router',
      ];

      for (const subpath of invalidSubpaths) {
        expect(pkg.exports[subpath]).toBeUndefined();
      }
    });

    it('rejects unexported deep imports via real Node package self-reference resolution boundary', () => {
      const requireFromPkg = createRequire(path.join(rootDir, 'packages/ranu/package.json'));

      const invalidImports = [
        'ranu/dist/index.js',
        'ranu/src/index.ts',
        'ranu/src/index.js',
        'ranu/internal',
      ];

      for (const deepImport of invalidImports) {
        expect(() => requireFromPkg.resolve(deepImport)).toThrowError(
          expect.objectContaining({ code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' }),
        );
      }
    });

    it('verifies that actual consumer import attempts for invalid deep imports are blocked by Node package exports', () => {
      const consumerDir = path.join(rootDir, 'examples/minimal');

      // Attempt actual import of ranu/dist/index.js
      const resultDist = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          'try { await import("ranu/dist/index.js"); process.exit(0); } catch (e) { process.stderr.write(e.code || e.message); process.exit(42); }',
        ],
        { cwd: consumerDir, encoding: 'utf8' },
      );
      expect(resultDist.status).toBe(42);
      expect(resultDist.stderr).toContain('ERR_PACKAGE_PATH_NOT_EXPORTED');

      // Attempt actual import of ranu/src/index.js
      const resultSrc = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          'try { await import("ranu/src/index.js"); process.exit(0); } catch (e) { process.stderr.write(e.code || e.message); process.exit(42); }',
        ],
        { cwd: consumerDir, encoding: 'utf8' },
      );
      expect(resultSrc.status).toBe(42);
      expect(resultSrc.stderr).toContain('ERR_PACKAGE_PATH_NOT_EXPORTED');
    });

    it('verifies that real consumer can import all canonical public entrypoints without export errors', () => {
      const consumerDir = path.join(rootDir, 'examples/minimal');
      const result = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          'await Promise.all([import("ranu"), import("ranu/config"), import("ranu/react"), import("ranu/server"), import("ranu/plugin"), import("ranu/server-only")]); process.exit(0);',
        ],
        { cwd: consumerDir, encoding: 'utf8' },
      );
      expect(result.status).toBe(0);
    });
  });

  describe('3. Internal Package Visibility & Privacy Enforcement', () => {
    it('enumerates all workspace packages across packages/* and adapters/* and enforces privacy boundary', () => {
      // Release packages allowlist aligned with scripts/check-exports.mjs
      const publicReleasePackages = new Set(['packages/ranu', 'adapters/vercel']);

      const scanDirs = ['packages', 'adapters'];
      const scannedPackages: { relativeDir: string; name: string; private: boolean }[] = [];

      for (const groupDir of scanDirs) {
        const fullGroupPath = path.join(rootDir, groupDir);
        if (!fs.existsSync(fullGroupPath)) continue;

        const entries = fs.readdirSync(fullGroupPath, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const pkgJsonPath = path.join(fullGroupPath, entry.name, 'package.json');
          if (!fs.existsSync(pkgJsonPath)) continue;

          const relativeDir = `${groupDir}/${entry.name}`;
          const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
          scannedPackages.push({
            relativeDir,
            name: pkgJson.name,
            private: pkgJson.private,
          });
        }
      }

      // Ensure we scanned both packages/* and adapters/* directories
      expect(scannedPackages.length).toBeGreaterThanOrEqual(15);

      for (const pkg of scannedPackages) {
        if (publicReleasePackages.has(pkg.relativeDir)) {
          expect(
            pkg.private,
            `Expected ${pkg.relativeDir} (${pkg.name}) to have private: false`,
          ).toBe(false);
        } else {
          expect(
            pkg.private,
            `Expected ${pkg.relativeDir} (${pkg.name}) to have private: true`,
          ).toBe(true);
        }
      }
    });

    it('ensures only public release packages have private: false', () => {
      const checkPkg = (relativeDir: string) => {
        const pkgJsonPath = path.join(rootDir, relativeDir, 'package.json');
        if (fs.existsSync(pkgJsonPath)) {
          return JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        }
        return null;
      };

      const ranuPkg = checkPkg('packages/ranu');
      const createRanuPkg = checkPkg('create-ranu');
      const vercelPkg = checkPkg('adapters/vercel');

      expect(ranuPkg?.private).toBe(false);
      expect(createRanuPkg?.private).toBe(false);
      expect(vercelPkg?.private).toBe(false);
    });
  });

  describe('4. Peer Dependencies & Node Engines Conformance', () => {
    it('declares React 19 as required peer dependency in packages/ranu', () => {
      const pkgPath = path.join(rootDir, 'packages/ranu/package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

      expect(pkg.peerDependencies).toBeDefined();
      expect(pkg.peerDependencies.react).toBe('^19.0.0');
      expect(pkg.peerDependencies['react-dom']).toBe('^19.0.0');

      expect(pkg.peerDependenciesMeta?.react?.optional).toBe(false);
      expect(pkg.peerDependenciesMeta?.['react-dom']?.optional).toBe(false);
    });

    it('declares Node.js engine requirement >= 22.0.0', () => {
      const pkgPath = path.join(rootDir, 'packages/ranu/package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

      expect(pkg.engines?.node).toBe('>=22.0.0');
    });
  });

  describe('5. Runtime Domain Boundaries Enforcement', () => {
    it('throws when request-context helpers are invoked outside server request context', async () => {
      const { cookies, headers, getRequestContext } = await import('ranu/server');

      expect(() => cookies()).toThrow(/request/i);
      expect(() => headers()).toThrow(/request/i);
      expect(() => getRequestContext()).toThrow(/request/i);
    });

    it('triggers navigation control flow signals for redirect, notFound, and rewrite', async () => {
      const { redirect, notFound, rewrite } = await import('ranu/server');

      expect(() => redirect('/somewhere')).toThrow(/Redirect to \/somewhere/i);
      expect(() => notFound()).toThrow(/Not Found/i);
      expect(() => rewrite('/target')).toThrow(/Rewrite to \/target/i);
    });

    it('throws when client navigation hooks are invoked outside React execution context', async () => {
      const { useRouter, usePathname, useSearchParams } = await import('ranu/react');

      expect(() => useRouter()).toThrow();
      expect(() => usePathname()).toThrow();
      expect(() => useSearchParams()).toThrow();
    });
  });

  describe('6. Built Output & Declaration Files Verification', () => {
    it('verifies that built declaration files (.d.ts) exist for all public entrypoints', () => {
      const distDir = path.join(rootDir, 'packages/ranu/dist');
      const expectedDeclarations = [
        'index.d.ts',
        'config.d.ts',
        'react.d.ts',
        'server.d.ts',
        'plugin.d.ts',
        'server-only.d.ts',
      ];

      for (const file of expectedDeclarations) {
        const filePath = path.join(distDir, file);
        expect(fs.existsSync(filePath), `Missing declaration file: ${file}`).toBe(true);
        const content = fs.readFileSync(filePath, 'utf8');
        expect(content.length).toBeGreaterThan(0);
      }
    });

    it('ensures dist/index.d.ts includes defineConfig and configuration types', () => {
      const indexDtsPath = path.join(rootDir, 'packages/ranu/dist/index.d.ts');
      if (fs.existsSync(indexDtsPath)) {
        const content = fs.readFileSync(indexDtsPath, 'utf8');
        expect(content).toMatch(/defineConfig/);
        expect(content).toMatch(/RanuUserConfig/);
        expect(content).toMatch(/RanuConfigContext/);
      }
    });
  });
});
