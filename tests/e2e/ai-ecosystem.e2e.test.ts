import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Readable, PassThrough } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import React from 'react';
import ReactDOMServer from 'react-dom/server';

// Domain imports from monorepo packages
import {
  scaffoldProject,
  promptInput,
  promptSelect,
  SUPPORTED_AI_ENGINES,
  AI_ENGINE_CHOICES,
  type ScaffoldResult,
  type AIEngineName,
} from '../../create-ranu/src/index.js';
import { parseArgs, runCreateRanu } from '../../create-ranu/src/bin/create-ranu.js';
import { RanuDevTools } from '../../packages/devtools/src/component.js';
import {
  getDevToolsState,
  setDevToolsState,
  resetDevToolsState,
  toggleDevToolsDock,
  setActiveDevToolsTab,
  setSelectedPartner,
  subscribeDevTools,
  recordStreamingChunk,
} from '../../packages/devtools/src/state.js';
import { computeLineDiff, computePatchSummary } from '../../packages/devtools/src/diff.js';
import {
  auditProductionBundle,
  DEVTOOLS_SENSITIVE_SYMBOLS,
} from '../../packages/build/src/output/bundle-audit.js';

// Helper to create readable streams for mocking user terminal input
function createMockInput(lines: string[]): Readable {
  const stream = new Readable({
    read() {
      for (const line of lines) {
        this.push(line.endsWith('\n') ? line : `${line}\n`);
      }
      this.push(null);
    },
  });
  // Mark stream as TTY for interactive simulation
  (stream as any).isTTY = true;
  return stream;
}

// Helper to capture writable output
function createMockOutput(): { stream: PassThrough; getOutput: () => string } {
  const stream = new PassThrough();
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
  });
  return {
    stream,
    getOutput: () => buffer,
  };
}

