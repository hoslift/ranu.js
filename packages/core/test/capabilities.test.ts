import { describe, it, expect, vi } from 'vitest';
import type {
  DeploymentCapabilities,
  FrameworkCapabilities,
  DeploymentAdapterContext,
  DeploymentLogger,
  RanuDeploymentAdapter,
  DeploymentResult,
} from '../src/index.js';
import type {
  DeploymentCapabilities as DirectDeploymentCapabilities,
  FrameworkCapabilities as DirectFrameworkCapabilities,
} from '../src/capabilities.js';

describe('@ranu/core - Capabilities and Deployment Contracts', () => {
  describe('FrameworkCapabilities', () => {
    it('enforces required capability flags', () => {
      const standardCapabilities: FrameworkCapabilities = {
        streaming: true,
        middleware: true,
        nodejsBuiltins: false,
      };

      expect(standardCapabilities.streaming).toBe(true);
      expect(standardCapabilities.middleware).toBe(true);
      expect(standardCapabilities.nodejsBuiltins).toBe(false);
    });

    it('matches types exported directly from capabilities.js', () => {
      const directCaps: DirectFrameworkCapabilities = {
        streaming: false,
        middleware: true,
        nodejsBuiltins: true,
      };

      expect(directCaps.streaming).toBe(false);
      expect(directCaps.nodejsBuiltins).toBe(true);
    });
  });

  describe('DeploymentCapabilities', () => {
    it('supports all canonical runtime targets', () => {
      const runtimes: DeploymentCapabilities['runtime'][] = [
        'node',
        'edge',
        'workerd',
        'bun',
        'deno',
        'static',
      ];

      for (const runtime of runtimes) {
        const caps: DeploymentCapabilities = {
          runtime,
          ssr: true,
          apiRoutes: true,
          middleware: true,
          streaming: true,
          staticFiles: true,
          runtimeEnvironment: true,
          writableFilesystem: runtime === 'static' ? 'none' : 'temporary',
          longLivedProcess: runtime === 'node' || runtime === 'bun',
        };

        expect(caps.runtime).toBe(runtime);
      }
    });

    it('supports background execution flag supportsWaitUntil', () => {
      const edgeCaps: DeploymentCapabilities = {
        runtime: 'workerd',
        ssr: true,
        apiRoutes: true,
        middleware: true,
        streaming: true,
        staticFiles: false,
        runtimeEnvironment: true,
        writableFilesystem: 'none',
        longLivedProcess: false,
        supportsWaitUntil: true,
      };

      const lambdaCaps: DeploymentCapabilities = {
        runtime: 'node',
        ssr: true,
        apiRoutes: true,
        middleware: false,
        streaming: true,
        staticFiles: true,
        runtimeEnvironment: true,
        writableFilesystem: 'temporary',
        longLivedProcess: false,
        supportsWaitUntil: false,
      };

      const defaultCaps: DeploymentCapabilities = {
        runtime: 'static',
        ssr: false,
        apiRoutes: false,
        middleware: false,
        streaming: false,
        staticFiles: true,
        runtimeEnvironment: false,
        writableFilesystem: 'none',
        longLivedProcess: false,
      };

      expect(edgeCaps.supportsWaitUntil).toBe(true);
      expect(lambdaCaps.supportsWaitUntil).toBe(false);
      expect(defaultCaps.supportsWaitUntil).toBeUndefined();
    });

    it('supports database connection pooling limits maxDatabaseConnections', () => {
      const serverlessCaps: DeploymentCapabilities = {
        runtime: 'node',
        ssr: true,
        apiRoutes: true,
        middleware: true,
        streaming: true,
        staticFiles: true,
        runtimeEnvironment: true,
        writableFilesystem: 'temporary',
        longLivedProcess: false,
        maxDatabaseConnections: 5,
      };

      const standaloneCaps: DeploymentCapabilities = {
        runtime: 'node',
        ssr: true,
        apiRoutes: true,
        middleware: true,
        streaming: true,
        staticFiles: true,
        runtimeEnvironment: true,
        writableFilesystem: 'persistent',
        longLivedProcess: true,
        maxDatabaseConnections: 100,
      };

      expect(serverlessCaps.maxDatabaseConnections).toBe(5);
      expect(standaloneCaps.maxDatabaseConnections).toBe(100);
    });

    it('is compatible when instantiated through direct capabilities module import', () => {
      const directCaps: DirectDeploymentCapabilities = {
        runtime: 'deno',
        ssr: true,
        apiRoutes: true,
        middleware: true,
        streaming: true,
        staticFiles: true,
        runtimeEnvironment: true,
        writableFilesystem: 'temporary',
        longLivedProcess: false,
        supportsWaitUntil: true,
        maxDatabaseConnections: 10,
      };

      expect(directCaps.runtime).toBe('deno');
      expect(directCaps.supportsWaitUntil).toBe(true);
      expect(directCaps.maxDatabaseConnections).toBe(10);
    });
  });

  describe('DeploymentLogger & DeploymentAdapterContext', () => {
    it('accepts custom structured logger conforming to DeploymentLogger', () => {
      const logMessages: { level: string; msg: string }[] = [];

      const logger: DeploymentLogger = {
        info: (msg) => logMessages.push({ level: 'info', msg }),
        warn: (msg) => logMessages.push({ level: 'warn', msg }),
        error: (msg) => logMessages.push({ level: 'error', msg }),
        debug: (msg) => logMessages.push({ level: 'debug', msg }),
        log: (msg) => logMessages.push({ level: 'log', msg }),
      };

      logger.info('adapter build started');
      logger.warn('memory close to threshold');
      logger.error('failed writing bundle');
      logger.debug?.('cache miss on route /');
      logger.log?.('raw console output');

      expect(logMessages).toEqual([
        { level: 'info', msg: 'adapter build started' },
        { level: 'warn', msg: 'memory close to threshold' },
        { level: 'error', msg: 'failed writing bundle' },
        { level: 'debug', msg: 'cache miss on route /' },
        { level: 'log', msg: 'raw console output' },
      ]);
    });

    it('works with minimal DeploymentAdapterContext and full optional fields', () => {
      const minimalContext: DeploymentAdapterContext = {
        projectRoot: '/projects/my-app',
      };

      expect(minimalContext.projectRoot).toBe('/projects/my-app');
      expect(minimalContext.buildDir).toBeUndefined();
      expect(minimalContext.outputDir).toBeUndefined();
      expect(minimalContext.logger).toBeUndefined();
      expect(minimalContext.rootDir).toBeUndefined();
      expect(minimalContext.manifest).toBeUndefined();
      expect(minimalContext.config).toBeUndefined();

      const capturedLogs: string[] = [];
      const testLogger: DeploymentLogger = {
        info: (m) => capturedLogs.push(m),
        warn: (m) => capturedLogs.push(m),
        error: (m) => capturedLogs.push(m),
      };

      const fullContext: DeploymentAdapterContext = {
        projectRoot: '/projects/my-app',
        buildDir: '.ranu',
        outputDir: '.vercel/output',
        logger: testLogger,
        rootDir: '/projects/my-app',
        manifest: { routes: ['/'] },
        config: { target: 'serverless' },
      };

      expect(fullContext.buildDir).toBe('.ranu');
      expect(fullContext.outputDir).toBe('.vercel/output');
      expect(fullContext.rootDir).toBe('/projects/my-app');
      expect(fullContext.manifest).toEqual({ routes: ['/'] });
      expect(fullContext.config).toEqual({ target: 'serverless' });

      fullContext.logger?.info('context test message');
      expect(capturedLogs).toContain('context test message');
    });

    it('integrates seamlessly with RanuDeploymentAdapter execution flow', async () => {
      const events: string[] = [];

      const dummyAdapter: RanuDeploymentAdapter = {
        name: 'test-adapter',
        apiVersion: 1,
        capabilities: {
          runtime: 'workerd',
          ssr: true,
          apiRoutes: true,
          middleware: true,
          streaming: true,
          staticFiles: true,
          runtimeEnvironment: true,
          writableFilesystem: 'none',
          longLivedProcess: false,
          supportsWaitUntil: true,
          maxDatabaseConnections: 6,
        },
        async adapt(ctx: DeploymentAdapterContext): Promise<DeploymentResult> {
          ctx.logger?.info?.(`Adapting for ${ctx.projectRoot}`);
          events.push(`adapted:${ctx.projectRoot}`);
          return {
            success: true,
            target: 'workerd',
            outputDirectory: ctx.outputDir ?? `${ctx.projectRoot}/dist`,
            files: ['_worker.js'],
          };
        },
      };

      const logger: DeploymentLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      const result = await dummyAdapter.adapt({
        projectRoot: '/tmp/repo',
        outputDir: '/tmp/repo/build',
        logger,
      });

      expect(result.success).toBe(true);
      expect(result.target).toBe('workerd');
      expect(result.outputDirectory).toBe('/tmp/repo/build');
      expect(events).toContain('adapted:/tmp/repo');
      expect(logger.info).toHaveBeenCalledWith('Adapting for /tmp/repo');
    });
  });

  describe('Package Subpath Resolution and Re-exports', () => {
    it('allows dynamic import of @ranu/core root and capabilities entrypoint', async () => {
      const core = await import('../src/index.js');
      expect(core.RANU_VERSION).toBeDefined();
      expect(core.DEFAULT_OUT_DIR).toBeDefined();

      const capabilities = await import('../src/capabilities.js');
      expect(capabilities).toBeDefined();
    });

    it('resolves @ranu/core and @ranu/core/capabilities through package exports', async () => {
      // Dynamic import using package specifiers (verifies package.json exports mapping)
      const core = await import('@ranu/core');
      expect(core).toBeDefined();
      expect(core.RANU_VERSION).toBe('0.0.0');

      const coreCaps = await import('@ranu/core/capabilities');
      expect(coreCaps).toBeDefined();
    });
  });
});
