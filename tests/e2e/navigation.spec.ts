import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { createTemporaryFixture } from '../helpers/fixture.js';
import { runCommand, cleanupAllProcesses } from '../helpers/process.js';
import { getAvailablePort, releasePort } from '../helpers/ports.js';
import { waitForHttpReady } from '../helpers/http.js';

const root = process.cwd();
const cliBin = path.join(root, 'packages/cli/dist/bin/ranu.js');
const cliEnv = { ...process.env, NODE_ENV: 'production' };

test.describe('Phase 4 — Browser E2E: Client Navigation & History Traversal', () => {
  let projectDir: string;
  let cleanupFixture: () => Promise<void>;
  let port: number;
  let serverPromise: Promise<any>;

  test.beforeAll(async () => {
    const fixture = await createTemporaryFixture('build-basic', root);
    projectDir = fixture.projectDir;
    cleanupFixture = fixture.cleanup;
    port = await getAvailablePort();

    // Setup multi-route navigation fixture with persistent layout
    const layoutPath = path.join(projectDir, 'app/layout.tsx');
    fs.writeFileSync(
      layoutPath,
      `import React from 'react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>Ranu Navigation E2E</title>
      </head>
      <body>
        <header id="persistent-layout-header" style={{ padding: '1rem', background: '#e2e8f0' }}>
          <nav>
            <a href="/" id="nav-home" style={{ marginRight: '1rem' }}>Home</a>
            <a href="/about" id="nav-about">About</a>
          </nav>
        </header>
        <div id="page-container" style={{ padding: '1rem' }}>
          {children}
        </div>
      </body>
    </html>
  );
}
`,
      'utf-8'
    );

    const homePagePath = path.join(projectDir, 'app/page.tsx');
    fs.writeFileSync(
      homePagePath,
      `import React from 'react';

export const render = 'server';

export default function HomePage() {
  return (
    <main>
      <h1 id="page-heading">Home Page</h1>
      <p id="page-description">Welcome to the home route</p>
      <a href="/about" id="link-to-about">Go to About Page</a>
    </main>
  );
}
`,
      'utf-8'
    );

    const aboutPagePath = path.join(projectDir, 'app/about/page.tsx');
    fs.writeFileSync(
      aboutPagePath,
      `import React from 'react';

export const render = 'server';

export default function AboutPage() {
  return (
    <main>
      <h1 id="page-heading">About Page</h1>
      <p id="page-description">Welcome to the about route</p>
      <a href="/" id="link-to-home">Back to Home Page</a>
    </main>
  );
}
`,
      'utf-8'
    );

    // Build project with production optimizations
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

  test('navigates from home to about route and updates document view', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${port}/`);

    // Verify initial home route
    const heading = page.locator('#page-heading');
    await expect(heading).toHaveText('Home Page');
    expect(page.url()).toBe(`http://127.0.0.1:${port}/`);

    // Click link to navigate to about
    await page.click('#link-to-about');

    // Wait for about content to render
    await expect(heading).toHaveText('About Page');
    expect(page.url()).toBe(`http://127.0.0.1:${port}/about`);
  });

  test('traverses browser history via goBack and goForward', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${port}/`);
    const heading = page.locator('#page-heading');
    await expect(heading).toHaveText('Home Page');

    // Navigate to /about
    await page.click('#link-to-about');
    await expect(heading).toHaveText('About Page');
    expect(page.url()).toBe(`http://127.0.0.1:${port}/about`);

    // Navigate back in history
    await page.goBack();
    await expect(heading).toHaveText('Home Page');
    expect(page.url()).toBe(`http://127.0.0.1:${port}/`);

    // Navigate forward in history
    await page.goForward();
    await expect(heading).toHaveText('About Page');
    expect(page.url()).toBe(`http://127.0.0.1:${port}/about`);
  });

  test('preserves nested root layout structure across page transitions', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${port}/`);

    // Verify persistent layout header exists
    const header = page.locator('#persistent-layout-header');
    await expect(header).toBeVisible();
    await expect(page.locator('#nav-home')).toBeVisible();
    await expect(page.locator('#nav-about')).toBeVisible();

    // Navigate to /about via navbar
    await page.click('#nav-about');
    await expect(page.locator('#page-heading')).toHaveText('About Page');

    // Verify layout header is still present on /about
    await expect(header).toBeVisible();
    await expect(page.locator('#nav-home')).toBeVisible();

    // Navigate back to home via navbar
    await page.click('#nav-home');
    await expect(page.locator('#page-heading')).toHaveText('Home Page');
    await expect(header).toBeVisible();
  });
});
