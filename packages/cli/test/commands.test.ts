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
        };`
      );

      const logger = createCliLogger({ quiet: true });
      const code1 = await runDeployCommand({ args: [], root: tempDir }, logger);
      expect(code1).toBe(0);

      const code2 = await runDeployCommand({ args: [], root: tempDir, json: true }, logger);
      expect(code2).toBe(0);
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
        };`
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
        start: vi.fn().mockResolvedValue({ url: 'http://localhost:3000', port: 3000, host: '127.0.0.1' }),
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
        'No production build found'
      );
    });

    it('throws when server entry exports no valid runtime', async () => {
      const buildServerDir = path.join(tempDir, '.ranu', 'build', 'server');
      fs.mkdirSync(buildServerDir, { recursive: true });
      const entryFile = path.join(buildServerDir, 'entry.mjs');
      fs.writeFileSync(entryFile, 'export default null;');

      const logger = createCliLogger({ quiet: true });
      await expect(runStartCommand({ args: [], root: tempDir }, logger)).rejects.toThrow(
        'did not export a valid runtime instance'
      );
    });

    it('starts production server and closes on SIGINT', async () => {
      const buildServerDir = path.join(tempDir, '.ranu', 'build', 'server');
      fs.mkdirSync(buildServerDir, { recursive: true });
      const entryFile = path.join(buildServerDir, 'entry.mjs');
      fs.writeFileSync(entryFile, 'export const runtime = { handle: () => {} };');

      const serverMock = {
        listen: vi.fn().mockResolvedValue({ host: '0.0.0.0', port: 3000 }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      const nodeServerSpy = vi.spyOn(nodeServerModule, 'createNodeServer').mockReturnValue(serverMock as any);

      const logger = createCliLogger({ quiet: true });
      const promise = runStartCommand({ args: [], root: tempDir }, logger);
      setTimeout(() => process.emit('SIGINT'), 50);
      const code = await promise;
      expect(code).toBe(0);

      // JSON mode with SIGTERM
      const promiseJson = runStartCommand({ args: [], root: tempDir, json: true }, logger);
      setTimeout(() => process.emit('SIGTERM'), 50);
      const codeJson = await promiseJson;
      expect(codeJson).toBe(0);

      nodeServerSpy.mockRestore();
    });
  });

  describe('runCli orchestrator', () => {
    it('dispatches to dev, build, start, deploy, create, help, and version', async () => {
      vi.spyOn(buildModule, 'build').mockResolvedValue({
        success: true,
        buildId: 'b1',
        outDir: 'out',
        duration: 10,
        diagnostics: [],
      });

      expect(await runCli(['--help'])).toBe(0);
      expect(await runCli(['--version'])).toBe(0);
      expect(await runCli(['version'])).toBe(0);
      expect(await runCli(['help', 'build'])).toBe(0);
      expect(await runCli(['create', 'test-app', '--json'])).toBe(0);
      expect(await runCli(['build', '--root', tempDir, '--json'])).toBe(0);
    });

    it('handles unexpected errors in JSON and debug mode', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      const codeJson = await runCli(['build', '--root', '/non/existent/path/123', '--json']);
      expect(codeJson).toBe(1);

      const codeDebug = await runCli(['build', '--root', '/non/existent/path/123', '--debug']);
      expect(codeDebug).toBe(1);

      errSpy.mockRestore();
      debugSpy.mockRestore();
    });
  });
});
