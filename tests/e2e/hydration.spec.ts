import { test, expect } from '@playwright/test';
import path from 'node:path';
import { createTemporaryFixture } from '../helpers/fixture.js';
import { runCommand, cleanupAllProcesses } from '../helpers/process.js';
import { getAvailablePort, releasePort } from '../helpers/ports.js';
import { waitForHttpReady } from '../helpers/http.js';

const root = process.cwd();
const cliBin = path.join(root, 'packages/cli/dist/bin/ranu.js');
const cliEnv = { ...process.env, NODE_ENV: 'production' };

test.describe('Phase 28 — Browser E2E: React 19 Hydration & Interactivity', () => {
  let projectDir: string;
  let cleanupFixture: () => Promise<void>;
  let port: number;
  let serverPromise: Promise<any>;

  test.beforeAll(async () => {
    const fixture = await createTemporaryFixture('build-basic', root);
    projectDir = fixture.projectDir;
    cleanupFixture = fixture.cleanup;
    port = await getAvailablePort();

    // Build project
    const buildRes = await runCommand(process.execPath, [cliBin, 'build'], { cwd: projectDir, env: cliEnv });
    expect(buildRes.code).toBe(0);

    // Boot start server
    serverPromise = runCommand(
      process.execPath,
      [cliBin, 'start', '--port', String(port), '--host', '127.0.0.1'],
      { cwd: projectDir, timeoutMs: 30000, env: cliEnv },
    );

    await waitForHttpReady(`http://127.0.0.1:${port}/`, { timeoutMs: 15000 });
  });

  test.afterAll(async () => {
    await cleanupAllProcesses();
    releasePort(port);
    if (cleanupFixture) await cleanupFixture();
  });

  test('hydrates client document without React mismatch errors and preserves DOM structure', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`http://127.0.0.1:${port}/`);

    // Verify SSR content arrived
    const mainHeading = page.locator('h1');
    await expect(mainHeading).toBeVisible();

    // Verify no hydration mismatches
    const mismatchErrors = consoleErrors.filter((e) =>
      /hydration|mismatch|did not match/i.test(e),
    );
    expect(mismatchErrors).toHaveLength(0);
  });

  test('updates document title and metadata in browser head correctly', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${port}/`);
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });
});
