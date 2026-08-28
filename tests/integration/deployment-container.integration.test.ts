import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { build, writeContainerArtifacts } from '@ranu/build';

describe('Integration: Phase 25 Container Deployment', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-container-int-'));
    const appDir = path.join(tempDir, 'app');
    fs.mkdirSync(appDir, { recursive: true });

    // Minimal App
    fs.writeFileSync(
      path.join(appDir, 'layout.tsx'),
      `import React from 'react'; export default function RootLayout({ children }: any) { return <html><body>{children}</body></html>; }`,
    );
    fs.writeFileSync(
      path.join(appDir, 'page.tsx'),
      `import React from 'react'; export default function HomePage() { return <h1>Container App</h1>; }`,
    );
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-container-app',
        version: '1.0.0',
        scripts: { build: 'ranu build', start: 'ranu start' },
      }),
    );
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('builds application and generates container configuration files', async () => {
    // 1. Build project
    const buildRes = await build({ projectRoot: tempDir });
    expect(buildRes.success).toBe(true);

    // 2. Generate container artifacts
    const containerRes = writeContainerArtifacts(tempDir, {
      nodeVersion: '22-alpine',
      packageManager: 'npm',
      port: 3000,
    });

    expect(containerRes.written).toBe(true);

    const dockerfilePath = path.join(tempDir, 'Dockerfile');
    const dockerignorePath = path.join(tempDir, '.dockerignore');

    expect(fs.existsSync(dockerfilePath)).toBe(true);
    expect(fs.existsSync(dockerignorePath)).toBe(true);

    const dockerfile = fs.readFileSync(dockerfilePath, 'utf8');
    expect(dockerfile).toContain('FROM node:22-alpine AS build');
    expect(dockerfile).toContain('FROM node:22-alpine AS runtime');
    expect(dockerfile).toContain('ENV NODE_ENV=production');
    expect(dockerfile).toContain('USER node');
    expect(dockerfile).toContain('EXPOSE 3000');
    expect(dockerfile).toContain('CMD ["node",".ranu/build/server/entry.mjs"]');

    const dockerignore = fs.readFileSync(dockerignorePath, 'utf8');
    expect(dockerignore).toContain('.git');
    expect(dockerignore).toContain('node_modules');
  }, 60_000);
});
