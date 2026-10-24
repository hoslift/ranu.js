import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Readable, PassThrough, Writable } from 'node:stream';
import readline from 'node:readline/promises';
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import React from 'react';
import ReactDOMServer from 'react-dom/server';

// Domain imports from monorepo packages
import {
  scaffoldProject,
  promptInput,
  promptSelect,
  AI_ENGINE_CHOICES,
  generateTemplateFiles,
  type TemplateName,
  type AIEngineName,
} from '../../create-ranu/src/index.js';
import { parseArgs, runCreateRanu } from '../../create-ranu/src/bin/create-ranu.js';
import { getEnvContent } from '../../create-ranu/src/template.js';
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
  setDevToolsDockPosition,
} from '../../packages/devtools/src/state.js';
import { mountDevToolsDock } from '../../packages/devtools/src/dock.js';
import {
  auditProductionBundle,
  DEVTOOLS_SENSITIVE_SYMBOLS,
} from '../../packages/build/src/output/bundle-audit.js';
import { createRanuEsbuildPlugin } from '../../packages/build/src/bundler/esbuild-plugin-ranu.js';

describe('Tier 5 White-Box Adversarial Coverage Hardening Suite (R1 & R2)', () => {
  let tempBaseDir: string;
  const originalEnv = process.env.NODE_ENV;

  beforeAll(() => {
    tempBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-tier5-adversarial-'));
  });

  afterAll(() => {
    if (fs.existsSync(tempBaseDir)) {
      fs.rmSync(tempBaseDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    resetDevToolsState();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    resetDevToolsState();
  });

  // =========================================================================
  // SECTION 1: create-ranu/src/prompts.ts White-Box Stress & Concurrency
  // =========================================================================
  describe('Section 1: create-ranu/src/prompts.ts WeakMap FIFO, Rapid Inputs & EOF Races', () => {
    it('T5-1.1: Rapid burst piped input: consumes 60 rapid lines in strict FIFO order across alternating promptSelect and promptInput', async () => {
      const inStream = new PassThrough();
      const outStream = new PassThrough();
      const rl = readline.createInterface({ input: inStream, output: outStream });

      // Generate 30 rounds of alternating (promptSelect, promptInput)
      // Round i: select engine (2 = gemini), then input key (`key-${i}`)
      const rounds = 30;
      let pipedPayload = '';
      for (let i = 0; i < rounds; i++) {
        pipedPayload += `2\nkey-round-${i}\n`;
      }

      try {
        const firstChoicePromise = promptSelect('Select Engine:', AI_ENGINE_CHOICES, 0, {
          input: inStream,
          output: outStream,
          rl,
        });

        // Write all 60 lines at once into active rl
        inStream.write(pipedPayload);

        const firstChoice = await firstChoicePromise;
        expect(firstChoice).toBe('gemini');

        const firstKey = await promptInput('Enter Key:', {
          input: inStream,
          output: outStream,
          rl,
        });
        expect(firstKey).toBe('key-round-0');

        for (let i = 1; i < rounds; i++) {
          const selected = await promptSelect('Select Engine:', AI_ENGINE_CHOICES, 0, {
            input: inStream,
            output: outStream,
            rl,
          });
          expect(selected).toBe('gemini');

          const key = await promptInput('Enter Key:', {
            input: inStream,
            output: outStream,
            rl,
          });
          expect(key).toBe(`key-round-${i}`);
        }
      } finally {
        rl.close();
      }
    });

    it('T5-1.2: EOF race condition: input stream closed before promptSelect and promptInput are invoked', async () => {
      const inStream = new PassThrough();
      const outStream = new PassThrough();
      inStream.end(); // Premature EOF

      const choice = await promptSelect('Select Engine:', AI_ENGINE_CHOICES, 0, {
        input: inStream,
        output: outStream,
      });
      expect(choice).toBe('none');

      const text = await promptInput('Enter Key:', {
        input: inStream,
        output: outStream,
        defaultValue: 'fallback-value',
      });
      expect(text).toBe('fallback-value');
    });

    it('T5-1.3: EOF race condition: input stream ends while promptInput is waiting for input', async () => {
      const inStream = new PassThrough();
      const outStream = new PassThrough();

      const promptPromise = promptInput('Enter Key:', {
        input: inStream,
        output: outStream,
        defaultValue: 'eof-fallback',
      });

      // Stream ends without sending a newline
      setImmediate(() => {
        inStream.end();
      });

      const result = await promptPromise;
      expect(result).toBe('eof-fallback');
    });

    it('T5-1.4: Stream close event drains pending waiters cleanly with empty string', async () => {
      const inStream = new PassThrough();
      const outStream = new PassThrough();
      const rl = readline.createInterface({ input: inStream, output: outStream });

      try {
        const p1 = promptInput('Enter Key 1:', { input: inStream, output: outStream, rl });
        const p2 = promptInput('Enter Key 2:', { input: inStream, output: outStream, rl });

        setImmediate(() => {
          rl.close();
        });

        const [r1, r2] = await Promise.all([p1, p2]);
        expect(r1).toBe('');
        expect(r2).toBe('');
      } finally {
        rl.close();
      }
    });

    it('T5-1.5: Stream error event marks state closed and drains waiters without hanging', async () => {
      const inStream = new PassThrough();
      const outStream = new PassThrough();
      const rl = readline.createInterface({ input: inStream, output: outStream });

      try {
        const p1 = promptInput('Enter Key:', { input: inStream, output: outStream, rl });

        setImmediate(() => {
          rl.emit('error', new Error('Simulated socket error'));
        });

        const result = await p1;
        expect(result).toBe('');
      } finally {
        rl.close();
      }
    });

    it('T5-1.6: Windows CRLF (\\r\\n) and mixed line endings are cleanly stripped without \\r artifacts', async () => {
      const inStream = new PassThrough();
      const outStream = new PassThrough();
      const rl = readline.createInterface({ input: inStream, output: outStream });

      try {
        const choicePromise = promptSelect('Select Engine:', AI_ENGINE_CHOICES, 0, {
          input: inStream,
          output: outStream,
          rl,
        });

        inStream.write('groq\r\nsk-crlf-api-key-12345\r\n');

        const choice = await choicePromise;
        expect(choice).toBe('groq');

        const key = await promptInput('Enter Key:', {
          input: inStream,
          output: outStream,
          rl,
        });
        expect(key).toBe('sk-crlf-api-key-12345');
        expect(key.includes('\r')).toBe(false);
      } finally {
        rl.close();
      }
    });

    it('T5-1.7: Adversarial selection inputs in promptSelect: handles out-of-bounds, non-numeric, and partial matching', async () => {
      const adversarialCases: Array<{ input: string; expected: AIEngineName }> = [
        { input: '0', expected: 'none' }, // 0 is invalid choice index
        { input: '-1', expected: 'none' }, // negative index
        { input: '99', expected: 'none' }, // out of bounds
        { input: '2.5', expected: 'gemini' }, // parseInt('2.5', 10) === 2 -> Gemini
        { input: '0.8', expected: 'none' }, // parseInt('0.8', 10) === 0 -> out of bounds -> fallback 'none'
        { input: 'NaN', expected: 'none' }, // NaN string
        { input: '!@#$%^&*()', expected: 'none' }, // punctuation
        { input: '   ', expected: 'none' }, // empty/whitespace
        { input: 'gEmInI', expected: 'gemini' }, // case-insensitive exact value
        { input: 'CLAUDE', expected: 'claude' }, // uppercase exact value
        { input: 'groq', expected: 'groq' }, // lowercase exact value
        { input: 'Anthropic', expected: 'claude' }, // label substring match
        { input: 'Google', expected: 'gemini' }, // label substring match
        { input: 'Ollama', expected: 'custom' }, // label substring match
        { input: 'OpenAI', expected: 'openai' }, // label substring match
      ];

      for (const { input, expected } of adversarialCases) {
        const inStream = new PassThrough();
        const outStream = new PassThrough();
        const p = promptSelect('Select Engine:', AI_ENGINE_CHOICES, 0, {
          input: inStream,
          output: outStream,
        });
        inStream.write(`${input}\n`);
        const res = await p;
        expect(res).toBe(expected);
      }
    });

    it('T5-1.8: Survives 64KB oversized API key without corruption or memory leak', async () => {
      const inStream = new PassThrough();
      const outStream = new PassThrough();
      const hugeKey = 'sk-live-' + 'X'.repeat(65536);

      const p = promptInput('Enter Huge Key:', {
        input: inStream,
        output: outStream,
      });

      inStream.write(`${hugeKey}\n`);
      const res = await p;
      expect(res.length).toBe(hugeKey.length);
      expect(res).toBe(hugeKey);
    });

    it('T5-1.9: Survives write error on broken/closed output stream gracefully', async () => {
      const inStream = new PassThrough();
      const brokenOutStream = new Writable({
        write(_chunk, _encoding, callback) {
          callback(new Error('EPIPE: broken pipe'));
        },
      });
      brokenOutStream.on('error', () => {}); // Handle expected error event on broken stream

      const p = promptInput('Enter Key on Broken Stream:', {
        input: inStream,
        output: brokenOutStream,
        defaultValue: 'safe-fallback',
      });

      inStream.write('my-key\n');
      const res = await p;
      expect(res).toBe('my-key');
    });
  });

  // =========================================================================
  // SECTION 2: create-ranu Template & Bin Security & .gitignore Shielding
  // =========================================================================
  describe('Section 2: create-ranu Template, CLI Flags & .gitignore Shielding Audit', () => {
    it('T5-2.1: Exhaustive .gitignore audit across ALL 7 templates: shields .env and .env*.local while allowing !.env.example', () => {
      const templates: TemplateName[] = [
        'default',
        'minimal',
        'cloudflare',
        'node-docker',
        'api-routes',
        'saas',
        'ai-studio',
      ];

      for (const tmpl of templates) {
        const files = generateTemplateFiles(`test-${tmpl}`, 'pnpm', {
          template: tmpl,
          ai: 'gemini',
          apiKey: 'AIzaSyTest123',
        });

        expect(files['.gitignore'], `Template "${tmpl}" must generate .gitignore`).toBeDefined();
        const gi = files['.gitignore'];

        // Strict security rules for environment credentials
        expect(gi).toContain('.env');
        expect(gi).toContain('.env*.local');
        expect(gi).toContain('!.env.example');

        // .env must be generated with credentials
        expect(files['.env']).toBeDefined();
        expect(files['.env']).toContain('GEMINI_API_KEY=AIzaSyTest123');

        // .env.example must NOT leak actual credentials
        expect(files['.env.example']).toBeDefined();
        expect(files['.env.example']).not.toContain('AIzaSyTest123');
        expect(files['.env.example']).toContain('your_gemini_api_key_here');
      }
    });

    it('T5-2.2: node-docker template shields .env in .dockerignore to prevent image credential baking', () => {
      const files = generateTemplateFiles('test-docker', 'npm', {
        template: 'node-docker',
        ai: 'openai',
        apiKey: 'sk-proj-docker-secret',
      });

      expect(files['.dockerignore']).toBeDefined();
      expect(files['.dockerignore']).toContain('.env');
      expect(files['.dockerignore']).toContain('!.env.example');
      expect(files['.dockerignore']).toContain('node_modules');
    });

    it('T5-2.3: getEnvContent generation handles special characters in keys without truncation or escaping flaws', () => {
      const specialKeys = [
        'sk-ant-api03-!@#$%^&*()_+=-{}[]:;<>?,./',
        'sk-proj-with="quotes"\'and\'spaces',
        'AIzaSy-accented-éàçüñ-symbols',
        'gsk_colon:and;semicolon',
      ];

      for (const key of specialKeys) {
        const content = getEnvContent('claude', key);
        expect(content).toBe(`PORT=3000\nANTHROPIC_API_KEY=${key}\n`);
      }
    });

    it('T5-2.4: Custom AI engine with endpoint and session token populates CUSTOM_AI_ENDPOINT and CUSTOM_AI_KEY', () => {
      const content = getEnvContent('custom', 'session-token-999', 'https://llm.mycompany.internal:8443/v1');
      expect(content).toContain('CUSTOM_AI_ENDPOINT=https://llm.mycompany.internal:8443/v1');
      expect(content).toContain('CUSTOM_AI_KEY=session-token-999');

      // Custom AI without key only emits endpoint
      const contentNoKey = getEnvContent('custom', undefined, 'http://localhost:11434');
      expect(contentNoKey).toBe('PORT=3000\nCUSTOM_AI_ENDPOINT=http://localhost:11434\n');
    });

    it('T5-2.5: parseArgs flag injection defense: throws when flag values look like adjacent flags or are missing', () => {
      // --api-key followed immediately by another flag
      expect(() => parseArgs(['--api-key', '--template', 'minimal'])).toThrow(
        'Flag "--api-key" requires a valid API key argument.'
      );

      // --endpoint followed immediately by another flag
      expect(() => parseArgs(['--endpoint', '--ai', 'custom'])).toThrow(
        'Flag "--endpoint" requires a valid URL endpoint argument.'
      );

      // --api-key as trailing argument without value
      expect(() => parseArgs(['my-app', '--api-key'])).toThrow(
        'Flag "--api-key" requires a valid API key argument.'
      );

      // --endpoint as trailing argument without value
      expect(() => parseArgs(['my-app', '--endpoint'])).toThrow(
        'Flag "--endpoint" requires a valid URL endpoint argument.'
      );

      // Unknown flag rejection
      expect(() => parseArgs(['my-app', '--malicious-flag'])).toThrow(
        'Unknown flag "--malicious-flag". Run "create-ranu --help" for available options.'
      );
    });

    it('T5-2.6: Full non-interactive scaffolding with --ai, --api-key, and --endpoint produces verifiable project directory', () => {
      const target = path.join(tempBaseDir, 'test-full-scaffold');
      const result = scaffoldProject({
        projectPath: target,
        ai: 'custom',
        endpoint: 'http://127.0.0.1:11434',
        apiKey: 'custom-secret-key-42',
        git: false,
        install: false,
      });

      expect(result.success).toBe(true);
      expect(result.hasCredentials).toBe(true);

      const envPath = path.join(target, '.env');
      expect(fs.existsSync(envPath)).toBe(true);
      const envContent = fs.readFileSync(envPath, 'utf8');
      expect(envContent).toContain('CUSTOM_AI_ENDPOINT=http://127.0.0.1:11434');
      expect(envContent).toContain('CUSTOM_AI_KEY=custom-secret-key-42');

      const gitignorePath = path.join(target, '.gitignore');
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
      expect(gitignoreContent).toContain('.env');
      expect(gitignoreContent).toContain('!.env.example');
    });
  });

  // =========================================================================
  // SECTION 3: packages/devtools/src/component.tsx React 19 SSR & Shortcuts
  // =========================================================================
  describe('Section 3: packages/devtools/src/component.tsx React 19 SSR Guard & In-Browser Dock', () => {
    it('T5-3.1: React 19 SSR guard: does not throw and returns null when ReactCurrentDispatcher is null in Server Components', () => {
      const internals =
        (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE ||
        (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

      if (internals) {
        const prevH = internals.H;
        const prevDispatcher = internals.ReactCurrentDispatcher?.current;
        try {
          if ('H' in internals) internals.H = null;
          if (internals.ReactCurrentDispatcher) {
            internals.ReactCurrentDispatcher.current = null;
          }

          let element: React.ReactElement | null = null;
          expect(() => {
            element = RanuDevTools();
          }).not.toThrow();
          expect(element).toBeNull();
        } finally {
          if ('H' in internals) internals.H = prevH;
          if (internals.ReactCurrentDispatcher) {
            internals.ReactCurrentDispatcher.current = prevDispatcher;
          }
        }
      }
    });

    it('T5-3.2: useSyncExternalStore getServerSnapshot referential identity audit across 1000 calls', () => {
      // Must guarantee identical object reference to prevent React 19 infinite re-render loop
      const initial = getDevToolsState();
      for (let i = 0; i < 1000; i++) {
        const next = getDevToolsState();
        expect(next).toBe(initial);
      }
    });

    it('T5-3.3: Keyboard shortcut combinations: Alt+D, Alt+d, Ctrl+Shift+D, Cmd+Shift+D toggle dock reliably', () => {
      class MockElement {
        public style: Record<string, string> = {};
        public children: MockElement[] = [];
        public shadowRoot: MockElement | null = null;
        public onclick: (() => void) | null = null;
        public id = '';
        public className = '';
        public innerHTML = '';
        public textContent = '';

        attachShadow() {
          this.shadowRoot = new MockElement();
          return this.shadowRoot;
        }
        appendChild(child: MockElement) {
          this.children.push(child);
          return child;
        }
        querySelector() { return null; }
        querySelectorAll() { return []; }
        remove() {}
      }

      class MockDoc {
        public listeners = new Map<string, Array<(e: any) => void>>();
        public body = new MockElement();

        addEventListener(type: string, listener: (e: any) => void): void {
          if (!this.listeners.has(type)) this.listeners.set(type, []);
          this.listeners.get(type)!.push(listener);
        }

        removeEventListener(type: string, listener: (e: any) => void): void {
          const arr = this.listeners.get(type);
          if (arr) this.listeners.set(type, arr.filter((l) => l !== listener));
        }

        dispatchEvent(e: any): void {
          for (const l of this.listeners.get(e.type) || []) l(e);
        }

        createElement() {
          return new MockElement();
        }
        getElementById() { return null; }
      }

      const doc = new MockDoc();
      const unmount = mountDevToolsDock(doc as any);

      try {
        expect(getDevToolsState().isOpen).toBe(false);

        // 1. Alt+D
        let prevented = false;
        doc.dispatchEvent({ type: 'keydown', altKey: true, key: 'D', preventDefault: () => { prevented = true; } });
        expect(prevented).toBe(true);
        expect(getDevToolsState().isOpen).toBe(true);

        // 2. Alt+d closes
        doc.dispatchEvent({ type: 'keydown', altKey: true, key: 'd' });
        expect(getDevToolsState().isOpen).toBe(false);

        // 3. Ctrl+Shift+D
        prevented = false;
        doc.dispatchEvent({ type: 'keydown', ctrlKey: true, shiftKey: true, key: 'D', preventDefault: () => { prevented = true; } });
        expect(prevented).toBe(true);
        expect(getDevToolsState().isOpen).toBe(true);

        // 4. Ctrl+Shift+d closes
        doc.dispatchEvent({ type: 'keydown', ctrlKey: true, shiftKey: true, key: 'd' });
        expect(getDevToolsState().isOpen).toBe(false);

        // 5. Cmd+Shift+D (macOS metaKey)
        prevented = false;
        doc.dispatchEvent({ type: 'keydown', metaKey: true, shiftKey: true, key: 'D', preventDefault: () => { prevented = true; } });
        expect(prevented).toBe(true);
        expect(getDevToolsState().isOpen).toBe(true);

        // 6. Cmd+Shift+d closes
        doc.dispatchEvent({ type: 'keydown', metaKey: true, shiftKey: true, key: 'd' });
        expect(getDevToolsState().isOpen).toBe(false);

        // Adversarial rejection: Ctrl+D alone (browser bookmark) must NOT toggle
        doc.dispatchEvent({ type: 'keydown', ctrlKey: true, key: 'd' });
        expect(getDevToolsState().isOpen).toBe(false);

        // Adversarial rejection: Shift+D alone must NOT toggle
        doc.dispatchEvent({ type: 'keydown', shiftKey: true, key: 'd' });
        expect(getDevToolsState().isOpen).toBe(false);

        // Adversarial rejection: Alt+Shift+X must NOT toggle
        doc.dispatchEvent({ type: 'keydown', altKey: true, shiftKey: true, key: 'x' });
        expect(getDevToolsState().isOpen).toBe(false);
      } finally {
        if (unmount) unmount();
      }
    });

    it('T5-3.4: Floating pill dock styling & DOM rendering: z-index 2147483646 and streaming counter', () => {
      recordStreamingChunk(512, 'chunk-1');
      recordStreamingChunk(1024, 'chunk-2');

      const html = ReactDOMServer.renderToString(React.createElement(RanuDevTools));
      expect(html).toContain('z-index:2147483646');
      expect(html).toContain('bottom:16px');
      expect(html).toContain('left:16px');
      expect(html).toContain('⚡');
      expect(html).toContain('Ranu DevTools');
      expect(html).toContain('2'); // Chunk count badge
    });
  });

  // =========================================================================
  // SECTION 4: packages/build/src/bundler/esbuild-plugin-ranu.ts 0-Byte Tree-Shaking
  // =========================================================================
  describe('Section 4: esbuild DevTools Production Virtual Stub & 0-Byte Audit', () => {
    it('T5-4.1: esbuild plugin intercepts @ranu/devtools in production browser builds and emits 0-byte stub', () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const plugin = createRanuEsbuildPlugin({
          platform: 'browser',
          projectRoot: tempBaseDir,
          staticOutDir: path.join(tempBaseDir, 'static'),
          tempOutDir: path.join(tempBaseDir, 'temp'),
        });

        let devtoolsResolver: ((args: any) => any) | undefined;
        let devtoolsLoader: ((args: any) => any) | undefined;

        const buildMock: any = {
          onResolve: (filterObj: any, cb: any) => {
            if (filterObj.filter.test('@ranu/devtools')) {
              devtoolsResolver = cb;
            }
          },
          onLoad: (filterObj: any, cb: any) => {
            if (filterObj.namespace === 'ranu-virtual-devtools-stub') {
              devtoolsLoader = cb;
            }
          },
        };

        plugin.setup(buildMock);

        expect(devtoolsResolver).toBeDefined();
        expect(devtoolsLoader).toBeDefined();

        // 1. Verify resolution maps to virtual stub namespace
        const resolved = devtoolsResolver!({ path: '@ranu/devtools' });
        expect(resolved).toEqual({
          path: '@ranu/devtools',
          namespace: 'ranu-virtual-devtools-stub',
        });

        // 2. Verify virtual stub contents
        const loaded = devtoolsLoader!({ path: '@ranu/devtools' });
        expect(loaded.loader).toBe('js');
        const stubContent = loaded.contents;

        // Stub must contain safe null implementations of all public symbols
        expect(stubContent).toContain('export const RanuDevTools = () => null;');
        expect(stubContent).toContain('export const DevToolsDock = () => null;');
        expect(stubContent).toContain('export const AIStudio = () => null;');
        expect(stubContent).toContain('export const toggleDevToolsDock = () => false;');
        expect(stubContent).toContain('export const getDevToolsState = () => ({});');
        expect(stubContent).toContain('export const subscribeDevTools = () => () => {};');

        // 3. Virtual stub contains NO sensitive implementation code or sensitive constants
        expect(stubContent).not.toContain('2147483646');
        expect(stubContent).not.toContain('shadowRoot');
        expect(stubContent).not.toContain('attachShadow');
        expect(stubContent).not.toContain('addEventListener');

        // 4. Bundled production client code importing <RanuDevTools /> satisfies 0-byte audit
        const prodAppBundle = `
          import React from 'react';
          const RanuDevTools = () => null;
          export default function RootLayout({ children }) {
            return React.createElement('html', null, React.createElement(RanuDevTools), children);
          }
        `;
        const audit = auditProductionBundle(prodAppBundle);
        expect(audit.passed).toBe(true);
        expect(audit.leakedDevtoolsBytes).toBe(0);
        expect(audit.matchedDevtoolsSymbols).toEqual([]);
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    it('T5-4.2: esbuild plugin also intercepts ranu/devtools (core subpath) in production client builds', () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const plugin = createRanuEsbuildPlugin({
          platform: 'browser',
          projectRoot: tempBaseDir,
          staticOutDir: path.join(tempBaseDir, 'static'),
          tempOutDir: path.join(tempBaseDir, 'temp'),
        });

        let devtoolsResolver: ((args: any) => any) | undefined;
        const buildMock: any = {
          onResolve: (filterObj: any, cb: any) => {
            if (filterObj.filter.test('ranu/devtools')) {
              devtoolsResolver = cb;
            }
          },
          onLoad: () => {},
        };

        plugin.setup(buildMock);
        expect(devtoolsResolver).toBeDefined();

        const resolved = devtoolsResolver!({ path: 'ranu/devtools' });
        expect(resolved).toEqual({
          path: 'ranu/devtools',
          namespace: 'ranu-virtual-devtools-stub',
        });
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    it('T5-4.3: In development mode, esbuild leaves DevTools un-stubbed to support in-browser visual debugging', () => {
      process.env.NODE_ENV = 'development';

      const plugin = createRanuEsbuildPlugin({
        platform: 'browser',
        projectRoot: tempBaseDir,
        staticOutDir: path.join(tempBaseDir, 'static'),
        tempOutDir: path.join(tempBaseDir, 'temp'),
      });

      let devtoolsResolver: ((args: any) => any) | undefined;
      const buildMock: any = {
        onResolve: (filterObj: any, cb: any) => {
          if (filterObj.filter.test('@ranu/devtools')) {
            devtoolsResolver = cb;
          }
        },
        onLoad: () => {},
      };

      plugin.setup(buildMock);
      expect(devtoolsResolver).toBeDefined();

      const resolved = devtoolsResolver!({ path: '@ranu/devtools' });
      // Under development, onResolve returns undefined (standard bundle resolution preserved)
      expect(resolved).toBeUndefined();
    });

    it('T5-4.4: In Node platform (SSR / server builds), DevTools is un-stubbed regardless of NODE_ENV', () => {
      process.env.NODE_ENV = 'production';

      const plugin = createRanuEsbuildPlugin({
        platform: 'node',
        projectRoot: tempBaseDir,
        staticOutDir: path.join(tempBaseDir, 'static'),
        tempOutDir: path.join(tempBaseDir, 'temp'),
      });

      let devtoolsResolver: ((args: any) => any) | undefined;
      const buildMock: any = {
        onResolve: (filterObj: any, cb: any) => {
          if (filterObj.filter.test('@ranu/devtools')) {
            devtoolsResolver = cb;
          }
        },
        onLoad: () => {},
      };

      plugin.setup(buildMock);
      expect(devtoolsResolver).toBeDefined();

      const resolved = devtoolsResolver!({ path: '@ranu/devtools' });
      expect(resolved).toBeUndefined();
    });
  });
});
