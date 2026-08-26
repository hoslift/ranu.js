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
}`,
    );

    const outDir = path.join(tempDir, 'dist');
    const adapter = new EsbuildAdapter();
    const result = await adapter.bundle({
      entryPoints: { page: srcFile },
      outdir: outDir,
      platform: 'node',
      format: 'esm',
      sourcemap: 'external',
      external: ['react', 'react/jsx-runtime'],
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
  }, 60_000);

  it('handles virtual module ranu/server-only on server platform', async () => {
    const srcFile = path.join(tempDir, 'server-db.ts');
    fs.writeFileSync(
      srcFile,
      `import 'ranu/server-only';
export const db = { connected: true };`,
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
export const clientSecret = 'bad';`,
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
    expect(result.errors.some((e) => e.text.includes('RANU_BUILD_SERVER_ONLY_CLIENT'))).toBe(true);
  });

  it.each(['ranu/server', '@ranu/server'])(
    'preserves the %s specifier in Node bundles',
    async (specifier) => {
      const srcFile = path.join(tempDir, 'server-api.ts');
      fs.writeFileSync(srcFile, `import { next } from '${specifier}';\nexport { next };`);

      const outDir = path.join(tempDir, 'dist-node-api');
      const adapter = new EsbuildAdapter();
      const plugin = createRanuEsbuildPlugin({
        platform: 'node',
        projectRoot: tempDir,
        staticOutDir: path.join(tempDir, 'static'),
        tempOutDir: path.join(tempDir, 'temp'),
      });
      const result = await adapter.bundle({
        entryPoints: { 'server-api': srcFile },
        outdir: outDir,
        platform: 'node',
        format: 'esm',
        plugins: [plugin],
      });

      expect(result.success).toBe(true);
      expect(fs.readFileSync(path.join(outDir, 'server-api.js'), 'utf8')).toContain(specifier);
    },
  );

  it.each(['ranu/server', '@ranu/server'])(
    'rejects the server API specifier %s on browser bundles',
    async (specifier) => {
      const srcFile = path.join(tempDir, 'client-server-api.ts');
      fs.writeFileSync(srcFile, `import { next } from '${specifier}';\nexport { next };`);

      const adapter = new EsbuildAdapter();
      const plugin = createRanuEsbuildPlugin({
        platform: 'browser',
        projectRoot: tempDir,
        staticOutDir: path.join(tempDir, 'static'),
        tempOutDir: path.join(tempDir, 'temp'),
      });
      const result = await adapter.bundle({
        entryPoints: { 'client-server-api': srcFile },
        outdir: path.join(tempDir, 'dist-browser-api'),
        platform: 'browser',
        format: 'esm',
        plugins: [plugin],
      });

      expect(result.success).toBe(false);
      expect(
        result.errors.some((error) => error.text.includes('RANU_BUILD_SERVER_ONLY_CLIENT')),
      ).toBe(true);
    },
  );

  it('bundles client modules with modern destructuring syntax using default es2022 target', async () => {
    const srcFile = path.join(tempDir, 'client-counter.tsx');
    fs.writeFileSync(
      srcFile,
      `import React from 'react';
export function Counter({ initial = 0 }: { initial?: number }) {
  const [count, setCount] = [initial, () => {}];
  return <button>{count}</button>;
}`,
    );

    const outDir = path.join(tempDir, 'dist-client');
    const adapter = new EsbuildAdapter();
    const result = await adapter.bundle({
      entryPoints: { counter: srcFile },
      outdir: outDir,
      platform: 'browser',
      format: 'esm',
      external: ['react', 'react/jsx-runtime'],
    });

    expect(result.success).toBe(true);
    expect(result.errors.length).toBe(0);
    const outFile = path.join(outDir, 'counter.js');
    expect(fs.existsSync(outFile)).toBe(true);
  });

  it('resolves regex plugin aliases and leaves non-matching imports to esbuild', async () => {
    const aliasedFile = path.join(tempDir, 'aliased.ts');
    const localFile = path.join(tempDir, 'local.ts');
    const entryFile = path.join(tempDir, 'entry.ts');
    fs.writeFileSync(aliasedFile, "export const aliased = 'regex-alias';\n");
    fs.writeFileSync(localFile, "export const local = 'local-import';\n");
    fs.writeFileSync(
      entryFile,
      "import { aliased } from '@regex-value';\nimport { local } from './local';\nconsole.log(aliased, local);\n",
    );

    const outDir = path.join(tempDir, 'dist-regex-alias');
    const adapter = new EsbuildAdapter();
    const result = await adapter.bundle({
      entryPoints: { entry: entryFile },
      outdir: outDir,
      absWorkingDir: tempDir,
      platform: 'node',
      format: 'esm',
      pluginAliases: [{ find: /^@regex-value$/, replacement: aliasedFile }],
    });

    expect(result.success).toBe(true);
    const output = fs.readFileSync(path.join(outDir, 'entry.js'), 'utf8');
    expect(output).toContain('regex-alias');
    expect(output).toContain('local-import');
  });
});
