import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ts from 'typescript';
import { runCli } from '../src/cli.js';
import { runAddCommand, isPathContained } from '../src/commands/add.js';
import { sanitizeTargetFilePath } from '../src/commands/ai.js';
import { createCliLogger } from '../src/logger.js';
import type { AddOnResult } from '../src/types.js';

describe('Milestone M9 Challenger 4: Concurrency, AST Syntax, Dry-Run & Path Security', () => {
  let baseTmpDir: string;

  beforeEach(() => {
    baseTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-challenger4-base-'));
  });

  afterEach(() => {
    if (fs.existsSync(baseTmpDir)) {
      fs.rmSync(baseTmpDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  // Helper to verify AST syntax validity using TypeScript compiler
  function assertValidTypeScriptAST(code: string, fileName = 'api.ai.ts'): ts.SourceFile {
    const sourceFile = ts.createSourceFile(
      fileName,
      code,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    const diagnostics =
      (sourceFile as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [];

    expect(diagnostics.length).toBe(0);
    return sourceFile;
  }

  /* ========================================================================
   * Suite 1: High-Volume Concurrency Stress (16 Parallel CLI Operations)
   * ======================================================================== */
  describe('High-Volume Concurrency Stress Testing', () => {
    it('executes 16 concurrent runCli add operations across distinct targets with zero cross-talk', async () => {
      const concurrencyCount = 16;
      const tasks: Array<{
        id: number;
        dir: string;
        recipe: string;
        model: string;
        endpoint?: string;
        expectedDep: string;
        expectedEnv: string;
      }> = [];

      // Setup 16 distinct project directories
      for (let i = 0; i < concurrencyCount; i++) {
        const dir = path.join(baseTmpDir, `concurrent-worker-${i}`);
        fs.mkdirSync(path.join(dir, 'app', 'routes'), { recursive: true });
        fs.writeFileSync(
          path.join(dir, 'package.json'),
          JSON.stringify({ name: `concurrent-worker-${i}`, version: '1.0.0', dependencies: {} }, null, 2),
          'utf8',
        );

        let recipe = 'ai-gemini';
        let model = 'gemini-1.5-pro';
        let endpoint: string | undefined;
        let expectedDep = '@ranu/ai-gemini';
        let expectedEnv = 'GEMINI_API_KEY';

        const mod = i % 5;
        if (mod === 1) {
          recipe = 'ai-groq';
          model = `llama-3.3-70b-versatile-${i}`;
          expectedDep = '@ranu/ai-groq';
          expectedEnv = 'GROQ_API_KEY';
        } else if (mod === 2) {
          recipe = 'ai-claude';
          model = `claude-3-5-sonnet-${i}`;
          expectedDep = '@ranu/ai-claude';
          expectedEnv = 'ANTHROPIC_API_KEY';
        } else if (mod === 3) {
          recipe = 'ai-openai';
          model = `gpt-4o-${i}`;
          expectedDep = '@ranu/ai-openai';
          expectedEnv = 'OPENAI_API_KEY';
        } else if (mod === 4) {
          recipe = 'ai-custom';
          model = `custom-model-${i}`;
          endpoint = `http://localhost:${11000 + i}`;
          expectedDep = '@ranu/ai-custom';
          expectedEnv = 'CUSTOM_AI_KEY';
        }

        tasks.push({ id: i, dir, recipe, model, endpoint, expectedDep, expectedEnv });
      }

      // Launch all 16 operations concurrently
      const results = await Promise.all(
        tasks.map((task) => {
          const cliArgs = ['add', task.recipe, '--root', task.dir, '--model', task.model];
          if (task.endpoint) {
            cliArgs.push('--endpoint', task.endpoint);
          }
          return runCli(cliArgs);
        }),
      );

      // Verify all exited with 0
      for (let i = 0; i < concurrencyCount; i++) {
        expect(results[i]).toBe(0);
      }

      // Assert zero cross-talk and exact isolation per target directory
      for (const task of tasks) {
        const routePath = path.join(task.dir, 'app', 'routes', 'api.ai.ts');
        expect(fs.existsSync(routePath)).toBe(true);

        const routeContent = fs.readFileSync(routePath, 'utf8');
        expect(routeContent).toContain(task.expectedDep);
        expect(routeContent).toContain(task.model);
        if (task.endpoint) {
          expect(routeContent).toContain(task.endpoint);
        }

        // Verify valid TypeScript AST with zero diagnostics
        assertValidTypeScriptAST(routeContent);

        // Verify no foreign provider leaked into this route
        const allProviders = ['gemini', 'groq', 'claude', 'openai', 'custom'];
        const currentProvider = task.recipe.replace('ai-', '');
        const foreignProviders = allProviders.filter((p) => p !== currentProvider);
        for (const foreign of foreignProviders) {
          expect(routeContent).not.toContain(`@ranu/ai-${foreign}`);
        }

        // Verify package.json contains exactly the intended dependencies
        const pkg = JSON.parse(fs.readFileSync(path.join(task.dir, 'package.json'), 'utf8')) as {
          dependencies: Record<string, string>;
        };
        expect(pkg.dependencies['@ranu/ai']).toBe('^0.1.0');
        expect(pkg.dependencies[task.expectedDep]).toBe('^0.1.0');
        for (const foreign of foreignProviders) {
          expect(pkg.dependencies[`@ranu/ai-${foreign}`]).toBeUndefined();
        }

        // Verify .env.example contains expected env var and no foreign keys
        const envContent = fs.readFileSync(path.join(task.dir, '.env.example'), 'utf8');
        expect(envContent).toContain(task.expectedEnv);
        for (const foreign of foreignProviders) {
          const foreignKey =
            foreign === 'gemini'
              ? 'GEMINI_API_KEY'
              : foreign === 'groq'
                ? 'GROQ_API_KEY'
                : foreign === 'claude'
                  ? 'ANTHROPIC_API_KEY'
                  : foreign === 'openai'
                    ? 'OPENAI_API_KEY'
                    : 'CUSTOM_AI_KEY';
          if (foreignKey !== task.expectedEnv) {
            expect(envContent).not.toContain(foreignKey);
          }
        }
      }
    });
  });

  /* ========================================================================
   * Suite 2: Deep AST Validation Across All 5 Recipes
   * ======================================================================== */
  describe('AST Route Syntax & Structure Validation Across All 5 Recipes', () => {
    const recipes = [
      { name: 'ai-gemini', driver: 'gemini', pkg: '@ranu/ai-gemini', defaultModel: 'gemini-1.5-pro' },
      { name: 'ai-groq', driver: 'groq', pkg: '@ranu/ai-groq', defaultModel: 'llama-3.3-70b-versatile' },
      { name: 'ai-claude', driver: 'claude', pkg: '@ranu/ai-claude', defaultModel: 'claude-3-5-sonnet-20241022' },
      { name: 'ai-openai', driver: 'openai', pkg: '@ranu/ai-openai', defaultModel: 'gpt-4o' },
      { name: 'ai-custom', driver: 'customAI', pkg: '@ranu/ai-custom', defaultModel: 'llama3' },
    ];

    for (const r of recipes) {
      it(`scaffolds ${r.name} with 0 TypeScript parse diagnostics and verified AST exports`, async () => {
        const targetDir = path.join(baseTmpDir, `ast-test-${r.name}`);
        fs.mkdirSync(path.join(targetDir, 'app', 'routes'), { recursive: true });
        fs.writeFileSync(path.join(targetDir, 'package.json'), '{}', 'utf8');

        const exitCode = await runCli(['add', r.name, '--root', targetDir]);
        expect(exitCode).toBe(0);

        const routePath = path.join(targetDir, 'app', 'routes', 'api.ai.ts');
        const content = fs.readFileSync(routePath, 'utf8');

        // 1. AST Parse Diagnostics Check
        const sourceFile = assertValidTypeScriptAST(content);

        // 2. Structural AST Node Inspection
        let hasStreamAiImport = false;
        let hasDriverImport = false;
        let hasExportPost = false;
        let hasExportGet = false;

        ts.forEachChild(sourceFile, (node) => {
          // Check Import Declarations
          if (ts.isImportDeclaration(node)) {
            const moduleSpecifier = (node.moduleSpecifier as ts.StringLiteral).text;
            if (moduleSpecifier === '@ranu/ai') {
              hasStreamAiImport = true;
            }
            if (moduleSpecifier === r.pkg) {
              hasDriverImport = true;
            }
          }

          // Check Export Functions POST and GET
          if (ts.isFunctionDeclaration(node)) {
            const hasExportModifier = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
            const isAsync = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
            const funcName = node.name?.text;

            if (hasExportModifier && isAsync && funcName === 'POST') {
              hasExportPost = true;
              // Check request parameter
              expect(node.parameters.length).toBeGreaterThanOrEqual(1);
              expect(node.parameters[0]?.name.getText(sourceFile)).toBe('request');
            }

            if (hasExportModifier && isAsync && funcName === 'GET') {
              hasExportGet = true;
            }
          }
        });

        expect(hasStreamAiImport).toBe(true);
        expect(hasDriverImport).toBe(true);
        expect(hasExportPost).toBe(true);
        expect(hasExportGet).toBe(true);
      });
    }

    it('scaffolds ai-custom with non-trivial endpoints and model identifiers without breaking AST', async () => {
      const targetDir = path.join(baseTmpDir, 'ast-test-custom-complex');
      fs.mkdirSync(path.join(targetDir, 'app', 'routes'), { recursive: true });
      fs.writeFileSync(path.join(targetDir, 'package.json'), '{}', 'utf8');

      const complexEndpoint = 'https://ai-proxy.corp.internal:8443/v1/chat';
      const complexModel = 'namespace/model:tag-3.2_rc1';

      const exitCode = await runCli([
        'add',
        'ai-custom',
        '--root',
        targetDir,
        '--endpoint',
        complexEndpoint,
        '--model',
        complexModel,
      ]);
      expect(exitCode).toBe(0);

      const routePath = path.join(targetDir, 'app', 'routes', 'api.ai.ts');
      const content = fs.readFileSync(routePath, 'utf8');

      const sourceFile = assertValidTypeScriptAST(content);
      expect(content).toContain(complexEndpoint);
      expect(content).toContain(complexModel);
      expect(sourceFile).toBeDefined();
    });
  });

  /* ========================================================================
   * Suite 3: 100% Clean Disk Dry-Run Assertion Across All 5 Recipes
   * ======================================================================== */
  describe('100% Clean Disk Dry-Run Assertion Across All 5 Recipes', () => {
    const allRecipes = ['ai-gemini', 'ai-groq', 'ai-claude', 'ai-openai', 'ai-custom'];

    for (const recipe of allRecipes) {
      it(`guarantees --dry-run leaves disk 100% clean for ${recipe}`, async () => {
        const targetDir = path.join(baseTmpDir, `dry-run-${recipe}`);
        fs.mkdirSync(path.join(targetDir, 'app', 'routes'), { recursive: true });
        const initialPkg = JSON.stringify({ name: `dry-app-${recipe}`, version: '1.0.0' }, null, 2);
        fs.writeFileSync(path.join(targetDir, 'package.json'), initialPkg, 'utf8');

        // Capture initial filesystem tree
        const getFileTree = (dir: string): string[] => {
          const entries: string[] = [];
          for (const item of fs.readdirSync(dir, { recursive: true })) {
            entries.push(String(item));
          }
          return entries.sort();
        };

        const beforeEntries = getFileTree(targetDir);

        // Execute CLI with --dry-run
        const exitCode = await runCli(['add', recipe, '--dry-run', '--root', targetDir]);
        expect(exitCode).toBe(0);

        // Disk assertion 1: File tree must be exactly identical
        const afterEntries = getFileTree(targetDir);
        expect(afterEntries).toEqual(beforeEntries);

        // Disk assertion 2: Route file must NOT exist
        const routePath = path.join(targetDir, 'app', 'routes', 'api.ai.ts');
        expect(fs.existsSync(routePath)).toBe(false);

        // Disk assertion 3: .env.example must NOT exist
        const envPath = path.join(targetDir, '.env.example');
        expect(fs.existsSync(envPath)).toBe(false);

        // Disk assertion 4: package.json must not be modified by a single byte
        const afterPkg = fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8');
        expect(afterPkg).toBe(initialPkg);
      });

      it(`preserves existing .env.example without byte modification when ${recipe} is run with --dry-run`, async () => {
        const targetDir = path.join(baseTmpDir, `dry-run-env-${recipe}`);
        fs.mkdirSync(path.join(targetDir, 'app', 'routes'), { recursive: true });
        fs.writeFileSync(path.join(targetDir, 'package.json'), '{}', 'utf8');

        const initialEnv = 'EXISTING_SECRET=foo_bar_baz\nDATABASE_URL=postgres://localhost:5432\n';
        fs.writeFileSync(path.join(targetDir, '.env.example'), initialEnv, 'utf8');

        const exitCode = await runCli(['add', recipe, '--dry-run', '--root', targetDir]);
        expect(exitCode).toBe(0);

        const afterEnv = fs.readFileSync(path.join(targetDir, '.env.example'), 'utf8');
        expect(afterEnv).toBe(initialEnv);
      });
    }
  });

  /* ========================================================================
   * Suite 4: Sibling Directory Collision & Path Traversal Containment
   * ======================================================================== */
  describe('Sibling Directory Collision & Path Traversal Security', () => {
    it('strictly blocks sibling directory escapes (e.g. app-sibling) in sanitizeTargetFilePath', () => {
      const projectRoot = path.join(baseTmpDir, 'my-app');
      fs.mkdirSync(projectRoot, { recursive: true });

      // Create a sibling directory named my-app-sibling
      const siblingDir = path.join(baseTmpDir, 'my-app-sibling');
      fs.mkdirSync(siblingDir, { recursive: true });

      // Direct relative escape to sibling
      expect(() => sanitizeTargetFilePath(projectRoot, '../my-app-sibling/secret.env')).toThrow(
        /Path traversal violation/,
      );

      // Traversal with multiple dots and slashes
      expect(() => sanitizeTargetFilePath(projectRoot, '..//my-app-sibling//secret.env')).toThrow(
        /Path traversal violation/,
      );

      // Traversal using Windows backward slashes
      expect(() => sanitizeTargetFilePath(projectRoot, '..\\my-app-sibling\\secret.env')).toThrow(
        /Path traversal violation/,
      );

      // Absolute path targeting sibling directory
      expect(() => sanitizeTargetFilePath(projectRoot, path.join(siblingDir, 'secret.env'))).toThrow(
        /Path traversal violation/,
      );
    });

    it('strictly blocks root and parent directory references', () => {
      const projectRoot = path.join(baseTmpDir, 'my-app');
      fs.mkdirSync(projectRoot, { recursive: true });

      expect(() => sanitizeTargetFilePath(projectRoot, '.')).toThrow(/Path traversal violation/);
      expect(() => sanitizeTargetFilePath(projectRoot, '..')).toThrow(/Path traversal violation/);
      expect(() => sanitizeTargetFilePath(projectRoot, '')).toThrow(/Path traversal violation/);
      expect(() => sanitizeTargetFilePath(projectRoot, '../../../../etc/passwd')).toThrow(
        /Path traversal violation/,
      );
    });

    it('verifies isPathContained helper strictly rejects sibling folder escapes', () => {
      const projectRoot = path.join(baseTmpDir, 'app');
      const siblingFile = path.join(baseTmpDir, 'app-sibling', 'malicious.js');
      const nestedValidFile = path.join(projectRoot, 'app', 'routes', 'api.ai.ts');
      const upwardTraversal = path.join(projectRoot, '..', 'app-sibling', 'malicious.js');

      expect(isPathContained(nestedValidFile, projectRoot)).toBe(true);
      expect(isPathContained(siblingFile, projectRoot)).toBe(false);
      expect(isPathContained(upwardTraversal, projectRoot)).toBe(false);
    });

    it('prevents CLI add command from writing outside project root via --root tampering', async () => {
      const nonExistentDir = path.join(baseTmpDir, 'does-not-exist');
      const exitCode = await runCli(['add', 'ai-gemini', '--root', nonExistentDir]);
      expect(exitCode).toBe(1);
    });
  });
});
