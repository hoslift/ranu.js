import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterAll } from 'vitest';
import { createTemporaryFixture } from '../helpers/fixture.js';
import { runCommand, cleanupAllProcesses } from '../helpers/process.js';
import { runBenchmark } from '../helpers/benchmark.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');
const cliBin = path.join(root, 'packages/cli/dist/bin/ranu.js');

describe('Phase 28 — Performance Benchmark Infrastructure Harness', () => {
  afterAll(async () => {
    await cleanupAllProcesses();
  });

  it('measures repeatable build timing and outputs structured metrics with median and variance', async () => {
    const { projectDir, cleanup } = await createTemporaryFixture('build-basic', root);

    try {
      const summary = await runBenchmark(
        'build-basic-timing',
        'build-basic',
        async () => {
          const res = await runCommand(process.execPath, [cliBin, 'build'], { cwd: projectDir });
          if (res.code !== 0) throw new Error(`Build failed: ${res.stderr}`);
        },
        { iterations: 3, warmupIterations: 1 },
      );

      expect(summary.name).toBe('build-basic-timing');
      expect(summary.iterations).toBe(3);
      expect(summary.medianMs).toBeGreaterThan(0);
      expect(summary.varianceMs).toBeGreaterThanOrEqual(0);
      expect(summary.stdDevMs).toBeGreaterThanOrEqual(0);
      expect(summary.metadata.nodeVersion).toBe(process.version);
      expect(summary.metadata.platform).toBe(process.platform);
    } finally {
      await cleanup();
    }
  });
});
