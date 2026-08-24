import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
      'export default function RootLayout({ children }: any) { return <html><body>{children}</body></html>; }\n',
    );
    fs.writeFileSync(
      path.join(tempDir, 'app', 'page.tsx'),
      'export default function HomePage() { return <h1>Plugin Test</h1>; }\n',
    );
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('runs build lifecycle hooks and applies plugin config in production build', async () => {
    const hookEvents: string[] = [];
    let resolvedPluginConfig: any;

    fs.writeFileSync(
      path.join(tempDir, 'plugin-value.ts'),
      "export const pluginValue = 'aliased-value';\n",
    );
    fs.writeFileSync(
      path.join(tempDir, 'app', 'page.tsx'),
      "import { pluginValue } from '@plugin-value';\nexport default function HomePage() { return <h1>{PLUGIN_VALUE}:{pluginValue}</h1>; }\n",
    );

    const testPlugin = definePlugin({
      name: 'integration-plugin',
      apiVersion: 1,
      setup() {
        return {
          config(current) {
            hookEvents.push('config');
            return {
              build: { minify: true },
            };
          },
          configResolved(resolved) {
            resolvedPluginConfig = resolved;
            hookEvents.push('configResolved');
          },
          buildStart() {
            hookEvents.push('buildStart');
          },
          routes(routes) {
            hookEvents.push(`routes:${routes.length}`);
          },
          extendBuild(api) {
            api.addAlias('@plugin-value', path.join(tempDir, 'plugin-value.ts'));
            api.addDefine({ PLUGIN_VALUE: JSON.stringify('defined-value') });
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
      sourceMaps: false,
    });

    expect(result.success).toBe(true);
    expect(resolvedPluginConfig.build.minify).toBe(true);

    const serverDir = path.join(tempDir, '.ranu', 'build', 'server');
    const emittedServerCode = fs
      .readdirSync(serverDir, { recursive: true })
      .filter((entry) => typeof entry === 'string' && entry.endsWith('.mjs'))
      .map((entry) => fs.readFileSync(path.join(serverDir, entry), 'utf8'))
      .join('\n');
    expect(emittedServerCode).toContain('aliased-value');
    expect(emittedServerCode).toContain('defined-value');

    expect(hookEvents).toEqual([
      'config',
      'configResolved',
      'buildStart',
      'routes:1',
      'extendBuild',
      'buildEnd:true',
    ]);
  }, 15_000);

  it('does not promote build artifacts when buildEnd fails', async () => {
    const failingPlugin = definePlugin({
      name: 'failing-build-end',
      apiVersion: 1,
      setup() {
        return {
          buildEnd() {
            throw new Error('terminal hook failed');
          },
        };
      },
    });

    (globalThis as any).__failingBuildEndPlugin = failingPlugin;
    fs.writeFileSync(
      path.join(tempDir, 'ranu.config.js'),
      'export default { plugins: [globalThis.__failingBuildEndPlugin] };',
      'utf8',
    );

    const result = await build({ projectRoot: tempDir });

    expect(result.success).toBe(false);
    expect(
      result.diagnostics.some((diagnostic) => diagnostic.message.includes('terminal hook failed')),
    ).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.ranu', 'build', 'BUILD_ID'))).toBe(false);
  });

  it('returns deterministic diagnostics when configResolved fails', async () => {
    const failingPlugin = definePlugin({
      name: 'failing-config-resolved',
      apiVersion: 1,
      setup() {
        return {
          configResolved() {
            throw new Error('resolved config rejected');
          },
        };
      },
    });

    (globalThis as any).__failingConfigResolvedPlugin = failingPlugin;
    fs.writeFileSync(
      path.join(tempDir, 'ranu.config.js'),
      'export default { plugins: [globalThis.__failingConfigResolvedPlugin] };',
      'utf8',
    );

    const result = await build({ projectRoot: tempDir });

    expect(result.success).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'RANU_PLUGIN_INVALID',
        message: expect.stringContaining('resolved config rejected'),
      }),
    );
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

  it('cleans up startup resources when devStart fails', async () => {
    const failingDevPlugin = definePlugin({
      name: 'failing-dev-start',
      apiVersion: 1,
      setup() {
        return {
          devStart() {
            throw new Error('devStart failed');
          },
        };
      },
    });

    const devServer = createDevServer({
      projectRoot: tempDir,
      plugins: [failingDevPlugin],
    });

    await expect(devServer.start(0, '127.0.0.1')).rejects.toThrow('devStart failed');

    expect(devServer.httpServer.listening).toBe(false);
    expect((devServer as any).watcher).toBe(null);
    expect((devServer.reloadChannel as any).isClosed).toBe(true);
  });

  it('preserves a devStart failure when best-effort cleanup also fails', async () => {
    const failingDevPlugin = definePlugin({
      name: 'failing-start-and-cleanup',
      apiVersion: 1,
      setup() {
        return {
          devStart() {
            throw new Error('primary devStart failure');
          },
        };
      },
    });
    const devServer = createDevServer({
      projectRoot: tempDir,
      plugins: [failingDevPlugin],
      watch: false,
    });
    const close = devServer.close.bind(devServer);
    vi.spyOn(devServer, 'close').mockImplementation(async () => {
      await close();
      throw new Error('secondary cleanup failure');
    });

    await expect(devServer.start(0, '127.0.0.1')).rejects.toThrow('primary devStart failure');
    expect(devServer.httpServer.listening).toBe(false);
  });

  it('completes shutdown when a devEnd hook fails', async () => {
    const failingDevPlugin = definePlugin({
      name: 'failing-dev-end',
      apiVersion: 1,
      setup() {
        return {
          devEnd() {
            throw new Error('devEnd failure');
          },
        };
      },
    });
    const devServer = createDevServer({
      projectRoot: tempDir,
      plugins: [failingDevPlugin],
      watch: false,
    });

    await devServer.start(0, '127.0.0.1');
    await expect(devServer.close()).resolves.toBeUndefined();
    expect(devServer.httpServer.listening).toBe(false);
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
      'utf8',
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
