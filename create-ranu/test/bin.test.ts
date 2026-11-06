import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseArgs, printHelp, runCreateRanu, normalizeAIEngine } from '../src/bin/create-ranu.js';
import * as scaffoldModule from '../src/scaffold.js';

describe('create-ranu bin CLI', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-ranu-bin-'));
    vi.restoreAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('parseArgs', () => {
    it('parses target path and flags', () => {
      const parsed = parseArgs([
        '',
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

    it('parses supported package manager arguments via -p and --package-manager', () => {
      expect(parseArgs(['-p', 'npm']).packageManager).toBe('npm');
      expect(parseArgs(['-p', 'pnpm']).packageManager).toBe('pnpm');
      expect(parseArgs(['-p', 'yarn']).packageManager).toBe('yarn');
      expect(parseArgs(['-p', 'bun']).packageManager).toBe('bun');
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
      expect(() => parseArgs(['my-app', '-p', '--git'])).toThrow(
        'Flag "--package-manager" requires a valid package manager argument.'
      );
    });

    it('throws on unknown flag', () => {
      expect(() => parseArgs(['my-app', '--unknown-flag'])).toThrow(
        'Unknown flag "--unknown-flag"'
      );
    });

    describe('--ai and --ai-engine flags', () => {
      it.each([
        ['none', 'none'],
        ['gemini', 'gemini'],
        ['groq', 'groq'],
        ['claude', 'claude'],
        ['openai', 'openai'],
        ['custom', 'custom'],
      ])('parses --ai %s flag correctly', (input, expected) => {
        const parsed = parseArgs(['my-app', '--ai', input]);
        expect(parsed.ai).toBe(expected);
      });

      it.each([
        ['gemini', 'gemini'],
        ['groq', 'groq'],
        ['claude', 'claude'],
      ])('parses --ai-engine %s alias flag correctly', (input, expected) => {
        const parsed = parseArgs(['my-app', '--ai-engine', input]);
        expect(parsed.ai).toBe(expected);
      });

      it.each([
        ['none', 'none'],
        ['false', 'none'],
        ['zero', 'none'],
        ['google', 'gemini'],
        ['ai-gemini', 'gemini'],
        ['ai-groq', 'groq'],
        ['anthropic', 'claude'],
        ['ai-claude', 'claude'],
        ['gpt', 'openai'],
        ['ai-openai', 'openai'],
        ['ollama', 'custom'],
        ['ai-custom', 'custom'],
      ])('normalizes alias %s to %s', (alias, expected) => {
        expect(normalizeAIEngine(alias)).toBe(expected);
        const parsed = parseArgs(['my-app', '--ai', alias]);
        expect(parsed.ai).toBe(expected);
      });

      it('defaults parsed.ai to undefined when flag is omitted', () => {
        const parsed = parseArgs(['my-app']);
        expect(parsed.ai).toBeUndefined();
      });

      it('throws descriptive error when --ai flag is missing argument', () => {
        expect(() => parseArgs(['my-app', '--ai'])).toThrow(
          'Flag "--ai" requires a valid AI engine argument.'
        );
        expect(() => parseArgs(['my-app', '--ai', '--git'])).toThrow(
          'Flag "--ai" requires a valid AI engine argument.'
        );
        expect(() => parseArgs(['my-app', '--ai-engine'])).toThrow(
          'Flag "--ai-engine" requires a valid AI engine argument.'
        );
      });

      it('throws descriptive error on invalid AI engine value', () => {
        expect(() => parseArgs(['my-app', '--ai', 'invalid_engine'])).toThrow(
          'Invalid AI engine "invalid_engine". Supported: none, gemini, groq, claude, openai, custom.'
        );
        expect(() => parseArgs(['my-app', '--ai-engine', 'mistral'])).toThrow(
          'Invalid AI engine "mistral". Supported: none, gemini, groq, claude, openai, custom.'
        );
      });
    });
  });

  describe('printHelp', () => {
    it('prints help message with --ai flags to console.log', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      printHelp();
      expect(logSpy).toHaveBeenCalled();
      const output = logSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain('--ai, --ai-engine <name>');
      expect(output).toContain('--ai gemini');
      logSpy.mockRestore();
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

    it('scaffolds with default my-ranu-app when no directory specified', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(scaffoldModule, 'scaffoldProject').mockReturnValueOnce({
        success: true,
        projectPath: process.cwd(),
        projectName: 'my-ranu-app',
        packageManager: 'pnpm',
        filesCreated: ['package.json'],
        ai: 'none',
      });

      const code = await runCreateRanu(['--quiet']);
      expect(code).toBe(0);
      logSpy.mockRestore();
    });

    it('formats paths with spaces correctly in next steps and current directory', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const targetDir = path.join(tempDir, 'folder with spaces', 'my-app');
      const code = await runCreateRanu([targetDir, '--no-install', '--no-git']);
      expect(code).toBe(0);

      // Test current directory relDir === '.'
      vi.spyOn(scaffoldModule, 'scaffoldProject').mockReturnValueOnce({
        success: true,
        projectPath: process.cwd(),
        projectName: 'current-dir-app',
        packageManager: 'pnpm',
        filesCreated: ['package.json'],
        ai: 'none',
      });

      const codeCurrent = await runCreateRanu(['.']);
      expect(codeCurrent).toBe(0);

      logSpy.mockRestore();
    });

    it('runs create-ranu successfully with --ai gemini and forwards to scaffoldProject', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const targetDir = path.join(tempDir, 'app-ai-gemini');
      const exitCode = await runCreateRanu([targetDir, '--ai', 'gemini', '--no-install', '--no-git', '--quiet']);
      expect(exitCode).toBe(0);
      expect(fs.existsSync(path.join(targetDir, 'app/routes/api.ai.ts'))).toBe(true);
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
        ai: 'none',
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
        ai: 'none',
        error: 'Scaffold failed JSON',
      });

      const code2 = await runCreateRanu(['bad-app', '--json']);
      expect(code2).toBe(1);

      errSpy.mockRestore();
    });

    it('rejects invalid --ai in runCreateRanu with exit code 1 in text and JSON modes', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const exitCode1 = await runCreateRanu(['bad-app', '--ai', 'unknown-model']);
      expect(exitCode1).toBe(1);

      const exitCode2 = await runCreateRanu(['bad-app', '--ai', 'unknown-model', '--json']);
      expect(exitCode2).toBe(1);
      errSpy.mockRestore();
    });

    it('catches and reports unexpected errors in text and JSON mode, including non-Error types', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const code1 = await runCreateRanu(['--invalid-flag-123']);
      expect(code1).toBe(1);

      const code2 = await runCreateRanu(['--invalid-flag-123', '--json']);
      expect(code2).toBe(1);

      // Non-Error thrown
      vi.spyOn(scaffoldModule, 'scaffoldProject').mockImplementationOnce(() => {
        throw 'Fatal string exception';
      });
      const code3 = await runCreateRanu(['app-crash', '--json']);
      expect(code3).toBe(1);

      vi.spyOn(scaffoldModule, 'scaffoldProject').mockImplementationOnce(() => {
        throw 'Fatal string exception text';
      });
      const code4 = await runCreateRanu(['app-crash-text']);
      expect(code4).toBe(1);

      errSpy.mockRestore();
    });
  });
});
