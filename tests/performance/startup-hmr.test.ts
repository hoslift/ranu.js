import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterAll } from 'vitest';
import { createTemporaryFixture } from '../helpers/fixture.js';
import { runCommand, cleanupAllProcesses } from '../helpers/process.js';
import { runBenchmark } from '../helpers/benchmark.js';
import { createDevServer } from '@ranu/dev';
import { getAvailablePort, releasePort } from '../helpers/ports.js';
import { waitForHttpReady, fetchText } from '../helpers/http.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');
const cliBin = path.join(root, 'packages/cli/dist/bin/ranu.js');
const cliEnv = { ...process.env, NODE_ENV: 'production' };

describe('Phase 30 — Performance Baseline: Dev Startup & HMR Benchmarks', () => {
  afterAll(async () => {
    await cleanupAllProcesses();
  });

  it('measures CLI cold invocation latency for --version and --help', async () => {
    const versionSummary = await runBenchmark(
      'cli-cold-version-startup',
      'core',
      async () => {
        const res = await runCommand(process.execPath, [cliBin, '--version'], { env: cliEnv });
        if (res.code !== 0) throw new Error(`CLI version command failed: ${res.stderr}`);
      },
      { iterations: 3, warmupIterations: 1 },
    );

    expect(versionSummary.name).toBe('cli-cold-version-startup');
    expect(versionSummary.iterations).toBe(3);
    expect(versionSummary.medianMs).toBeGreaterThan(0);
    // Cold CLI invocation should complete within reasonable bounds (< 3000ms)
    expect(versionSummary.medianMs).toBeLessThan(3000);

    const helpSummary = await runBenchmark(
      'cli-cold-help-startup',
      'core',
      async () => {
        const res = await runCommand(process.execPath, [cliBin, '--help'], { env: cliEnv });
        if (res.code !== 0) throw new Error(`CLI help command failed: ${res.stderr}`);
      },
      { iterations: 3, warmupIterations: 1 },
    );

    expect(helpSummary.medianMs).toBeGreaterThan(0);
    expect(helpSummary.medianMs).toBeLessThan(3000);
  });

  it('measures dev server startup latency and warm restart latency', async () => {
    const { projectDir, cleanup } = await createTemporaryFixture('build-basic', root);
    const port = await getAvailablePort();

    try {
      // 1. Cold Dev Server Startup
      const coldStart = performance.now();
      const devServer = createDevServer({
        projectRoot: projectDir,
        watch: false,
      });

      const address = await devServer.start(port, '127.0.0.1');
      const coldDurationMs = performance.now() - coldStart;

      expect(address.url).toBe(`http://127.0.0.1:${port}`);
      await waitForHttpReady(address.url, { timeoutMs: 10000 });

      const res = await fetchText(address.url);
      expect(res.status).toBe(200);
      expect(coldDurationMs).toBeGreaterThan(0);

      await devServer.close();

      // 2. Warm Dev Server Startup (on same project directory with existing .ranu/dev)
      const warmPort = await getAvailablePort();
      try {
        const warmStart = performance.now();
        const warmServer = createDevServer({
          projectRoot: projectDir,
          watch: false,
        });

        const warmAddr = await warmServer.start(warmPort, '127.0.0.1');
        const warmDurationMs = performance.now() - warmStart;

        expect(warmAddr.url).toBe(`http://127.0.0.1:${warmPort}`);
        await waitForHttpReady(warmAddr.url, { timeoutMs: 10000 });

        const warmRes = await fetchText(warmAddr.url);
        expect(warmRes.status).toBe(200);
        expect(warmDurationMs).toBeGreaterThan(0);

        await warmServer.close();
      } finally {
        releasePort(warmPort);
      }
    } finally {
      releasePort(port);
      await cleanup();
    }
  });

  it('measures HMR rebuild and module invalidation latency on file change', async () => {
    const { projectDir, cleanup } = await createTemporaryFixture('build-basic', root);
    const port = await getAvailablePort();

    try {
      const devServer = createDevServer({
        projectRoot: projectDir,
        watch: false,
      });

      await devServer.start(port, '127.0.0.1');
      const targetPage = path.join(projectDir, 'app', 'page.tsx');

      const hmrSummary = await runBenchmark(
        'hmr-incremental-rebuild',
        'build-basic',
        async (iter) => {
          // Simulate an incremental edit
          const updatedContent = `export default function Page() { return <div>Benchmark Iteration ${iter}</div>; }`;
          fs.writeFileSync(targetPage, updatedContent, 'utf8');

          let completed = false;
          let timeoutHandle: NodeJS.Timeout | null = null;
          await new Promise<void>((resolve, reject) => {
            timeoutHandle = setTimeout(() => {
              if (!completed) {
                completed = true;
                reject(new Error('HMR rebuild timed out after 10000ms'));
              }
            }, 10000);

            devServer.coordinator.triggerRebuild('file-change', [
              {
                path: targetPage,
                type: 'change',
              },
            ]).then(() => {
              if (!completed) {
                completed = true;
                if (timeoutHandle) clearTimeout(timeoutHandle);
                resolve();
              }
            }).catch((err) => {
              if (!completed) {
                completed = true;
                if (timeoutHandle) clearTimeout(timeoutHandle);
                reject(err);
              }
            });
          });
        },
        { iterations: 3, warmupIterations: 1 },
      );

      expect(hmrSummary.name).toBe('hmr-incremental-rebuild');
      expect(hmrSummary.medianMs).toBeGreaterThan(0);
      expect(hmrSummary.medianMs).toBeLessThan(3000); // HMR rebuild should finish in under 3s
      expect(hmrSummary.p95Ms).toBeGreaterThan(0);

      await devServer.close();
    } finally {
      releasePort(port);
      await cleanup();
    }
  });
});
