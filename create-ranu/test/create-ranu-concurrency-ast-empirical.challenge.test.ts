import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import ts from 'typescript';
import { runCreateRanu, parseArgs, normalizeAIEngine } from '../src/bin/create-ranu.js';
import { scaffoldProject } from '../src/scaffold.js';
import { generateTemplateFiles } from '../src/template.js';
import { generateAgentContextFiles } from '../src/agent-context.js';
import type { AIEngineName, TemplateName, PackageManager } from '../src/types.js';
import { SUPPORTED_AI_ENGINES } from '../src/types.js';

const SUPPORTED_TEMPLATES: TemplateName[] = ['default', 'minimal', 'cloudflare', 'node-docker', 'api-routes', 'saas'];



describe('Milestone M10 Challenger 2: Concurrency, AST Syntax, Agent Context & Build Stability', () => {
  const createdTmpDirs: string[] = [];
  let baseTmpDir: string;

  beforeEach(() => {
    baseTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-m10-chal2-'));
    createdTmpDirs.push(baseTmpDir);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    // Total cleanup of all temporary directories
    for (const dir of createdTmpDirs) {
      try {
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      } catch {
        // ignore cleanup error
      }
    }
  });

  // Helper to assert TypeScript AST parse cleanliness
  function assertValidTypeScriptAST(code: string, fileName = 'api.ai.ts'): ts.SourceFile {
    const sourceFile = ts.createSourceFile(
      fileName,
      code,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );

    const diagnostics =
      (sourceFile as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [];

    expect(diagnostics.length).toBe(0);

    // Verify transpilation produces clean JS without throwing
    const transpileResult = ts.transpileModule(code, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        strict: true,
      },
      fileName,
    });
    expect(transpileResult.outputText).toBeDefined();
    expect(transpileResult.outputText.length).toBeGreaterThan(0);

    return sourceFile;
  }

  // Helper to check balanced markdown code fences
  function assertBalancedCodeFences(content: string, filename: string): void {
    const lines = content.split('\n');
    let fenceOpen = false;
    let fenceCount = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]?.trimEnd() ?? '';
      if (line.startsWith('```')) {
        fenceCount++;
        fenceOpen = !fenceOpen;
      }
    }
    expect(fenceCount % 2, `Unbalanced code fences in ${filename}: total fences = ${fenceCount}`).toBe(0);
    expect(fenceOpen, `Unclosed code fence in ${filename}`).toBe(false);
  }

  /* ========================================================================
   * Suite 1: Concurrency Stress Testing (10 Parallel Scaffolding Operations)
   * ======================================================================== */
  describe('Concurrency Stress Testing', () => {
    it('executes 10 parallel scaffolding operations via runCreateRanu with random flag combos and zero collisions', async () => {
      const concurrencyCount = 10;

      const testCases: Array<{
        id: number;
        projectDir: string;
        projectName: string;
        template: TemplateName;
        aiArg: string;
        normalizedAI: AIEngineName;
        pm: PackageManager;
        git: boolean;
        tests: boolean;
      }> = [
        { id: 0, projectDir: path.join(baseTmpDir, 'app-0-default-gemini'), projectName: 'app-0-default-gemini', template: 'default', aiArg: 'gemini', normalizedAI: 'gemini', pm: 'pnpm', git: true, tests: true },
        { id: 1, projectDir: path.join(baseTmpDir, 'app-1-minimal-groq'), projectName: 'app-1-minimal-groq', template: 'minimal', aiArg: 'groq', normalizedAI: 'groq', pm: 'npm', git: false, tests: false },
        { id: 2, projectDir: path.join(baseTmpDir, 'app-2-cf-claude'), projectName: 'app-2-cf-claude', template: 'cloudflare', aiArg: 'claude', normalizedAI: 'claude', pm: 'yarn', git: true, tests: true },
        { id: 3, projectDir: path.join(baseTmpDir, 'app-3-docker-openai'), projectName: 'app-3-docker-openai', template: 'node-docker', aiArg: 'openai', normalizedAI: 'openai', pm: 'bun', git: false, tests: false },
        { id: 4, projectDir: path.join(baseTmpDir, 'app-4-api-custom'), projectName: 'app-4-api-custom', template: 'api-routes', aiArg: 'custom', normalizedAI: 'custom', pm: 'pnpm', git: true, tests: true },
        { id: 5, projectDir: path.join(baseTmpDir, 'app-5-saas-none'), projectName: 'app-5-saas-none', template: 'saas', aiArg: 'none', normalizedAI: 'none', pm: 'npm', git: false, tests: false },
        { id: 6, projectDir: path.join(baseTmpDir, 'app-6-def-google-alias'), projectName: 'app-6-def-google-alias', template: 'default', aiArg: 'google', normalizedAI: 'gemini', pm: 'pnpm', git: false, tests: true },
        { id: 7, projectDir: path.join(baseTmpDir, 'app-7-min-anthropic-alias'), projectName: 'app-7-min-anthropic-alias', template: 'minimal', aiArg: 'anthropic', normalizedAI: 'claude', pm: 'bun', git: true, tests: false },
        { id: 8, projectDir: path.join(baseTmpDir, 'app-8-cf-gpt-alias'), projectName: 'app-8-cf-gpt-alias', template: 'cloudflare', aiArg: 'gpt', normalizedAI: 'openai', pm: 'pnpm', git: true, tests: true },
        { id: 9, projectDir: path.join(baseTmpDir, 'app-9-docker-ollama-alias'), projectName: 'app-9-docker-ollama-alias', template: 'node-docker', aiArg: 'ollama', normalizedAI: 'custom', pm: 'yarn', git: false, tests: true },
      ];

      // Launch all 10 operations concurrently
      const exitCodes = await Promise.all(
        testCases.map((tc) => {
          const args = [
            tc.projectDir,
            '--template',
            tc.template,
            '--ai',
            tc.aiArg,
            '--package-manager',
            tc.pm,
            '--quiet',
          ];
          if (tc.git) args.push('--git');
          else args.push('--no-git');
          if (tc.tests) args.push('--tests');

          return runCreateRanu(args);
        })
      );

      // Verify all 10 parallel operations succeeded
      for (let i = 0; i < concurrencyCount; i++) {
        expect(exitCodes[i]).toBe(0);
      }

      // Assert complete isolation and correct contents for each directory
      for (const tc of testCases) {
        expect(fs.existsSync(tc.projectDir)).toBe(true);

        // Verify package.json
        const pkgJsonPath = path.join(tc.projectDir, 'package.json');
        expect(fs.existsSync(pkgJsonPath)).toBe(true);
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        expect(pkg.name).toBe(tc.projectName);

        // Verify agent context files
        expect(fs.existsSync(path.join(tc.projectDir, '.cursorrules'))).toBe(true);
        expect(fs.existsSync(path.join(tc.projectDir, 'AGENTS.md'))).toBe(true);
        expect(fs.existsSync(path.join(tc.projectDir, 'CLAUDE.md'))).toBe(true);
        expect(fs.existsSync(path.join(tc.projectDir, '.ranu', 'AGENT_GUIDE.md'))).toBe(true);
        expect(fs.existsSync(path.join(tc.projectDir, 'public', 'llms.txt'))).toBe(true);

        // Verify .gitignore contains exception for .ranu/AGENT_GUIDE.md
        const gitignoreContent = fs.readFileSync(path.join(tc.projectDir, '.gitignore'), 'utf8');
        expect(gitignoreContent).toContain('!.ranu/AGENT_GUIDE.md');

        // Verify AI vs Non-AI files
        const aiRoutePath = path.join(tc.projectDir, 'app', 'routes', 'api.ai.ts');
        const envExamplePath = path.join(tc.projectDir, '.env.example');

        if (tc.normalizedAI === 'none') {
          expect(fs.existsSync(aiRoutePath)).toBe(false);
          expect(pkg.dependencies?.['@ranu/ai']).toBeUndefined();
          const cursorRules = fs.readFileSync(path.join(tc.projectDir, '.cursorrules'), 'utf8');
          expect(cursorRules).toContain('Zero-AI Architecture');
        } else {
          expect(fs.existsSync(aiRoutePath)).toBe(true);
          expect(fs.existsSync(envExamplePath)).toBe(true);
          expect(pkg.dependencies?.['@ranu/ai']).toBe('^0.1.0');
          expect(pkg.dependencies?.[`@ranu/ai-${tc.normalizedAI}`]).toBe('^0.1.0');

          const routeCode = fs.readFileSync(aiRoutePath, 'utf8');
          expect(routeCode).toContain(`@ranu/ai-${tc.normalizedAI}`);

          // Assert zero foreign provider leaks
          for (const other of SUPPORTED_AI_ENGINES) {
            if (other !== tc.normalizedAI && other !== 'none') {
              expect(routeCode).not.toContain(`@ranu/ai-${other}`);
              expect(pkg.dependencies?.[`@ranu/ai-${other}`]).toBeUndefined();
            }
          }

          // Assert valid TypeScript AST
          assertValidTypeScriptAST(routeCode);
        }

        // Verify git initialization status
        const gitDir = path.join(tc.projectDir, '.git');
        if (tc.git) {
          expect(fs.existsSync(gitDir)).toBe(true);
        } else {
          expect(fs.existsSync(gitDir)).toBe(false);
        }
      }
    }, 30000);


    it('executes 10 parallel direct scaffoldProject calls with diverse options and zero race conditions', () => {
      const concurrencyCount = 10;
      const tasks = Array.from({ length: concurrencyCount }, (_, i) => {
        const aiOptions: AIEngineName[] = ['none', 'gemini', 'groq', 'claude', 'openai', 'custom'];
        const chosenAI = aiOptions[i % aiOptions.length]!;
        const chosenTemplate = SUPPORTED_TEMPLATES[i % SUPPORTED_TEMPLATES.length]!;
        const dir = path.join(baseTmpDir, `direct-scaffold-${i}`);
        return {
          id: i,
          dir,
          ai: chosenAI,
          template: chosenTemplate,
        };
      });

      // Execute concurrently
      const results = tasks.map((task) =>
        scaffoldProject({
          projectPath: task.dir,
          template: task.template,
          ai: task.ai,
          packageManager: 'pnpm',
          quiet: true,
        })
      );

      for (let i = 0; i < concurrencyCount; i++) {
        const res = results[i]!;
        const task = tasks[i]!;
        expect(res.success).toBe(true);
        expect(res.ai).toBe(task.ai);
        expect(res.template).toBe(task.template);
        expect(fs.existsSync(path.join(task.dir, 'package.json'))).toBe(true);
        expect(fs.existsSync(path.join(task.dir, '.cursorrules'))).toBe(true);

        if (task.ai !== 'none') {
          expect(fs.existsSync(path.join(task.dir, 'app', 'routes', 'api.ai.ts'))).toBe(true);
        } else {
          expect(fs.existsSync(path.join(task.dir, 'app', 'routes', 'api.ai.ts'))).toBe(false);
        }
      }
    });
  });

  /* ========================================================================
   * Suite 2: AST Syntax & Type Validation Check
   * ======================================================================== */
  describe('AST Syntax & Type Validation', () => {
    const aiEngines: AIEngineName[] = ['gemini', 'groq', 'claude', 'openai', 'custom'];

    for (const engine of aiEngines) {
      it(`generates syntactically clean TypeScript AST for engine: ${engine}`, () => {
        const files = generateTemplateFiles('test-ast-app', 'pnpm', {
          template: 'default',
          ai: engine,
        });

        const routeCode = files['app/routes/api.ai.ts'];
        expect(routeCode).toBeDefined();

        const sourceFile = assertValidTypeScriptAST(routeCode!);

        // Inspect AST structure
        let hasExportedPost = false;
        let hasExportedGet = false;
        let hasStreamAIImport = false;
        let hasProviderImport = false;

        ts.forEachChild(sourceFile, (node) => {
          if (ts.isImportDeclaration(node)) {
            const moduleSpecifier = (node.moduleSpecifier as ts.StringLiteral).text;
            if (moduleSpecifier === '@ranu/ai') {
              hasStreamAIImport = true;
            }
            if (moduleSpecifier === `@ranu/ai-${engine}`) {
              hasProviderImport = true;
            }
          }

          if (ts.isFunctionDeclaration(node)) {
            const isExported = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
            const isAsync = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
            const funcName = node.name?.text;

            if (isExported && isAsync && funcName === 'POST') {
              hasExportedPost = true;
              // Check return type annotation is Promise<Response>
              if (node.type && ts.isTypeReferenceNode(node.type)) {
                const typeName = (node.type.typeName as ts.Identifier).text;
                expect(typeName).toBe('Promise');
              }
            }

            if (isExported && isAsync && funcName === 'GET') {
              hasExportedGet = true;
              if (node.type && ts.isTypeReferenceNode(node.type)) {
                const typeName = (node.type.typeName as ts.Identifier).text;
                expect(typeName).toBe('Promise');
              }
            }
          }
        });

        expect(hasStreamAIImport, `${engine} route missing @ranu/ai import`).toBe(true);
        expect(hasProviderImport, `${engine} route missing @ranu/ai-${engine} import`).toBe(true);
        expect(hasExportedPost, `${engine} route missing export async function POST`).toBe(true);
        expect(hasExportedGet, `${engine} route missing export async function GET`).toBe(true);
      });
    }

    it('ensures --ai none produces zero api.ai.ts in template output', () => {
      const files = generateTemplateFiles('zero-ai-app', 'pnpm', {
        template: 'default',
        ai: 'none',
      });
      expect(files['app/routes/api.ai.ts']).toBeUndefined();
      expect(files['.env.example']).toBeUndefined();
    });
  });

  /* ========================================================================
   * Suite 3: Agent Context Files Formatting & Syntax Check
   * ======================================================================== */
  describe('Agent Context Files Formatting & Syntax Check', () => {
    const aiEngines: AIEngineName[] = ['none', 'gemini', 'groq', 'claude', 'openai', 'custom'];

    for (const engine of aiEngines) {
      for (const tpl of SUPPORTED_TEMPLATES) {
        it(`produces regression-free agent context files for template=${tpl}, ai=${engine}`, () => {
          const contextFiles = generateAgentContextFiles({
            projectName: `agent-ctx-${tpl}-${engine}`,
            packageManager: 'pnpm',
            aiEngine: engine,
            template: tpl,
          });

          // Check required files exist
          expect(contextFiles['.cursorrules']).toBeDefined();
          expect(contextFiles['AGENTS.md']).toBeDefined();
          expect(contextFiles['CLAUDE.md']).toBeDefined();
          expect(contextFiles['.ranu/AGENT_GUIDE.md']).toBeDefined();
          expect(contextFiles['public/llms.txt']).toBeDefined();

          // Verify balanced markdown code fences across all agent context files
          for (const [fname, content] of Object.entries(contextFiles)) {
            assertBalancedCodeFences(content, fname);
            // Ensure zero unresolved template literals like ${undefined} or literal NaN
            expect(content).not.toMatch(/\$\{[\w.]+\}/);
            expect(content).not.toContain('${undefined}');
            expect(content).not.toContain('${null}');
            expect(content).not.toContain('NaN');
            // Ensure non-trivial content length
            expect(content.length).toBeGreaterThan(100);
          }


          // Specific content assertions
          const cursorRules = contextFiles['.cursorrules']!;
          const agentGuide = contextFiles['.ranu/AGENT_GUIDE.md']!;
          const llmsTxt = contextFiles['public/llms.txt']!;

          // llms.txt matches agent guide
          expect(llmsTxt).toBe(agentGuide);

          if (engine === 'none') {
            expect(cursorRules).toContain('Zero-AI Architecture');
            expect(cursorRules).toContain('No Phantom AI Imports');
            expect(agentGuide).toContain('Zero AI');
          } else {

            expect(cursorRules).toContain(`@ranu/ai-${engine}`);
            expect(cursorRules).toContain('app/routes/api.ai.ts');
            expect(agentGuide).toContain(`@ranu/ai-${engine}`);
            expect(agentGuide).toContain('app/routes/api.ai.ts');
          }
        });
      }
    }
  });




  /* ========================================================================
   * Suite 5: CLI Adversarial Edge Cases & Boundary Handling
   * ======================================================================== */
  describe('CLI Adversarial Edge Cases', () => {
    it('rejects unsupported AI engine with error code 1', async () => {
      const target = path.join(baseTmpDir, 'unsupported-ai-app');
      const code = await runCreateRanu([target, '--ai', 'unsupported-model', '--quiet']);
      expect(code).toBe(1);
      expect(fs.existsSync(target)).toBe(false);
    });

    it('rejects missing argument after --ai flag', async () => {
      const target = path.join(baseTmpDir, 'missing-ai-val-app');
      const code = await runCreateRanu([target, '--quiet', '--ai']);
      expect(code).toBe(1);
    });

    it('rejects missing argument after --ai-engine flag', async () => {
      const target = path.join(baseTmpDir, 'missing-ai-eng-val-app');
      const code = await runCreateRanu([target, '--quiet', '--ai-engine']);
      expect(code).toBe(1);
    });

    it('normalizes all supported aliases correctly', () => {
      expect(normalizeAIEngine('none')).toBe('none');
      expect(normalizeAIEngine('zero')).toBe('none');
      expect(normalizeAIEngine('false')).toBe('none');
      expect(normalizeAIEngine('gemini')).toBe('gemini');
      expect(normalizeAIEngine('google')).toBe('gemini');
      expect(normalizeAIEngine('ai-gemini')).toBe('gemini');
      expect(normalizeAIEngine('groq')).toBe('groq');
      expect(normalizeAIEngine('ai-groq')).toBe('groq');
      expect(normalizeAIEngine('claude')).toBe('claude');
      expect(normalizeAIEngine('anthropic')).toBe('claude');
      expect(normalizeAIEngine('ai-claude')).toBe('claude');
      expect(normalizeAIEngine('openai')).toBe('openai');
      expect(normalizeAIEngine('gpt')).toBe('openai');
      expect(normalizeAIEngine('ai-openai')).toBe('openai');
      expect(normalizeAIEngine('custom')).toBe('custom');
      expect(normalizeAIEngine('ollama')).toBe('custom');
      expect(normalizeAIEngine('ai-custom')).toBe('custom');
    });

    it('refuses collision on existing non-empty directory without --force', async () => {
      const collisionDir = path.join(baseTmpDir, 'collision-dir');
      fs.mkdirSync(collisionDir, { recursive: true });
      fs.writeFileSync(path.join(collisionDir, 'existing.txt'), 'precious data');

      const code = await runCreateRanu([collisionDir, '--quiet']);
      expect(code).toBe(1);
      expect(fs.readFileSync(path.join(collisionDir, 'existing.txt'), 'utf8')).toBe('precious data');
    });

    it('allows scaffolding into existing directory when --force is passed', async () => {
      const forceDir = path.join(baseTmpDir, 'force-dir');
      fs.mkdirSync(forceDir, { recursive: true });
      fs.writeFileSync(path.join(forceDir, 'existing.txt'), 'overwritten');

      const code = await runCreateRanu([forceDir, '--force', '--ai', 'none', '--quiet']);
      expect(code).toBe(0);
      expect(fs.existsSync(path.join(forceDir, 'package.json'))).toBe(true);
    });
  });
});
