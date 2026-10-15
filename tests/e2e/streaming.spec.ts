import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { createTemporaryFixture } from '../helpers/fixture.js';
import { runCommand, cleanupAllProcesses } from '../helpers/process.js';
import { getAvailablePort, releasePort } from '../helpers/ports.js';
import { waitForHttpReady } from '../helpers/http.js';

const root = process.cwd();
const cliBin = path.join(root, 'packages/cli/dist/bin/ranu.js');
const cliEnv = { ...process.env, NODE_ENV: 'production' };

test.describe('Phase 4 — Browser E2E: React 19 Suspense Streaming & TTFB', () => {
  let projectDir: string;
  let cleanupFixture: () => Promise<void>;
  let port: number;
  let serverPromise: Promise<any>;

  test.beforeAll(async () => {
    const fixture = await createTemporaryFixture('build-basic', root);
    projectDir = fixture.projectDir;
    cleanupFixture = fixture.cleanup;
    port = await getAvailablePort();

    // Create Suspense streaming page
    const layoutPath = path.join(projectDir, 'app/layout.tsx');
    fs.writeFileSync(
      layoutPath,
      `import React from 'react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>Streaming E2E</title>
      </head>
      <body>{children}</body>
    </html>
  );
}
`,
      'utf-8'
    );

    const streamPagePath = path.join(projectDir, 'app/page.tsx');
    fs.writeFileSync(
      streamPagePath,
      `import React, { Suspense } from 'react';

export const render = 'server';

async function DeferredStreamData() {
  await new Promise((resolve) => setTimeout(resolve, 60));
  return (
    <div id="deferred-content" style={{ padding: '1rem', background: '#dcfce7', marginTop: '1rem' }}>
      <h2 id="deferred-heading">Deferred Streamed Content</h2>
      <p id="streamed-payload">Payload resolved after async boundary</p>
    </div>
  );
}

export default function StreamingPage() {
  return (
    <main style={{ padding: '2rem' }}>
      <h1 id="stream-heading">React 19 Suspense Streaming</h1>
      <p id="initial-shell-content">Initial document shell delivered immediately</p>
      <Suspense fallback={<div id="streaming-skeleton">Loading deferred data...</div>}>
        <DeferredStreamData />
      </Suspense>
    </main>
  );
}
`,
      'utf-8'
    );

    // Build project
    const buildRes = await runCommand(process.execPath, [cliBin, 'build'], {
      cwd: projectDir,
      env: cliEnv,
    });
    expect(buildRes.code).toBe(0);

    // Boot start server
    serverPromise = runCommand(
      process.execPath,
      [cliBin, 'start', '--port', String(port), '--host', '127.0.0.1'],
      { cwd: projectDir, timeoutMs: 30000, env: cliEnv }
    );

    await waitForHttpReady(`http://127.0.0.1:${port}/`, { timeoutMs: 15000 });
  });

  test.afterAll(async () => {
    await cleanupAllProcesses();
    releasePort(port);
    if (cleanupFixture) await cleanupFixture();
  });

  test('validates HTTP chunked transfer encoding and measures low TTFB response', async () => {
    const startTime = Date.now();

    const { statusCode, headers, ttfb, fullBody } = await new Promise<{
      statusCode: number;
      headers: http.IncomingHttpHeaders;
      ttfb: number;
      fullBody: string;
    }>((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
        let firstChunkTime = 0;
        let body = '';

        res.on('data', (chunk) => {
          if (!firstChunkTime) {
            firstChunkTime = Date.now();
          }
          body += chunk.toString('utf8');
        });

        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            ttfb: (firstChunkTime || Date.now()) - startTime,
            fullBody: body,
          });
        });
      });

      req.on('error', reject);
    });

    expect(statusCode).toBe(200);
    // Verify HTTP chunked streaming
    expect(headers['transfer-encoding']).toBe('chunked');
    // Verify fast TTFB delivery of initial chunk
    expect(ttfb).toBeLessThan(1000);
    // Verify shell and deferred payload both arrived
    expect(fullBody).toContain('React 19 Suspense Streaming');
    expect(fullBody).toContain('Payload resolved after async boundary');
  });

  test('progressively renders initial shell followed by resolved deferred Suspense chunk', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`http://127.0.0.1:${port}/`);

    // Verify initial shell rendered immediately
    const heading = page.locator('#stream-heading');
    await expect(heading).toHaveText('React 19 Suspense Streaming');
    await expect(page.locator('#initial-shell-content')).toBeVisible();

    // Verify deferred content resolves and hydrates properly
    const deferred = page.locator('#deferred-content');
    await expect(deferred).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#streamed-payload')).toHaveText('Payload resolved after async boundary');

    // Verify zero hydration mismatch errors occurred during stream resolution
    const mismatchErrors = consoleErrors.filter((e) =>
      /hydration|mismatch|did not match/i.test(e)
    );
    expect(mismatchErrors).toHaveLength(0);
  });
});
