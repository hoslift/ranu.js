import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDevServer } from '@ranu/dev';

describe('Integration: Phase 18 Development Server V0', () => {
  let tempDir: string;
  let devServer: ReturnType<typeof createDevServer> | null;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-dev-int-'));
    const appDir = path.join(tempDir, 'app');
    fs.mkdirSync(appDir, { recursive: true });

    fs.writeFileSync(
      path.join(appDir, 'layout.tsx'),
      `import React from 'react';
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html><head></head><body>{children}</body></html>;
}`
    );

    fs.writeFileSync(
      path.join(appDir, 'page.tsx'),
      `import React from 'react';
export default function HomePage() {
  return <h1>Initial Dev Version</h1>;
}`
    );
  });

  afterEach(async () => {
    try {
      await devServer?.close();
    } finally {
      devServer = null;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('runs dev server, handles edits, updates CSS modules and routes, survives errors, and shuts down', async () => {
    devServer = createDevServer({
      projectRoot: tempDir,
      port: 0,
      host: '127.0.0.1',
      watch: false,
    });

    const address = await devServer.start(0, '127.0.0.1');

    // 1. Initial page request
    const res1 = await fetch(`${address.url}/`);
    expect(res1.status).toBe(200);
    const html1 = await res1.text();
    expect(html1).toContain('Initial Dev Version');
    expect(html1).toContain('/_ranu/dev-client.js');

    // 2. Modify page content and trigger rebuild
    fs.writeFileSync(
      path.join(tempDir, 'app', 'page.tsx'),
      `import React from 'react';
export default function HomePage() {
  return <h1>Updated Dev Version</h1>;
}`
    );

    // Rebuild
    await devServer.rebuild('page update');

    const res2 = await fetch(`${address.url}/`);
    expect(res2.status).toBe(200);
    const html2 = await res2.text();
    expect(html2).toContain('Updated Dev Version');

    // 3. Add CSS Module to page
    fs.writeFileSync(
      path.join(tempDir, 'app', 'Home.module.css'),
      '.header { color: blue; }'
    );
    fs.writeFileSync(
      path.join(tempDir, 'app', 'page.tsx'),
      `import React from 'react';
import styles from './Home.module.css';
export default function HomePage() {
  return <h1 className={styles.header}>Styled Dev Version</h1>;
}`
    );

    await devServer.rebuild('css module update');

    const res3 = await fetch(`${address.url}/`);
    expect(res3.status).toBe(200);
    const html3 = await res3.text();
    expect(html3).toContain('Styled Dev Version');
    expect(html3).toMatch(/class="Home_header__[a-zA-Z0-9_-]{5}"/);
    expect(html3).toContain('<link rel="stylesheet"');

    // 4. Add new route
    const aboutDir = path.join(tempDir, 'app', 'about');
    fs.mkdirSync(aboutDir, { recursive: true });
    fs.writeFileSync(
      path.join(aboutDir, 'page.tsx'),
      `import React from 'react';
export default function AboutPage() {
  return <h1>About Us Dev</h1>;
}`
    );

    await devServer.rebuild('new route');

    const aboutRes = await fetch(`${address.url}/about`);
    expect(aboutRes.status).toBe(200);
    const aboutHtml = await aboutRes.text();
    expect(aboutHtml).toContain('About Us Dev');

  }, 120_000);

  it('keeps serving the last good build and reports diagnostics when a rebuild fails', async () => {
    devServer = createDevServer({
      projectRoot: tempDir,
      port: 0,
      host: '127.0.0.1',
      watch: false,
    });

    const address = await devServer.start(0, '127.0.0.1');

    const goodRes = await fetch(`${address.url}/`);
    expect(goodRes.status).toBe(200);
    expect(await goodRes.text()).toContain('Initial Dev Version');

    // Open an SSE connection before breaking the build so we can observe the
    // error broadcast.
    const sseRes = await fetch(`${address.url}/_ranu/dev-reload`);
    const reader = sseRes.body!.getReader();
    await reader.read(); // consume the initial "connected" event

    // Introduce a syntax error and trigger a rebuild.
    fs.writeFileSync(
      path.join(tempDir, 'app', 'page.tsx'),
      `import React from 'react';
export default function HomePage() {
  return <h1>Broken</h1>;
`
    );

    const failedState = await devServer.rebuild('broken edit');
    expect(failedState.success).toBe(false);
    expect(failedState.diagnostics.length).toBeGreaterThan(0);

    // The SSE channel should have broadcast a build-error event to connected
    // clients rather than a reload.
    const { value } = await reader.read();
    const errorChunk = new TextDecoder().decode(value);
    expect(errorChunk).toContain('event: build-error');
    await reader.cancel();

    // The previously-working runtime must still be serving the last good
    // build rather than crashing or showing the build-error page.
    const staleRes = await fetch(`${address.url}/`);
    expect(staleRes.status).toBe(200);
    expect(await staleRes.text()).toContain('Initial Dev Version');

    // Repairing the file should restore normal rebuilds.
    fs.writeFileSync(
      path.join(tempDir, 'app', 'page.tsx'),
      `import React from 'react';
export default function HomePage() {
  return <h1>Recovered Dev Version</h1>;
}`
    );
    const recoveredState = await devServer.rebuild('repaired edit');
    expect(recoveredState.success).toBe(true);

    const recoveredRes = await fetch(`${address.url}/`);
    expect(recoveredRes.status).toBe(200);
    expect(await recoveredRes.text()).toContain('Recovered Dev Version');

  }, 120_000);
});
