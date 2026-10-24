import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scaffoldProject } from '../../create-ranu/src/index.js';
import { build } from '@ranu/build';

const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/;
const CLI_PATH = path.resolve(__dirname, '../../create-ranu/dist/bin/create-ranu.js');

interface CliRunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function runCliProcess(
  args: string[],
  options: {
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    cwd?: string;
    input?: string;
  } = {}
): Promise<CliRunResult> {
  return new Promise((resolve) => {
    const timeoutMs = options.timeoutMs ?? 7000;
    let timedOut = false;

    // vitest sets NODE_ENV='test'. Since create-ranu bin checks `process.env.NODE_ENV !== 'test'`
    // to auto-invoke `runCreateRanu()`, we must explicitly pass NODE_ENV='development' unless overridden.
    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: options.env?.NODE_ENV ?? 'development',
      ...(options.env ?? {}),
    };

    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      cwd: options.cwd ?? os.tmpdir(),
      env: childEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');

    child.stdout.on('data', (d) => {
      stdout += d;
    });

    child.stderr.on('data', (d) => {
      stderr += d;
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    if (options.input !== undefined) {
      child.stdin.write(options.input);
    }
    child.stdin.end();

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

describe('create-ranu Adversarial Stress Test Suite (Challenger 2)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-challenger2-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // cleanup best effort on Windows file locks
      }
    }
  });

  // =========================================================================
  // 1. --json Flag Output Validation & Strict Cleanliness
  // =========================================================================
  describe('Scope 1: --json Flag Output Cleanliness & Zero ANSI / Prompt Leaks', () => {
    it('emits strictly valid JSON with hasCredentials=true and zero ANSI when credentials provided', async () => {
      const projectDir = path.join(tempDir, 'json-gemini-keyed');
      const res = await runCliProcess([
        projectDir,
        '--ai',
        'gemini',
        '--api-key',
        'AIzaSyAdversarialKey123',
        '--no-install',
        '--no-git',
        '--json',
      ]);

      expect(res.timedOut).toBe(false);
      expect(res.code).toBe(0);
      expect(res.stderr).toBe('');

      // Verify zero ANSI escapes in stdout
      expect(res.stdout).not.toMatch(ANSI_REGEX);
      expect(res.stdout).not.toContain('\x1b');

      // Verify zero prompt leaks
      expect(res.stdout).not.toContain('Creating a new Ranu.js project');
      expect(res.stdout).not.toContain('Success!');
      expect(res.stdout).not.toContain('Enter choice');

      // Verify strictly valid JSON
      let parsed: any;
      expect(() => {
        parsed = JSON.parse(res.stdout.trim());
      }).not.toThrow();

      expect(parsed.success).toBe(true);
      expect(parsed.hasCredentials).toBe(true);
      expect(parsed.ai).toBe('gemini');
      expect(parsed.filesCreated).toContain('.env');
      expect(parsed.filesCreated).toContain('.env.example');
      expect(parsed.filesCreated).toContain('.gitignore');

      // Verify on-disk file
      const envPath = path.join(projectDir, '.env');
      expect(fs.existsSync(envPath)).toBe(true);
      const envBody = fs.readFileSync(envPath, 'utf-8');
      expect(envBody).toContain('GEMINI_API_KEY=AIzaSyAdversarialKey123');
    });

    it('emits strictly valid JSON with hasCredentials=false and zero ANSI when AI chosen without credentials', async () => {
      const projectDir = path.join(tempDir, 'json-gemini-nokey');
      const res = await runCliProcess([
        projectDir,
        '--ai',
        'gemini',
        '--no-install',
        '--no-git',
        '--json',
      ]);

      expect(res.timedOut).toBe(false);
      expect(res.code).toBe(0);
      expect(res.stderr).toBe('');
      expect(res.stdout).not.toMatch(ANSI_REGEX);

      const parsed = JSON.parse(res.stdout.trim());
      expect(parsed.success).toBe(true);
      expect(parsed.hasCredentials).toBe(false);
      expect(parsed.ai).toBe('gemini');
      expect(parsed.filesCreated).not.toContain('.env');
      expect(parsed.filesCreated).toContain('.env.example');

      expect(fs.existsSync(path.join(projectDir, '.env'))).toBe(false);
      expect(fs.existsSync(path.join(projectDir, '.env.example'))).toBe(true);
    });

    it('emits strictly valid JSON with hasCredentials=false for Zero AI (--ai none)', async () => {
      const projectDir = path.join(tempDir, 'json-zero-ai');
      const res = await runCliProcess([
        projectDir,
        '--ai',
        'none',
        '--no-install',
        '--no-git',
        '--json',
      ]);

      expect(res.timedOut).toBe(false);
      expect(res.code).toBe(0);
      expect(res.stderr).toBe('');
      expect(res.stdout).not.toMatch(ANSI_REGEX);

      const parsed = JSON.parse(res.stdout.trim());
      expect(parsed.success).toBe(true);
      expect(parsed.hasCredentials).toBe(false);
      expect(parsed.ai).toBe('none');
      expect(parsed.filesCreated).not.toContain('.env');
      expect(parsed.filesCreated).not.toContain('.env.example');
    });

    it('emits strictly valid JSON with hasCredentials=true for custom AI with endpoint', async () => {
      const projectDir = path.join(tempDir, 'json-custom-endpoint');
      const res = await runCliProcess([
        projectDir,
        '--ai',
        'custom',
        '--endpoint',
        'http://internal-ai:11434',
        '--no-install',
        '--no-git',
        '--json',
      ]);

      expect(res.timedOut).toBe(false);
      expect(res.code).toBe(0);
      expect(res.stderr).toBe('');
      expect(res.stdout).not.toMatch(ANSI_REGEX);

      const parsed = JSON.parse(res.stdout.trim());
      expect(parsed.success).toBe(true);
      expect(parsed.hasCredentials).toBe(true);
      expect(parsed.ai).toBe('custom');
      expect(parsed.filesCreated).toContain('.env');

      const envBody = fs.readFileSync(path.join(projectDir, '.env'), 'utf-8');
      expect(envBody).toContain('CUSTOM_AI_ENDPOINT=http://internal-ai:11434');
    });

    it('emits strictly valid JSON on CLI errors with zero ANSI', async () => {
      const res = await runCliProcess(['--json', '--ai', 'invalid-provider-xyz']);

      expect(res.timedOut).toBe(false);
      expect(res.code).toBe(1);

      // In error mode with --json, error is printed as JSON to stderr
      expect(res.stderr).not.toMatch(ANSI_REGEX);
      const parsed = JSON.parse(res.stderr.trim());
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Invalid AI engine');
    });

    it('emits strictly valid JSON for --help and --version with zero ANSI', async () => {
      const helpRes = await runCliProcess(['--help', '--json']);
      expect(helpRes.timedOut).toBe(false);
      expect(helpRes.code).toBe(0);
      expect(helpRes.stdout).not.toMatch(ANSI_REGEX);
      const helpJson = JSON.parse(helpRes.stdout.trim());
      expect(helpJson.name).toBe('create-ranu');
      expect(helpJson.version).toBeDefined();

      const versionRes = await runCliProcess(['--version', '--json']);
      expect(versionRes.timedOut).toBe(false);
      expect(versionRes.code).toBe(0);
      expect(versionRes.stdout).not.toMatch(ANSI_REGEX);
      const versionJson = JSON.parse(versionRes.stdout.trim());
      expect(versionJson.version).toBeDefined();
    });
  });

  // =========================================================================
  // 2. Non-Interactive Execution in Simulated CI Environment
  // =========================================================================
  describe('Scope 2: Non-Interactive Execution in Simulated CI Environment (CI=1, non-TTY)', () => {
    it('never hangs or prompts when no flags are given under CI=1 (defaults to Zero AI)', async () => {
      const projectDir = path.join(tempDir, 'ci-defaults-app');
      const startTime = Date.now();
      const res = await runCliProcess(
        [projectDir, '--no-install', '--no-git'],
        {
          env: { CI: '1' },
          timeoutMs: 5000,
        }
      );
      const elapsed = Date.now() - startTime;

      expect(res.timedOut).toBe(false);
      expect(elapsed).toBeLessThan(4500);
      expect(res.code).toBe(0);
      expect(res.stdout).not.toContain('Select AI Engine:');
      expect(fs.existsSync(path.join(projectDir, 'package.json'))).toBe(true);
    });

    it('never hangs or prompts when CI=true', async () => {
      const projectDir = path.join(tempDir, 'ci-true-app');
      const startTime = Date.now();
      const res = await runCliProcess(
        [projectDir, '--no-install', '--no-git'],
        {
          env: { CI: 'true' },
          timeoutMs: 5000,
        }
      );
      const elapsed = Date.now() - startTime;

      expect(res.timedOut).toBe(false);
      expect(elapsed).toBeLessThan(4500);
      expect(res.code).toBe(0);
      expect(fs.existsSync(path.join(projectDir, 'package.json'))).toBe(true);
    });

    it('never hangs when --ai gemini is provided without api key under CI=1', async () => {
      const projectDir = path.join(tempDir, 'ci-gemini-unattended');
      const startTime = Date.now();
      const res = await runCliProcess(
        [projectDir, '--ai', 'gemini', '--no-install', '--no-git'],
        {
          env: { CI: '1' },
          timeoutMs: 5000,
        }
      );
      const elapsed = Date.now() - startTime;

      expect(res.timedOut).toBe(false);
      expect(elapsed).toBeLessThan(4500);
      expect(res.code).toBe(0);
      expect(res.stdout).not.toContain('Enter Google Gemini API Key');
      expect(res.stdout).toContain('Skipped');
      expect(fs.existsSync(path.join(projectDir, '.env'))).toBe(false);
      expect(fs.existsSync(path.join(projectDir, '.env.example'))).toBe(true);
    });

    it('never hangs when --ai custom is provided without endpoint under CI=1', async () => {
      const projectDir = path.join(tempDir, 'ci-custom-unattended');
      const startTime = Date.now();
      const res = await runCliProcess(
        [projectDir, '--ai', 'custom', '--no-install', '--no-git'],
        {
          env: { CI: '1' },
          timeoutMs: 5000,
        }
      );
      const elapsed = Date.now() - startTime;

      expect(res.timedOut).toBe(false);
      expect(elapsed).toBeLessThan(4500);
      expect(res.code).toBe(0);
      expect(res.stdout).not.toContain('Local / Custom AI Endpoint URL');
      expect(fs.existsSync(path.join(projectDir, 'package.json'))).toBe(true);
    });
  });

  // =========================================================================
  // 3. Custom Endpoint Normalization & .env Format Stress
  // =========================================================================
  describe('Scope 3: Custom Endpoint Normalization & .env Format Stress', () => {
    it('normalizes custom endpoint with leading/trailing whitespace', () => {
      const projectDir = path.join(tempDir, 'endpoint-whitespace');
      const result = scaffoldProject({
        projectPath: projectDir,
        packageManager: 'pnpm',
        ai: 'custom',
        endpoint: '   http://127.0.0.1:8000/v1/chat   ',
        apiKey: '  custom-secret-key-99  ',
        quiet: true,
      });

      expect(result.success).toBe(true);
      expect(result.hasCredentials).toBe(true);

      const envContent = fs.readFileSync(path.join(projectDir, '.env'), 'utf-8');
      expect(envContent).toContain('CUSTOM_AI_ENDPOINT=http://127.0.0.1:8000/v1/chat');
      expect(envContent).toContain('CUSTOM_AI_KEY=custom-secret-key-99');
      // Ensure no raw untrimmed spaces
      expect(envContent).not.toContain('   http');

      // Verify route file consumes baseURL
      const routeContent = fs.readFileSync(path.join(projectDir, 'app/routes/api.ai.ts'), 'utf-8');
      expect(routeContent).toContain('http://127.0.0.1:8000/v1/chat');
    });

    it('handles custom endpoint with trailing slash and query/port components', () => {
      const projectDir = path.join(tempDir, 'endpoint-trailing-slash');
      const result = scaffoldProject({
        projectPath: projectDir,
        packageManager: 'pnpm',
        ai: 'custom',
        endpoint: 'https://ollama.internal.net:11434/',
        quiet: true,
      });

      expect(result.success).toBe(true);
      expect(result.hasCredentials).toBe(true);

      const envContent = fs.readFileSync(path.join(projectDir, '.env'), 'utf-8');
      expect(envContent).toContain('CUSTOM_AI_ENDPOINT=https://ollama.internal.net:11434/');
    });

    it('handles API keys with special characters, symbols, and quotes safely in .env', () => {
      const specialKey = 'sk-proj_$#!=@+-~`^%&*()[]{}:;,./?|';
      const projectDir = path.join(tempDir, 'special-key-app');
      const result = scaffoldProject({
        projectPath: projectDir,
        packageManager: 'pnpm',
        ai: 'openai',
        apiKey: specialKey,
        quiet: true,
      });

      expect(result.success).toBe(true);
      expect(result.hasCredentials).toBe(true);

      const envContent = fs.readFileSync(path.join(projectDir, '.env'), 'utf-8');
      expect(envContent).toBe(`PORT=3000\nOPENAI_API_KEY=${specialKey}\n`);

      // Verify each non-empty line in .env is a valid KEY=VALUE assignment
      const lines = envContent.trim().split('\n');
      for (const line of lines) {
        expect(line).toMatch(/^[A-Z0-9_]+=.*$/);
      }
    });

    it('rigorously verifies .gitignore and .dockerignore shield .env across presets', () => {
      // Default template
      const defaultDir = path.join(tempDir, 'shield-default');
      scaffoldProject({
        projectPath: defaultDir,
        packageManager: 'pnpm',
        ai: 'gemini',
        apiKey: 'secret-shield-key',
        quiet: true,
      });

      const gitignore = fs.readFileSync(path.join(defaultDir, '.gitignore'), 'utf-8');
      const gitignoreLines = gitignore.split(/\r?\n/).map((l) => l.trim());
      expect(gitignoreLines).toContain('.env');
      expect(gitignoreLines).toContain('.env*.local');
      expect(gitignoreLines).toContain('!.env.example');

      // node-docker template (includes .dockerignore)
      const dockerDir = path.join(tempDir, 'shield-docker');
      scaffoldProject({
        projectPath: dockerDir,
        template: 'node-docker',
        packageManager: 'pnpm',
        ai: 'groq',
        apiKey: 'gsk-docker-key',
        quiet: true,
      });

      const dockerignore = fs.readFileSync(path.join(dockerDir, '.dockerignore'), 'utf-8');
      const dockerLines = dockerignore.split(/\r?\n/).map((l) => l.trim());
      expect(dockerLines).toContain('.env');
      expect(dockerLines).toContain('.env*.local');
      expect(dockerLines).toContain('!.env.example');
    });

    it('treats empty or whitespace-only apiKey as skipped credentials', () => {
      const projectDir = path.join(tempDir, 'empty-key-app');
      const result = scaffoldProject({
        projectPath: projectDir,
        packageManager: 'pnpm',
        ai: 'claude',
        apiKey: '    ',
        quiet: true,
      });

      expect(result.success).toBe(true);
      expect(result.hasCredentials).toBe(false);
      expect(fs.existsSync(path.join(projectDir, '.env'))).toBe(false);
      expect(fs.existsSync(path.join(projectDir, '.env.example'))).toBe(true);
    });
  });

  // =========================================================================
  // 4. Build Scaffolded Projects Using @ranu/build Cleanliness
  // =========================================================================
  describe('Scope 4: Build Scaffolded Projects Using @ranu/build', () => {
    it('scaffolds with --ai gemini + apiKey and builds successfully with @ranu/build', async () => {
      const projectDir = path.join(tempDir, 'gemini-build-app');
      const result = scaffoldProject({
        projectPath: projectDir,
        packageManager: 'pnpm',
        ai: 'gemini',
        apiKey: 'AIzaSyAdversarialBuild123',
        template: 'default',
        quiet: true,
      });

      expect(result.success).toBe(true);
      expect(result.hasCredentials).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.env'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'app/routes/api.ai.ts'))).toBe(true);

      const buildResult = await build({
        projectRoot: projectDir,
        mode: 'production',
        minify: false,
        sourceMaps: false,
      });

      expect(buildResult.success).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.ranu', 'build', 'manifest', 'routes.json'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.ranu', 'build', 'server', 'entry.mjs'))).toBe(true);
      const manifestContent = JSON.parse(
        fs.readFileSync(path.join(projectDir, '.ranu', 'build', 'manifest', 'routes.json'), 'utf-8')
      );
      expect(manifestContent).toBeDefined();
      expect(manifestContent.routes).toBeInstanceOf(Array);
    });

    it('scaffolds with --ai gemini (skipped apiKey) and builds successfully with @ranu/build', async () => {
      const projectDir = path.join(tempDir, 'gemini-skipped-build-app');
      const result = scaffoldProject({
        projectPath: projectDir,
        packageManager: 'pnpm',
        ai: 'gemini',
        template: 'default',
        quiet: true,
      });

      expect(result.success).toBe(true);
      expect(result.hasCredentials).toBe(false);
      expect(fs.existsSync(path.join(projectDir, '.env'))).toBe(false);

      const buildResult = await build({
        projectRoot: projectDir,
        mode: 'production',
        minify: false,
        sourceMaps: false,
      });

      expect(buildResult.success).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.ranu', 'build', 'server', 'entry.mjs'))).toBe(true);
    });

    it('scaffolds with --ai custom (custom endpoint + key) and builds successfully with @ranu/build', async () => {
      const projectDir = path.join(tempDir, 'custom-keyed-build-app');
      const result = scaffoldProject({
        projectPath: projectDir,
        packageManager: 'pnpm',
        ai: 'custom',
        endpoint: 'http://my-ollama:11434',
        apiKey: 'tok-custom-key',
        template: 'default',
        quiet: true,
      });

      expect(result.success).toBe(true);
      expect(result.hasCredentials).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.env'))).toBe(true);

      const buildResult = await build({
        projectRoot: projectDir,
        mode: 'production',
        minify: false,
        sourceMaps: false,
      });

      expect(buildResult.success).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.ranu', 'build', 'manifest', 'routes.json'))).toBe(true);
    });

    it('scaffolds with api-routes template + gemini and builds successfully with @ranu/build', async () => {
      const projectDir = path.join(tempDir, 'api-routes-gemini-build');
      const result = scaffoldProject({
        projectPath: projectDir,
        packageManager: 'pnpm',
        ai: 'gemini',
        apiKey: 'AIzaSyTestKey123',
        template: 'api-routes',
        quiet: true,
      });

      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.env'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'app/routes/api.ai.ts'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'app/api/hello/route.ts'))).toBe(true);

      const buildResult = await build({
        projectRoot: projectDir,
        mode: 'production',
        minify: false,
        sourceMaps: false,
      });

      expect(buildResult.success).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.ranu', 'build', 'manifest', 'routes.json'))).toBe(true);
    });

    it('scaffolds with node-docker template + openai and builds successfully with @ranu/build', async () => {
      const projectDir = path.join(tempDir, 'docker-openai-build');
      const result = scaffoldProject({
        projectPath: projectDir,
        packageManager: 'pnpm',
        ai: 'openai',
        apiKey: 'sk-proj-docker-123',
        template: 'node-docker',
        quiet: true,
      });

      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(projectDir, 'Dockerfile'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.dockerignore'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.env'))).toBe(true);

      const buildResult = await build({
        projectRoot: projectDir,
        mode: 'production',
        minify: false,
        sourceMaps: false,
      });

      expect(buildResult.success).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.ranu', 'build', 'manifest', 'routes.json'))).toBe(true);
    });
  });
});
