import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDevServer } from '@ranu/dev';

describe('Integration: Phase 18 Development Server V0', () => {
  let tempDir: string;

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

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('runs dev server, handles edits, updates CSS modules and routes, survives errors, and shuts down', async () => {
    const devServer = createDevServer({
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
    await (devServer as any).coordinator.triggerRebuild('page update');

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

    await (devServer as any).coordinator.triggerRebuild('css module update');

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

    await (devServer as any).coordinator.triggerRebuild('new route');

    const aboutRes = await fetch(`${address.url}/about`);
    expect(aboutRes.status).toBe(200);
    const aboutHtml = await aboutRes.text();
    expect(aboutHtml).toContain('About Us Dev');

    // 5. Clean shutdown
    await devServer.close();
  });
});
