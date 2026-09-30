import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterAll } from 'vitest';
import { createTemporaryFixture } from '../helpers/fixture.js';
import { runCommand, cleanupAllProcesses } from '../helpers/process.js';
import { runBenchmark } from '../helpers/benchmark.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');
const cliBin = path.join(root, 'packages/cli/dist/bin/ranu.js');
const cliEnv = { ...process.env, NODE_ENV: 'production' };

describe('Phase 30 — Performance Baseline: Production Build & SSG Benchmarks', () => {
  afterAll(async () => {
    await cleanupAllProcesses();
  });

  it('measures repeatable cold production build duration and peak memory', async () => {
    const { projectDir, cleanup } = await createTemporaryFixture('build-basic', root);

    try {
      const summary = await runBenchmark(
        'cold-production-build',
        'build-basic',
        async () => {
          const res = await runCommand(process.execPath, [cliBin, 'build', '--clean'], {
            cwd: projectDir,
            env: cliEnv,
          });
          if (res.code !== 0) throw new Error(`Build failed: ${res.stderr}\n${res.stdout}`);
        },
        { iterations: 3, warmupIterations: 1 },
      );

      expect(summary.name).toBe('cold-production-build');
      expect(summary.iterations).toBe(3);
      expect(summary.medianMs).toBeGreaterThan(0);
      expect(summary.medianMs).toBeLessThan(15000); // Production build should complete < 15s
      expect(summary.p95Ms).toBeGreaterThan(0);
      expect(summary.varianceMs).toBeGreaterThanOrEqual(0);
      expect(summary.metadata.nodeVersion).toBe(process.version);
    } finally {
      await cleanup();
    }
  });

  it('measures warm build duration without --clean flag', async () => {
    const { projectDir, cleanup } = await createTemporaryFixture('build-basic', root);

    try {
      // Warm up initial build first
      const initialBuild = await runCommand(process.execPath, [cliBin, 'build', '--clean'], {
        cwd: projectDir,
        env: cliEnv,
      });
      expect(initialBuild.code).toBe(0);

      const warmSummary = await runBenchmark(
        'warm-production-build',
        'build-basic',
        async () => {
          const res = await runCommand(process.execPath, [cliBin, 'build'], {
            cwd: projectDir,
            env: cliEnv,
          });
          if (res.code !== 0) throw new Error(`Warm build failed: ${res.stderr}\n${res.stdout}`);
        },
        { iterations: 3, warmupIterations: 1 },
      );

      expect(warmSummary.name).toBe('warm-production-build');
      expect(warmSummary.medianMs).toBeGreaterThan(0);
      expect(warmSummary.medianMs).toBeLessThan(12000);
    } finally {
      await cleanup();
    }
  });

  it('measures static site generation (SSG) page pre-rendering throughput', async () => {
    const { projectDir, cleanup } = await createTemporaryFixture('build-basic', root);

    try {
      // Add additional static pages to measure throughput across multiple pages
      const pagesToCreate = ['blog', 'docs', 'pricing', 'features', 'contact'];
      for (const p of pagesToCreate) {
        const pageDir = path.join(projectDir, 'app', p);
        fs.mkdirSync(pageDir, { recursive: true });
        fs.writeFileSync(
          path.join(pageDir, 'page.tsx'),
          `export default function ${p.toUpperCase()}Page() { return <div><h1>${p} Page</h1><p>Static content for ${p}</p></div>; }`,
          'utf8',
        );
      }

      const startTime = performance.now();
      const res = await runCommand(process.execPath, [cliBin, 'build', '--clean'], {
        cwd: projectDir,
        env: cliEnv,
      });
      const totalBuildMs = performance.now() - startTime;

      expect(res.code).toBe(0);

      // Verify build output artifacts were generated
      const manifestDir = path.join(projectDir, '.ranu', 'build', 'manifest');
      expect(fs.existsSync(manifestDir)).toBe(true);
      const staticDir = path.join(projectDir, '.ranu', 'build', 'static');
      expect(fs.existsSync(staticDir)).toBe(true);

      const totalPages = pagesToCreate.length + 1; // + index page
      const ssgThroughputPagesPerSec = (totalPages / (totalBuildMs / 1000));

      expect(ssgThroughputPagesPerSec).toBeGreaterThan(0);
      expect(totalBuildMs).toBeLessThan(20000);
    } finally {
      await cleanup();
    }
  });
});
