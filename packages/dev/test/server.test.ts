import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDevServer } from '../src/server.js';

describe('DevServer HTTP Server and Lifecycle', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-dev-server-'));
    const appDir = path.join(tempDir, 'app');
    const publicDir = path.join(tempDir, 'public');
    fs.mkdirSync(appDir, { recursive: true });
    fs.mkdirSync(publicDir, { recursive: true });

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
  return <h1>Dev Server Works</h1>;
}`
    );

    fs.writeFileSync(path.join(publicDir, 'favicon.ico'), 'fake-favicon');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('starts dev server, serves HTML with injected dev client, serves public assets, and shuts down cleanly', async () => {
    const devServer = createDevServer({
      projectRoot: tempDir,
      port: 0, // Ephemeral port
      host: '127.0.0.1',
      watch: false,
    });

    const address = await devServer.start(0, '127.0.0.1');
    expect(address.port).toBeGreaterThan(0);
    expect(address.url).toContain(`http://127.0.0.1:${address.port}`);

    // 1. Fetch homepage
    const pageRes = await fetch(`${address.url}/`);
    expect(pageRes.status).toBe(200);
    const pageHtml = await pageRes.text();
    expect(pageHtml).toContain('Dev Server Works');
    expect(pageHtml).toContain('/_ranu/dev-client.js');

    // 2. Fetch dev client script
    const clientRes = await fetch(`${address.url}/_ranu/dev-client.js`);
    expect(clientRes.status).toBe(200);
    const clientScript = await clientRes.text();
    expect(clientScript).toContain('/_ranu/dev-reload');

    // 3. Fetch public asset
    const publicRes = await fetch(`${address.url}/favicon.ico`);
    expect(publicRes.status).toBe(200);

    // 4. Fetch non-existent path
    const notFoundRes = await fetch(`${address.url}/missing-path-12345`);
    expect(notFoundRes.status).toBe(404);

    // 5. Clean shutdown
    await devServer.close();
  });
});
