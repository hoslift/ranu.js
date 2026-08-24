import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDevServer } from '@ranu/dev';
import { build } from '@ranu/build';

describe('Integration: Phase 20 Middleware', () => {
  let tempDir: string;
  let devServer: ReturnType<typeof createDevServer> | null;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-middleware-int-'));
    const appDir = path.join(tempDir, 'app');
    const apiDir = path.join(appDir, 'api', 'data');
    const publicDir = path.join(tempDir, 'public');
    const adminDir = path.join(appDir, 'admin');
    const targetDir = path.join(appDir, 'target');
    fs.mkdirSync(appDir, { recursive: true });
    fs.mkdirSync(apiDir, { recursive: true });
    fs.mkdirSync(publicDir, { recursive: true });
    fs.mkdirSync(adminDir, { recursive: true });
    fs.mkdirSync(targetDir, { recursive: true });

    // 1. Root Layout
    fs.writeFileSync(
      path.join(appDir, 'layout.tsx'),
      `import React from 'react';
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html><head></head><body>{children}</body></html>;
}`
    );

    // 2. Home Page (reads context locals if available)
    fs.writeFileSync(
      path.join(appDir, 'page.tsx'),
      `import React from 'react';
import { getRequestContext } from '@ranu/server';

export default function HomePage() {
  const ctx = getRequestContext();
  const user = ctx.locals.get('auth_user') ?? 'guest';
  return <h1 id="home-title">Welcome: {String(user)}</h1>;
}`
    );

    // 3. Admin Page
    fs.writeFileSync(
      path.join(appDir, 'admin', 'page.tsx'),
      `import React from 'react';
export default function AdminPage() {
  return <h1 id="admin-title">Admin Secret Area</h1>;
}`
    );

    // 4. Target Page for Rewrite
    fs.writeFileSync(
      path.join(appDir, 'target', 'page.tsx'),
      `import React from 'react';
export default function TargetPage() {
  return <h1 id="target-title">Rewritten Target Page</h1>;
}`
    );

    // 5. API Route
    fs.writeFileSync(
      path.join(apiDir, 'route.ts'),
      `import { getRequestContext } from '@ranu/server';

export async function GET() {
  const ctx = getRequestContext();
  const user = ctx.locals.get('auth_user') ?? 'none';
  return Response.json({ status: 'ok', user });
}`
    );

    // 6. Public File
    fs.writeFileSync(
      path.join(publicDir, 'hello.txt'),
      'Hello from public directory'
    );

    // 7. Initial Middleware
    fs.writeFileSync(
      path.join(tempDir, 'middleware.ts'),
      `import { next, rewrite, redirect } from '@ranu/server';

export const config = {
  matcher: ['/((?!_ranu).*)'],
};

export default async function middleware(req: Request, ctx: any) {
  const url = new URL(req.url);

  // Attach request local
  ctx.locals.set('auth_user', 'authenticated_tester');

  // Direct response on /blocked
  if (url.pathname === '/blocked') {
    return new Response('Access Denied from Middleware', {
      status: 403,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Redirect /old-home to /
  if (url.pathname === '/old-home') {
    return redirect('/', 307);
  }

  // Rewrite /source to /target
  if (url.pathname === '/source') {
    return rewrite('/target');
  }

  // Rewrite loop trigger for testing
  if (url.pathname === '/loop-1') {
    return rewrite('/loop-2');
  }
  if (url.pathname === '/loop-2') {
    return rewrite('/loop-1');
  }

  return next({
    headers: {
      'x-middleware-executed': 'true',
    },
  });
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

  it('middleware executes before SSR, API routes, redirects, rewrites, and attaches headers & locals in dev server', async () => {
    devServer = createDevServer({
      projectRoot: tempDir,
      port: 0,
      host: '127.0.0.1',
      watch: false,
    });

    const address = await devServer.start(0, '127.0.0.1');

    // 1. SSR Route: Middleware runs, attaches header, sets local reaching page component
    const res1 = await fetch(`${address.url}/`);
    expect(res1.status).toBe(200);
    expect(res1.headers.get('x-middleware-executed')).toBe('true');
    const html1 = await res1.text();
    expect(html1).toContain('authenticated_tester');

    // 2. Direct Response: /blocked returns 403 from middleware
    const res2 = await fetch(`${address.url}/blocked`);
    expect(res2.status).toBe(403);
    const text2 = await res2.text();
    expect(text2).toBe('Access Denied from Middleware');

    // 3. Redirect: /old-home redirects with 307 to /
    const res3 = await fetch(`${address.url}/old-home`, { redirect: 'manual' });
    expect(res3.status).toBe(307);
    expect(res3.headers.get('Location')).toBe('/');

    // 4. Rewrite: /source rewrites to /target and renders target page
    const res4 = await fetch(`${address.url}/source`);
    expect(res4.status).toBe(200);
    const html4 = await res4.text();
    expect(html4).toContain('Rewritten Target Page');

    // 5. Rewrite Loop: /loop-1 terminates with 500 error
    const res5 = await fetch(`${address.url}/loop-1`);
    expect(res5.status).toBe(500);

    // 6. API Route: Middleware sets local, API route returns it in JSON
    const res6 = await fetch(`${address.url}/api/data`);
    expect(res6.status).toBe(200);
    expect(res6.headers.get('x-middleware-executed')).toBe('true');
    const json6 = await res6.json();
    expect(json6).toEqual({ status: 'ok', user: 'authenticated_tester' });

    // 7. Internal Asset: /_ranu/dev-client.js bypasses middleware
    const res7 = await fetch(`${address.url}/_ranu/dev-client.js`);
    expect(res7.status).toBe(200);
    expect(res7.headers.get('x-middleware-executed')).toBeNull();

    // 8. Public File: /hello.txt is served successfully
    const res8 = await fetch(`${address.url}/hello.txt`);
    expect(res8.status).toBe(200);
    const text8 = await res8.text();
    expect(text8).toBe('Hello from public directory');

    // 9. Hot edit middleware.ts in development and verify update
    fs.writeFileSync(
      path.join(tempDir, 'middleware.ts'),
      `import { next } from '@ranu/server';

export default async function middleware(req: Request, ctx: any) {
  ctx.locals.set('auth_user', 'updated_tester_v2');
  return next({
    headers: {
      'x-middleware-version': 'v2',
    },
  });
}`
    );

    await devServer.rebuild('middleware updated');

    const res9 = await fetch(`${address.url}/`);
    expect(res9.status).toBe(200);
    expect(res9.headers.get('x-middleware-version')).toBe('v2');
    const html9 = await res9.text();
    expect(html9).toContain('updated_tester_v2');
  });

  it('production build compiles middleware.ts into .ranu/build/server/middleware.mjs', async () => {
    const buildResult = await build({
      projectRoot: tempDir,
      sourceMaps: 'hidden',
    });

    expect(buildResult.success).toBe(true);
    expect(buildResult.diagnostics.filter((d: any) => d.severity === 'error')).toEqual([]);

    const middlewareOut = path.join(tempDir, '.ranu', 'build', 'server', 'middleware.mjs');
    expect(fs.existsSync(middlewareOut)).toBe(true);
    const compiledCode = fs.readFileSync(middlewareOut, 'utf8');
    expect(compiledCode).toContain('authenticated_tester');
  });
});
