import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as buildModule from '@ranu/build';
import * as devModule from '@ranu/dev';
import * as nodeServerModule from '@ranu/runtime-node';
import { runBuildCommand } from '../src/commands/build.js';
import { runDeployCommand } from '../src/commands/deploy.js';
import { runDevCommand } from '../src/commands/dev.js';
import { runStartCommand } from '../src/commands/start.js';
import { runHelpCommand } from '../src/commands/help.js';
import { runVersionCommand } from '../src/commands/version.js';
import { runCreateCommand } from '../src/commands/create.js';
import { createCliLogger } from '../src/logger.js';
import { runCli } from '../src/cli.js';

describe('@ranu/cli commands comprehensive', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-cli-test-'));
    fs.mkdirSync(path.join(tempDir, 'app'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('runHelpCommand', () => {
    it('handles all known subcommands and unknown subcommands in text and JSON mode', () => {
      const logger = createCliLogger({ quiet: true });
      expect(runHelpCommand(undefined, logger)).toBe(0);
      expect(runHelpCommand('dev', logger)).toBe(0);
      expect(runHelpCommand('build', logger)).toBe(0);
      expect(runHelpCommand('start', logger)).toBe(0);
      expect(runHelpCommand('create', logger)).toBe(0);
      expect(runHelpCommand('deploy', logger)).toBe(0);
      expect(runHelpCommand('unknownSub', logger)).toBe(0);

      // JSON mode
      expect(runHelpCommand(undefined, logger, true)).toBe(0);
      expect(runHelpCommand('dev', logger, true)).toBe(0);
    });

    it('uses console.log when logger is not provided', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      expect(runHelpCommand()).toBe(0);
      expect(runHelpCommand('dev')).toBe(0);
      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });

  describe('runVersionCommand', () => {
    it('outputs version in text and JSON mode', () => {
      const logger = createCliLogger({ quiet: true });
      expect(runVersionCommand({ args: [] }, logger)).toBe(0);
      expect(runVersionCommand({ args: [], json: true }, logger)).toBe(0);
    });
  });

  describe('runCreateCommand', () => {
    it('outputs create instructions in text and JSON mode', () => {
      const logger = createCliLogger({ quiet: true });
      expect(runCreateCommand({ args: ['my-app'] }, logger)).toBe(0);
      expect(runCreateCommand({ args: [], json: true }, logger)).toBe(0);
    });
  });

  describe('runBuildCommand', () => {
    it('handles successful build in text and JSON mode', async () => {
      const buildSpy = vi.spyOn(buildModule, 'build').mockResolvedValue({
        success: true,
        buildId: 'test-build-id',
        outDir: path.join(tempDir, '.ranu', 'build'),
        duration: 250,
        diagnostics: [],
      });

      const logger = createCliLogger({ quiet: true });
      const code1 = await runBuildCommand({ args: [], root: tempDir }, logger);
      expect(code1).toBe(0);

      const code2 = await runBuildCommand({ args: [], root: tempDir, json: true }, logger);
      expect(code2).toBe(0);
      buildSpy.mockRestore();
    });

    it('handles failed build with diagnostics in text and JSON mode', async () => {
      const buildSpy = vi.spyOn(buildModule, 'build').mockResolvedValue({
        success: false,
        buildId: 'failed-id',
        outDir: path.join(tempDir, '.ranu', 'build'),
        duration: 100,
        diagnostics: [
          {
            code: 'RANU_SYNTAX_ERROR',
            message: 'Syntax error occurred',
            severity: 'error',
            location: { file: 'app/routes.tsx', line: 10 },
          },
          {
            code: 'RANU_BUILD_WARN',
            message: 'Warning without file location',
            severity: 'warning',
          },
        ],
      });

      const logger = createCliLogger({ quiet: true });
      const code1 = await runBuildCommand({ args: [], root: tempDir }, logger);
      expect(code1).toBe(1);

      const code2 = await runBuildCommand({ args: [], root: tempDir, json: true }, logger);
      expect(code2).toBe(1);
      buildSpy.mockRestore();
    });
  });

  describe('runDeployCommand', () => {
    it('rejects unsupported CLI adapters in text and JSON modes', async () => {
      const logger = createCliLogger({ quiet: true });
      const error = vi.spyOn(logger, 'error');
      const json = vi.spyOn(logger, 'json');

      expect(await runDeployCommand({ args: [], root: tempDir, adapter: 'unknown' }, logger)).toBe(
        1,
      );
      expect(error).toHaveBeenCalledWith(expect.stringContaining('Unsupported deployment adapter'));
      expect(
        await runDeployCommand({ args: [], root: tempDir, adapter: 'unknown', json: true }, logger),
      ).toBe(1);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.stringContaining('Unsupported') }),
      );
    });

    it('warns when no adapter is configured in text and JSON mode', async () => {
      const logger = createCliLogger({ quiet: true });
      const code1 = await runDeployCommand({ args: [], root: tempDir }, logger);
      expect(code1).toBe(1);

      const code2 = await runDeployCommand({ args: [], root: tempDir, json: true }, logger);
      expect(code2).toBe(1);
    });

    it('executes adapt when valid adapter is configured', async () => {
      const configFile = path.join(tempDir, 'ranu.config.ts');
      fs.writeFileSync(
        configFile,
        `export default {
          deployment: {
            adapter: {
              name: 'test-adapter',
              adapt: async () => {},
            },
          },
        };`,
      );

      const logger = createCliLogger({ quiet: true });
      const code1 = await runDeployCommand({ args: [], root: tempDir }, logger);
      expect(code1).toBe(0);

      const code2 = await runDeployCommand({ args: [], root: tempDir, json: true }, logger);
      expect(code2).toBe(0);
    });

    it('reports adapter success details, explicit failure, and thrown errors', async () => {
      const logger = createCliLogger({ quiet: true });
      const json = vi.spyOn(logger, 'json');
      const configFile = path.join(tempDir, 'ranu.config.ts');
      fs.writeFileSync(
        configFile,
        `export default { deployment: { adapter: {
          name: 'result-adapter',
          adapt: async () => ({ success: true, outputDirectory: '/output', files: ['one.js'] })
        } } };`,
      );
      expect(await runDeployCommand({ args: [], root: tempDir, json: true }, logger)).toBe(0);
      expect(json).toHaveBeenLastCalledWith(
        expect.objectContaining({ outputDirectory: '/output', files: ['one.js'] }),
      );

      fs.writeFileSync(
        configFile,
        `export default { deployment: { adapter: {
          name: 'failed-adapter', adapt: async () => ({ success: false })
        } } };`,
      );
      expect(await runDeployCommand({ args: [], root: tempDir }, logger)).toBe(1);

      fs.writeFileSync(
        configFile,
        `export default { deployment: { adapter: {
          name: 'throwing-adapter', adapt: async () => { throw new Error('adapt exploded') }
        } } };`,
      );
      expect(await runDeployCommand({ args: [], root: tempDir }, logger)).toBe(1);
      expect(await runDeployCommand({ args: [], root: tempDir, json: true }, logger)).toBe(1);
      expect(json).toHaveBeenLastCalledWith(
        expect.objectContaining({ success: false, error: 'adapt exploded' }),
      );
    });

    it('returns error when adapter lacks adapt method', async () => {
      const configFile = path.join(tempDir, 'ranu.config.ts');
      fs.writeFileSync(
        configFile,
        `export default {
          deployment: {
            adapter: {
              name: 'invalid-adapter',
            },
          },
        };`,
      );

      const logger = createCliLogger({ quiet: true });
      const code1 = await runDeployCommand({ args: [], root: tempDir }, logger);
      expect(code1).toBe(1);

      const code2 = await runDeployCommand({ args: [], root: tempDir, json: true }, logger);
      expect(code2).toBe(1);
    });
  });

  describe('runDevCommand', () => {
    it('starts dev server and terminates gracefully on SIGINT', async () => {
      const devServerMock = {
        start: vi
          .fn()
          .mockResolvedValue({ url: 'http://localhost:3000', port: 3000, host: '127.0.0.1' }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      const devSpy = vi.spyOn(devModule, 'createDevServer').mockReturnValue(devServerMock as any);

      const logger = createCliLogger({ quiet: true });
      const promise = runDevCommand({ args: [], root: tempDir }, logger);

      setTimeout(() => process.emit('SIGINT'), 50);
      const code = await promise;
      expect(code).toBe(0);
      expect(devServerMock.start).toHaveBeenCalled();
      expect(devServerMock.close).toHaveBeenCalled();

      // Test JSON mode with SIGTERM
      const promiseJson = runDevCommand({ args: [], root: tempDir, json: true }, logger);
      setTimeout(() => process.emit('SIGTERM'), 50);
      const codeJson = await promiseJson;
      expect(codeJson).toBe(0);

      devSpy.mockRestore();
    });
  });

  describe('runStartCommand', () => {
    it('throws when production build is missing', async () => {
      const logger = createCliLogger({ quiet: true });
      await expect(runStartCommand({ args: [], root: tempDir }, logger)).rejects.toThrow(
        'No valid production build found',
      );
    });

    it('throws when a production build is incomplete', async () => {
      const buildServerDir = path.join(tempDir, '.ranu', 'build', 'server');
      fs.mkdirSync(buildServerDir, { recursive: true });
      const entryFile = path.join(buildServerDir, 'entry.mjs');
      fs.writeFileSync(entryFile, 'export default null;');

      const logger = createCliLogger({ quiet: true });
      await expect(runStartCommand({ args: [], root: tempDir }, logger)).rejects.toThrow(
        'No valid production build found',
      );
    });

    it('starts production server and closes on SIGINT', async () => {
      const buildServerDir = path.join(tempDir, '.ranu', 'build', 'server');
      fs.mkdirSync(buildServerDir, { recursive: true });
      const entryFile = path.join(buildServerDir, 'entry.mjs');
      fs.writeFileSync(entryFile, 'export const runtime = { handle: () => {} };');
      fs.writeFileSync(path.join(tempDir, '.ranu', 'build', 'build.json'), '{}');

      const serverMock = {
        listen: vi.fn().mockResolvedValue({ host: '0.0.0.0', port: 3000 }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      const nodeServerSpy = vi
        .spyOn(nodeServerModule, 'createProductionServer')
        .mockResolvedValue(serverMock as any);

      const logger = createCliLogger({ quiet: true });
      const promise = runStartCommand({ args: [], root: tempDir }, logger);
      setTimeout(() => process.emit('SIGINT'), 50);
      const code = await promise;
      expect(code).toBe(0);

      // JSON mode with SIGTERM
      const jsonSpy = vi.spyOn(logger, 'json');
      const promiseJson = runStartCommand({ args: [], root: tempDir, json: true }, logger);
      setTimeout(() => process.emit('SIGTERM'), 50);
      const codeJson = await promiseJson;
      expect(codeJson).toBe(0);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'http://127.0.0.1:3000' }),
      );

      nodeServerSpy.mockRestore();
    });

    it('uses environment values, ignores invalid ports, and gives CLI values precedence', async () => {
      const buildServerDir = path.join(tempDir, '.ranu', 'build', 'server');
      fs.mkdirSync(buildServerDir, { recursive: true });
      fs.writeFileSync(path.join(buildServerDir, 'entry.mjs'), 'export default {};');
      fs.writeFileSync(path.join(tempDir, '.ranu', 'build', 'build.json'), '{}');
      const serverMock = {
        listen: vi.fn().mockResolvedValue({ host: '', port: 4321 }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      const createServer = vi
        .spyOn(nodeServerModule, 'createProductionServer')
        .mockResolvedValue(serverMock as any);
      const previousPort = process.env.PORT;
      const previousHost = process.env.HOST;
      process.env.PORT = '4100';
      process.env.HOST = 'env-host';

      try {
        let promise = runStartCommand(
          { args: [], root: tempDir },
          createCliLogger({ quiet: true }),
        );
        setTimeout(() => process.emit('SIGINT'), 10);
        await promise;
        expect(createServer).toHaveBeenLastCalledWith(
          expect.objectContaining({ port: 4100, host: 'env-host' }),
        );

        process.env.PORT = 'invalid';
        promise = runStartCommand(
          { args: [], root: tempDir, port: 4200, host: 'cli-host' },
          createCliLogger({ quiet: true }),
        );
        setTimeout(() => process.emit('SIGINT'), 10);
        await promise;
        expect(createServer).toHaveBeenLastCalledWith(
          expect.objectContaining({ port: 4200, host: 'cli-host' }),
        );
      } finally {
        if (previousPort === undefined) delete process.env.PORT;
        else process.env.PORT = previousPort;
        if (previousHost === undefined) delete process.env.HOST;
        else process.env.HOST = previousHost;
      }
    });
  });

  describe('runCli orchestrator', () => {
    it('dispatches to dev, build, start, deploy, create, help, version, and default', async () => {
      vi.spyOn(buildModule, 'build').mockResolvedValue({
        success: true,
        buildId: 'b1',
        outDir: 'out',
        duration: 10,
        diagnostics: [],
      });

      const devServerMock = {
        start: vi
          .fn()
          .mockResolvedValue({ url: 'http://localhost:3000', port: 3000, host: '127.0.0.1' }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      vi.spyOn(devModule, 'createDevServer').mockReturnValue(devServerMock as any);

      const buildServerDir = path.join(tempDir, '.ranu', 'build', 'server');
      fs.mkdirSync(buildServerDir, { recursive: true });
      fs.writeFileSync(
        path.join(buildServerDir, 'entry.mjs'),
        'export default { handle: () => {} };',
      );
      fs.writeFileSync(path.join(tempDir, '.ranu', 'build', 'build.json'), '{}');
      const serverMock = {
        listen: vi.fn().mockResolvedValue({ host: '0.0.0.0', port: 3000 }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      vi.spyOn(nodeServerModule, 'createProductionServer').mockResolvedValue(serverMock as any);

      // Default dispatch when no command provided
      expect(await runCli([])).toBe(0);
      expect(await runCli(['--help'])).toBe(0);
      expect(await runCli(['--version'])).toBe(0);
      expect(await runCli(['version'])).toBe(0);
      expect(await runCli(['help', 'build'])).toBe(0);
      expect(await runCli(['create', 'test-app', '--json'])).toBe(0);
      expect(await runCli(['build', '--root', tempDir, '--json'])).toBe(0);

      // Dispatch dev
      const devPromise = runCli(['dev', '--root', tempDir]);
      setTimeout(() => process.emit('SIGINT'), 50);
      expect(await devPromise).toBe(0);

      // Dispatch start
      const startPromise = runCli(['start', '--root', tempDir]);
      setTimeout(() => process.emit('SIGINT'), 50);
      expect(await startPromise).toBe(0);

      // Dispatch deploy (without adapter returns 1)
      expect(await runCli(['deploy', '--root', tempDir])).toBe(1);
    });

    it('handles unexpected errors and non-Error throws in JSON and debug mode', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      const codeJson = await runCli(['build', '--root', '/non/existent/path/123', '--json']);
      expect(codeJson).toBe(1);

      const codeDebug = await runCli(['build', '--root', '/non/existent/path/123', '--debug']);
      expect(codeDebug).toBe(1);

      // Non-Error throw
      vi.spyOn(buildModule, 'build').mockImplementation(() => {
        throw 'String error thrown';
      });
      const codeStringErr = await runCli(['build', '--root', tempDir]);
      expect(codeStringErr).toBe(1);

      errSpy.mockRestore();
      debugSpy.mockRestore();
    });
  });
});
