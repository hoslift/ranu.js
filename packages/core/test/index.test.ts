import { describe, it, expect } from 'vitest';
import { RANU_VERSION, DEFAULT_OUT_DIR } from '../src/index.js';
import type { RanuMode, RanuCommand, RouteKind, RenderMode, FrameworkCapabilities } from '../src/index.js';

describe('@ranu/core', () => {
  it('exports RANU_VERSION and DEFAULT_OUT_DIR', () => {
    expect(RANU_VERSION).toBe('0.0.0');
    expect(DEFAULT_OUT_DIR).toBe('.ranu');
  });

  it('declares type contracts properly', () => {
    const mode: RanuMode = 'production';
    const command: RanuCommand = 'build';
    const routeKind: RouteKind = 'page';
    const renderMode: RenderMode = 'static';

    const capabilities: FrameworkCapabilities = {
      streaming: true,
      middleware: false,
      nodejsBuiltins: true,
    };

    expect(mode).toBe('production');
    expect(command).toBe('build');
    expect(routeKind).toBe('page');
    expect(renderMode).toBe('static');
    expect(capabilities.streaming).toBe(true);
  });

  it('supports decoupled generic typing in DeploymentAdapterContext and RanuDeploymentAdapter', async () => {
    interface CustomConfig {
      appName: string;
      port: number;
    }

    interface CustomManifest {
      routes: string[];
      buildHash: string;
    }

    const context: import('../src/index.js').DeploymentAdapterContext<CustomConfig, CustomManifest> = {
      projectRoot: '/test/app',
      config: {
        appName: 'TestApp',
        port: 8080,
      },
      manifest: {
        routes: ['/'],
        buildHash: 'abc1234',
      },
    };

    const adapter: import('../src/index.js').RanuDeploymentAdapter<CustomConfig, CustomManifest> = {
      name: 'test-adapter',
      apiVersion: 1,
      capabilities: {
        runtime: 'node',
        streaming: true,
        staticFiles: true,
      },
      adapt: async (ctx) => {
        return {
          success: true,
          target: ctx.config?.appName ?? 'unknown',
          outputDirectory: ctx.projectRoot + '/dist',
        };
      },
    };

    const result = await adapter.adapt(context);
    expect(result.success).toBe(true);
    expect(result.target).toBe('TestApp');
    expect(result.outputDirectory).toBe('/test/app/dist');
  });
});
