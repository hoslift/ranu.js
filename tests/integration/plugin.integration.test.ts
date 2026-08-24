import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { build } from '@ranu/build';
import { definePlugin } from '@ranu/plugin';
import { createDevServer } from '@ranu/dev';

describe('Integration: Phase 21 Plugin API v1', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-plugin-test-'));
    fs.mkdirSync(path.join(tempDir, 'app'), { recursive: true });

    // Minimal valid layout and page
    fs.writeFileSync(
      path.join(tempDir, 'app', 'layout.tsx'),
      'export default function RootLayout({ children }: any) { return <html><body>{children}</body></html>; }\n'
    );
    fs.writeFileSync(
      path.join(tempDir, 'app', 'page.tsx'),
      'export default function HomePage() { return <h1>Plugin Test</h1>; }\n'
    );
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('runs build lifecycle hooks and applies plugin config in production build', async () => {
    const hookEvents: string[] = [];

    const testPlugin = definePlugin({
      name: 'integration-plugin',
      apiVersion: 1,
      setup() {
        return {
          config(current) {
            hookEvents.push('config');
            return {
              build: { minify: false },
            };
          },
          configResolved() {
            hookEvents.push('configResolved');
          },
          buildStart() {
            hookEvents.push('buildStart');
          },
          routes(routes) {
            hookEvents.push(`routes:${routes.length}`);
          },
          extendBuild() {
            hookEvents.push('extendBuild');
          },
          buildEnd(result) {
            hookEvents.push(`buildEnd:${result.success}`);
          },
        };
      },
    });

    // Write ranu.config.js referencing the plugin
    const configContent = `
      export default {
        plugins: [globalThis.__testPlugin],
      };
    `;
    (globalThis as any).__testPlugin = testPlugin;
    fs.writeFileSync(path.join(tempDir, 'ranu.config.js'), configContent, 'utf8');

    const result = await build({
      projectRoot: tempDir,
      mode: 'production',
    });

    expect(result.success).toBe(true);
    expect(hookEvents).toEqual([
      'config',
      'configResolved',
      'buildStart',
      'routes:1',
      'extendBuild',
      'buildEnd:true',
    ]);
  });

  it('executes devStart and devEnd hooks during dev server lifecycle', async () => {
    const devEvents: string[] = [];

    const devPlugin = definePlugin({
      name: 'dev-integration-plugin',
      apiVersion: 1,
      setup() {
        return {
          devStart(ctx) {
            devEvents.push(`devStart:${ctx.port}`);
          },
          devEnd() {
            devEvents.push('devEnd');
          },
        };
      },
    });

    const devServer = createDevServer({
      projectRoot: tempDir,
      plugins: [devPlugin],
      watch: false,
    });

    const addr = await devServer.start(0, '127.0.0.1');
    expect(devEvents).toEqual([`devStart:${addr.port}`]);

    await devServer.close();
    expect(devEvents).toEqual([`devStart:${addr.port}`, 'devEnd']);
  });

  it('rejects invalid plugins and produces deterministic build diagnostics', async () => {
    const invalidPlugin = {
      name: 'invalid-version-plugin',
      apiVersion: 99,
      setup() {},
    };

    (globalThis as any).__invalidPlugin = invalidPlugin;
    fs.writeFileSync(
      path.join(tempDir, 'ranu.config.js'),
      'export default { plugins: [globalThis.__invalidPlugin] };',
      'utf8'
    );

    const result = await build({
      projectRoot: tempDir,
      mode: 'production',
    });

    expect(result.success).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'RANU_PLUGIN_INVALID')).toBe(true);
  });

  it('builds successfully with zero plugins unchanged', async () => {
    const result = await build({
      projectRoot: tempDir,
      mode: 'production',
    });

    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.ranu', 'build', 'BUILD_ID'))).toBe(true);
  });
});
