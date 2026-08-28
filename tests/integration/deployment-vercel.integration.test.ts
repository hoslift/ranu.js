import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { build } from '@ranu/build';
import { createVercelAdapter } from '@ranu/adapter-vercel';

describe('Integration: Phase 26 Vercel Adapter', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-vercel-int-'));
    const appDir = path.join(tempDir, 'app');
    const apiDir = path.join(appDir, 'api', 'ping');
    const docsDir = path.join(appDir, 'docs');
    const publicDir = path.join(tempDir, 'public');

    fs.mkdirSync(appDir, { recursive: true });
    fs.mkdirSync(apiDir, { recursive: true });
    fs.mkdirSync(docsDir, { recursive: true });
    fs.mkdirSync(publicDir, { recursive: true });

    // 1. Root Layout
    fs.writeFileSync(
      path.join(appDir, 'layout.tsx'),
      `import React from 'react'; export default function RootLayout({ children }: any) { return <html><body>{children}</body></html>; }`,
    );

    // 2. SSR Page
    fs.writeFileSync(
      path.join(appDir, 'page.tsx'),
      `import React from 'react'; export default function HomePage() { return <h1>Vercel SSR Home</h1>; }`,
    );

    // 3. Static Page
    fs.writeFileSync(
      path.join(docsDir, 'page.tsx'),
      `import React from 'react'; export const render = 'static'; export default function DocsPage() { return <h1>Vercel Static Docs</h1>; }`,
    );

    // 4. API Route
    fs.writeFileSync(
      path.join(apiDir, 'route.ts'),
      `export async function GET() { return Response.json({ pong: true }); }`,
    );

    // 5. Public Static Asset
    fs.writeFileSync(path.join(publicDir, 'favicon.ico'), 'favicon-content');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('builds application and generates full Vercel deployment package', async () => {
    // 1. Build project
    const buildRes = await build({ projectRoot: tempDir });
    expect(buildRes.success).toBe(true);

    // 2. Run Vercel adapter
    const adapter = createVercelAdapter({
      runtimeVersion: 'nodejs22.x',
      regions: ['iad1', 'sfo1'],
      memory: 1024,
      maxDuration: 30,
    });

    const result = await adapter.adapt({ projectRoot: tempDir });
    expect(result.success).toBe(true);

    const vercelOut = path.join(tempDir, '.vercel', 'output');
    expect(fs.existsSync(vercelOut)).toBe(true);

    // Validate config.json
    const configPath = path.join(vercelOut, 'config.json');
    expect(fs.existsSync(configPath)).toBe(true);
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    expect(config.version).toBe(3);
    expect(config.routes).toBeInstanceOf(Array);

    // Validate static files
    const staticDir = path.join(vercelOut, 'static');
    expect(fs.existsSync(path.join(staticDir, 'docs.html'))).toBe(true);
    expect(fs.existsSync(path.join(staticDir, 'favicon.ico'))).toBe(true);

    // Validate serverless function package
    const funcDir = path.join(vercelOut, 'functions', 'index.func');
    expect(fs.existsSync(path.join(funcDir, '.vc-config.json'))).toBe(true);
    expect(fs.existsSync(path.join(funcDir, 'index.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(funcDir, 'build.json'))).toBe(true);
    expect(fs.existsSync(path.join(funcDir, 'server'))).toBe(true);
    expect(fs.existsSync(path.join(funcDir, 'manifest'))).toBe(true);

    const vcConfig = JSON.parse(fs.readFileSync(path.join(funcDir, '.vc-config.json'), 'utf8'));
    expect(vcConfig.runtime).toBe('nodejs22.x');
    expect(vcConfig.regions).toEqual(['iad1', 'sfo1']);
    expect(vcConfig.maxDuration).toBe(30);

    // Validate deployment metadata
    const deployMarkerPath = path.join(tempDir, '.ranu', 'deploy', 'vercel', 'deployment.json');
    expect(fs.existsSync(deployMarkerPath)).toBe(true);
  }, 60_000);
});
