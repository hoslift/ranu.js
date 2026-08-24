import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDevServer } from '@ranu/dev';

describe('Integration: Phase 19 HMR & React Fast Refresh', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-hmr-int-'));
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
      `import React, { useState } from 'react';
export default function CounterPage() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <h1 id="title">Counter App</h1>
      <button id="btn" onClick={() => setCount(count + 1)}>Count: {count}</button>
    </div>
  );
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

  it('connects to SSE HMR channel, broadcasts JS and CSS hot updates, recovers from errors, and falls back to reload', async () => {
    const devServer = createDevServer({
      projectRoot: tempDir,
      port: 0,
      host: '127.0.0.1',
      watch: false,
    });

    const address = await devServer.start(0, '127.0.0.1');

    // 1. Initial page fetch
    const pageRes = await fetch(`${address.url}/`);
    expect(pageRes.status).toBe(200);
    const html = await pageRes.text();
    expect(html).toContain('Counter App');
    expect(html).toContain('/_ranu/dev-client.js');

    // 2. Mock SSE Client Connection
    const receivedEvents: Array<{ event: string; data: any }> = [];
    const mockRes: any = {
      writeHead: () => {},
      write: (chunk: string) => {
        const lines = chunk.split('\n');
        let currentEvent = 'message';
        let currentData = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice('event: '.length).trim();
          } else if (line.startsWith('data: ')) {
            currentData = line.slice('data: '.length).trim();
          }
        }
        if (currentData) {
          try {
            receivedEvents.push({ event: currentEvent, data: JSON.parse(currentData) });
          } catch {
            receivedEvents.push({ event: currentEvent, data: currentData });
          }
        }
      },
      flushHeaders: () => {},
      on: () => {},
      end: () => {},
    };

    devServer.reloadChannel.handleConnection({} as any, mockRes, 'dev-build-1', 1);
    expect(receivedEvents[0].event).toBe('connected');
    expect(receivedEvents[0].data.generation).toBe(1);

    // 3. Edit React component -> triggers JS HMR update
    fs.writeFileSync(
      path.join(tempDir, 'app', 'page.tsx'),
      `import React, { useState } from 'react';
export default function CounterPage() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <h1 id="title">Updated Counter App</h1>
      <button id="btn" onClick={() => setCount(count + 1)}>Count: {count}</button>
    </div>
  );
}`
    );

    await devServer.coordinator.triggerRebuild('component edit', [
      {
        type: 'change',
        relativePath: 'app/page.tsx',
        fullPath: path.join(tempDir, 'app', 'page.tsx'),
        category: 'other',
      },
    ]);

    const updateEvent = receivedEvents.find((e) => e.event === 'update');
    expect(updateEvent).toBeDefined();
    expect(updateEvent?.data.updates[0].type).toBe('js');
    expect(updateEvent?.data.updates[0].isReactRefresh).toBe(true);

    // 4. Add & edit CSS module -> triggers CSS HMR update
    fs.writeFileSync(
      path.join(tempDir, 'app', 'Counter.module.css'),
      '.title { color: purple; }'
    );

    await devServer.coordinator.triggerRebuild('css edit', [
      {
        type: 'change',
        relativePath: 'app/Counter.module.css',
        fullPath: path.join(tempDir, 'app', 'Counter.module.css'),
        category: 'css',
      },
    ]);

    const cssUpdate = receivedEvents.filter((e) => e.event === 'update')[1];
    expect(cssUpdate).toBeDefined();
    expect(cssUpdate?.data.updates[0].type).toBe('css');
    expect(cssUpdate?.data.updates[0].isModule).toBe(true);

    // 5. Syntax error -> broadcasts error, dev process survives
    fs.writeFileSync(
      path.join(tempDir, 'app', 'page.tsx'),
      `import React from 'react';
export default function CounterPage() {
  return <div>Unterminated tag;
}`
    );

    await devServer.coordinator.triggerRebuild('syntax error', [
      {
        type: 'change',
        relativePath: 'app/page.tsx',
        fullPath: path.join(tempDir, 'app', 'page.tsx'),
        category: 'other',
      },
    ]);

    const errorEvent = receivedEvents.find((e) => e.event === 'error');
    expect(errorEvent).toBeDefined();

    // 6. Fix syntax error -> broadcasts recovered
    fs.writeFileSync(
      path.join(tempDir, 'app', 'page.tsx'),
      `import React from 'react';
export default function CounterPage() {
  return <div>Fixed App</div>;
}`
    );

    await devServer.coordinator.triggerRebuild('fix error', [
      {
        type: 'change',
        relativePath: 'app/page.tsx',
        fullPath: path.join(tempDir, 'app', 'page.tsx'),
        category: 'other',
      },
    ]);

    const recoveredEvent = receivedEvents.find((e) => e.event === 'recovered');
    expect(recoveredEvent).toBeDefined();

    // 7. Route structural addition -> falls back to full reload
    const blogDir = path.join(tempDir, 'app', 'blog');
    fs.mkdirSync(blogDir, { recursive: true });
    fs.writeFileSync(
      path.join(blogDir, 'page.tsx'),
      `import React from 'react';
export default function BlogPage() {
  return <h1>Blog</h1>;
}`
    );

    await devServer.coordinator.triggerRebuild('new route', [
      {
        type: 'add',
        relativePath: 'app/blog/page.tsx',
        fullPath: path.join(blogDir, 'page.tsx'),
        category: 'route',
      },
    ]);

    const reloadEvent = receivedEvents.find((e) => e.event === 'reload');
    expect(reloadEvent).toBeDefined();

    // 8. Graceful shutdown
    await devServer.close();
  });
});
