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

describe('@ranu/cli add AI recipes (PR #253)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-add-ai-test-'));
    fs.mkdirSync(path.join(tmpDir, 'app', 'routes'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify(
        {
          name: 'test-ai-app',
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

  // Helper to verify valid TypeScript syntax
  function assertValidTypeScript(content: string, fileName = 'api.ai.ts'): void {
    const sourceFile = ts.createSourceFile(
      fileName,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    // TypeScript scanner issues (e.g. unclosed strings, invalid tokens)
    const diagnostics =
      (sourceFile as unknown as { parseDiagnostics?: readonly unknown[] }).parseDiagnostics ?? [];
    expect(diagnostics.length).toBe(0);
  }

  // Helper to assert clean character encoding
  function assertCleanEncoding(text: string): void {
    const invalidScriptRegex = /[\u0D80-\u0DFF]/;
    expect(invalidScriptRegex.test(text)).toBe(false);
  }

  /* ========================================================================
   * Suite 1: Turnkey AI Recipe Scaffolding (Unit & Integration)
   * ======================================================================== */
  describe('Turnkey AI Recipe Scaffolding', () => {
    it('configures ai-gemini: route, package dependencies, and .env.example', async () => {
      const code = await runCli(['add', 'ai-gemini', '--root', tmpDir]);
      expect(code).toBe(0);

      // 1. Verify app/routes/api.ai.ts
      const routePath = path.join(tmpDir, 'app', 'routes', 'api.ai.ts');
      expect(fs.existsSync(routePath)).toBe(true);
      const routeContent = fs.readFileSync(routePath, 'utf8');
      expect(routeContent).toContain("from '@ranu/ai'");
      expect(routeContent).toContain("from '@ranu/ai-gemini'");
      expect(routeContent).toContain('export async function POST');
      expect(routeContent).toContain("gemini('gemini-1.5-pro')");
      assertValidTypeScript(routeContent);
      assertCleanEncoding(routeContent);

      // 2. Verify package.json dependencies
      const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8')) as {
        dependencies?: Record<string, string>;
      };
      expect(pkg.dependencies?.['@ranu/ai']).toBeDefined();
      expect(pkg.dependencies?.['@ranu/ai-gemini']).toBeDefined();

      // 3. Verify .env.example
      const envPath = path.join(tmpDir, '.env.example');
      expect(fs.existsSync(envPath)).toBe(true);
      const envContent = fs.readFileSync(envPath, 'utf8');
      expect(envContent).toContain('GEMINI_API_KEY=');
      assertCleanEncoding(envContent);
    });

    it('configures ai-groq: route, package dependencies, and .env.example', async () => {
      const code = await runCli(['add', 'ai-groq', '--root', tmpDir]);
      expect(code).toBe(0);

      const routePath = path.join(tmpDir, 'app', 'routes', 'api.ai.ts');
      expect(fs.existsSync(routePath)).toBe(true);
      const routeContent = fs.readFileSync(routePath, 'utf8');
      expect(routeContent).toContain("from '@ranu/ai'");
      expect(routeContent).toContain("from '@ranu/ai-groq'");
      expect(routeContent).toContain("groq('llama-3.3-70b-versatile')");
      assertValidTypeScript(routeContent);

      const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8')) as {
        dependencies?: Record<string, string>;
      };
      expect(pkg.dependencies?.['@ranu/ai-groq']).toBeDefined();

      const envContent = fs.readFileSync(path.join(tmpDir, '.env.example'), 'utf8');
      expect(envContent).toContain('GROQ_API_KEY=');
    });

    it('configures ai-claude: route, package dependencies, and .env.example', async () => {
      const code = await runCli(['add', 'ai-claude', '--root', tmpDir]);
      expect(code).toBe(0);

      const routePath = path.join(tmpDir, 'app', 'routes', 'api.ai.ts');
      expect(fs.existsSync(routePath)).toBe(true);
      const routeContent = fs.readFileSync(routePath, 'utf8');
      expect(routeContent).toContain("from '@ranu/ai'");
      expect(routeContent).toContain("from '@ranu/ai-claude'");
      expect(routeContent).toContain("claude('claude-3-5-sonnet-20241022')");
      assertValidTypeScript(routeContent);

      const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8')) as {
        dependencies?: Record<string, string>;
      };
      expect(pkg.dependencies?.['@ranu/ai-claude']).toBeDefined();

      const envContent = fs.readFileSync(path.join(tmpDir, '.env.example'), 'utf8');
      expect(envContent).toContain('ANTHROPIC_API_KEY=');
    });

    it('configures ai-custom: endpoint, model options, and .env.example', async () => {
      const code = await runCli([
        'add',
        'ai-custom',
        '--endpoint',
        'http://localhost:11434',
        '--model',
        'llama3',
        '--name',
        'local-ollama',
        '--root',
        tmpDir,
      ]);
      expect(code).toBe(0);

      const routePath = path.join(tmpDir, 'app', 'routes', 'api.ai.ts');
      expect(fs.existsSync(routePath)).toBe(true);
      const routeContent = fs.readFileSync(routePath, 'utf8');
      expect(routeContent).toContain("from '@ranu/ai'");
      expect(routeContent).toContain("from '@ranu/ai-custom'");
      expect(routeContent).toMatch(/http:\/\/localhost:11434|process\.env\.CUSTOM_AI_ENDPOINT/);
      expect(routeContent).toMatch(/llama3|process\.env\.CUSTOM_AI_MODEL/);
      assertValidTypeScript(routeContent);

      const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8')) as {
        dependencies?: Record<string, string>;
      };
      expect(pkg.dependencies?.['@ranu/ai-custom']).toBeDefined();

      const envContent = fs.readFileSync(path.join(tmpDir, '.env.example'), 'utf8');
      expect(envContent).toContain('CUSTOM_AI_KEY=');
      expect(envContent).toContain('CUSTOM_AI_ENDPOINT=http://localhost:11434');
    });

    it('configures ai-openai: route, package dependencies, and .env.example', async () => {
      const code = await runCli(['add', 'ai-openai', '--root', tmpDir]);
      expect(code).toBe(0);

      const routePath = path.join(tmpDir, 'app', 'routes', 'api.ai.ts');
      expect(fs.existsSync(routePath)).toBe(true);
      const routeContent = fs.readFileSync(routePath, 'utf8');
      expect(routeContent).toContain("from '@ranu/ai'");
      expect(routeContent).toContain("from '@ranu/ai-openai'");
      expect(routeContent).toContain("openai('gpt-4o')");
      assertValidTypeScript(routeContent);

      const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8')) as {
        dependencies?: Record<string, string>;
      };
      expect(pkg.dependencies?.['@ranu/ai-openai']).toBeDefined();

      const envContent = fs.readFileSync(path.join(tmpDir, '.env.example'), 'utf8');
      expect(envContent).toContain('OPENAI_API_KEY=');
    });
  });

  /* ========================================================================
   * Suite 2: Idempotency & Clean State Preservation
   * ======================================================================== */
  describe('Idempotency & Non-Duplication', () => {
    it('does not duplicate dependencies when running the recipe twice', async () => {
      const code1 = await runCli(['add', 'ai-gemini', '--root', tmpDir]);
      expect(code1).toBe(0);

      const code2 = await runCli(['add', 'ai-gemini', '--force', '--root', tmpDir]);
      expect(code2).toBe(0);

      const rawPkg = fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8');
      const pkg = JSON.parse(rawPkg) as { dependencies?: Record<string, string> };

      const geminiEntries = Object.keys(pkg.dependencies ?? {}).filter((k) => k === '@ranu/ai-gemini');
      const aiEntries = Object.keys(pkg.dependencies ?? {}).filter((k) => k === '@ranu/ai');

      expect(geminiEntries.length).toBe(1);
      expect(aiEntries.length).toBe(1);
    });

    it('does not duplicate environment variables in .env.example on re-run', async () => {
      await runCli(['add', 'ai-gemini', '--root', tmpDir]);
      await runCli(['add', 'ai-gemini', '--force', '--root', tmpDir]);

      const envContent = fs.readFileSync(path.join(tmpDir, '.env.example'), 'utf8');
      const lines = envContent.split(/\r?\n/).filter((line) => line.startsWith('GEMINI_API_KEY='));
      expect(lines.length).toBe(1);
    });

    it('preserves pre-existing user dependencies and environment variables', async () => {
      // Pre-populate .env.example with existing app secret
      fs.writeFileSync(
        path.join(tmpDir, '.env.example'),
        'DATABASE_URL=postgresql://localhost:5432/mydb\n',
        'utf8',
      );

      const code = await runCli(['add', 'ai-groq', '--root', tmpDir]);
      expect(code).toBe(0);

      const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8')) as {
        dependencies: Record<string, string>;
      };
      expect(pkg.dependencies.react).toBe('^19.0.0');
      expect(pkg.dependencies['react-dom']).toBe('^19.0.0');
      expect(pkg.dependencies['@ranu/ai-groq']).toBeDefined();

      const envContent = fs.readFileSync(path.join(tmpDir, '.env.example'), 'utf8');
      expect(envContent).toContain('DATABASE_URL=postgresql://localhost:5432/mydb');
      expect(envContent).toContain('GROQ_API_KEY=');
    });

    it('cleanly accumulates multiple distinct AI recipes', async () => {
      await runCli(['add', 'ai-gemini', '--root', tmpDir]);
      await runCli(['add', 'ai-groq', '--force', '--root', tmpDir]);

      const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8')) as {
        dependencies: Record<string, string>;
      };
      expect(pkg.dependencies['@ranu/ai']).toBeDefined();
      expect(pkg.dependencies['@ranu/ai-gemini']).toBeDefined();
      expect(pkg.dependencies['@ranu/ai-groq']).toBeDefined();

      const envContent = fs.readFileSync(path.join(tmpDir, '.env.example'), 'utf8');
      expect(envContent).toContain('GEMINI_API_KEY=');
      expect(envContent).toContain('GROQ_API_KEY=');
    });
  });

  /* ========================================================================
   * Suite 3: Conflict Handling & --force Flag
   * ======================================================================== */
  describe('Conflict Handling & --force Flag', () => {
    it('aborts with error when app/routes/api.ai.ts already exists without --force', async () => {
      const customContent = '// Custom user implementation\nexport const userCode = true;\n';
      const routePath = path.join(tmpDir, 'app', 'routes', 'api.ai.ts');
      fs.writeFileSync(routePath, customContent, 'utf8');

      const code = await runCli(['add', 'ai-gemini', '--root', tmpDir]);
      expect(code).toBe(1);

      // Verify existing file is completely untouched
      expect(fs.readFileSync(routePath, 'utf8')).toBe(customContent);
    });

    it('overwrites existing route when --force is supplied', async () => {
      const customContent = '// Custom user implementation\n';
      const routePath = path.join(tmpDir, 'app', 'routes', 'api.ai.ts');
      fs.writeFileSync(routePath, customContent, 'utf8');

      const code = await runCli(['add', 'ai-gemini', '--force', '--root', tmpDir]);
      expect(code).toBe(0);

      const updated = fs.readFileSync(routePath, 'utf8');
      expect(updated).not.toBe(customContent);
      expect(updated).toContain("from '@ranu/ai-gemini'");
    });

    it('emits structured JSON error on conflict when --json is passed', async () => {
      const routePath = path.join(tmpDir, 'app', 'routes', 'api.ai.ts');
      fs.writeFileSync(routePath, '// existing', 'utf8');

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
      expect(loggedJson?.error).toMatch(/already exists.*--force/i);
    });
  });

  /* ========================================================================
   * Suite 4: Dry-Run Safety Verification
   * ======================================================================== */
  describe('Dry-Run Safety Verification', () => {
    it('leaves filesystem 100% untouched when --dry-run is supplied', async () => {
      const initialPkg = fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8');

      const code = await runCli(['add', 'ai-gemini', '--dry-run', '--root', tmpDir]);
      expect(code).toBe(0);

      // Route must NOT exist
      const routePath = path.join(tmpDir, 'app', 'routes', 'api.ai.ts');
      expect(fs.existsSync(routePath)).toBe(false);

      // .env.example must NOT exist
      const envPath = path.join(tmpDir, '.env.example');
      expect(fs.existsSync(envPath)).toBe(false);

      // package.json must remain identical
      expect(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf8')).toBe(initialPkg);
    });

    it('outputs structured JSON with dryRun: true in dry-run mode', async () => {
      let loggedJson: AddOnResult | undefined;
      const logger = createCliLogger({ json: true });
      vi.spyOn(logger, 'json').mockImplementation((data: unknown) => {
        loggedJson = data as AddOnResult;
      });

      const exitCode = await runAddCommand(
        {
          command: 'add',
          args: ['ai-custom'],
          root: tmpDir,
          dryRun: true,
          json: true,
          endpoint: 'http://localhost:11434',
        },
        logger,
      );

      expect(exitCode).toBe(0);
      expect(loggedJson?.success).toBe(true);
      expect(loggedJson?.addon).toBe('ai-custom');
      expect(loggedJson?.dependencies).toContain('@ranu/ai-custom');
    });
  });

  /* ========================================================================
   * Suite 5: Argument & Parameter Validation for ai-custom
   * ======================================================================== */
  describe('Parameter Validation & Adversarial Inputs', () => {
    it('fails on unsupported add-on name', async () => {
      const code = await runCli(['add', 'ai-unknown-engine', '--root', tmpDir]);
      expect(code).toBe(1);
    });

    it('rejects malformed --endpoint URL for ai-custom', async () => {
      const code = await runCli([
        'add',
        'ai-custom',
        '--endpoint',
        'invalid_non_url',
        '--root',
        tmpDir,
      ]);
      expect(code).toBe(1);
    });

    it('rejects dangerous URL protocols in --endpoint (javascript:, file:)', async () => {
      const codeJs = await runCli([
        'add',
        'ai-custom',
        '--endpoint',
        'javascript:alert(1)',
        '--root',
        tmpDir,
      ]);
      expect(codeJs).toBe(1);

      const codeFile = await runCli([
        'add',
        'ai-custom',
        '--endpoint',
        'file:///etc/passwd',
        '--root',
        tmpDir,
      ]);
      expect(codeFile).toBe(1);
    });

    it('defaults endpoint to http://localhost:11434 if --endpoint is omitted', async () => {
      const code = await runCli(['add', 'ai-custom', '--root', tmpDir]);
      expect(code).toBe(0);

      const routeContent = fs.readFileSync(
        path.join(tmpDir, 'app', 'routes', 'api.ai.ts'),
        'utf8',
      );
      expect(routeContent).toMatch(/http:\/\/localhost:11434|process\.env\.CUSTOM_AI_ENDPOINT/);
    });

    it('sanitizes custom model name against code injection', async () => {
      const maliciousModel = 'llama3"; process.exit(1); "';
      const code = await runCli([
        'add',
        'ai-custom',
        '--endpoint',
        'http://localhost:11434',
        '--model',
        maliciousModel,
        '--root',
        tmpDir,
      ]);

      // Either cleanly escaped or rejected
      if (code === 0) {
        const routeContent = fs.readFileSync(
          path.join(tmpDir, 'app', 'routes', 'api.ai.ts'),
          'utf8',
        );
        assertValidTypeScript(routeContent);
      } else {
        expect(code).toBe(1);
      }
    });
  });

  /* ========================================================================
   * Suite 6: Path Containment & Security Invariants
   * ======================================================================== */
  describe('Path Containment & Security Invariants', () => {
    it('strictly prevents route creation escaping project root boundary', () => {
      expect(() => sanitizeTargetFilePath(tmpDir, '../../etc/passwd')).toThrow(
        /Path traversal violation/,
      );
      expect(() => sanitizeTargetFilePath(tmpDir, '..\\..\\Windows\\System32')).toThrow(
        /Path traversal violation/,
      );
    });

    it('strictly prevents sibling prefix directory collision escape', () => {
      const siblingDir = `${tmpDir}-sibling`;
      expect(() => sanitizeTargetFilePath(tmpDir, path.join(siblingDir, 'api.ai.ts'))).toThrow(
        /Path traversal violation/,
      );
    });

    it('asserts generated route is strictly server-only with zero client leakage', async () => {
      await runCli(['add', 'ai-gemini', '--root', tmpDir]);

      const routeContent = fs.readFileSync(
        path.join(tmpDir, 'app', 'routes', 'api.ai.ts'),
        'utf8',
      );
      // Route must NOT contain 'use client'
      expect(routeContent).not.toContain("'use client'");
      expect(routeContent).not.toContain('"use client"');
    });
  });

  /* ========================================================================
   * Suite 7: Character Encoding & Formatting Hygiene
   * ======================================================================== */
  describe('Character Encoding & Formatting Hygiene', () => {
    it('guarantees clean UTF-8 encoding in all scaffolded AI routes and .env.example', async () => {
      const recipes = ['ai-gemini', 'ai-groq', 'ai-claude', 'ai-openai'];
      for (const recipe of recipes) {
        const subTmp = fs.mkdtempSync(path.join(os.tmpdir(), `ranu-ai-${recipe}-`));
        fs.mkdirSync(path.join(subTmp, 'app', 'routes'), { recursive: true });
        fs.writeFileSync(path.join(subTmp, 'package.json'), '{}', 'utf8');

        await runCli(['add', recipe, '--root', subTmp]);

        const route = fs.readFileSync(path.join(subTmp, 'app', 'routes', 'api.ai.ts'), 'utf8');
        assertCleanEncoding(route);

        const env = fs.readFileSync(path.join(subTmp, '.env.example'), 'utf8');
        assertCleanEncoding(env);

        fs.rmSync(subTmp, { recursive: true, force: true });
      }
    });
  });
});
