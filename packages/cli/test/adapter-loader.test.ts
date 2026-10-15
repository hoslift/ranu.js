import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { RanuDeploymentAdapter } from '@ranu/core';
import {
  KNOWN_ADAPTER_SHORTHANDS,
  resolveAdapterSpecifier,
  resolveAdapterInstance,
  loadDeploymentAdapter,
} from '../src/adapter-loader.js';

describe('Dynamic Deployment Adapter Loader', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-adapter-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  describe('resolveAdapterSpecifier', () => {
    it('resolves canonical provider shorthands to @ranujs packages', () => {
      const providers = ['vercel', 'cloudflare', 'node', 'bun', 'deno', 'netlify'] as const;

      for (const provider of providers) {
        const resolved = resolveAdapterSpecifier(provider, { projectRoot: tempDir });
        expect(resolved.kind).toBe('shorthand');
        expect(resolved.resolvedTarget).toBe(KNOWN_ADAPTER_SHORTHANDS[provider]);
        expect(resolved.importSpecifier).toBe(KNOWN_ADAPTER_SHORTHANDS[provider]);
      }
    });

    it('resolves shorthands case-insensitively with whitespace trimmed', () => {
      const variations = ['  VERCEL  ', 'CloudFlare', 'NoDe', 'BUN', 'Deno', 'NetLify'];

      for (const variation of variations) {
        const lower = variation.trim().toLowerCase();
        const resolved = resolveAdapterSpecifier(variation, { projectRoot: tempDir });
        expect(resolved.kind).toBe('shorthand');
        expect(resolved.resolvedTarget).toBe(KNOWN_ADAPTER_SHORTHANDS[lower]);
        expect(resolved.importSpecifier).toBe(KNOWN_ADAPTER_SHORTHANDS[lower]);
      }
    });

    it('resolves full official package names as package specifiers', () => {
      const packages = [
        '@ranujs/adapter-vercel',
        '@ranujs/adapter-cloudflare',
        '@ranujs/adapter-node',
        '@ranujs/adapter-netlify',
      ];

      for (const pkg of packages) {
        const resolved = resolveAdapterSpecifier(pkg, { projectRoot: tempDir });
        expect(resolved.kind).toBe('package');
        expect(resolved.resolvedTarget).toBe(pkg);
        expect(resolved.importSpecifier).toBe(pkg);
      }
    });

    it('resolves custom package specifiers', () => {
      const packages = ['@myorg/custom-adapter', 'ranu-adapter-aws', '@scope/adapter'];

      for (const pkg of packages) {
        const resolved = resolveAdapterSpecifier(pkg, { projectRoot: tempDir });
        expect(resolved.kind).toBe('package');
        expect(resolved.resolvedTarget).toBe(pkg);
        expect(resolved.importSpecifier).toBe(pkg);
      }
    });

    it('resolves prototype property names like constructor and __proto__ as packages, not shorthands', () => {
      const prototypeKeys = ['constructor', '__proto__', 'toString', 'valueOf'];

      for (const key of prototypeKeys) {
        const resolved = resolveAdapterSpecifier(key, { projectRoot: tempDir });
        expect(resolved.kind).toBe('package');
        expect(resolved.resolvedTarget).toBe(key);
        expect(resolved.importSpecifier).toBe(key);
      }
    });

    it('resolves explicit relative local file paths to file URLs', () => {
      const relPaths = ['./adapters/custom.mjs', '../shared/adapter.js', '.\\win-adapter.ts'];

      for (const rel of relPaths) {
        const resolved = resolveAdapterSpecifier(rel, { projectRoot: tempDir });
        expect(resolved.kind).toBe('local-file');
        expect(path.isAbsolute(resolved.resolvedTarget)).toBe(true);
        expect(resolved.importSpecifier.startsWith('file://')).toBe(true);
        expect(resolved.filePath).toBe(path.resolve(tempDir, rel));
      }
    });

    it('resolves absolute local file paths to file URLs', () => {
      const absPath = path.resolve(tempDir, 'my-adapter.mjs');
      const resolved = resolveAdapterSpecifier(absPath, { projectRoot: tempDir });

      expect(resolved.kind).toBe('local-file');
      expect(resolved.resolvedTarget).toBe(absPath);
      expect(resolved.importSpecifier.startsWith('file://')).toBe(true);
      expect(resolved.filePath).toBe(absPath);
    });

    it('resolves local files identified by file extensions', () => {
      const resolved = resolveAdapterSpecifier('custom-adapter.ts', { projectRoot: tempDir });

      expect(resolved.kind).toBe('local-file');
      expect(resolved.filePath).toBe(path.resolve(tempDir, 'custom-adapter.ts'));
      expect(resolved.importSpecifier.startsWith('file://')).toBe(true);
    });
  });

  describe('resolveAdapterInstance', () => {
    const dummyAdapt = async () => ({
      success: true,
      target: 'test',
      outputDirectory: '/out',
    });

    it('returns null for null, undefined, primitive values, or empty objects', () => {
      expect(resolveAdapterInstance(null)).toBeNull();
      expect(resolveAdapterInstance(undefined)).toBeNull();
      expect(resolveAdapterInstance('string-adapter')).toBeNull();
      expect(resolveAdapterInstance(12345)).toBeNull();
      expect(resolveAdapterInstance(true)).toBeNull();
      expect(resolveAdapterInstance({})).toBeNull();
    });

    it('resolves a direct adapter instance implementing adapt()', () => {
      const adapter: RanuDeploymentAdapter = {
        name: 'direct-adapter',
        apiVersion: 1,
        capabilities: {},
        adapt: dummyAdapt,
      };

      const resolved = resolveAdapterInstance(adapter);
      expect(resolved).toBe(adapter);
    });

    it('resolves named provider factories: create<Provider>Adapter and createAdapter', () => {
      const factoryNames = [
        'createVercelAdapter',
        'createCloudflareAdapter',
        'createNodeAdapter',
        'createBunAdapter',
        'createDenoAdapter',
        'createNetlifyAdapter',
        'createAdapter',
      ];

      for (const fnName of factoryNames) {
        const adapter: RanuDeploymentAdapter = {
          name: fnName,
          apiVersion: 1,
          capabilities: {},
          adapt: dummyAdapt,
        };
        const mod = { [fnName]: vi.fn(() => adapter) };

        const resolved = resolveAdapterInstance(mod);
        expect(resolved).toBe(adapter);
        expect(mod[fnName]).toHaveBeenCalledOnce();
      }
    });

    it('resolves default export factory function', () => {
      const adapter: RanuDeploymentAdapter = {
        name: 'default-factory',
        apiVersion: 1,
        capabilities: {},
        adapt: dummyAdapt,
      };
      const defaultFn = vi.fn(() => adapter);
      const mod = { default: defaultFn };

      const resolved = resolveAdapterInstance(mod);
      expect(resolved).toBe(adapter);
      expect(defaultFn).toHaveBeenCalledOnce();
    });

    it('resolves default export adapter object', () => {
      const adapter: RanuDeploymentAdapter = {
        name: 'default-object',
        apiVersion: 1,
        capabilities: {},
        adapt: dummyAdapt,
      };
      const mod = { default: adapter };

      const resolved = resolveAdapterInstance(mod);
      expect(resolved).toBe(adapter);
    });

    it('resolves named adapter export function or object', () => {
      const adapterFn: RanuDeploymentAdapter = {
        name: 'named-adapter-fn',
        apiVersion: 1,
        capabilities: {},
        adapt: dummyAdapt,
      };
      const modFn = { adapter: vi.fn(() => adapterFn) };
      expect(resolveAdapterInstance(modFn)).toBe(adapterFn);

      const adapterObj: RanuDeploymentAdapter = {
        name: 'named-adapter-obj',
        apiVersion: 1,
        capabilities: {},
        adapt: dummyAdapt,
      };
      const modObj = { adapter: adapterObj };
      expect(resolveAdapterInstance(modObj)).toBe(adapterObj);
    });

    it('resolves when the module itself is a factory function', () => {
      const adapter: RanuDeploymentAdapter = {
        name: 'root-fn',
        apiVersion: 1,
        capabilities: {},
        adapt: dummyAdapt,
      };
      const mod = () => adapter;

      const resolved = resolveAdapterInstance(mod);
      expect(resolved).toBe(adapter);
    });

    it('resolves any exported object implementing adapt()', () => {
      const adapter: RanuDeploymentAdapter = {
        name: 'arbitrary-export',
        apiVersion: 1,
        capabilities: {},
        adapt: dummyAdapt,
      };
      const mod = { myCustomAdapter: adapter };

      const resolved = resolveAdapterInstance(mod);
      expect(resolved).toBe(adapter);
    });

    it('re-throws when a factory function throws a runtime initialization error', () => {
      const mod = {
        createVercelAdapter: () => {
          throw new Error('Factory initialization failed');
        },
      };

      expect(() => resolveAdapterInstance(mod)).toThrow('Factory initialization failed');
    });

    it('returns null when factory returns an object without adapt() method', () => {
      const mod = {
        createAdapter: () => ({ name: 'not-an-adapter' }),
      };

      expect(resolveAdapterInstance(mod)).toBeNull();
    });
  });

  describe('loadDeploymentAdapter', () => {
    const dummyAdapt = async () => ({
      success: true,
      target: 'test',
      outputDirectory: '/out',
    });

    it('successfully loads cloudflare adapter via mock importer for shorthands', async () => {
      const adapter: RanuDeploymentAdapter = {
        name: 'cloudflare-test',
        apiVersion: 1,
        capabilities: {},
        adapt: dummyAdapt,
      };
      const importer = vi.fn(async (spec: string) => {
        expect(spec).toBe('@ranujs/adapter-cloudflare');
        return { createCloudflareAdapter: () => adapter };
      });

      const result = await loadDeploymentAdapter('cloudflare', {
        projectRoot: tempDir,
        importer,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.adapter).toBe(adapter);
        expect(result.specifier.kind).toBe('shorthand');
        expect(result.specifier.resolvedTarget).toBe('@ranujs/adapter-cloudflare');
      }
      expect(importer).toHaveBeenCalledOnce();
    });

    it('successfully loads node adapter via mock importer for shorthands', async () => {
      const adapter: RanuDeploymentAdapter = {
        name: 'node-test',
        apiVersion: 1,
        capabilities: {},
        adapt: dummyAdapt,
      };
      const importer = vi.fn(async (spec: string) => {
        expect(spec).toBe('@ranujs/adapter-node');
        return { createNodeAdapter: () => adapter };
      });

      const result = await loadDeploymentAdapter('node', {
        projectRoot: tempDir,
        importer,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.adapter).toBe(adapter);
        expect(result.specifier.kind).toBe('shorthand');
        expect(result.specifier.resolvedTarget).toBe('@ranujs/adapter-node');
      }
      expect(importer).toHaveBeenCalledOnce();
    });

    it('successfully loads netlify adapter via mock importer for shorthands', async () => {
      const adapter: RanuDeploymentAdapter = {
        name: 'netlify-test',
        apiVersion: 1,
        capabilities: {},
        adapt: dummyAdapt,
      };
      const importer = vi.fn(async (spec: string) => {
        expect(spec).toBe('@ranujs/adapter-netlify');
        return { createNetlifyAdapter: () => adapter };
      });

      const result = await loadDeploymentAdapter('netlify', {
        projectRoot: tempDir,
        importer,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.adapter).toBe(adapter);
        expect(result.specifier.kind).toBe('shorthand');
        expect(result.specifier.resolvedTarget).toBe('@ranujs/adapter-netlify');
      }
      expect(importer).toHaveBeenCalledOnce();
    });

    it('successfully loads adapters via full package specifiers', async () => {
      const cfAdapter: RanuDeploymentAdapter = {
        name: 'cloudflare',
        apiVersion: 1,
        capabilities: {},
        adapt: dummyAdapt,
      };
      const importer = vi.fn(async (spec: string) => {
        expect(spec).toBe('@ranujs/adapter-cloudflare');
        return { default: cfAdapter };
      });

      const result = await loadDeploymentAdapter('@ranujs/adapter-cloudflare', {
        projectRoot: tempDir,
        importer,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.adapter).toBe(cfAdapter);
        expect(result.specifier.kind).toBe('package');
      }
    });

    it('successfully loads an adapter from a custom package specifier', async () => {
      const adapter: RanuDeploymentAdapter = {
        name: 'custom-org-adapter',
        apiVersion: 1,
        capabilities: {},
        adapt: dummyAdapt,
      };
      const importer = vi.fn(async (spec: string) => {
        expect(spec).toBe('@custom/ranu-adapter');
        return { default: adapter };
      });

      const result = await loadDeploymentAdapter('@custom/ranu-adapter', {
        projectRoot: tempDir,
        importer,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.adapter).toBe(adapter);
        expect(result.specifier.kind).toBe('package');
      }
    });

    it('successfully loads a real local .mjs file using pathToFileURL', async () => {
      const adapterFilePath = path.join(tempDir, 'local-adapter.mjs');
      const adapterCode = `
        export default {
          name: 'local-file-adapter',
          apiVersion: 1,
          capabilities: {},
          adapt: async () => ({ success: true, target: 'local', outputDirectory: '/local-out' }),
        };
      `;
      fs.writeFileSync(adapterFilePath, adapterCode, 'utf8');

      const result = await loadDeploymentAdapter('./local-adapter.mjs', {
        projectRoot: tempDir,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.adapter.name).toBe('local-file-adapter');
        expect(result.specifier.kind).toBe('local-file');
        expect(result.specifier.filePath).toBe(adapterFilePath);
      }
    });

    it('returns RANU_DEPLOY_ADAPTER_FILE_NOT_FOUND when local file does not exist', async () => {
      const missingFilePath = path.join(tempDir, 'missing-adapter.js');

      const result = await loadDeploymentAdapter('./missing-adapter.js', {
        projectRoot: tempDir,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.diagnostic.code).toBe('RANU_DEPLOY_ADAPTER_FILE_NOT_FOUND');
        expect(result.diagnostic.severity).toBe('error');
        expect(result.diagnostic.message).toContain('Deployment adapter file not found');
        expect(result.diagnostic.hint).toContain(tempDir);
        expect(result.diagnostic.location?.file).toBe(missingFilePath);
      }
    });

    it('returns RANU_DEPLOY_ADAPTER_NOT_FOUND for missing shorthand package with install hint', async () => {
      const importer = vi.fn(async () => {
        const err = new Error("Cannot find package '@ranujs/adapter-deno'");
        (err as any).code = 'ERR_MODULE_NOT_FOUND';
        throw err;
      });

      const result = await loadDeploymentAdapter('deno', {
        projectRoot: tempDir,
        importer,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.diagnostic.code).toBe('RANU_DEPLOY_ADAPTER_NOT_FOUND');
        expect(result.diagnostic.severity).toBe('error');
        expect(result.diagnostic.message).toContain('@ranujs/adapter-deno');
        expect(result.diagnostic.hint).toContain('npm install -D @ranujs/adapter-deno');
      }
    });

    it('returns RANU_DEPLOY_ADAPTER_NOT_FOUND for missing custom package with install hint', async () => {
      const importer = vi.fn(async () => {
        const err = new Error("Cannot find package '@myorg/missing-adapter'");
        (err as any).code = 'ERR_MODULE_NOT_FOUND';
        throw err;
      });

      const result = await loadDeploymentAdapter('@myorg/missing-adapter', {
        projectRoot: tempDir,
        importer,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.diagnostic.code).toBe('RANU_DEPLOY_ADAPTER_NOT_FOUND');
        expect(result.diagnostic.severity).toBe('error');
        expect(result.diagnostic.hint).toContain('npm install -D @myorg/missing-adapter');
      }
    });

    it('returns RANU_DEPLOY_ADAPTER_INVALID when loaded module lacks adapt() method', async () => {
      const importer = vi.fn(async () => ({
        someExport: 'not an adapter',
      }));

      const result = await loadDeploymentAdapter('vercel', {
        projectRoot: tempDir,
        importer,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.diagnostic.code).toBe('RANU_DEPLOY_ADAPTER_INVALID');
        expect(result.diagnostic.severity).toBe('error');
        expect(result.diagnostic.message).toContain('does not implement a valid adapt() method');
        expect(result.diagnostic.hint).toContain('RanuDeploymentAdapter interface');
      }
    });

    it('returns RANU_DEPLOY_ADAPTER_LOAD_FAILED when module throws runtime error during load', async () => {
      const importer = vi.fn(async () => {
        throw new Error('Adapter crashed on initialization due to missing environment bindings');
      });

      const result = await loadDeploymentAdapter('cloudflare', {
        projectRoot: tempDir,
        importer,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.diagnostic.code).toBe('RANU_DEPLOY_ADAPTER_LOAD_FAILED');
        expect(result.diagnostic.severity).toBe('error');
        expect(result.diagnostic.message).toContain('missing environment bindings');
        expect(result.diagnostic.hint).toContain('Check the adapter module for syntax or runtime');
      }
    });
  });
});
