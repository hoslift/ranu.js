import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { build } from '@ranu/build';
import { createProductionServer } from '@ranu/runtime-node';

describe('Integration: Phase 24 Generic Node.js Production Path', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-node-prod-int-'));
    const appDir = path.join(tempDir, 'app');
    const apiDir = path.join(appDir, 'api', 'greet');
    const docsDir = path.join(appDir, 'docs');
    const publicDir = path.join(tempDir, 'public');

    fs.mkdirSync(appDir, { recursive: true });
    fs.mkdirSync(apiDir, { recursive: true });
    fs.mkdirSync(docsDir, { recursive: true });
    fs.mkdirSync(publicDir, { recursive: true });

    // 1. Root Layout
    fs.writeFileSync(
      path.join(appDir, 'layout.tsx'),
      `import React from 'react';
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head><title>Production App</title></head>
      <body>
        <nav>Navbar</nav>
        {children}
      </body>
    </html>
  );
}`,
    );

    // 2. SSR Home Page
    fs.writeFileSync(
      path.join(appDir, 'page.tsx'),
      `import React from 'react';
import { getRequestContext } from '@ranu/server';

export default function HomePage() {
  const ctx = getRequestContext();
  const user = ctx.locals.get('auth_user') ?? 'anonymous';
  return (
    <main>
      <h1>Production Home Page</h1>
      <p id="user-display">User: {String(user)}</p>
    </main>
  );
}`,
    );

    // 3. Static Pre-rendered Page
    fs.writeFileSync(
      path.join(docsDir, 'page.tsx'),
      `import React from 'react';
export const render = 'static';

export default function DocsPage() {
  return <h1>Documentation Overview</h1>;
}`,
    );

    // 4. API Route
    fs.writeFileSync(
      path.join(apiDir, 'route.ts'),
      `export async function GET(req: Request) {
  return Response.json({ message: 'Hello from production API!' });
}

export async function POST(req: Request) {
  const body = await req.json();
  return Response.json({ received: body }, { status: 201 });
}`,
    );

    // 5. Middleware
    fs.writeFileSync(
      path.join(tempDir, 'middleware.ts'),
      `export default async function middleware(req: Request, ctx: any) {
  ctx.locals.set('auth_user', 'prod_authenticated_user');
  return {
    type: 'next',
    headers: {
      'x-ranu-prod': 'active',
    },
  };
}`,
    );

    // 6. Public Static Asset
    fs.writeFileSync(path.join(publicDir, 'robots.txt'), 'User-agent: *\nDisallow: /admin');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('builds and executes the full Node.js production server lifecycle', async () => {
    // 1. Execute Production Build
    const buildResult = await build({
      projectRoot: tempDir,
      sourceMaps: false,
    });

    expect(buildResult.success).toBe(true);
    expect(buildResult.diagnostics.filter((d: any) => d.severity === 'error')).toEqual([]);

    const buildDir = path.join(tempDir, '.ranu', 'build');
    expect(fs.existsSync(path.join(buildDir, 'build.json'))).toBe(true);
    expect(fs.existsSync(path.join(buildDir, 'server', 'entry.mjs'))).toBe(true);

    // 2. Start Production Server
    const server = await createProductionServer({
      projectRoot: tempDir,
      buildDir,
      port: 0,
      host: '127.0.0.1',
    });

    const addr = await server.listen();
    expect(addr.port).toBeGreaterThan(0);

    try {
      const baseUrl = `http://127.0.0.1:${addr.port}`;

      // Test 2a: SSR Page with Layout & Middleware
      const homeRes = await fetch(`${baseUrl}/`);
      expect(homeRes.status).toBe(200);
      expect(homeRes.headers.get('x-ranu-prod')).toBe('active');
      const homeHtml = await homeRes.text();
      expect(homeHtml).toContain('Production Home Page');
      expect(homeHtml).toContain('Navbar');
      expect(homeHtml).toContain('prod_authenticated_user');

      // Test 2b: Static SSG Page
      const docsRes = await fetch(`${baseUrl}/docs`);
      expect(docsRes.status).toBe(200);
      const docsHtml = await docsRes.text();
      expect(docsHtml).toContain('Documentation Overview');

      // Test 2c: API Route GET
      const apiGetRes = await fetch(`${baseUrl}/api/greet`);
      expect(apiGetRes.status).toBe(200);
      const apiGetData = await apiGetRes.json();
      expect(apiGetData).toEqual({ message: 'Hello from production API!' });

      // Test 2d: API Route POST
      const apiPostRes = await fetch(`${baseUrl}/api/greet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Ranu' }),
      });
      expect(apiPostRes.status).toBe(201);
      const apiPostData = await apiPostRes.json();
      expect(apiPostData).toEqual({ received: { name: 'Ranu' } });

      // Test 2e: Public Static File
      const robotRes = await fetch(`${baseUrl}/robots.txt`);
      expect(robotRes.status).toBe(200);
      expect(await robotRes.text()).toContain('User-agent: *');

      // Test 2f: Nonexistent route returns 404
      const notFoundRes = await fetch(`${baseUrl}/missing-route-404`);
      expect(notFoundRes.status).toBe(404);
    } finally {
      await server.close();
    }
  }, 60_000);
});
