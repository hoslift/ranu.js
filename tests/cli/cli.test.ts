import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterAll } from 'vitest';
import { runCommand, cleanupAllProcesses, type SpawnManagedOptions } from '../helpers/process.js';
import { createTemporaryFixture } from '../helpers/fixture.js';
import { getAvailablePort, releasePort } from '../helpers/ports.js';
import { waitForHttpReady, fetchText } from '../helpers/http.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../..');
const cliBin = path.join(root, 'packages/cli/dist/bin/ranu.js');

// Strip NODE_ENV=test so the bin entry-point guard doesn't suppress execution
const cliEnv = { ...process.env, NODE_ENV: 'production' };

function runCli(args: string[], opts: SpawnManagedOptions = {}) {
  return runCommand(process.execPath, [cliBin, ...args], { env: cliEnv, ...opts });
}

describe('Phase 28 — CLI E2E Subprocess Execution', () => {
  afterAll(async () => {
    await cleanupAllProcesses();
  });

  it('prints help information and exits with code 0', async () => {
    const res = await runCli(['--help']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Ranu.js');
    expect(res.stdout).toContain('Usage:');
    expect(res.stdout).toContain('Commands:');
  });

  it('prints version information and exits with code 0', async () => {
    const res = await runCli(['--version']);
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/Ranu\.js v\d+\.\d+\.\d+/);
  });

  it('fails gracefully with exit code 1 on unknown commands', async () => {
    const res = await runCli(['non-existent-cmd']);
    expect(res.code).toBe(1);
    expect(res.stderr + res.stdout).toContain('Unknown command');
  });

  it('discovers project root from nested subdirectory and builds successfully', async () => {
    const { projectDir, cleanup } = await createTemporaryFixture('build-basic', root);
    try {
      const nestedDir = path.join(projectDir, 'app', 'about');
      const res = await runCli(['build'], { cwd: nestedDir });
      expect(res.code).toBe(0);
      expect(res.stdout).toContain('Ranu.js production build completed');
    } finally {
      await cleanup();
    }
  });

  it('outputs valid machine-readable JSON when --json flag is provided to build', async () => {
    const { projectDir, cleanup } = await createTemporaryFixture('build-basic', root);
    try {
      const res = await runCli(['build', '--json'], { cwd: projectDir });
      expect(res.code).toBe(0);
      const json = JSON.parse(res.stdout.trim());
      expect(json.success).toBe(true);
      expect(json.buildId).toBeDefined();
      expect(json.outDir).toBeDefined();
    } finally {
      await cleanup();
    }
  });

  it('executes production build and runs start server serving responses', async () => {
    const { projectDir, cleanup } = await createTemporaryFixture('build-basic', root);
    const port = await getAvailablePort();

    try {
      // 1. Build
      const buildRes = await runCli(['build'], { cwd: projectDir });
      expect(buildRes.code).toBe(0);

      // 2. Start subprocess
      const startPromise = runCli(
        ['start', '--port', String(port), '--host', '127.0.0.1'],
        { cwd: projectDir, timeoutMs: 15000 },
      );

      const url = `http://127.0.0.1:${port}/`;
      await waitForHttpReady(url, { timeoutMs: 10000 });

      const pageRes = await fetchText(url);
      expect(pageRes.status).toBe(200);
      expect(pageRes.body).toContain('<!DOCTYPE html>');

      await cleanupAllProcesses();
      await startPromise.catch(() => {});
    } finally {
      releasePort(port);
      await cleanup();
    }
  });
});
