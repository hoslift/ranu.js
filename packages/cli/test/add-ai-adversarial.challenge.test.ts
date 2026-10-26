import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ts from 'typescript';
import { runCli } from '../src/cli.js';
import { runAddCommand } from '../src/commands/add.js';
import { sanitizeTargetFilePath } from '../src/commands/ai.js';
import { createCliLogger } from '../src/logger.js';
import type { AddOnResult } from '../src/types.js';

describe('Adversarial Stress Testing: ranu add AI recipes (Milestone M9 / PR #253)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-ai-adv-'));
    fs.mkdirSync(path.join(tmpDir, 'app', 'routes'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify(
        {
          name: 'adversarial-test-app',
          version: '0.1.0',
          dependencies: {
            react: '^19.0.0',
            'react-dom': '^19.0.0',
          },
        },
        null,
        2,
      ),
      'utf8',
    );
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  function assertValidTypeScript(content: string, fileName = 'api.ai.ts'): void {
    const sourceFile = ts.createSourceFile(
      fileName,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const diagnostics =
      (sourceFile as unknown as { parseDiagnostics?: readonly unknown[] }).parseDiagnostics ?? [];
    expect(diagnostics.length).toBe(0);
  }

  /* ========================================================================
   * Dimension 1: Path Traversal Attacks via Crafted --name & Target Routes
   * ======================================================================== */
  describe('Dimension 1: Path Traversal Attacks via Crafted --name & Target Routes', () => {
    const traversalNames = [
      '../../etc/passwd',
      '..\\..\\Windows',
      '..\\..\\Windows\\System32',
      '../../../../../../../../tmp/evil.txt',
      '..',
      '../',
      './',
      '.\\..\\Windows',
      '..%2f..%2fpasswd',
      'test\0bad',
      '$(whoami)',
      '; rm -rf /',
      '`calc`',
      '<script>alert(1)</script>',
      'C:\\Windows\\System32',
      '/etc/passwd',
      'name with spaces',
      'name/with/slashes',
      'name\\with\\backslashes',
      'name:with:colons',
      'name?with?query',
      'name*with*wildcards',
      'name|pipe',
      'name>redirect',
      'name<input',
    ];

    for (const namePayload of traversalNames) {
      it(`rejects crafted --name "${namePayload}" and writes 0 bytes to disk`, async () => {
        let capturedJson: AddOnResult | undefined;
        const logger = createCliLogger({ json: true });
        vi.spyOn(logger, 'json').mockImplementation((data: unknown) => {
          capturedJson = data as AddOnResult;
        });

        const initialPkgContent = fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8');

        const exitCode = await runAddCommand(
          {
            command: 'add',
            args: ['ai-custom'],
            name: namePayload,
            endpoint: 'http://localhost:11434',
            root: tmpDir,
            json: true,
          },
          logger,
        );

        // 1. Must reject with exit code 1
        expect(exitCode).toBe(1);

        // 2. Structured JSON error contract
        expect(capturedJson).toBeDefined();
        expect(capturedJson?.success).toBe(false);
        expect(capturedJson?.error).toMatch(/Invalid --name/i);

        // 3. Route file must NOT have been created
        const routePath = path.join(tmpDir, 'app', 'routes', 'api.ai.ts');
        expect(fs.existsSync(routePath)).toBe(false);

        // 4. .env.example must NOT have been created
        const envPath = path.join(tmpDir, '.env.example');
        expect(fs.existsSync(envPath)).toBe(false);

        // 5. package.json must remain 100% unchanged
        expect(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8')).toBe(initialPkgContent);
      });
    }

    it('rejects path traversal in add-on positional name parameter', async () => {
      const exitCode = await runCli(['add', '../../etc/passwd', '--root', tmpDir]);
      expect(exitCode).toBe(1);

      const routePath = path.join(tmpDir, 'app', 'routes', 'api.ai.ts');
      expect(fs.existsSync(routePath)).toBe(false);
    });

    describe('sanitizeTargetFilePath containment stress', () => {
      const escapeAttempts = [
        '../../etc/passwd',
        '..\\..\\Windows',
        '..\\..\\Windows\\System32',
        '../sibling-dir/file.ts',
        '/etc/shadow',
        'C:\\Windows\\System32\\drivers\\etc\\hosts',
        'D:\\secret.txt',
        'app/routes/../../../../../../etc/passwd',
        'app/../../..',
        '',
        '.',
        '..',
      ];

      for (const attempt of escapeAttempts) {
        it(`sanitizeTargetFilePath strictly throws on "${attempt}"`, () => {
          expect(() => sanitizeTargetFilePath(tmpDir, attempt)).toThrow(/Path traversal violation/);
        });
      }

      it('safely resolves legitimate contained relative paths within project root', () => {
        const safe1 = sanitizeTargetFilePath(tmpDir, 'app/routes/api.ai.ts');
        expect(safe1).toBe(path.resolve(tmpDir, 'app', 'routes', 'api.ai.ts'));

        const safe2 = sanitizeTargetFilePath(tmpDir, '.env.example');
        expect(safe2).toBe(path.resolve(tmpDir, '.env.example'));

        const safe3 = sanitizeTargetFilePath(tmpDir, 'app/sub/../routes/api.ai.ts');
        expect(safe3).toBe(path.resolve(tmpDir, 'app', 'routes', 'api.ai.ts'));
      });
    });
  });

  /* ========================================================================
   * Dimension 2: Protocol Poisoning in ai-custom --endpoint
   * ======================================================================== */
  describe('Dimension 2: Protocol Poisoning in ai-custom --endpoint', () => {
    const dangerousProtocols = [
      'javascript:alert("XSS")',
      'JAVASCRIPT:alert(1)',
      'javascript:void(0)',
      'javascript:/*--></title></style></textarea>*/<script>alert(1)</script>',
      'file:///etc/passwd',
      'FILE:///etc/passwd',
      'file://C:/Windows/win.ini',
      'file:///C:/Users/Administrator/secret.key',
      'data:text/html,<script>alert(1)</script>',
      'DATA:text/html,<script>alert(1)</script>',
      'data:application/json,{"malicious":true}',
      'data:text/javascript;base64,YWxlcnQoMSk=',
      'ftp://malicious-server.com/payload.sh',
      'ftps://malicious-server.com/payload.sh',
      'ws://evil.attacker.com/telemetry',
      'wss://evil.attacker.com/telemetry',
      'gopher://evil.attacker.com:70/1',
      'blob:http://localhost:11434/00000000-0000-0000-0000-000000000000',
      'vbscript:msgbox(1)',
      'mailto:victim@example.com',
      'tel:+1234567890',
      'ldap://evil.com/cn=root',
      'dict://evil.com/dict',
    ];

    for (const badEndpoint of dangerousProtocols) {
      it(`rejects dangerous protocol in --endpoint: "${badEndpoint}"`, async () => {
        let capturedJson: AddOnResult | undefined;
        const logger = createCliLogger({ json: true });
        vi.spyOn(logger, 'json').mockImplementation((data: unknown) => {
          capturedJson = data as AddOnResult;
        });

        const exitCode = await runAddCommand(
          {
            command: 'add',
            args: ['ai-custom'],
            endpoint: badEndpoint,
            root: tmpDir,
            json: true,
          },
          logger,
        );

        expect(exitCode).toBe(1);
        expect(capturedJson).toBeDefined();
        expect(capturedJson?.success).toBe(false);
        expect(capturedJson?.error).toMatch(/Invalid --endpoint protocol/i);

        // Zero bytes written to disk
        expect(fs.existsSync(path.join(tmpDir, 'app', 'routes', 'api.ai.ts'))).toBe(false);
        expect(fs.existsSync(path.join(tmpDir, '.env.example'))).toBe(false);
      });
    }

    const malformedEndpoints = [
      'not_a_valid_url',
      'http://',
      'https://',
      '://missing-scheme',
      'htp://misspelled.com',
      'http//missing-colon.com',
      'http://invalid host with spaces',
      'http://[invalid-ipv6',
    ];

    for (const malformed of malformedEndpoints) {
      it(`rejects malformed --endpoint: "${malformed}"`, async () => {
        let capturedJson: AddOnResult | undefined;
        const logger = createCliLogger({ json: true });
        vi.spyOn(logger, 'json').mockImplementation((data: unknown) => {
          capturedJson = data as AddOnResult;
        });

        const exitCode = await runAddCommand(
          {
            command: 'add',
            args: ['ai-custom'],
            endpoint: malformed,
            root: tmpDir,
            json: true,
          },
          logger,
        );

        expect(exitCode).toBe(1);
        expect(capturedJson?.success).toBe(false);
        expect(capturedJson?.error).toMatch(/Invalid --endpoint/i);

        // Zero bytes written to disk
        expect(fs.existsSync(path.join(tmpDir, 'app', 'routes', 'api.ai.ts'))).toBe(false);
      });
    }

    const legitimateEndpoints = [
      'http://localhost:11434',
      'HTTP://localhost:11434',
      'http://127.0.0.1:11434',
      'https://api.openai.com/v1',
      'HTTPS://api.openai.com/v1',
      'https://api.groq.com/openai/v1',
      'http://my-ollama.internal.net:8080/v1',
    ];

    for (const validEndpoint of legitimateEndpoints) {
      it(`accepts valid HTTP/HTTPS endpoint: "${validEndpoint}"`, async () => {
        const subTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-ai-valid-'));
        fs.mkdirSync(path.join(subTmp, 'app', 'routes'), { recursive: true });
        fs.writeFileSync(path.join(subTmp, 'package.json'), '{}', 'utf8');

        const exitCode = await runCli([
          'add',
          'ai-custom',
          '--endpoint',
          validEndpoint,
          '--root',
          subTmp,
        ]);

        expect(exitCode).toBe(0);

        const routePath = path.join(subTmp, 'app', 'routes', 'api.ai.ts');
        expect(fs.existsSync(routePath)).toBe(true);
        const routeContent = fs.readFileSync(routePath, 'utf8');
        expect(routeContent).toContain(validEndpoint);
        assertValidTypeScript(routeContent);

        const envContent = fs.readFileSync(path.join(subTmp, '.env.example'), 'utf8');
        expect(envContent).toContain(`CUSTOM_AI_ENDPOINT=${validEndpoint}`);

        fs.rmSync(subTmp, { recursive: true, force: true });
      });
    }
  });

  /* ========================================================================
   * Dimension 3: Rapid Sequential Executions for Idempotency
   * ======================================================================== */
  describe('Dimension 3: Rapid Sequential Executions for Idempotency', () => {
    it('executes ranu add ai-gemini 10 times in sequence with --force without corruption', async () => {
      for (let i = 1; i <= 10; i++) {
        const exitCode = await runCli(['add', 'ai-gemini', '--force', '--root', tmpDir]);
        expect(exitCode).toBe(0);

        // Verify package.json remains valid JSON and has zero duplicate dependencies
        const rawPkg = fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8');
        let pkg: { dependencies?: Record<string, string> };
        expect(() => {
          pkg = JSON.parse(rawPkg) as typeof pkg;
        }).not.toThrow();

        pkg = JSON.parse(rawPkg);
        const geminiEntries = Object.keys(pkg.dependencies ?? {}).filter((k) => k === '@ranu/ai-gemini');
        const aiEntries = Object.keys(pkg.dependencies ?? {}).filter((k) => k === '@ranu/ai');
        expect(geminiEntries.length).toBe(1);
        expect(aiEntries.length).toBe(1);

        // Verify .env.example contains GEMINI_API_KEY exactly once
        const envContent = fs.readFileSync(path.join(tmpDir, '.env.example'), 'utf8');
        const keyMatches = envContent.match(/^GEMINI_API_KEY=/gm);
        expect(keyMatches).toHaveLength(1);

        const commentMatches = envContent.match(/# Google Gemini API Key/g);
        expect(commentMatches).toHaveLength(1);

        // Verify route file is valid TypeScript
        const routeContent = fs.readFileSync(
          path.join(tmpDir, 'app', 'routes', 'api.ai.ts'),
          'utf8',
        );
        assertValidTypeScript(routeContent);
      }
    });

    it('rapidly alternates across all 5 AI recipes with --force and retains all dependencies cleanly', async () => {
      const recipes = ['ai-gemini', 'ai-groq', 'ai-claude', 'ai-openai', 'ai-custom'];

      // Execute 3 full rounds (15 executions)
      for (let round = 0; round < 3; round++) {
        for (const recipe of recipes) {
          const exitCode = await runCli(['add', recipe, '--force', '--root', tmpDir]);
          expect(exitCode).toBe(0);

          // Route file must be valid TypeScript at every turn
          const route = fs.readFileSync(path.join(tmpDir, 'app', 'routes', 'api.ai.ts'), 'utf8');
          assertValidTypeScript(route);
        }
      }

      // Final package.json checks: all 5 drivers + @ranu/ai must exist exactly once
      const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8')) as {
        dependencies: Record<string, string>;
      };
      const expectedPackages = [
        '@ranu/ai',
        '@ranu/ai-gemini',
        '@ranu/ai-groq',
        '@ranu/ai-claude',
        '@ranu/ai-openai',
        '@ranu/ai-custom',
      ];
      for (const p of expectedPackages) {
        expect(pkg.dependencies[p]).toBe('^0.1.0');
      }

      // Final .env.example checks: each key exists exactly once
      const envContent = fs.readFileSync(path.join(tmpDir, '.env.example'), 'utf8');
      const expectedKeys = [
        'GEMINI_API_KEY',
        'GROQ_API_KEY',
        'ANTHROPIC_API_KEY',
        'OPENAI_API_KEY',
        'CUSTOM_AI_KEY',
        'CUSTOM_AI_ENDPOINT',
      ];
      for (const k of expectedKeys) {
        const matches = envContent.match(new RegExp(`^${k}=`, 'm'));
        expect(matches).not.toBeNull();
        const allMatches = envContent.match(new RegExp(`^${k}=`, 'gm'));
        expect(allMatches).toHaveLength(1);
      }
    });

    it('consistently rejects subsequent runs without --force without modifying existing route', async () => {
      // First run succeeds
      const firstCode = await runCli(['add', 'ai-gemini', '--root', tmpDir]);
      expect(firstCode).toBe(0);

      const routePath = path.join(tmpDir, 'app', 'routes', 'api.ai.ts');
      const initialRouteContent = fs.readFileSync(routePath, 'utf8');

      // Run 5 sequential attempts without --force; each must fail and leave route 100% untouched
      for (let i = 0; i < 5; i++) {
        const repeatCode = await runCli(['add', 'ai-gemini', '--root', tmpDir]);
        expect(repeatCode).toBe(1);

        const currentRouteContent = fs.readFileSync(routePath, 'utf8');
        expect(currentRouteContent).toBe(initialRouteContent);
      }
    });
  });

  /* ========================================================================
   * Dimension 4: --json Structured Error Contracts Across All Failure Modes
   * ======================================================================== */
  describe('Dimension 4: --json Structured Error Contracts Across All Failure Modes', () => {
    it('FM-1: missing add-on name emits { success: false, error: ... }', async () => {
      let loggedJson: AddOnResult | undefined;
      const logger = createCliLogger({ json: true });
      vi.spyOn(logger, 'json').mockImplementation((data: unknown) => {
        loggedJson = data as AddOnResult;
      });

      const exitCode = await runAddCommand(
        {
          command: 'add',
          args: [],
          root: tmpDir,
          json: true,
        },
        logger,
      );

      expect(exitCode).toBe(1);
      expect(loggedJson?.success).toBe(false);
      expect(typeof loggedJson?.error).toBe('string');
      expect(loggedJson?.error).toContain('Missing add-on name');
    });

    it('FM-2: unsupported add-on name emits { success: false, error: ... }', async () => {
      let loggedJson: AddOnResult | undefined;
      const logger = createCliLogger({ json: true });
      vi.spyOn(logger, 'json').mockImplementation((data: unknown) => {
        loggedJson = data as AddOnResult;
      });

      const exitCode = await runAddCommand(
        {
          command: 'add',
          args: ['ai-nonexistent-framework'],
          root: tmpDir,
          json: true,
        },
        logger,
      );

      expect(exitCode).toBe(1);
      expect(loggedJson?.success).toBe(false);
      expect(typeof loggedJson?.error).toBe('string');
      expect(loggedJson?.error).toContain('Unsupported add-on');
    });

    it('FM-3: non-existent project root emits { success: false, error: ... }', async () => {
      let loggedJson: AddOnResult | undefined;
      const logger = createCliLogger({ json: true });
      vi.spyOn(logger, 'json').mockImplementation((data: unknown) => {
        loggedJson = data as AddOnResult;
      });

      const fakeRoot = path.join(tmpDir, 'nonexistent-directory-xyz');
      const exitCode = await runAddCommand(
        {
          command: 'add',
          args: ['ai-gemini'],
          root: fakeRoot,
          json: true,
        },
        logger,
      );

      expect(exitCode).toBe(1);
      expect(loggedJson?.success).toBe(false);
      expect(loggedJson?.error).toContain('Project root directory does not exist');
    });

    it('FM-4: route conflict without --force emits { success: false, error: ..., hint: ... }', async () => {
      // Pre-create route
      fs.writeFileSync(path.join(tmpDir, 'app', 'routes', 'api.ai.ts'), '// existing', 'utf8');

      let loggedJson: AddOnResult | undefined;
      const logger = createCliLogger({ json: true });
      vi.spyOn(logger, 'json').mockImplementation((data: unknown) => {
        loggedJson = data as AddOnResult;
      });

      const exitCode = await runAddCommand(
        {
          command: 'add',
          args: ['ai-gemini'],
          root: tmpDir,
          json: true,
        },
        logger,
      );

      expect(exitCode).toBe(1);
      expect(loggedJson?.success).toBe(false);
      expect(loggedJson?.error).toContain('already exists');
      expect(loggedJson?.hint).toContain('--force');
    });

    it('FM-5: invalid --name in ai-custom emits structured JSON error', async () => {
      let loggedJson: AddOnResult | undefined;
      const logger = createCliLogger({ json: true });
      vi.spyOn(logger, 'json').mockImplementation((data: unknown) => {
        loggedJson = data as AddOnResult;
      });

      const exitCode = await runAddCommand(
        {
          command: 'add',
          args: ['ai-custom'],
          name: '../../attack',
          root: tmpDir,
          json: true,
        },
        logger,
      );

      expect(exitCode).toBe(1);
      expect(loggedJson?.success).toBe(false);
      expect(loggedJson?.error).toContain('Invalid --name');
    });

    it('FM-6: protocol poisoning in ai-custom --endpoint emits structured JSON error', async () => {
      let loggedJson: AddOnResult | undefined;
      const logger = createCliLogger({ json: true });
      vi.spyOn(logger, 'json').mockImplementation((data: unknown) => {
        loggedJson = data as AddOnResult;
      });

      const exitCode = await runAddCommand(
        {
          command: 'add',
          args: ['ai-custom'],
          endpoint: 'javascript:alert(1)',
          root: tmpDir,
          json: true,
        },
        logger,
      );

      expect(exitCode).toBe(1);
      expect(loggedJson?.success).toBe(false);
      expect(loggedJson?.error).toContain('Invalid --endpoint protocol');
    });

    it('FM-7: malformed model name in ai-custom emits structured JSON error', async () => {
      let loggedJson: AddOnResult | undefined;
      const logger = createCliLogger({ json: true });
      vi.spyOn(logger, 'json').mockImplementation((data: unknown) => {
        loggedJson = data as AddOnResult;
      });

      const exitCode = await runAddCommand(
        {
          command: 'add',
          args: ['ai-custom'],
          model: 'model; rm -rf /',
          root: tmpDir,
          json: true,
        },
        logger,
      );

      expect(exitCode).toBe(1);
      expect(loggedJson?.success).toBe(false);
      expect(loggedJson?.error).toContain('Invalid --model');
    });

    it('SM-1: successful execution emits complete structured JSON with success: true', async () => {
      let loggedJson: AddOnResult | undefined;
      const logger = createCliLogger({ json: true });
      vi.spyOn(logger, 'json').mockImplementation((data: unknown) => {
        loggedJson = data as AddOnResult;
      });

      const exitCode = await runAddCommand(
        {
          command: 'add',
          args: ['ai-claude'],
          root: tmpDir,
          json: true,
        },
        logger,
      );

      expect(exitCode).toBe(0);
      expect(loggedJson?.success).toBe(true);
      expect(loggedJson?.addon).toBe('ai-claude');
      expect(loggedJson?.filesCreated).toContain('app/routes/api.ai.ts');
      expect(loggedJson?.dependencies).toContain('@ranu/ai');
      expect(loggedJson?.dependencies).toContain('@ranu/ai-claude');
      expect(loggedJson?.envVars).toContain('ANTHROPIC_API_KEY');
      expect(Array.isArray(loggedJson?.nextSteps)).toBe(true);
      expect((loggedJson?.nextSteps?.length ?? 0) > 0).toBe(true);
    });

    it('SM-2: dry-run mode emits complete structured JSON with dryRun: true', async () => {
      let loggedJson: AddOnResult | undefined;
      const logger = createCliLogger({ json: true });
      vi.spyOn(logger, 'json').mockImplementation((data: unknown) => {
        loggedJson = data as AddOnResult;
      });

      const exitCode = await runAddCommand(
        {
          command: 'add',
          args: ['ai-groq'],
          dryRun: true,
          root: tmpDir,
          json: true,
        },
        logger,
      );

      expect(exitCode).toBe(0);
      expect(loggedJson?.success).toBe(true);
      expect(loggedJson?.dryRun).toBe(true);
      expect(loggedJson?.addon).toBe('ai-groq');
      expect(loggedJson?.dependencies).toContain('@ranu/ai-groq');
      expect(fs.existsSync(path.join(tmpDir, 'app', 'routes', 'api.ai.ts'))).toBe(false);
    });
  });
});
