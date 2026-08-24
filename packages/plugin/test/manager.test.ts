import { describe, it, expect, vi } from 'vitest';
import { PluginManager } from '../src/manager.js';
import { definePlugin } from '../src/define.js';

describe('PluginManager', () => {
  it('orders plugins by enforce tier (pre -> normal -> post) preserving registration order', () => {
    const pNormal1 = definePlugin({ name: 'normal-1', apiVersion: 1, setup() {} });
    const pPost1 = definePlugin({ name: 'post-1', apiVersion: 1, enforce: 'post', setup() {} });
    const pPre1 = definePlugin({ name: 'pre-1', apiVersion: 1, enforce: 'pre', setup() {} });
    const pNormal2 = definePlugin({ name: 'normal-2', apiVersion: 1, setup() {} });
    const pPre2 = definePlugin({ name: 'pre-2', apiVersion: 1, enforce: 'pre', setup() {} });

    const manager = new PluginManager([pNormal1, pPost1, pPre1, pNormal2, pPre2]);
    expect(manager.getPluginNames()).toEqual(['pre-1', 'pre-2', 'normal-1', 'normal-2', 'post-1']);
  });

  it('rejects duplicate plugin names', () => {
    const p1 = definePlugin({ name: 'dup', apiVersion: 1, setup() {} });
    const p2 = definePlugin({ name: 'dup', apiVersion: 1, setup() {} });

    expect(() => new PluginManager([p1, p2])).toThrow('RANU_PLUGIN_DUPLICATE');
  });

  it('supports plugin factory functions', () => {
    const factory = () => definePlugin({ name: 'factory-plugin', apiVersion: 1, setup() {} });
    const manager = new PluginManager([factory]);
    expect(manager.getPluginNames()).toEqual(['factory-plugin']);
  });

  it('executes setup() sequentially and provides PluginSetupContext', async () => {
    const order: string[] = [];
    const p1 = definePlugin({
      name: 'p1',
      apiVersion: 1,
      enforce: 'pre',
      setup(ctx) {
        expect(ctx.pluginApiVersion).toBe(1);
        expect(ctx.mode).toBe('production');
        order.push('p1');
      },
    });
    const p2 = definePlugin({
      name: 'p2',
      apiVersion: 1,
      setup() {
        order.push('p2');
      },
    });

    const manager = new PluginManager([p2, p1]);
    await manager.setup();
    expect(order).toEqual(['p1', 'p2']);
  });

  it('isolates and wraps setup() failures in RANU_PLUGIN_SETUP_ERROR', async () => {
    const badPlugin = definePlugin({
      name: 'broken',
      apiVersion: 1,
      setup() {
        throw new Error('Boom in setup');
      },
    });

    const manager = new PluginManager([badPlugin]);
    await expect(manager.setup()).rejects.toThrow('RANU_PLUGIN_SETUP_ERROR: Plugin "broken" failed during setup()');
  });

  it('runs config hook sequentially and merges configuration contributions', async () => {
    const p1 = definePlugin({
      name: 'p1',
      apiVersion: 1,
      setup() {
        return {
          config(current) {
            return {
              server: { ...current.server, port: 4000 },
            };
          },
        };
      },
    });

    const p2 = definePlugin({
      name: 'p2',
      apiVersion: 1,
      setup() {
        return {
          config(current) {
            return {
              build: { minify: false },
            };
          },
        };
      },
    });

    const manager = new PluginManager([p1, p2]);
    const merged = await manager.runConfig({ server: { host: 'localhost' } });
    expect(merged).toEqual({
      server: { host: 'localhost', port: 4000 },
      build: { minify: false },
    });
  });

  it('runs configResolved hook sequentially with readonly resolved config', async () => {
    const seen: any[] = [];
    const p = definePlugin({
      name: 'p',
      apiVersion: 1,
      setup() {
        return {
          configResolved(resolved) {
            seen.push(resolved);
          },
        };
      },
    });

    const manager = new PluginManager([p]);
    const resolvedConfig = { root: '/app', mode: 'production' } as any;
    await manager.runConfigResolved(resolvedConfig);
    expect(seen[0]).toBe(resolvedConfig);
  });

  it('runs routes and route hooks collecting namespaced metadata', async () => {
    const p1 = definePlugin({
      name: 'p1',
      apiVersion: 1,
      setup() {
        return {
          routes(routes) {
            return {
              '/about': { prerender: true },
            };
          },
          route(route) {
            return { tested: true };
          },
        };
      },
    });

    const manager = new PluginManager([p1]);
    const mockRoutes = [
      {
        routeId: 'r1',
        kind: 'page' as const,
        pathnameTemplate: '/about',
        params: [],
      },
    ];

    const routesMeta = await manager.runRoutes(mockRoutes);
    expect(routesMeta['/about']).toEqual({
      p1: { prerender: true },
    });

    const singleRouteMeta = await manager.runRoute(mockRoutes[0]);
    expect(singleRouteMeta).toEqual({
      p1: { tested: true },
    });
  });

  it('runs buildStart, extendBuild, and buildEnd hooks', async () => {
    const events: string[] = [];
    const p = definePlugin({
      name: 'builder',
      apiVersion: 1,
      setup() {
        return {
          buildStart() {
            events.push('buildStart');
          },
          extendBuild(api) {
            expect(api.platform).toBe('node');
            events.push('extendBuild');
          },
          buildEnd(result) {
            expect(result.success).toBe(true);
            events.push('buildEnd');
          },
        };
      },
    });

    const manager = new PluginManager([p]);
    const buildCtx = {
      pluginName: '',
      mode: 'production' as const,
      command: 'build' as const,
      projectRoot: '/test',
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      buildId: 'b1',
      routes: [],
    };

    await manager.runBuildStart(buildCtx);
    await manager.runExtendBuild(
      {
        platform: 'node',
        projectRoot: '/test',
        addAlias() {},
        addDefine() {},
      },
      buildCtx
    );
    await manager.runBuildEnd(
      {
        success: true,
        buildId: 'b1',
        durationMs: 100,
        diagnostics: [],
      },
      buildCtx
    );

    expect(events).toEqual(['buildStart', 'extendBuild', 'buildEnd']);
  });

  it('runs devStart and devEnd hooks', async () => {
    const events: string[] = [];
    const p = definePlugin({
      name: 'dev-plugin',
      apiVersion: 1,
      setup() {
        return {
          devStart(ctx) {
            expect(ctx.port).toBe(3000);
            events.push('devStart');
          },
          devEnd() {
            events.push('devEnd');
          },
        };
      },
    });

    const manager = new PluginManager([p]);
    const devCtx = {
      pluginName: '',
      mode: 'development' as const,
      command: 'dev' as const,
      projectRoot: '/test',
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      port: 3000,
      host: 'localhost',
    };

    await manager.runDevStart(devCtx);
    await manager.runDevEnd(devCtx);

    expect(events).toEqual(['devStart', 'devEnd']);
  });

  it('wraps hook errors in RANU_PLUGIN_HOOK_ERROR attributing the plugin identity', async () => {
    const badHookPlugin = definePlugin({
      name: 'failing-hook',
      apiVersion: 1,
      setup() {
        return {
          buildStart() {
            throw new Error('Failed to generate artifact');
          },
        };
      },
    });

    const manager = new PluginManager([badHookPlugin]);
    const buildCtx = {
      pluginName: '',
      mode: 'production' as const,
      command: 'build' as const,
      projectRoot: '/test',
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      buildId: 'b1',
      routes: [],
    };

    await expect(manager.runBuildStart(buildCtx)).rejects.toThrow(
      'RANU_PLUGIN_HOOK_ERROR: Plugin "failing-hook" failed in "buildStart" hook: Failed to generate artifact'
    );
  });
});
