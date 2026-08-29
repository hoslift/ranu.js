import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli } from '@ranu/cli';

describe('Integration: Phase 22 Ranu.js CLI Core', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-cli-int-'));
    const appDir = path.join(tempDir, 'app');
    fs.mkdirSync(appDir, { recursive: true });

    fs.writeFileSync(
      path.join(appDir, 'layout.tsx'),
      `import React from 'react';
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html><head><title>CLI App</title></head><body>{children}</body></html>;
}`
    );

    fs.writeFileSync(
      path.join(appDir, 'page.tsx'),
      `import React from 'react';
export default function HomePage() {
  return <main id="home"><h1>Welcome to Ranu.js CLI</h1></main>;
}`
    );

    fs.writeFileSync(
      path.join(tempDir, 'ranu.config.ts'),
      `export default {
  server: { port: 4321 },
};`
    );
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('runs "ranu build" via CLI dispatcher and outputs valid build artifacts', async () => {
    const exitCode = await runCli(['build', '--root', tempDir, '--quiet']);
    expect(exitCode).toBe(0);

    const buildDir = path.join(tempDir, '.ranu', 'build');
    expect(fs.existsSync(buildDir)).toBe(true);
    expect(fs.existsSync(path.join(buildDir, 'build.json'))).toBe(true);
    expect(fs.existsSync(path.join(buildDir, 'manifest', 'routes.json'))).toBe(true);
    expect(fs.existsSync(path.join(buildDir, 'manifest', 'client.json'))).toBe(true);
  });

  it('runs "ranu build --clean" and removes existing build cache first', async () => {
    const fakeCache = path.join(tempDir, '.ranu', 'stale.txt');
    fs.mkdirSync(path.dirname(fakeCache), { recursive: true });
    fs.writeFileSync(fakeCache, 'stale content');

    const exitCode = await runCli(['build', '--root', tempDir, '--clean', '--quiet']);
    expect(exitCode).toBe(0);
    expect(fs.existsSync(fakeCache)).toBe(false);
  });

  it('fails gracefully with exit code 1 when project root does not exist', async () => {
    const nonExistent = path.join(tempDir, 'does-not-exist');
    const exitCode = await runCli(['build', '--root', nonExistent, '--quiet']);
    expect(exitCode).toBe(1);
  });

  it('outputs valid JSON when --json flag is provided to build', async () => {
    const exitCode = await runCli(['build', '--root', tempDir, '--json']);
    expect(exitCode).toBe(0);
  });
});
