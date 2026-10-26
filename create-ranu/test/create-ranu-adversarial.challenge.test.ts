import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ts from 'typescript';
import { scaffoldProject } from '../src/scaffold.js';
import {
  parseArgs,
  runCreateRanu,
  normalizeAIEngine,
} from '../src/bin/create-ranu.js';
import type { TemplateName, AIEngineName } from '../src/types.js';
import { SUPPORTED_AI_ENGINES } from '../src/types.js';

describe('Adversarial Stress Testing: create-ranu AI engine selector (Milestone M10 / PR #254)', () => {
  const sinhalaRegex = /[\u0D80-\u0DFF]/;
  const createdDirs: string[] = [];

  function createTrackedTempDir(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    createdDirs.push(dir);
    return dir;
  }

  function assertValidTypeScript(content: string, fileName = 'file.ts'): void {
    const sourceFile = ts.createSourceFile(
      fileName,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
    const diagnostics =
      (sourceFile as unknown as { parseDiagnostics?: readonly unknown[] }).parseDiagnostics ?? [];
    expect(diagnostics.length).toBe(0);
  }

  afterEach(() => {
    vi.restoreAllMocks();
    while (createdDirs.length > 0) {
      const dir = createdDirs.pop();
      if (dir && fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  /* ========================================================================
   * Dimension 1: Full 6x6 Scaffolding Matrix (36 combinations)
   * ======================================================================== */
  describe('Dimension 1: Full 6x6 Scaffolding Matrix (36 combinations)', () => {
    const templates: readonly TemplateName[] = [
      'default',
      'minimal',
      'cloudflare',
      'node-docker',
      'api-routes',
      'saas',
    ] as const;

    const aiOptions: readonly AIEngineName[] = [
      'none',
      'gemini',
      'groq',
      'claude',
      'openai',
      'custom',
    ] as const;

    for (const template of templates) {
      for (const ai of aiOptions) {
        it(`scaffolds matrix combination: template="${template}" + ai="${ai}"`, () => {
          const tempDir = createTrackedTempDir(`scaffold-matrix-${template}-${ai}-`);
          const targetDir = path.join(tempDir, `app-${template}-${ai}`);

          const result = scaffoldProject({
            projectPath: targetDir,
            template,
            ai,
            packageManager: 'pnpm',
            quiet: true,
          });

          expect(result.success).toBe(true);
          expect(result.template).toBe(template);
          expect(result.ai).toBe(ai);

          // 1. Verify package.json
          const pkgPath = path.join(targetDir, 'package.json');
          expect(fs.existsSync(pkgPath)).toBe(true);
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

          expect(pkg.name).toBe(`app-${template}-${ai}`);
          expect(pkg.type).toBe('module');
          expect(pkg.dependencies).toBeDefined();

          if (ai === 'none') {
            expect(pkg.dependencies['@ranu/ai']).toBeUndefined();
            for (const otherAI of ['gemini', 'groq', 'claude', 'openai', 'custom']) {
              expect(pkg.dependencies[`@ranu/ai-${otherAI}`]).toBeUndefined();
            }
          } else {
            expect(pkg.dependencies['@ranu/ai']).toBe('^0.1.0');
            expect(pkg.dependencies[`@ranu/ai-${ai}`]).toBe('^0.1.0');
          }

          // Template-specific package checks
          if (template === 'cloudflare') {
            expect(pkg.dependencies['@ranujs/adapter-cloudflare']).toBe('^0.1.0');
            expect(fs.existsSync(path.join(targetDir, 'wrangler.toml'))).toBe(true);
          } else if (template === 'node-docker') {
            expect(pkg.dependencies['@ranujs/adapter-node']).toBe('^0.1.0');
            expect(fs.existsSync(path.join(targetDir, 'Dockerfile'))).toBe(true);
            expect(fs.existsSync(path.join(targetDir, '.dockerignore'))).toBe(true);
          } else if (template === 'saas') {
            expect(pkg.dependencies['drizzle-orm']).toBe('^0.39.0');
            expect(pkg.dependencies['@tailwindcss/vite']).toBe('^4.0.0');
            expect(fs.existsSync(path.join(targetDir, 'drizzle.config.ts'))).toBe(true);
          }

          // 2. Verify route files (app/routes/api.ai.ts)
          const aiRoutePath = path.join(targetDir, 'app', 'routes', 'api.ai.ts');
          if (ai === 'none') {
            expect(fs.existsSync(aiRoutePath)).toBe(false);
          } else {
            expect(fs.existsSync(aiRoutePath)).toBe(true);
            const routeContent = fs.readFileSync(aiRoutePath, 'utf8');

            assertValidTypeScript(routeContent, 'api.ai.ts');
            expect(routeContent).toContain("import { streamAI } from '@ranu/ai';");
            expect(routeContent).toContain('export async function POST(');
            expect(routeContent).toContain('export async function GET(');

            if (ai === 'gemini') {
              expect(routeContent).toContain("import { gemini } from '@ranu/ai-gemini';");
              expect(routeContent).toContain("gemini('gemini-1.5-pro')");
            } else if (ai === 'groq') {
              expect(routeContent).toContain("import { groq } from '@ranu/ai-groq';");
              expect(routeContent).toContain("groq('llama-3.3-70b-versatile')");
            } else if (ai === 'claude') {
              expect(routeContent).toContain("import { claude } from '@ranu/ai-claude';");
              expect(routeContent).toContain("claude('claude-3-5-sonnet-20241022')");
            } else if (ai === 'openai') {
              expect(routeContent).toContain("import { openai } from '@ranu/ai-openai';");
              expect(routeContent).toContain("openai('gpt-4o')");
            } else if (ai === 'custom') {
              expect(routeContent).toContain("import { createCustomAI } from '@ranu/ai-custom';");
              expect(routeContent).toContain('createCustomAI(');
            }
          }

          // 3. Verify .env.example
          const envPath = path.join(targetDir, '.env.example');
          if (ai === 'none') {
            expect(fs.existsSync(envPath)).toBe(false);
          } else {
            expect(fs.existsSync(envPath)).toBe(true);
            const envContent = fs.readFileSync(envPath, 'utf8');
            expect(envContent).toContain('PORT=3000');

            if (ai === 'gemini') {
              expect(envContent).toContain('GEMINI_API_KEY=your_gemini_api_key_here');
            } else if (ai === 'groq') {
              expect(envContent).toContain('GROQ_API_KEY=your_groq_api_key_here');
            } else if (ai === 'claude') {
              expect(envContent).toContain('ANTHROPIC_API_KEY=your_anthropic_api_key_here');
            } else if (ai === 'openai') {
              expect(envContent).toContain('OPENAI_API_KEY=your_openai_api_key_here');
            } else if (ai === 'custom') {
              expect(envContent).toContain('CUSTOM_AI_ENDPOINT=http://localhost:11434');
              expect(envContent).toContain('CUSTOM_AI_KEY=your_custom_ai_key_here');
            }
          }

          // 4. Verify automated agent context files across all 36 combinations
          const cursorRulesPath = path.join(targetDir, '.cursorrules');
          const agentsMdPath = path.join(targetDir, 'AGENTS.md');
          const claudeMdPath = path.join(targetDir, 'CLAUDE.md');
          const agentGuidePath = path.join(targetDir, '.ranu', 'AGENT_GUIDE.md');
          const llmsTxtPath = path.join(targetDir, 'public', 'llms.txt');
          const gitignorePath = path.join(targetDir, '.gitignore');

          expect(fs.existsSync(cursorRulesPath)).toBe(true);
          expect(fs.existsSync(agentsMdPath)).toBe(true);
          expect(fs.existsSync(claudeMdPath)).toBe(true);
          expect(fs.existsSync(agentGuidePath)).toBe(true);
          expect(fs.existsSync(llmsTxtPath)).toBe(true);
          expect(fs.existsSync(gitignorePath)).toBe(true);

          const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
          expect(gitignoreContent).toContain('!.ranu/AGENT_GUIDE.md');

          const guideContent = fs.readFileSync(agentGuidePath, 'utf8');
          const llmsContent = fs.readFileSync(llmsTxtPath, 'utf8');
          expect(guideContent).toBe(llmsContent);

          const cursorRulesContent = fs.readFileSync(cursorRulesPath, 'utf8');
          if (ai === 'none') {
            expect(cursorRulesContent).toContain('Zero-AI Architecture');
            expect(cursorRulesContent).toContain('Do NOT import `@ranu/ai`');
          } else {
            expect(cursorRulesContent).toContain(`@ranu/ai-${ai}`);
            expect(cursorRulesContent).toContain('app/routes/api.ai.ts');
          }

          // 5. Verify zero Sinhala characters in any file created
          for (const relPath of result.filesCreated) {
            const filePath = path.join(targetDir, relPath);
            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
              const content = fs.readFileSync(filePath, 'utf8');
              expect(sinhalaRegex.test(content)).toBe(false);
            }
          }
        });
      }
    }
  });

  /* ========================================================================
   * Dimension 2: Invalid Flag Fuzzing and Validation
   * ======================================================================== */
  describe('Dimension 2: Invalid Flag Fuzzing and Error Handling', () => {
    it('rejects invalid AI engine flag --ai invalid_xyz', () => {
      expect(() => parseArgs(['my-app', '--ai', 'invalid_xyz'])).toThrow(
        'Invalid AI engine "invalid_xyz". Supported: none, gemini, groq, claude, openai, custom.'
      );
    });

    it('rejects empty string AI engine --ai ""', () => {
      expect(() => parseArgs(['my-app', '--ai', ''])).toThrow(
        'Flag "--ai" requires a valid AI engine argument.'
      );
    });

    it('rejects flag when next argument starts with hyphen (--ai --help)', () => {
      expect(() => parseArgs(['my-app', '--ai', '--help'])).toThrow(
        'Flag "--ai" requires a valid AI engine argument.'
      );
    });

    it('rejects unknown engine on --ai-engine unknown', () => {
      expect(() => parseArgs(['my-app', '--ai-engine', 'unknown'])).toThrow(
        'Invalid AI engine "unknown". Supported: none, gemini, groq, claude, openai, custom.'
      );
    });

    it('rejects empty string on --ai-engine ""', () => {
      expect(() => parseArgs(['my-app', '--ai-engine', ''])).toThrow(
        'Flag "--ai-engine" requires a valid AI engine argument.'
      );
    });

    it('rejects trailing --ai with no argument', () => {
      expect(() => parseArgs(['my-app', '--ai'])).toThrow(
        'Flag "--ai" requires a valid AI engine argument.'
      );
    });

    it('rejects trailing --ai-engine with no argument', () => {
      expect(() => parseArgs(['my-app', '--ai-engine'])).toThrow(
        'Flag "--ai-engine" requires a valid AI engine argument.'
      );
    });

    it('rejects invalid template --template invalid_tmpl', () => {
      expect(() => parseArgs(['my-app', '--template', 'invalid_tmpl'])).toThrow(
        'Invalid template "invalid_tmpl".'
      );
    });

    it('rejects invalid adapter --adapter invalid_adp', () => {
      expect(() => parseArgs(['my-app', '--adapter', 'invalid_adp'])).toThrow(
        'Invalid adapter "invalid_adp".'
      );
    });

    it('rejects unknown general flag --unknown-xyz', () => {
      expect(() => parseArgs(['my-app', '--unknown-xyz'])).toThrow(
        'Unknown flag "--unknown-xyz". Run "create-ranu --help" for available options.'
      );
    });

    it('runCreateRanu returns exit code 1 with clean error message on invalid --ai', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const code = await runCreateRanu(['my-app', '--ai', 'invalid_xyz', '--quiet']);
      expect(code).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
      const errorMsg = consoleErrorSpy.mock.calls[0]?.[0];
      expect(errorMsg).toContain('Invalid AI engine "invalid_xyz"');
    });

    it('runCreateRanu returns exit code 1 with clean error message on empty --ai', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const code = await runCreateRanu(['my-app', '--ai', '', '--quiet']);
      expect(code).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
      const errorMsg = consoleErrorSpy.mock.calls[0]?.[0];
      expect(errorMsg).toContain('requires a valid AI engine argument');
    });

    it('runCreateRanu returns exit code 1 and valid JSON on --json with invalid flag', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const code = await runCreateRanu(['my-app', '--ai', 'invalid_xyz', '--json']);
      expect(code).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
      const rawJson = consoleErrorSpy.mock.calls[0]?.[0];
      const parsed = JSON.parse(rawJson);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Invalid AI engine "invalid_xyz"');
    });
  });

  /* ========================================================================
   * Dimension 3: Alias Normalization
   * ======================================================================== */
  describe('Dimension 3: Alias Normalization', () => {
    it('normalizes primary aliases correctly', () => {
      expect(normalizeAIEngine('google')).toBe('gemini');
      expect(normalizeAIEngine('gpt')).toBe('openai');
      expect(normalizeAIEngine('anthropic')).toBe('claude');
      expect(normalizeAIEngine('ollama')).toBe('custom');
      expect(normalizeAIEngine('zero')).toBe('none');
      expect(normalizeAIEngine('false')).toBe('none');
    });

    it('normalizes recipe prefix aliases (ai-*)', () => {
      expect(normalizeAIEngine('ai-gemini')).toBe('gemini');
      expect(normalizeAIEngine('ai-groq')).toBe('groq');
      expect(normalizeAIEngine('ai-claude')).toBe('claude');
      expect(normalizeAIEngine('ai-openai')).toBe('openai');
      expect(normalizeAIEngine('ai-custom')).toBe('custom');
    });

    it('handles mixed case and whitespace', () => {
      expect(normalizeAIEngine('  GOOGLE  ')).toBe('gemini');
      expect(normalizeAIEngine('Anthropic')).toBe('claude');
      expect(normalizeAIEngine('GPT')).toBe('openai');
      expect(normalizeAIEngine('OLLAMA')).toBe('custom');
      expect(normalizeAIEngine('ZERO')).toBe('none');
      expect(normalizeAIEngine('  ai-groq  ')).toBe('groq');
    });

    it('parses aliases via CLI parseArgs', () => {
      expect(parseArgs(['app', '--ai', 'google']).ai).toBe('gemini');
      expect(parseArgs(['app', '--ai', 'gpt']).ai).toBe('openai');
      expect(parseArgs(['app', '--ai', 'anthropic']).ai).toBe('claude');
      expect(parseArgs(['app', '--ai', 'ollama']).ai).toBe('custom');
      expect(parseArgs(['app', '--ai', 'zero']).ai).toBe('none');
      expect(parseArgs(['app', '--ai-engine', 'google']).ai).toBe('gemini');
    });
  });

  /* ========================================================================
   * Dimension 4: End-to-End Scaffolding via runCreateRanu CLI
   * ======================================================================== */
  describe('Dimension 4: End-to-End CLI Scaffolding', () => {
    it('scaffolds successfully via runCreateRanu with --ai groq and --quiet', async () => {
      const tempDir = createTrackedTempDir('cli-e2e-groq-');
      const targetDir = path.join(tempDir, 'groq-app');

      const code = await runCreateRanu([
        targetDir,
        '--template',
        'minimal',
        '--ai',
        'groq',
        '--quiet',
      ]);
      expect(code).toBe(0);

      const pkg = JSON.parse(fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'));
      expect(pkg.dependencies['@ranu/ai']).toBe('^0.1.0');
      expect(pkg.dependencies['@ranu/ai-groq']).toBe('^0.1.0');
      expect(fs.existsSync(path.join(targetDir, 'app', 'routes', 'api.ai.ts'))).toBe(true);
      expect(fs.existsSync(path.join(targetDir, '.env.example'))).toBe(true);
    });

    it('scaffolds successfully via runCreateRanu with --json mode and zero AI', async () => {
      const tempDir = createTrackedTempDir('cli-e2e-json-');
      const targetDir = path.join(tempDir, 'json-zero-app');

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const code = await runCreateRanu([
        targetDir,
        '--template',
        'default',
        '--ai',
        'none',
        '--json',
      ]);
      expect(code).toBe(0);

      expect(consoleLogSpy).toHaveBeenCalled();
      const lastCall = consoleLogSpy.mock.calls[consoleLogSpy.mock.calls.length - 1]?.[0];
      const parsed = JSON.parse(lastCall);
      expect(parsed.success).toBe(true);
      expect(parsed.ai).toBe('none');
      expect(parsed.template).toBe('default');
    });

    it('handles --help and --version with exit code 0', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      expect(await runCreateRanu(['--help'])).toBe(0);
      expect(await runCreateRanu(['--version'])).toBe(0);
      expect(await runCreateRanu(['--help', '--json'])).toBe(0);
      expect(await runCreateRanu(['--version', '--json'])).toBe(0);
    });
  });

  /* ========================================================================
   * Dimension 5: Non-Interactive Default Fallback
   * ======================================================================== */
  describe('Dimension 5: Non-Interactive Fallback Invariant', () => {
    it('defaults to "none" when --ai is omitted in non-interactive environment', async () => {
      const tempDir = createTrackedTempDir('non-interactive-fallback-');
      const targetDir = path.join(tempDir, 'fallback-app');

      // In non-interactive mode (e.g. process.stdin.isTTY is false or quiet/json)
      const code = await runCreateRanu([targetDir, '--quiet']);
      expect(code).toBe(0);

      const pkg = JSON.parse(fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'));
      expect(pkg.dependencies['@ranu/ai']).toBeUndefined();
      expect(fs.existsSync(path.join(targetDir, 'app', 'routes', 'api.ai.ts'))).toBe(false);
      expect(fs.existsSync(path.join(targetDir, '.env.example'))).toBe(false);

      const cursorrules = fs.readFileSync(path.join(targetDir, '.cursorrules'), 'utf8');
      expect(cursorrules).toContain('Zero-AI Architecture');
    });
  });

  /* ========================================================================
   * Dimension 6: Temporary Directory Cleanup Verification
   * ======================================================================== */
  describe('Dimension 6: Cleanup Invariant Verification', () => {
    it('ensures temporary directories can be cleanly cleaned up without locking or residue', () => {
      const tempDir = createTrackedTempDir('cleanup-verification-');
      const targetDir = path.join(tempDir, 'cleanup-app');

      const result = scaffoldProject({
        projectPath: targetDir,
        template: 'saas',
        ai: 'openai',
        packageManager: 'pnpm',
        quiet: true,
      });

      expect(result.success).toBe(true);
      expect(fs.existsSync(targetDir)).toBe(true);

      // Verify clean deletion
      fs.rmSync(tempDir, { recursive: true, force: true });
      expect(fs.existsSync(tempDir)).toBe(false);
    });
  });
});
