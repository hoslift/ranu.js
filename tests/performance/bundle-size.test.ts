import path from 'node:path';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterAll } from 'vitest';
import { createTemporaryFixture } from '../helpers/fixture.js';
import { runCommand, cleanupAllProcesses } from '../helpers/process.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');
const cliBin = path.join(root, 'packages/cli/dist/bin/ranu.js');
const cliEnv = { ...process.env, NODE_ENV: 'production' };

interface AssetSizeInfo {
  name: string;
  rawBytes: number;
  gzipBytes: number;
}

function getDirectoryAssetSizes(dir: string): AssetSizeInfo[] {
  const results: AssetSizeInfo[] = [];
  if (!fs.existsSync(dir)) return results;

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.mjs') || entry.name.endsWith('.css'))) {
        const content = fs.readFileSync(fullPath);
        const gzipped = zlib.gzipSync(content);
        results.push({
          name: path.relative(dir, fullPath).replace(/\\/g, '/'),
          rawBytes: content.length,
          gzipBytes: gzipped.length,
        });
      }
    }
  }

  walk(dir);
  return results;
}

describe('Phase 30 — Performance Baseline: Bundle Size & Artifact Budgets', () => {
  afterAll(async () => {
    await cleanupAllProcesses();
  });

  it('verifies production build output bundle sizes conform to performance budgets', async () => {
    const { projectDir, cleanup } = await createTemporaryFixture('build-basic', root);

    try {
      const buildRes = await runCommand(process.execPath, [cliBin, 'build', '--clean'], {
        cwd: projectDir,
        env: cliEnv,
      });
      expect(buildRes.code).toBe(0);

      const staticDir = path.join(projectDir, '.ranu', 'build', 'static');
      const assets = getDirectoryAssetSizes(staticDir);

      // Verify that assets were generated
      expect(assets.length).toBeGreaterThan(0);

      let totalRawBytes = 0;
      let totalGzipBytes = 0;

      for (const asset of assets) {
        totalRawBytes += asset.rawBytes;
        totalGzipBytes += asset.gzipBytes;

        // Individual JS/CSS chunk budget: each chunk must be under 150KB gzip
        expect(asset.gzipBytes).toBeLessThan(150 * 1024);
      }

      // Total static client bundle budget: must be under 300KB gzip for a basic app
      const totalGzipKb = totalGzipBytes / 1024;
      const totalRawKb = totalRawBytes / 1024;

      expect(totalGzipKb).toBeLessThan(300);
      expect(totalRawKb).toBeLessThan(1000);
    } finally {
      await cleanup();
    }
  });

  it('audits client manifest and route metadata artifact sizes', async () => {
    const { projectDir, cleanup } = await createTemporaryFixture('build-basic', root);

    try {
      const buildRes = await runCommand(process.execPath, [cliBin, 'build'], {
        cwd: projectDir,
        env: cliEnv,
      });
      expect(buildRes.code).toBe(0);

      const manifestDir = path.join(projectDir, '.ranu', 'build', 'manifest');
      expect(fs.existsSync(manifestDir)).toBe(true);

      const manifestFiles = fs.readdirSync(manifestDir).filter((f) => f.endsWith('.json'));
      expect(manifestFiles.length).toBeGreaterThan(0);

      for (const mf of manifestFiles) {
        const fullPath = path.join(manifestDir, mf);
        const stats = fs.statSync(fullPath);
        // Metadata manifest JSON files should remain lightweight (< 100KB)
        expect(stats.size).toBeLessThan(100 * 1024);
      }
    } finally {
      await cleanup();
    }
  });

  it('validates monorepo core package distributions remain free of bloated unneeded artifacts', () => {
    const corePackages = ['core', 'router', 'runtime', 'runtime-node', 'react', 'build'];

    for (const pkg of corePackages) {
      const distDir = path.join(root, 'packages', pkg, 'dist');
      if (fs.existsSync(distDir)) {
        const files = fs.readdirSync(distDir);
        for (const file of files) {
          const filePath = path.join(distDir, file);
          const stat = fs.statSync(filePath);
          if (stat.isFile()) {
            // Single compiled library file should not exceed 5MB
            expect(stat.size).toBeLessThan(5 * 1024 * 1024);
          }
        }
      }
    }
  });
});
