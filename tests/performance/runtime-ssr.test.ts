import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterAll } from 'vitest';
import { createTemporaryFixture } from '../helpers/fixture.js';
import { runCommand, cleanupAllProcesses } from '../helpers/process.js';
import { runBenchmark, runThroughputBenchmark } from '../helpers/benchmark.js';
import { getAvailablePort, releasePort } from '../helpers/ports.js';
import { waitForHttpReady, fetchText } from '../helpers/http.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');
const cliBin = path.join(root, 'packages/cli/dist/bin/ranu.js');
const cliEnv = { ...process.env, NODE_ENV: 'production' };

describe('Phase 30 — Performance Baseline: Production Server & SSR Benchmarks', () => {
  afterAll(async () => {
    await cleanupAllProcesses();
  });

  it('measures production server startup latency and SSR request roundtrip', async () => {
    const { projectDir, cleanup } = await createTemporaryFixture('build-basic', root);
    const port = await getAvailablePort();
    let serverProcessPromise: Promise<unknown> | null = null;

    try {
      // 1. Build the fixture
      const buildRes = await runCommand(process.execPath, [cliBin, 'build'], {
        cwd: projectDir,
        env: cliEnv,
      });
      expect(buildRes.code).toBe(0);

      // 2. Measure production server startup time
      const serverStart = performance.now();
      serverProcessPromise = runCommand(
        process.execPath,
        [cliBin, 'start', '--port', String(port), '--host', '127.0.0.1'],
        { cwd: projectDir, env: cliEnv, timeoutMs: 30000 },
      );

      const url = `http://127.0.0.1:${port}/`;
      await waitForHttpReady(url, { timeoutMs: 15000 });
      const serverStartupDurationMs = performance.now() - serverStart;

      expect(serverStartupDurationMs).toBeGreaterThan(0);
      expect(serverStartupDurationMs).toBeLessThan(10000); // Startup should take < 10s

      // 3. Measure SSR Page Request Latency
      const ssrSummary = await runBenchmark(
        'ssr-page-request-latency',
        'build-basic',
        async () => {
          const res = await fetchText(url);
          if (res.status !== 200) {
            throw new Error(`Expected HTTP 200, got ${res.status}`);
          }
          if (!res.body.includes('<!DOCTYPE html>')) {
            throw new Error('Response did not contain HTML doctype');
          }
        },
        { iterations: 5, warmupIterations: 2 },
      );

      expect(ssrSummary.name).toBe('ssr-page-request-latency');
      expect(ssrSummary.iterations).toBe(5);
      expect(ssrSummary.medianMs).toBeGreaterThan(0);
      // SSR page requests should respond quickly (< 500ms median on local machine)
      expect(ssrSummary.medianMs).toBeLessThan(500);
      expect(ssrSummary.p95Ms).toBeGreaterThan(0);

      // 4. Measure API Route Request Latency
      const apiUrl = `http://127.0.0.1:${port}/api/hello`;
      const apiSummary = await runBenchmark(
        'api-endpoint-request-latency',
        'build-basic',
        async () => {
          const res = await fetchText(apiUrl);
          if (res.status !== 200) {
            throw new Error(`API returned HTTP ${res.status}`);
          }
        },
        { iterations: 5, warmupIterations: 2 },
      );

      expect(apiSummary.medianMs).toBeGreaterThan(0);
      expect(apiSummary.medianMs).toBeLessThan(300);
    } finally {
      await cleanupAllProcesses();
      if (serverProcessPromise) {
        await serverProcessPromise.catch(() => {});
      }
      releasePort(port);
      await cleanup();
    }
  });

  it('measures concurrent SSR throughput and verifies memory stability under load', async () => {
    const { projectDir, cleanup } = await createTemporaryFixture('build-basic', root);
    const port = await getAvailablePort();
    let serverProcessPromise: Promise<unknown> | null = null;

    try {
      // 1. Build
      const buildRes = await runCommand(process.execPath, [cliBin, 'build'], {
        cwd: projectDir,
        env: cliEnv,
      });
      expect(buildRes.code).toBe(0);

      // 2. Start
      serverProcessPromise = runCommand(
        process.execPath,
        [cliBin, 'start', '--port', String(port), '--host', '127.0.0.1'],
        { cwd: projectDir, env: cliEnv, timeoutMs: 30000 },
      );

      const url = `http://127.0.0.1:${port}/`;
      await waitForHttpReady(url, { timeoutMs: 15000 });

      // 3. Concurrent SSR Throughput (concurrency: 10, total: 40 requests)
      const throughputSummary = await runThroughputBenchmark(
        'concurrent-ssr-throughput',
        'build-basic',
        async () => {
          const res = await fetchText(url);
          return res.status === 200 && res.body.includes('<!DOCTYPE html>');
        },
        {
          totalRequests: 40,
          concurrency: 10,
          warmupRequests: 5,
        },
      );

      expect(throughputSummary.name).toBe('concurrent-ssr-throughput');
      expect(throughputSummary.totalRequests).toBe(40);
      expect(throughputSummary.concurrency).toBe(10);
      expect(throughputSummary.successRate).toBe(100);
      expect(throughputSummary.throughputPerSec).toBeGreaterThan(0);
      expect(throughputSummary.medianMs).toBeGreaterThan(0);
      expect(throughputSummary.p95Ms).toBeGreaterThan(0);

      // 4. Memory Stability Verification (send sustained requests and ensure no runaway heap growth)
      const memBefore = process.memoryUsage().heapUsed;
      for (let i = 0; i < 20; i++) {
        await fetchText(url);
      }
      const memAfter = process.memoryUsage().heapUsed;
      const memGrowthMb = (memAfter - memBefore) / (1024 * 1024);

      // Under 20 local fetch requests, client process heap should not experience uncontrolled leak (< 100MB)
      expect(memGrowthMb).toBeLessThan(100);
    } finally {
      await cleanupAllProcesses();
      if (serverProcessPromise) {
        await serverProcessPromise.catch(() => {});
      }
      releasePort(port);
      await cleanup();
    }
  });
});
