import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AIChunk, AIModelInstance } from '@ranu/ai';
import {
  runAiCommand,
  validateAIGenerationPlan,
  AIGenerationPlanSchema,
  sanitizeTargetFilePath,
  createUnifiedDiff,
  type AiCommandResult,
} from '../src/commands/ai.js';
import { createCliLogger } from '../src/logger.js';

describe('@ranu/cli ai command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-ai-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function setupMockProject(): void {
    const pkgJson = {
      name: 'test-ai-project',
      dependencies: {
        '@ranu/core': 'workspace:*',
        react: '^19.0.0',
      },
    };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkgJson, null, 2));

    const routesDir = path.join(tempDir, 'app', 'routes');
    fs.mkdirSync(routesDir, { recursive: true });
    fs.writeFileSync(path.join(routesDir, 'page.tsx'), 'export default function Page() { return <h1>Original</h1>; }');
  }

  function createMockStreamingModel(payload: unknown): AIModelInstance {
    const jsonText = JSON.stringify(payload);
    return {
      provider: 'mock-groq',
      modelId: 'llama-3.3-70b-versatile',
      doStream: vi.fn().mockImplementation(async () => {
        return new ReadableStream<AIChunk>({
          start(controller) {
            controller.enqueue({ type: 'text', text: jsonText });
            controller.enqueue({ type: 'finish', finishReason: 'stop' });
            controller.close();
          },
        });
      }),
    };
  }

  describe('validateAIGenerationPlan & Schema', () => {
    it('validates a valid AIGenerationPlan payload', () => {
      const input = {
        explanation: 'Add hello route and update page',
        files: [
          { path: 'app/routes/hello/page.tsx', content: 'export default function Hello() {}', action: 'create' },
          { path: 'app/routes/page.tsx', content: 'export default function Updated() {}', action: 'modify' },
        ],
      };

      const plan = validateAIGenerationPlan(input);
      expect(plan.explanation).toBe('Add hello route and update page');
      expect(plan.files.length).toBe(2);
      expect(plan.files[0]?.action).toBe('create');
      expect(plan.files[1]?.action).toBe('modify');
    });

    it('throws error when files is not an array', () => {
      expect(() => validateAIGenerationPlan({ explanation: 'test', files: 'invalid' })).toThrow(
        /AIGenerationPlan "files" property must be an array/
      );
    });

    it('throws error when a file is missing path', () => {
      expect(() =>
        validateAIGenerationPlan({
          explanation: 'test',
          files: [{ content: 'code', action: 'create' }],
        })
      ).toThrow(/must have a non-empty "path"/);
    });

    it('standard schema validates and returns value or issues', () => {
      const valid = AIGenerationPlanSchema['~standard'].validate({
        explanation: 'ok',
        files: [{ path: 'test.ts', content: 'const a = 1;', action: 'create' }],
      });
      expect('value' in valid).toBe(true);

      const invalid = AIGenerationPlanSchema['~standard'].validate(null);
      expect('issues' in invalid).toBe(true);
    });
  });

  describe('runAiCommand', () => {
    it('fails with exit code 1 when prompt is omitted', async () => {
      const logger = createCliLogger({ quiet: true });
      const errorSpy = vi.spyOn(logger, 'error');

      const exitCode = await runAiCommand({ args: [], root: tempDir }, logger);
      expect(exitCode).toBe(1);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Missing prompt'));
    });

    it('fails with JSON error when prompt is omitted with --json', async () => {
      let loggedJson: unknown;
      const logger = createCliLogger({ json: true });
      vi.spyOn(logger, 'json').mockImplementation((data) => {
        loggedJson = data;
      });

      const exitCode = await runAiCommand({ args: [], root: tempDir, json: true }, logger);
      expect(exitCode).toBe(1);
      expect(loggedJson).toEqual(expect.objectContaining({ success: false }));
    });

    it('executes in dry-run mode without modifying disk files', async () => {
      setupMockProject();

      const existingFile = path.join(tempDir, 'app', 'routes', 'page.tsx');
      const originalContent = fs.readFileSync(existingFile, 'utf-8');

      const mockPlan = {
        explanation: 'Update landing page header and add new about route',
        files: [
          {
            path: 'app/routes/page.tsx',
            content: 'export default function Page() { return <h1>Updated Page</h1>; }',
            action: 'modify',
          },
          {
            path: 'app/routes/about/page.tsx',
            content: 'export default function About() { return <h1>About</h1>; }',
            action: 'create',
          },
        ],
      };

      const mockModel = createMockStreamingModel(mockPlan);
      const logger = createCliLogger({ quiet: true });
      const successSpy = vi.spyOn(logger, 'success');

      const exitCode = await runAiCommand(
        {
          args: ['update landing page and add about page'],
          root: tempDir,
          dryRun: true,
        },
        logger,
        { model: mockModel }
      );

      expect(exitCode).toBe(0);
      expect(successSpy).toHaveBeenCalledWith(expect.stringContaining('AI Generation Plan:'));

      // Check that existing file was NOT modified
      expect(fs.readFileSync(existingFile, 'utf-8')).toBe(originalContent);

      // Check that new file was NOT created
      const newFile = path.join(tempDir, 'app', 'routes', 'about', 'page.tsx');
      expect(fs.existsSync(newFile)).toBe(false);
    });

    it('applies file creations, modifications, and deletions when not in dry-run mode', async () => {
      setupMockProject();

      const existingFile = path.join(tempDir, 'app', 'routes', 'page.tsx');

      // Create an obsolete file to be deleted
      const obsoleteFile = path.join(tempDir, 'app', 'routes', 'obsolete.tsx');
      fs.writeFileSync(obsoleteFile, 'export const old = true;');

      const mockPlan = {
        explanation: 'Modify page, create widget, and delete obsolete file',
        files: [
          {
            path: 'app/routes/page.tsx',
            content: 'export default function Page() { return <h1>Refactored</h1>; }',
            action: 'modify',
          },
          {
            path: 'app/components/Widget.tsx',
            content: "'use client';\nexport function Widget() { return <div>Active</div>; }",
            action: 'create',
          },
          {
            path: 'app/routes/obsolete.tsx',
            content: '',
            action: 'delete',
          },
        ],
      };

      const mockModel = createMockStreamingModel(mockPlan);
      const logger = createCliLogger({ quiet: true });

      const exitCode = await runAiCommand(
        {
          args: ['refactor components and clean up'],
          root: tempDir,
          yes: true,
        },
        logger,
        { model: mockModel }
      );

      expect(exitCode).toBe(0);

      // Modified file updated
      expect(fs.readFileSync(existingFile, 'utf-8')).toContain('Refactored');

      // Created file exists
      const createdFile = path.join(tempDir, 'app', 'components', 'Widget.tsx');
      expect(fs.existsSync(createdFile)).toBe(true);
      expect(fs.readFileSync(createdFile, 'utf-8')).toContain("'use client';");

      // Deleted file removed
      expect(fs.existsSync(obsoleteFile)).toBe(false);
    });

    it('gathers specified --file contents into AI context prompt', async () => {
      setupMockProject();

      const helperFile = path.join(tempDir, 'helper.ts');
      fs.writeFileSync(helperFile, 'export const DB_CONFIG = { host: "localhost" };');

      const mockPlan = {
        explanation: 'Created API using DB config',
        files: [
          {
            path: 'app/routes/api/db/route.ts',
            content: 'export async function GET() { return Response.json({ ok: true }); }',
            action: 'create',
          },
        ],
      };

      const mockModel = createMockStreamingModel(mockPlan);
      const logger = createCliLogger({ quiet: true });

      await runAiCommand(
        {
          args: ['create API route for database'],
          root: tempDir,
          files: ['helper.ts'],
          dryRun: true,
        },
        logger,
        { model: mockModel }
      );

      expect(mockModel.doStream).toHaveBeenCalled();
      const callOptions = (mockModel.doStream as any).mock.calls[0]?.[0];
      const userMessage = callOptions.messages?.find((m: any) => m.role === 'user');
      expect(userMessage?.content).toContain('helper.ts');
      expect(userMessage?.content).toContain('DB_CONFIG');
    });

    it('supports --format json for structured output', async () => {
      setupMockProject();

      const mockPlan = {
        explanation: 'Add ping API',
        files: [
          {
            path: 'app/routes/api/ping/route.ts',
            content: 'export async function GET() { return new Response("pong"); }',
            action: 'create',
          },
        ],
      };

      const mockModel = createMockStreamingModel(mockPlan);
      let jsonOutput: unknown;
      const logger = createCliLogger({ json: true });
      vi.spyOn(logger, 'json').mockImplementation((data) => {
        jsonOutput = data;
      });

      const exitCode = await runAiCommand(
        {
          args: ['add ping api'],
          root: tempDir,
          format: 'json',
          json: true,
          dryRun: true,
        },
        logger,
        { model: mockModel }
      );

      expect(exitCode).toBe(0);
      expect(jsonOutput).toBeDefined();
      const res = jsonOutput as AiCommandResult;
      expect(res.success).toBe(true);
      expect(res.provider).toBe('mock-groq');
      expect(res.model).toBe('llama-3.3-70b-versatile');
      expect(res.explanation).toBe('Add ping API');
      expect(res.dryRun).toBe(true);
      expect(res.files.length).toBe(1);
      expect(res.files[0]?.path).toBe('app/routes/api/ping/route.ts');
      expect(res.files[0]?.action).toBe('create');
      expect(res.files[0]?.diff).toContain('+ export async function GET()');
    });

    it('reports error when model stream rejects', async () => {
      setupMockProject();

      const faultyModel: AIModelInstance = {
        provider: 'faulty',
        modelId: 'broken-model',
        doStream: vi.fn().mockRejectedValue(new Error('API quota exceeded (rate limit)')),
      };

      const logger = createCliLogger({ quiet: true });
      const errorSpy = vi.spyOn(logger, 'error');

      const exitCode = await runAiCommand(
        {
          args: ['generate something'],
          root: tempDir,
        },
        logger,
        { model: faultyModel }
      );

      expect(exitCode).toBe(1);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('rate limit'));
    });
  });

  describe('sanitizeTargetFilePath security containment', () => {
    it('strictly rejects directory traversal with ../../etc/passwd', () => {
      expect(() => sanitizeTargetFilePath(tempDir, '../../etc/passwd')).toThrow(
        /Path traversal violation: file path "\.\.\/\.\.\/etc\/passwd" escapes project root\./
      );
    });

    it('strictly rejects Windows directory traversal with ..\\..\\Windows', () => {
      expect(() => sanitizeTargetFilePath(tempDir, '..\\..\\Windows')).toThrow(
        /Path traversal violation: file path "\.\.\\\.\.\\Windows" escapes project root\./
      );
    });

    it('strictly rejects sibling directory prefix collision escape', () => {
      const siblingDir = `${tempDir}-sibling`;
      const siblingFile = path.join(siblingDir, 'secret.txt');
      expect(() => sanitizeTargetFilePath(tempDir, siblingFile)).toThrow(
        /Path traversal violation.*escapes project root\./
      );
    });

    it('strictly rejects relative sibling directory escape', () => {
      expect(() => sanitizeTargetFilePath(tempDir, '../test-sibling/secret.txt')).toThrow(
        /Path traversal violation.*escapes project root\./
      );
    });

    it('strictly rejects empty path or root directory reference', () => {
      expect(() => sanitizeTargetFilePath(tempDir, '')).toThrow(/Path traversal violation/);
      expect(() => sanitizeTargetFilePath(tempDir, '.')).toThrow(/Path traversal violation/);
    });

    it('accepts safe relative paths within project root', () => {
      const safePath = sanitizeTargetFilePath(tempDir, 'app/routes/page.tsx');
      expect(safePath).toBe(path.resolve(tempDir, 'app/routes/page.tsx'));
    });

    it('normalizes internal dot segments that remain inside root', () => {
      const safePath = sanitizeTargetFilePath(tempDir, 'app/components/../routes/page.tsx');
      expect(safePath).toBe(path.resolve(tempDir, 'app/routes/page.tsx'));
    });

    it('aborts runAiCommand with exit code 1 and writes zero files on traversal attack in plan', async () => {
      setupMockProject();

      const maliciousPlan = {
        explanation: 'Attempt traversal attack',
        files: [
          {
            path: '../../etc/traversal-attack-canary.txt',
            content: 'malicious payload',
            action: 'create',
          },
        ],
      };

      const mockModel = createMockStreamingModel(maliciousPlan);
      const logger = createCliLogger({ quiet: true });
      const errorSpy = vi.spyOn(logger, 'error');

      const exitCode = await runAiCommand(
        {
          args: ['exploit vulnerability'],
          root: tempDir,
          yes: true,
        },
        logger,
        { model: mockModel }
      );

      expect(exitCode).toBe(1);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Path traversal violation'));

      // Invariant: zero files created outside or mutated inside project root
      const escapedTarget = path.resolve(tempDir, '..', '..', 'etc', 'traversal-attack-canary.txt');
      expect(fs.existsSync(escapedTarget)).toBe(false);
      const internalTarget = path.join(tempDir, 'etc', 'traversal-attack-canary.txt');
      expect(fs.existsSync(internalTarget)).toBe(false);
    });
  });

  describe('createUnifiedDiff formatting', () => {
    it('creates clean diff without extraneous deletion line for new files', () => {
      const diff = createUnifiedDiff('app/routes/new.tsx', '', 'export default function New() {\n  return <div>New</div>;\n}');
      expect(diff).toContain('--- a/app/routes/new.tsx');
      expect(diff).toContain('+++ b/app/routes/new.tsx');
      expect(diff).toContain('+ export default function New() {');
      expect(diff).not.toMatch(/^- /m);
    });

    it('creates clean diff without extraneous insertion line for deleted files', () => {
      const diff = createUnifiedDiff('app/routes/old.tsx', 'export const old = true;', '');
      expect(diff).toContain('- export const old = true;');
      expect(diff).not.toMatch(/^\+ /m);
    });

    it('creates balanced diff for modified files', () => {
      const diff = createUnifiedDiff('app/routes/page.tsx', 'const a = 1;', 'const a = 2;');
      expect(diff).toContain('- const a = 1;');
      expect(diff).toContain('+ const a = 2;');
    });
  });
});
