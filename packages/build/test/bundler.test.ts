import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EsbuildAdapter } from '../src/bundler/esbuild-adapter.js';
import { createRanuEsbuildPlugin } from '../src/bundler/esbuild-plugin-ranu.js';

describe('bundler-adapter (esbuild)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-bundler-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('compiles TypeScript and JSX to runnable JavaScript', async () => {
    const srcFile = path.join(tempDir, 'page.tsx');
    fs.writeFileSync(
      srcFile,
      `import React from 'react';
export function Component() {
  return <h1>Hello Ranu</h1>;
}`
    );

    const outDir = path.join(tempDir, 'dist');
    const adapter = new EsbuildAdapter();
    const result = await adapter.bundle({
      entryPoints: { page: srcFile },
      outdir: outDir,
      platform: 'node',
      format: 'esm',
      sourcemap: 'external',
    });

    expect(result.success).toBe(true);
    expect(result.errors.length).toBe(0);

    const outFile = path.join(outDir, 'page.js');
    expect(fs.existsSync(outFile)).toBe(true);

    const content = fs.readFileSync(outFile, 'utf8');
    expect(content).toContain('jsx');
    expect(content).toContain('Hello Ranu');

    const mapFile = path.join(outDir, 'page.js.map');
    expect(fs.existsSync(mapFile)).toBe(true);
  });

  it('handles virtual module ranu/server-only on server platform', async () => {
    const srcFile = path.join(tempDir, 'server-db.ts');
    fs.writeFileSync(
      srcFile,
      `import 'ranu/server-only';
export const db = { connected: true };`
    );

    const outDir = path.join(tempDir, 'dist');
    const adapter = new EsbuildAdapter();
    const plugin = createRanuEsbuildPlugin({ platform: 'node' });

    const result = await adapter.bundle({
      entryPoints: { 'server-db': srcFile },
      outdir: outDir,
      platform: 'node',
      format: 'esm',
      plugins: [plugin],
    });

    expect(result.success).toBe(true);
    const outFile = path.join(outDir, 'server-db.js');
    expect(fs.existsSync(outFile)).toBe(true);
  });

  it('rejects virtual module ranu/server-only on browser platform', async () => {
    const srcFile = path.join(tempDir, 'client-bad.ts');
    fs.writeFileSync(
      srcFile,
      `import 'ranu/server-only';
export const clientSecret = 'bad';`
    );

    const outDir = path.join(tempDir, 'dist');
    const adapter = new EsbuildAdapter();
    const plugin = createRanuEsbuildPlugin({ platform: 'browser' });

    const result = await adapter.bundle({
      entryPoints: { 'client-bad': srcFile },
      outdir: outDir,
      platform: 'browser',
      format: 'esm',
      plugins: [plugin],
    });

    expect(result.success).toBe(false);
    expect(result.errors.some(e => e.text.includes('RANU_BUILD_SERVER_ONLY_CLIENT'))).toBe(true);
  });
});