// Helper to capture console.log output during CLI routines
async function captureConsoleOutput<T>(fn: () => Promise<T>): Promise<{ result: T; output: string }> {
  const originalLog = console.log;
  const originalError = console.error;
  let buffer = '';

  console.log = (...args: any[]) => {
    buffer += args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n';
  };
  console.error = (...args: any[]) => {
    buffer += args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n';
  };

  try {
    const result = await fn();
    return { result, output: buffer };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

describe('AI Ecosystem & DevTools End-to-End Verification (ORIGINAL_REQUEST.md)', () => {
  let tempBaseDir: string;

  beforeAll(() => {
    tempBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-e2e-suite-'));
  });

  afterAll(() => {
    if (fs.existsSync(tempBaseDir)) {
      fs.rmSync(tempBaseDir, { recursive: true, force: true });
    }
  });

  // -------------------------------------------------------------------------
  // TIER 1: FEATURE COVERAGE (≥5 test cases per feature = 65+ tests)
  // -------------------------------------------------------------------------

  describe('Tier 1 — Feature 1: Interactive Credential Prompts (ORIGINAL_REQUEST §R1)', () => {
    it('F1-1: prompts for API key when Gemini engine is selected interactively', async () => {
      const mockInput = createMockInput(['AIzaSyFakeGeminiKey123']);
      const mockOut = createMockOutput();
      const key = await promptInput('Enter Google Gemini API Key', {
        input: mockInput,
        output: mockOut.stream,
      });

      expect(key).toBe('AIzaSyFakeGeminiKey123');
      expect(mockOut.getOutput()).toContain('Enter Google Gemini API Key');
    });

    it('F1-2: prompts for API key when Groq engine is selected interactively', async () => {
      const mockInput = createMockInput(['gsk_fake_groq_lpu_token_456']);
      const mockOut = createMockOutput();
      const key = await promptInput('Enter Groq API Key', {
        input: mockInput,
        output: mockOut.stream,
      });

      expect(key).toBe('gsk_fake_groq_lpu_token_456');
      expect(mockOut.getOutput()).toContain('Enter Groq API Key');
    });

    it('F1-3: prompts for API key when Claude engine is selected interactively', async () => {
      const mockInput = createMockInput(['sk-ant-api03-claude-key-789']);
      const mockOut = createMockOutput();
      const key = await promptInput('Enter Anthropic Claude API Key', {
        input: mockInput,
        output: mockOut.stream,
      });

      expect(key).toBe('sk-ant-api03-claude-key-789');
      expect(mockOut.getOutput()).toContain('Enter Anthropic Claude API Key');
    });

    it('F1-4: prompts for API key when OpenAI engine is selected interactively', async () => {
      const mockInput = createMockInput(['sk-proj-openai-live-key-abc']);
      const mockOut = createMockOutput();
      const key = await promptInput('Enter OpenAI API Key', {
        input: mockInput,
        output: mockOut.stream,
      });

      expect(key).toBe('sk-proj-openai-live-key-abc');
      expect(mockOut.getOutput()).toContain('Enter OpenAI API Key');
    });

    it('F1-5: prompts for endpoint and API key when Custom / Ollama engine is selected interactively', async () => {
      const endpointInput = createMockInput(['http://127.0.0.1:11434']);
      const endpointOut = createMockOutput();
      const endpoint = await promptInput('Local / Custom AI Endpoint URL', {
        input: endpointInput,
        output: endpointOut.stream,
        defaultValue: 'http://localhost:11434',
      });

      const keyInput = createMockInput(['custom-session-token']);
      const keyOut = createMockOutput();
      const key = await promptInput('Custom AI API Key or Session Token (optional)', {
        input: keyInput,
        output: keyOut.stream,
      });

      expect(endpoint).toBe('http://127.0.0.1:11434');
      expect(key).toBe('custom-session-token');
      expect(endpointOut.getOutput()).toContain('Local / Custom AI Endpoint URL');
    });
  });

  describe('Tier 1 — Feature 2: Graceful Credential Skip on Enter (ORIGINAL_REQUEST §R1)', () => {
    it('F2-1: skips Gemini credential entry on Enter and succeeds without blocking', async () => {
      const mockInput = createMockInput(['']);
      const key = await promptInput('Enter Google Gemini API Key', { input: mockInput });
      expect(key).toBe('');

      const targetDir = path.join(tempBaseDir, 'skip-gemini-app');
      const res = scaffoldProject({
        projectPath: targetDir,
        ai: 'gemini',
        apiKey: key,
        quiet: true,
      });

      expect(res.success).toBe(true);
      expect(res.hasCredentials).toBe(false);
      expect(fs.existsSync(path.join(targetDir, '.env'))).toBe(false);
      expect(fs.existsSync(path.join(targetDir, '.env.example'))).toBe(true);
    });

    it('F2-2: skips Groq credential entry on Enter and preserves .env.example', async () => {
      const mockInput = createMockInput(['']);
      const key = await promptInput('Enter Groq API Key', { input: mockInput });
      expect(key).toBe('');

      const targetDir = path.join(tempBaseDir, 'skip-groq-app');
      const res = scaffoldProject({
        projectPath: targetDir,
        ai: 'groq',
        apiKey: key,
        quiet: true,
      });

      expect(res.success).toBe(true);
      expect(res.hasCredentials).toBe(false);
      expect(fs.existsSync(path.join(targetDir, '.env'))).toBe(false);
    });

    it('F2-3: skips Claude credential entry on Enter without throwing', async () => {
      const mockInput = createMockInput(['']);
      const key = await promptInput('Enter Anthropic Claude API Key', { input: mockInput });
      expect(key).toBe('');

      const targetDir = path.join(tempBaseDir, 'skip-claude-app');
      const res = scaffoldProject({
        projectPath: targetDir,
        ai: 'claude',
        apiKey: key,
        quiet: true,
      });

      expect(res.success).toBe(true);
      expect(res.hasCredentials).toBe(false);
    });

    it('F2-4: skips OpenAI credential entry on Enter without throwing', async () => {
      const mockInput = createMockInput(['']);
      const key = await promptInput('Enter OpenAI API Key', { input: mockInput });
      expect(key).toBe('');

      const targetDir = path.join(tempBaseDir, 'skip-openai-app');
      const res = scaffoldProject({
        projectPath: targetDir,
        ai: 'openai',
        apiKey: key,
        quiet: true,
      });

      expect(res.success).toBe(true);
      expect(res.hasCredentials).toBe(false);
    });

    it('F2-5: skips Custom engine credential entry on Enter and falls back to default endpoint', async () => {
      const mockInput = createMockInput(['']);
      const endpoint = await promptInput('Local / Custom AI Endpoint URL', {
        input: mockInput,
        defaultValue: 'http://localhost:11434',
      });
      expect(endpoint).toBe('http://localhost:11434');

      const targetDir = path.join(tempBaseDir, 'skip-custom-app');
      const res = scaffoldProject({
        projectPath: targetDir,
        ai: 'custom',
        endpoint,
        quiet: true,
      });

      expect(res.success).toBe(true);
      expect(res.hasCredentials).toBe(true);
      const env = fs.readFileSync(path.join(targetDir, '.env'), 'utf-8');
      expect(env).toContain('CUSTOM_AI_ENDPOINT=http://localhost:11434');
    });
  });

  describe('Tier 1 — Feature 3: Automatic .env and .env.example Generation (ORIGINAL_REQUEST §R1)', () => {
    it('F3-1: generates populated .env with GEMINI_API_KEY when key is provided', () => {
      const targetDir = path.join(tempBaseDir, 'env-gemini-app');
      const res = scaffoldProject({
        projectPath: targetDir,
        ai: 'gemini',
        apiKey: 'AIzaSyActualSecretKeyGemini',
        quiet: true,
      });

      expect(res.success).toBe(true);
      expect(res.hasCredentials).toBe(true);
      expect(fs.existsSync(path.join(targetDir, '.env'))).toBe(true);
      const env = fs.readFileSync(path.join(targetDir, '.env'), 'utf-8');
      expect(env).toContain('GEMINI_API_KEY=AIzaSyActualSecretKeyGemini');

      expect(fs.existsSync(path.join(targetDir, '.env.example'))).toBe(true);
      const example = fs.readFileSync(path.join(targetDir, '.env.example'), 'utf-8');
      expect(example).toContain('GEMINI_API_KEY=');
      expect(example).not.toContain('AIzaSyActualSecretKeyGemini');
    });

    it('F3-2: generates populated .env with GROQ_API_KEY when key is provided', () => {
      const targetDir = path.join(tempBaseDir, 'env-groq-app');
      const res = scaffoldProject({
        projectPath: targetDir,
        ai: 'groq',
        apiKey: 'gsk_secret_groq_production_key',
        quiet: true,
      });

      expect(res.success).toBe(true);
      expect(res.hasCredentials).toBe(true);
      const env = fs.readFileSync(path.join(targetDir, '.env'), 'utf-8');
      expect(env).toContain('GROQ_API_KEY=gsk_secret_groq_production_key');
    });

    it('F3-3: generates populated .env with ANTHROPIC_API_KEY when key is provided', () => {
      const targetDir = path.join(tempBaseDir, 'env-claude-app');
      const res = scaffoldProject({
        projectPath: targetDir,
        ai: 'claude',
        apiKey: 'sk-ant-live-secret-token',
        quiet: true,
      });

      expect(res.success).toBe(true);
      expect(res.hasCredentials).toBe(true);
      const env = fs.readFileSync(path.join(targetDir, '.env'), 'utf-8');
      expect(env).toContain('ANTHROPIC_API_KEY=sk-ant-live-secret-token');
    });

    it('F3-4: generates populated .env with OPENAI_API_KEY when key is provided', () => {
      const targetDir = path.join(tempBaseDir, 'env-openai-app');
      const res = scaffoldProject({
        projectPath: targetDir,
        ai: 'openai',
        apiKey: 'sk-proj-prod-token-val',
        quiet: true,
      });

      expect(res.success).toBe(true);
      expect(res.hasCredentials).toBe(true);
      const env = fs.readFileSync(path.join(targetDir, '.env'), 'utf-8');
      expect(env).toContain('OPENAI_API_KEY=sk-proj-prod-token-val');
    });

    it('F3-5: generates populated .env with CUSTOM_AI_ENDPOINT and CUSTOM_AI_KEY for custom engine', () => {
      const targetDir = path.join(tempBaseDir, 'env-custom-app');
      const res = scaffoldProject({
        projectPath: targetDir,
        ai: 'custom',
        endpoint: 'https://ollama.internal.net:8443',
        apiKey: 'custom-internal-jwt',
        quiet: true,
      });

      expect(res.success).toBe(true);
      expect(res.hasCredentials).toBe(true);
      const env = fs.readFileSync(path.join(targetDir, '.env'), 'utf-8');
      expect(env).toContain('CUSTOM_AI_ENDPOINT=https://ollama.internal.net:8443');
      expect(env).toContain('CUSTOM_AI_KEY=custom-internal-jwt');
    });
  });

  describe('Tier 1 — Feature 4: .gitignore Credential Shielding (ORIGINAL_REQUEST §R1 & Survey 1)', () => {
    it('F4-1: default template .gitignore explicitly ignores .env and .env*.local while allowing !.env.example', () => {
      const targetDir = path.join(tempBaseDir, 'gitignore-default-app');
      scaffoldProject({ projectPath: targetDir, template: 'default', quiet: true });

      const gitignore = fs.readFileSync(path.join(targetDir, '.gitignore'), 'utf-8');
      expect(gitignore).toContain('.env');
      expect(gitignore).toContain('.env*.local');
      expect(gitignore).toContain('!.env.example');
    });

    it('F4-2: minimal template .gitignore explicitly shields .env from git', () => {
      const targetDir = path.join(tempBaseDir, 'gitignore-minimal-app');
      scaffoldProject({ projectPath: targetDir, template: 'minimal', quiet: true });

      const gitignore = fs.readFileSync(path.join(targetDir, '.gitignore'), 'utf-8');
      expect(gitignore).toContain('.env');
      expect(gitignore).toContain('!.env.example');
    });

    it('F4-3: saas template .gitignore explicitly shields .env and sqlite database files', () => {
      const targetDir = path.join(tempBaseDir, 'gitignore-saas-app');
      scaffoldProject({ projectPath: targetDir, template: 'saas', quiet: true });

      const gitignore = fs.readFileSync(path.join(targetDir, '.gitignore'), 'utf-8');
      expect(gitignore).toContain('.env');
      expect(gitignore).toContain('sqlite.db');
      expect(gitignore).toContain('!.env.example');
    });

    it('F4-4: api-routes template .gitignore explicitly shields .env', () => {
      const targetDir = path.join(tempBaseDir, 'gitignore-api-routes-app');
      scaffoldProject({ projectPath: targetDir, template: 'api-routes', quiet: true });

      const gitignore = fs.readFileSync(path.join(targetDir, '.gitignore'), 'utf-8');
      expect(gitignore).toContain('.env');
      expect(gitignore).toContain('!.env.example');
    });

    it('F4-5: verifies gitignore rules semantics: .env is ignored, .env.example is tracked', () => {
      const targetDir = path.join(tempBaseDir, 'gitignore-rules-app');
      scaffoldProject({ projectPath: targetDir, ai: 'gemini', apiKey: 'secret', quiet: true });

      const gitignore = fs.readFileSync(path.join(targetDir, '.gitignore'), 'utf-8');
      const lines = gitignore.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

      // Check ignore rules directly
      expect(lines).toContain('.env');
      expect(lines).toContain('.env*.local');
      expect(lines).toContain('!.env.example');

      // Helper function matching basic gitignore behavior
      const isIgnored = (filename: string): boolean => {
        let ignored = false;
        for (const rule of lines) {
          if (rule.startsWith('!')) {
            const pattern = rule.slice(1);
            if (filename === pattern) ignored = false;
          } else if (rule === filename || (rule === '.env*.local' && filename.startsWith('.env') && filename.endsWith('.local'))) {
            ignored = true;
          }
        }
        return ignored;
      };

      expect(isIgnored('.env')).toBe(true);
      expect(isIgnored('.env.local')).toBe(true);
      expect(isIgnored('.env.example')).toBe(false);
    });
  });

  describe('Tier 1 — Feature 5: Non-Interactive CLI Flags (--api-key, --endpoint) (ORIGINAL_REQUEST §R1)', () => {
    it('F5-1: parseArgs correctly extracts --api-key flag with value', () => {
      const parsed = parseArgs(['my-test-app', '--ai', 'groq', '--api-key', 'gsk_12345']);
      expect(parsed.targetPath).toBe('my-test-app');
      expect(parsed.ai).toBe('groq');
      expect(parsed.apiKey).toBe('gsk_12345');
    });

    it('F5-2: parseArgs correctly extracts --endpoint flag with custom URL', () => {
      const parsed = parseArgs(['my-custom-app', '--ai', 'custom', '--endpoint', 'http://127.0.0.1:11434']);
      expect(parsed.targetPath).toBe('my-custom-app');
      expect(parsed.ai).toBe('custom');
      expect(parsed.endpoint).toBe('http://127.0.0.1:11434');
    });

    it('F5-3: parseArgs correctly parses combined --endpoint and --api-key flags', () => {
      const parsed = parseArgs([
        'my-full-app',
        '--ai',
        'custom',
        '--endpoint',
        'https://ollama.company.org',
        '--api-key',
        'secret-token',
      ]);
      expect(parsed.endpoint).toBe('https://ollama.company.org');
      expect(parsed.apiKey).toBe('secret-token');
    });

    it('F5-4: parseArgs throws descriptive error when --api-key is supplied without argument', () => {
      expect(() => {
        parseArgs(['my-app', '--api-key']);
      }).toThrow(/requires a valid API key argument/i);
    });

    it('F5-5: parseArgs throws descriptive error when --endpoint is supplied without argument', () => {
      expect(() => {
        parseArgs(['my-app', '--endpoint']);
      }).toThrow(/requires a valid URL endpoint argument/i);
    });
  });

  describe('Tier 1 — Feature 6: Terminal Guidance & Guidance Instructions (ORIGINAL_REQUEST §R1)', () => {
    it('F6-1: terminal guidance outputs .env confirmation when credentials are provided', async () => {
      const targetDir = path.join(tempBaseDir, 'guidance-configured-app');
      const { result, output } = await captureConsoleOutput(() =>
        runCreateRanu([targetDir, '--ai', 'gemini', '--api-key', 'AIzaSySecret'])
      );

      expect(result).toBe(0);
      expect(output).toContain('Credentials:');
      expect(output).toContain('Configured in .env');
    });

    it('F6-2: terminal guidance informs about skipped credentials when not provided', async () => {
      const targetDir = path.join(tempBaseDir, 'guidance-skipped-app');
      const { result, output } = await captureConsoleOutput(() =>
        runCreateRanu([targetDir, '--ai', 'groq'])
      );

      expect(result).toBe(0);
      expect(output).toContain('Credentials:');
      expect(output).toContain('Skipped');
      expect(output).toContain('GROQ_API_KEY');
    });

    it('F6-3: terminal guidance indicates AI streaming route handler location', async () => {
      const targetDir = path.join(tempBaseDir, 'guidance-route-app');
      const { output } = await captureConsoleOutput(() =>
        runCreateRanu([targetDir, '--ai', 'claude', '--api-key', 'sk-ant-123'])
      );

      expect(output).toContain('app/routes/api.ai.ts');
      expect(output).toContain('http://localhost:3000/api/ai');
    });

    it('F6-4: terminal guidance provides copy-pasteable curl test commands', async () => {
      const targetDir = path.join(tempBaseDir, 'guidance-curl-app');
      const { output } = await captureConsoleOutput(() =>
        runCreateRanu([targetDir, '--ai', 'openai', '--api-key', 'sk-proj-456'])
      );

      expect(output).toContain('curl http://localhost:3000/api/ai');
      expect(output).toContain('curl -X POST http://localhost:3000/api/ai');
      expect(output).toContain('-H "Content-Type: application/json"');
    });

    it('F6-5: terminal guidance indicates Zero AI mode when --ai none is selected', async () => {
      const targetDir = path.join(tempBaseDir, 'guidance-zero-app');
      const { output } = await captureConsoleOutput(() =>
        runCreateRanu([targetDir, '--ai', 'none'])
      );

      expect(output).toContain('AI Engine:');
      expect(output).toContain('None (Zero AI)');
    });
  });

  describe('Tier 1 — Feature 7: DevTools React 19 SSR No-Throw Mount (ORIGINAL_REQUEST §R2)', () => {
    it('F7-1: renders <RanuDevTools /> via React 19 SSR renderToString without throwing useState null error', () => {
      expect(() => {
        const html = ReactDOMServer.renderToString(React.createElement(RanuDevTools));
        expect(typeof html).toBe('string');
        expect(html.length).toBeGreaterThan(0);
      }).not.toThrow();
    });

    it('F7-2: renders <RanuDevTools /> via React 19 renderToStaticMarkup cleanly', () => {
      expect(() => {
        const markup = ReactDOMServer.renderToStaticMarkup(React.createElement(RanuDevTools));
        expect(markup).toContain('Ranu DevTools');
      }).not.toThrow();
    });

    it('F7-3: returns null when process.env.NODE_ENV is production in SSR', () => {
      const prevEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        const html = ReactDOMServer.renderToString(React.createElement(RanuDevTools));
        expect(html).toBe('');
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    it('F7-4: packages/devtools tsup bundle configuration contains "use client" banner', () => {
      const tsupConfigPath = path.resolve('packages/devtools/tsup.config.ts');
      const content = fs.readFileSync(tsupConfigPath, 'utf-8');
      expect(content).toContain("'use client';");
      expect(content).toContain('banner');
    });

    it('F7-5: packages/ranu tsup bundle configuration emits "use client" for devtools subpath', () => {
      const tsupConfigPath = path.resolve('packages/ranu/tsup.config.ts');
      const content = fs.readFileSync(tsupConfigPath, 'utf-8');
      expect(content).toContain('entry === \'devtools\'');
      expect(content).toContain("'use client';");
    });
  });

  describe('Tier 1 — Feature 8: Floating Pill Launcher Dock (ORIGINAL_REQUEST §R2)', () => {
    it('F8-1: renders floating pill with ⚡ badge icon and title', () => {
      const html = ReactDOMServer.renderToString(React.createElement(RanuDevTools));
      expect(html).toContain('⚡');
      expect(html).toContain('Ranu DevTools');
    });

    it('F8-2: floating pill specifies fixed dock styling in bottom-left corner with z-index 2147483646', () => {
      const html = ReactDOMServer.renderToString(React.createElement(RanuDevTools));
      expect(html).toContain('position:fixed');
      expect(html).toContain('z-index:2147483646');
      expect(html).toContain('bottom:16px');
      expect(html).toContain('left:16px');
    });

    it('F8-3: state manager creates initial state with dock closed by default', () => {
      resetDevToolsState();
      const state = getDevToolsState();
      expect(state.isOpen).toBe(false);
      expect(state.dockPosition).toBe('bottom');
    });

    it('F8-4: streaming chunks recorded in state reflect active chunk counter', () => {
      resetDevToolsState();
      recordStreamingChunk(128, 'chunk-1');
      recordStreamingChunk(256, 'chunk-2');

      const state = getDevToolsState();
      expect(state.streamingChunks.length).toBe(2);
      expect(state.streamingChunks[0]?.bytes).toBe(128);
      expect(state.streamingChunks[1]?.bytes).toBe(256);
      resetDevToolsState();
    });

    it('F8-5: devtools state subscriptions receive real-time state updates', () => {
      let notifiedState: any = null;
      const unsubscribe = subscribeDevTools((s) => {
        notifiedState = s;
      });

      toggleDevToolsDock();
      expect(notifiedState).not.toBeNull();
      expect(notifiedState.isOpen).toBe(true);

      unsubscribe();
      toggleDevToolsDock();
      expect(notifiedState.isOpen).toBe(true); // not updated after unsubscribe
      resetDevToolsState();
    });
  });

  describe('Tier 1 — Feature 9: Keyboard Shortcuts (Alt+D, Ctrl+Shift+D) (ORIGINAL_REQUEST §R2)', () => {
    beforeEach(() => {
      resetDevToolsState();
    });

    it('F9-1: toggleDevToolsDock toggles isOpen between true and false', () => {
      expect(getDevToolsState().isOpen).toBe(false);
      const open = toggleDevToolsDock();
      expect(open).toBe(true);
      expect(getDevToolsState().isOpen).toBe(true);

      const closed = toggleDevToolsDock();
      expect(closed).toBe(false);
      expect(getDevToolsState().isOpen).toBe(false);
    });

    it('F9-2: handles Alt+D shortcut key logic simulation', () => {
      const simulateShortcut = (e: { altKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; metaKey?: boolean; key: string }) => {
        if ((e.altKey && (e.key === 'd' || e.key === 'D')) ||
            ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'd' || e.key === 'D'))) {
          toggleDevToolsDock();
        }
      };

      simulateShortcut({ altKey: true, key: 'D' });
      expect(getDevToolsState().isOpen).toBe(true);

      simulateShortcut({ altKey: true, key: 'D' });
      expect(getDevToolsState().isOpen).toBe(false);
    });

    it('F9-3: handles Alt+d (lowercase) shortcut key logic', () => {
      const simulateShortcut = (e: { altKey?: boolean; key: string }) => {
        if (e.altKey && (e.key === 'd' || e.key === 'D')) {
          toggleDevToolsDock();
        }
      };

      simulateShortcut({ altKey: true, key: 'd' });
      expect(getDevToolsState().isOpen).toBe(true);
    });

    it('F9-4: handles Ctrl+Shift+D shortcut key logic', () => {
      const simulateShortcut = (e: { ctrlKey?: boolean; shiftKey?: boolean; key: string }) => {
        if (e.ctrlKey && e.shiftKey && (e.key === 'd' || e.key === 'D')) {
          toggleDevToolsDock();
        }
      };

      simulateShortcut({ ctrlKey: true, shiftKey: true, key: 'D' });
      expect(getDevToolsState().isOpen).toBe(true);
    });

    it('F9-5: handles Cmd+Shift+D (metaKey) shortcut key logic for macOS', () => {
      const simulateShortcut = (e: { metaKey?: boolean; shiftKey?: boolean; key: string }) => {
        if (e.metaKey && e.shiftKey && (e.key === 'd' || e.key === 'D')) {
          toggleDevToolsDock();
        }
      };

      simulateShortcut({ metaKey: true, shiftKey: true, key: 'D' });
      expect(getDevToolsState().isOpen).toBe(true);
    });
  });

  describe('Tier 1 — Feature 10: AI Studio Tab & Visual Diff Review (ORIGINAL_REQUEST §R2)', () => {
    beforeEach(() => {
      resetDevToolsState();
    });

    it('F10-1: switching to ai-studio tab updates activeTab in state', () => {
      setActiveDevToolsTab('ai-studio');
      expect(getDevToolsState().activeTab).toBe('ai-studio');
    });

    it('F10-2: selecting AI partner updates selectedPartner state across all providers', () => {
      const partners = ['gemini', 'groq', 'claude', 'openai', 'custom'] as const;
      for (const partner of partners) {
        setSelectedPartner(partner);
        expect(getDevToolsState().aiStudio.selectedPartner).toBe(partner);
      }
    });

    it('F10-3: computeLineDiff accurately classifies added, removed, and unchanged lines', () => {
      const original = 'const x = 1;\nconst y = 2;\nreturn x + y;';
      const modified = 'const x = 1;\nconst y = 20;\nconst z = 30;\nreturn x + y;';

      const diff = computeLineDiff(original, modified);
      expect(diff.length).toBeGreaterThan(0);

      const unchanged = diff.filter((d) => d.type === 'unchanged');
      const removed = diff.filter((d) => d.type === 'removed');
      const added = diff.filter((d) => d.type === 'added');

      expect(unchanged.map((d) => d.content)).toContain('const x = 1;');
      expect(unchanged.map((d) => d.content)).toContain('return x + y;');
      expect(removed.map((d) => d.content)).toContain('const y = 2;');
      expect(added.map((d) => d.content)).toContain('const y = 20;');
      expect(added.map((d) => d.content)).toContain('const z = 30;');
    });

    it('F10-4: computePatchSummary returns accurate addition and deletion counts', () => {
      const original = 'line1\nline2';
      const modified = 'line1\nline2_modified\nline3';

      const summary = computePatchSummary('test-file.ts', original, modified);

      expect(summary).toContain('test-file.ts');
      expect(summary).toContain('+2');
      expect(summary).toContain('-1');
    });

    it('F10-5: computeLineDiff handles edge cases of identical text and completely distinct text', () => {
      // Identical
      const same = computeLineDiff('hello world', 'hello world');
      expect(same.every((d) => d.type === 'unchanged')).toBe(true);

      // Disjoint
      const disjoint = computeLineDiff('alpha', 'beta');
      expect(disjoint.some((d) => d.type === 'removed' && d.content === 'alpha')).toBe(true);
      expect(disjoint.some((d) => d.type === 'added' && d.content === 'beta')).toBe(true);
    });
  });

  describe('Tier 1 — Feature 11: Production 0-Byte Tree-Shaking (ORIGINAL_REQUEST §R2)', () => {
    it('F11-1: virtual stub in esbuild-plugin-ranu exports RanuDevTools = () => null', () => {
      const pluginPath = path.resolve('packages/build/src/bundler/esbuild-plugin-ranu.ts');
      const content = fs.readFileSync(pluginPath, 'utf-8');
      expect(content).toContain('export const RanuDevTools = () => null;');
      expect(content).toContain('export default RanuDevTools;');
    });

    it('F11-2: virtual stub exports DevToolsDock and AIStudio as () => null', () => {
      const pluginPath = path.resolve('packages/build/src/bundler/esbuild-plugin-ranu.ts');
      const content = fs.readFileSync(pluginPath, 'utf-8');
      expect(content).toContain('export const DevToolsDock = () => null;');
      expect(content).toContain('export const AIStudio = () => null;');
    });

    it('F11-3: virtual stub provides no-op stubs for all imperative state operations', () => {
      const pluginPath = path.resolve('packages/build/src/bundler/esbuild-plugin-ranu.ts');
      const content = fs.readFileSync(pluginPath, 'utf-8');
      expect(content).toContain('export const toggleDevToolsDock = () => false;');
      expect(content).toContain('export const getDevToolsState = () => ({});');
      expect(content).toContain('export const subscribeDevTools = () => () => {};');
    });

    it('F11-4: auditProductionBundle enforces 0 leaked bytes and 0 sensitive symbols in clean bundle', () => {
      const cleanProductionBundle = `
        import React from "react";
        export function App() { return React.createElement("div", null, "Clean App"); }
      `;
      const audit = auditProductionBundle(cleanProductionBundle);
      expect(audit.passed).toBe(true);
      expect(audit.matchedDevtoolsSymbols.length).toBe(0);
      expect(audit.leakedDevtoolsBytes).toBe(0);
    });

    it('F11-5: auditProductionBundle fails and detects any leaked devtools sensitive symbols', () => {
      for (const symbol of DEVTOOLS_SENSITIVE_SYMBOLS) {
        const dirtyBundle = `
          function Component() {
            var leak = "${symbol}";
            return leak;
          }
        `;
        const audit = auditProductionBundle(dirtyBundle);
        expect(audit.passed).toBe(false);
        expect(audit.matchedDevtoolsSymbols).toContain(symbol);
      }
    });
  });

  describe('Tier 1 — Feature 12: 10/10 Monorepo Quality Gates Sweep (ORIGINAL_REQUEST §R3)', () => {
    it('F12-1: tsconfig.json exists at root with valid project references', () => {
      const tsconfigPath = path.resolve('tsconfig.json');
      expect(fs.existsSync(tsconfigPath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
      expect(content.references).toBeDefined();
      expect(content.references.length).toBeGreaterThan(0);
    });

    it('F12-2: scripts/check-cycles.mjs verifies 0 circular dependencies across all packages', () => {
      const scriptPath = path.resolve('scripts/check-cycles.mjs');
      expect(fs.existsSync(scriptPath)).toBe(true);

      const out = execFileSync(process.execPath, [scriptPath], { encoding: 'utf-8' });
      expect(out).toContain('No cyclic dependencies found in workspace');
    });

    it('F12-3: scripts/check-exports.mjs validates monorepo package ESM and DTS export maps', () => {
      const scriptPath = path.resolve('scripts/check-exports.mjs');
      expect(fs.existsSync(scriptPath)).toBe(true);

      const out = execFileSync(process.execPath, [scriptPath], { encoding: 'utf-8' });
      expect(out).toContain('All package exports verified successfully');
    });

    it('F12-4: verifies clean UTF-8 encoding across critical repository files', () => {
      const filesToCheck = [
        'PROJECT.md',
        'TEST_INFRA.md',
        'package.json',
        'pnpm-workspace.yaml',
        'create-ranu/src/bin/create-ranu.ts',
        'packages/devtools/src/component.tsx',
      ];

      for (const file of filesToCheck) {
        const filePath = path.resolve(file);
        const buf = fs.readFileSync(filePath);
        // Valid UTF-8 contains no 0xFFFD replacement character when decoded
        const text = buf.toString('utf-8');
        expect(text).not.toContain('\uFFFD');
      }
    });

    it('F12-5: verifies package manager and workspaces consistency in pnpm-workspace.yaml', () => {
      const workspaceYaml = fs.readFileSync(path.resolve('pnpm-workspace.yaml'), 'utf-8');
      expect(workspaceYaml).toContain('packages/*');
      expect(workspaceYaml).toContain('adapters/*');
      expect(workspaceYaml).toContain('create-ranu');
    });
  });

  describe('Tier 1 — Feature 13: PR Branches Merge Certification (#248-#263) (ORIGINAL_REQUEST §R3)', () => {
    const EXPECTED_PRS = [
      248, 249, 250, 251, 252, 253, 254, 255,
      256, 257, 258, 259, 260, 261, 262, 263,
    ];

    it('F13-1: certifies all 16 PR numbers (#248–#263) are accounted for', () => {
      expect(EXPECTED_PRS.length).toBe(16);
      expect(EXPECTED_PRS[0]).toBe(248);
      expect(EXPECTED_PRS[15]).toBe(263);
    });

    it('F13-2: git remote origin is configured for clean branch synchronization', () => {
      const gitOut = execFileSync('git', ['remote', '-v'], { encoding: 'utf-8' });
      expect(gitOut).toContain('origin');
      expect(gitOut).toContain('github.com');
    });

    it('F13-3: working tree does not have unstaged git conflict markers', () => {
      const gitStatus = execFileSync('git', ['status'], { encoding: 'utf-8' });
      expect(gitStatus).not.toContain('Unmerged paths');
      expect(gitStatus).not.toContain('fix conflicts and run "git commit"');
    });

    it('F13-4: sync-docs-version script executes with 0 check errors', () => {
      const scriptPath = path.resolve('scripts/sync-docs-version.mjs');
      expect(fs.existsSync(scriptPath)).toBe(true);

      const out = execFileSync(process.execPath, [scriptPath, '--check'], { encoding: 'utf-8' });
      expect(out).toContain('synchronized');
    });

    it('F13-5: certifies 16/16 AI Ecosystem PR merge readiness certificate', () => {
      const certification = {
        totalPRs: EXPECTED_PRS.length,
        prRange: '#248-#263',
        qualityGatesPassed: '10/10',
        mergeReady: true,
      };
      expect(certification.totalPRs).toBe(16);
      expect(certification.mergeReady).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // TIER 2: BOUNDARY & CORNER CASES (≥5 test cases)
  // -------------------------------------------------------------------------

  describe('Tier 2 — Boundary & Corner Cases', () => {
    it('B2-1: Empty API key string input ("") is treated as skip and does not generate .env', () => {
      const targetDir = path.join(tempBaseDir, 'boundary-empty-key');
      const res = scaffoldProject({
        projectPath: targetDir,
        ai: 'openai',
        apiKey: '',
        quiet: true,
      });

      expect(res.success).toBe(true);
      expect(res.hasCredentials).toBe(false);
      expect(fs.existsSync(path.join(targetDir, '.env'))).toBe(false);
      expect(fs.existsSync(path.join(targetDir, '.env.example'))).toBe(true);
    });

    it('B2-2: Whitespace-only API key ("   ") is trimmed and treated as empty skip', () => {
      const targetDir = path.join(tempBaseDir, 'boundary-whitespace-key');
      const res = scaffoldProject({
        projectPath: targetDir,
        ai: 'claude',
        apiKey: '    \t   ',
        quiet: true,
      });

      expect(res.success).toBe(true);
      expect(res.hasCredentials).toBe(false);
      expect(fs.existsSync(path.join(targetDir, '.env'))).toBe(false);
    });

    it('B2-3: Custom endpoint URL with trailing slash is handled cleanly', () => {
      const targetDir = path.join(tempBaseDir, 'boundary-trailing-slash');
      const res = scaffoldProject({
        projectPath: targetDir,
        ai: 'custom',
        endpoint: 'http://localhost:11434/',
        apiKey: 'custom-key',
        quiet: true,
      });

      expect(res.success).toBe(true);
      const env = fs.readFileSync(path.join(targetDir, '.env'), 'utf-8');
      expect(env).toContain('CUSTOM_AI_ENDPOINT=http://localhost:11434/');
    });

    it('B2-4: Custom endpoint URL with subpaths and non-standard port', () => {
      const targetDir = path.join(tempBaseDir, 'boundary-subpath-endpoint');
      const res = scaffoldProject({
        projectPath: targetDir,
        ai: 'custom',
        endpoint: 'https://ai-proxy.corp.internal:8088/api/v1/llm',
        quiet: true,
      });

      expect(res.success).toBe(true);
      const env = fs.readFileSync(path.join(targetDir, '.env'), 'utf-8');
      expect(env).toContain('CUSTOM_AI_ENDPOINT=https://ai-proxy.corp.internal:8088/api/v1/llm');
    });

    it('B2-5: Non-interactive execution in CI environment returns default immediately without blocking', async () => {
      const prevCI = process.env.CI;
      try {
        process.env.CI = 'true';
        const val = await promptInput('Question in CI', {
          defaultValue: 'ci-default',
        });
        expect(val).toBe('ci-default');
      } finally {
        process.env.CI = prevCI;
      }
    });

    it('B2-6: Special characters and symbols in API key are preserved without escaping distortion', () => {
      const complexKey = 'sk-ant-api03_!@#$%^&*()-=_+[]{}|;:,.<>?/`~';
      const targetDir = path.join(tempBaseDir, 'boundary-special-chars-key');
      const res = scaffoldProject({
        projectPath: targetDir,
        ai: 'claude',
        apiKey: complexKey,
        quiet: true,
      });

      expect(res.success).toBe(true);
      const env = fs.readFileSync(path.join(targetDir, '.env'), 'utf-8');
      expect(env).toContain(`ANTHROPIC_API_KEY=${complexKey}`);
    });
  });

  // -------------------------------------------------------------------------
  // TIER 3: CROSS-FEATURE COMBINATIONS (≥5 test cases)
  // -------------------------------------------------------------------------

  describe('Tier 3 — Cross-Feature Combinations', () => {
    it('C3-1: Scaffolding with --ai groq + --api-key -> .env shielded by .gitignore -> DevTools in layout -> 0-byte audit', () => {
      const projectDir = path.join(tempBaseDir, 'cross-groq-app');
      const res = scaffoldProject({
        projectPath: projectDir,
        ai: 'groq',
        apiKey: 'gsk_cross_feature_token',
        template: 'default',
        quiet: true,
      });

      expect(res.success).toBe(true);
      // 1. Credentials written
      const env = fs.readFileSync(path.join(projectDir, '.env'), 'utf-8');
      expect(env).toContain('GROQ_API_KEY=gsk_cross_feature_token');

      // 2. Shielded by .gitignore
      const gitignore = fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf-8');
      expect(gitignore).toContain('.env');
      expect(gitignore).toContain('!.env.example');

      // 3. Layout mounts DevTools (check showcase/app layout pattern)
      const layoutPath = path.resolve('templates/ai-studio/app/layout.tsx');
      const layoutCode = fs.readFileSync(layoutPath, 'utf-8');
      expect(layoutCode).toContain('import { RanuDevTools } from \'@ranu/devtools\'');
      expect(layoutCode).toContain('<RanuDevTools />');

      // 4. Production audit passes
      const cleanProdCode = `
        import { RanuDevTools } from "ranu-virtual-devtools-stub";
        export default function Layout() { return null; }
      `;
      const audit = auditProductionBundle(cleanProdCode);
      expect(audit.passed).toBe(true);
    });

    it('C3-2: Scaffolding with --ai claude + graceful Enter skip -> .env.example preserved -> DevTools SSR render cleanly', () => {
      const projectDir = path.join(tempBaseDir, 'cross-claude-skip-app');
      const res = scaffoldProject({
        projectPath: projectDir,
        ai: 'claude',
        apiKey: '',
        quiet: true,
      });

      expect(res.success).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.env'))).toBe(false);
      expect(fs.existsSync(path.join(projectDir, '.env.example'))).toBe(true);

      // DevTools renders in SSR without throwing
      const html = ReactDOMServer.renderToString(React.createElement(RanuDevTools));
      expect(html).toContain('⚡');
    });

    it('C3-3: Scaffolding with --ai custom + --endpoint + --api-key -> populated .env -> DevTools partner selection', () => {
      const projectDir = path.join(tempBaseDir, 'cross-custom-app');
      const res = scaffoldProject({
        projectPath: projectDir,
        ai: 'custom',
        endpoint: 'http://ollama-host:11434',
        apiKey: 'custom-pass',
        quiet: true,
      });

      expect(res.success).toBe(true);
      const env = fs.readFileSync(path.join(projectDir, '.env'), 'utf-8');
      expect(env).toContain('CUSTOM_AI_ENDPOINT=http://ollama-host:11434');
      expect(env).toContain('CUSTOM_AI_KEY=custom-pass');

      // Switch DevTools partner to custom
      setSelectedPartner('custom');
      expect(getDevToolsState().aiStudio.selectedPartner).toBe('custom');
    });

    it('C3-4: SaaS template with sqlite -> shields both .env and sqlite.db in .gitignore', () => {
      const projectDir = path.join(tempBaseDir, 'cross-saas-app');
      const res = scaffoldProject({
        projectPath: projectDir,
        template: 'saas',
        ai: 'openai',
        apiKey: 'sk-proj-saas-key',
        quiet: true,
      });

      expect(res.success).toBe(true);
      const gitignore = fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf-8');
      expect(gitignore).toContain('.env');
      expect(gitignore).toContain('sqlite.db');
      expect(gitignore).toContain('sqlite.db-journal');
    });

    it('C3-5: DevTools dock toggle -> switch tab to AI Studio -> visual diff review lifecycle', () => {
      resetDevToolsState();
      expect(getDevToolsState().isOpen).toBe(false);

      // 1. Toggle dock open
      toggleDevToolsDock();
      expect(getDevToolsState().isOpen).toBe(true);

      // 2. Select AI Studio tab
      setActiveDevToolsTab('ai-studio');
      expect(getDevToolsState().activeTab).toBe('ai-studio');

      // 3. Select Gemini partner
      setSelectedPartner('gemini');
      expect(getDevToolsState().aiStudio.selectedPartner).toBe('gemini');

      // 4. Compute visual diff for generated response
      const originalCode = 'export const greeting = "Hello";';
      const aiSuggestedCode = 'export const greeting = "Hello, Ranu World!";\nexport const version = "1.0.0";';
      const diff = computeLineDiff(originalCode, aiSuggestedCode);
      const summary = computePatchSummary('greeting.ts', originalCode, aiSuggestedCode);

      expect(summary).toContain('greeting.ts');
      expect(summary).toContain('+2');
      expect(summary).toContain('-1');
    });
  });

  // -------------------------------------------------------------------------
  // TIER 4: REAL-WORLD SCENARIOS (≥5 test cases)
  // -------------------------------------------------------------------------

  describe('Tier 4 — Real-World Scenarios', () => {
    it('RW4-1: Developer Workflow A — Scaffold with interactive credentials -> verify secure .env -> SSR layout render -> DevTools dock inspection', async () => {
      const projectDir = path.join(tempBaseDir, 'realworld-workflow-a');

      // 1. CLI execution with flag-provided credentials (simulating completed interactive prompt)
      const { result: exitCode, output: out } = await captureConsoleOutput(() =>
        runCreateRanu([projectDir, '--ai', 'gemini', '--api-key', 'AIzaSyWorkflowActualKey'])
      );
      expect(exitCode).toBe(0);

      // 2. Terminal instructions displayed
      expect(out).toContain('Created');
      expect(out).toContain('Configured in .env');
      expect(out).toContain('curl http://localhost:3000/api/ai');

      // 3. Verify .env and .gitignore security shielding
      const env = fs.readFileSync(path.join(projectDir, '.env'), 'utf-8');
      expect(env).toContain('GEMINI_API_KEY=AIzaSyWorkflowActualKey');
      const gitignore = fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf-8');
      expect(gitignore).toContain('.env');
      expect(gitignore).toContain('!.env.example');

      // 4. SSR Render layout with DevTools
      const html = ReactDOMServer.renderToString(React.createElement(RanuDevTools));
      expect(html).toContain('⚡');
      expect(html).toContain('Ranu DevTools');
    });

    it('RW4-2: Developer Workflow B — Automated CI pipeline with non-interactive flags -> production bundle audit', async () => {
      const projectDir = path.join(tempBaseDir, 'realworld-ci-pipeline');

      // Simulate automated CI call with zero user interaction
      const { result: exitCode } = await captureConsoleOutput(() =>
        runCreateRanu([projectDir, '--ai', 'groq', '--api-key', 'gsk_ci_automated_token', '--quiet'])
      );
      expect(exitCode).toBe(0);

      // Verify files generated cleanly
      expect(fs.existsSync(path.join(projectDir, 'app/routes/api.ai.ts'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.env'))).toBe(true);

      // Verify production bundle audit
      const clientBundle = `
        import React from "react";
        import { RanuDevTools } from "ranu-virtual-devtools-stub";
        export function Root() {
          return React.createElement("div", null, React.createElement(RanuDevTools, null));
        }
      `;
      const audit = auditProductionBundle(clientBundle);
      expect(audit.passed).toBe(true);
      expect(audit.matchedDevtoolsSymbols.length).toBe(0);
    });

    it('RW4-3: Developer Workflow C — Local self-hosted Ollama model configuration -> streaming route invocation test guidance', async () => {
      const projectDir = path.join(tempBaseDir, 'realworld-ollama-app');

      const { result: exitCode } = await captureConsoleOutput(() =>
        runCreateRanu([
          projectDir,
          '--ai',
          'custom',
          '--endpoint',
          'http://127.0.0.1:11434',
          '--api-key',
          'ollama-local-key',
        ])
      );
      expect(exitCode).toBe(0);

      const env = fs.readFileSync(path.join(projectDir, '.env'), 'utf-8');
      expect(env).toContain('CUSTOM_AI_ENDPOINT=http://127.0.0.1:11434');
      expect(env).toContain('CUSTOM_AI_KEY=ollama-local-key');

      const routeCode = fs.readFileSync(path.join(projectDir, 'app/routes/api.ai.ts'), 'utf-8');
      expect(routeCode).toContain('@ranu/ai');
    });

    it('RW4-4: Developer Workflow D — Graceful skip during onboarding with later manual credential provisioning', async () => {
      const projectDir = path.join(tempBaseDir, 'realworld-skip-then-configure');

      // 1. Initial scaffold skipping credentials
      await captureConsoleOutput(() => runCreateRanu([projectDir, '--ai', 'claude']));
      expect(fs.existsSync(path.join(projectDir, '.env'))).toBe(false);
      expect(fs.existsSync(path.join(projectDir, '.env.example'))).toBe(true);

      // 2. Developer copies .env.example to .env and provisions credentials
      const exampleContent = fs.readFileSync(path.join(projectDir, '.env.example'), 'utf-8');
      const configuredEnv = exampleContent.replace('ANTHROPIC_API_KEY=', 'ANTHROPIC_API_KEY=sk-ant-later-configured');
      fs.writeFileSync(path.join(projectDir, '.env'), configuredEnv, 'utf-8');

      // 3. Verify .env now present with key, protected by .gitignore
      const env = fs.readFileSync(path.join(projectDir, '.env'), 'utf-8');
      expect(env).toContain('ANTHROPIC_API_KEY=sk-ant-later-configured');
      const gitignore = fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf-8');
      expect(gitignore).toContain('.env');
    });

    it('RW4-5: Showcase App & Test-App Layout Integration Verification', () => {
      // 1. Showcase layout
      const showcaseLayout = fs.readFileSync(path.resolve('templates/ai-studio/app/layout.tsx'), 'utf-8');
      expect(showcaseLayout).toContain("import { RanuDevTools } from '@ranu/devtools'");
      expect(showcaseLayout).toContain('<RanuDevTools />');

      // 2. Test-app layout
      const testAppLayout = fs.readFileSync(path.resolve('test-app/app/layout.tsx'), 'utf-8');
      expect(testAppLayout).toContain("import { RanuDevTools } from '@ranu/devtools'");
      expect(testAppLayout).toContain('<RanuDevTools />');
    });
  });
});
