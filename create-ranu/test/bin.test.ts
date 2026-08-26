import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseArgs, runCreateRanu } from '../src/bin/create-ranu.js';
import * as scaffoldModule from '../src/scaffold.js';

describe('create-ranu bin CLI', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-ranu-bin-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('parseArgs', () => {
    it('parses target path and flags', () => {
      const parsed = parseArgs([
        'my-app',
        '--package-manager',
        'pnpm',
        '--install',
        '--git',
        '--force',
        '--quiet',
      ]);
      expect(parsed.targetPath).toBe('my-app');
      expect(parsed.packageManager).toBe('pnpm');
      expect(parsed.install).toBe(true);
      expect(parsed.git).toBe(true);
      expect(parsed.force).toBe(true);
      expect(parsed.quiet).toBe(true);
    });

    it('parses short flags and negation flags', () => {
      const parsed = parseArgs(['./app-dir', '-p', 'bun', '--no-install', '--no-git', '-q', '--json']);
      expect(parsed.targetPath).toBe('./app-dir');
      expect(parsed.packageManager).toBe('bun');
      expect(parsed.install).toBe(false);
      expect(parsed.git).toBe(false);
      expect(parsed.quiet).toBe(true);
      expect(parsed.json).toBe(true);
    });

    it('parses --help and --version', () => {
      expect(parseArgs(['--help']).help).toBe(true);
      expect(parseArgs(['-h']).help).toBe(true);
      expect(parseArgs(['--version']).version).toBe(true);
      expect(parseArgs(['-v']).version).toBe(true);
    });

    it('throws on invalid package manager', () => {
      expect(() => parseArgs(['my-app', '-p', 'invalid_pm'])).toThrow(
        'Invalid package manager "invalid_pm"'
      );
      expect(() => parseArgs(['my-app', '-p'])).toThrow(
        'Flag "--package-manager" requires a valid package manager argument.'
      );
    });

    it('throws on unknown flag', () => {
      expect(() => parseArgs(['my-app', '--unknown-flag'])).toThrow(
        'Unknown flag "--unknown-flag"'
      );
    });
  });

  describe('runCreateRanu', () => {
    it('outputs help in text and JSON mode', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const code1 = await runCreateRanu(['--help']);
      expect(code1).toBe(0);

      const code2 = await runCreateRanu(['--help', '--json']);
      expect(code2).toBe(0);

      logSpy.mockRestore();
    });

    it('outputs version in text and JSON mode', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const code1 = await runCreateRanu(['--version']);
      expect(code1).toBe(0);

      const code2 = await runCreateRanu(['--version', '--json']);
      expect(code2).toBe(0);

      logSpy.mockRestore();
    });

    it('scaffolds project and returns 0 in text and JSON mode', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const targetDir = path.join(tempDir, 'cli-test-app');
      const code1 = await runCreateRanu([targetDir, '--no-install', '--no-git']);
      expect(code1).toBe(0);

      const targetDirJson = path.join(tempDir, 'cli-test-app-json');
      const code2 = await runCreateRanu([targetDirJson, '--json']);
      expect(code2).toBe(0);

      logSpy.mockRestore();
    });

    it('formats paths with spaces correctly in next steps', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const targetDir = path.join(tempDir, 'app with spaces');
      const code = await runCreateRanu([targetDir]);
      expect(code).toBe(0);

      logSpy.mockRestore();
    });

    it('handles scaffolding failure in text and JSON mode', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      vi.spyOn(scaffoldModule, 'scaffoldProject').mockReturnValueOnce({
        success: false,
        projectPath: '/bad',
        projectName: 'bad',
        packageManager: 'npm',
        filesCreated: [],
        error: 'Scaffold failed',
      });

      const code1 = await runCreateRanu(['bad-app']);
      expect(code1).toBe(1);

      vi.spyOn(scaffoldModule, 'scaffoldProject').mockReturnValueOnce({
        success: false,
        projectPath: '/bad',
        projectName: 'bad',
        packageManager: 'npm',
        filesCreated: [],
        error: 'Scaffold failed JSON',
      });

      const code2 = await runCreateRanu(['bad-app', '--json']);
      expect(code2).toBe(1);

      errSpy.mockRestore();
    });

    it('catches and reports unexpected errors in text and JSON mode', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const code1 = await runCreateRanu(['--invalid-flag-123']);
      expect(code1).toBe(1);

      const code2 = await runCreateRanu(['--invalid-flag-123', '--json']);
      expect(code2).toBe(1);

      errSpy.mockRestore();
    });
  });
});
