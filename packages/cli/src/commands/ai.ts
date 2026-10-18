import fs from 'node:fs';
import path from 'node:path';
import { generateObject, type AIModelInstance, type StandardSchemaV1 } from '@ranu/ai';
import type { ParsedCliArgs, CliLogger } from '../types.js';
import { discoverProjectRoot } from '../context.js';
import { loadAIModel } from '../ai-provider-loader.js';
import { discoverProjectInfo } from '../prompt-builder.js';

/**
 * Generates a unified diff representation for console or JSON logging.
 */
export function createUnifiedDiff(filePath: string, original: string, modified: string): string {
  const origLines = original.split(/\r?\n/);
  const modLines = modified.split(/\r?\n/);
  const diffLines: string[] = [
    `--- a/${filePath.replace(/\\/g, '/')}`,
    `+++ b/${filePath.replace(/\\/g, '/')}`,
  ];

  let i = 0;
  let j = 0;
  while (i < origLines.length || j < modLines.length) {
    if (origLines[i] === modLines[j]) {
      i++;
      j++;
    } else {
      if (i < origLines.length && !modLines.includes(origLines[i]!)) {
        diffLines.push(`- ${origLines[i]}`);
        i++;
      } else if (j < modLines.length && !origLines.includes(modLines[j]!)) {
        diffLines.push(`+ ${modLines[j]}`);
        j++;
      } else {
        if (i < origLines.length) {
          diffLines.push(`- ${origLines[i]}`);
          i++;
        }
        if (j < modLines.length) {
          diffLines.push(`+ ${modLines[j]}`);
          j++;
        }
      }
    }
  }

  return diffLines.join('\n');
}

export interface AIGenerationFile {
  readonly path: string;
  readonly content: string;
  readonly action: 'create' | 'modify' | 'delete';
  readonly description?: string | undefined;
}

export interface AIGenerationPlan {
  readonly explanation: string;
  readonly files: readonly AIGenerationFile[];
}

export interface AiCommandFileResult {
  readonly path: string;
  readonly action: 'create' | 'modify' | 'delete';
  readonly diff: string;
  readonly applied: boolean;
  readonly description?: string | undefined;
}

export interface AiCommandResult {
  readonly success: boolean;
  readonly provider: string;
  readonly model: string;
  readonly explanation: string;
  readonly dryRun: boolean;
  readonly files: readonly AiCommandFileResult[];
  readonly error?: string | undefined;
}

export interface AiCommandExecutionOptions {
  readonly importer?: ((specifier: string) => Promise<unknown>) | undefined;
  readonly model?: AIModelInstance | undefined;
}

/**
 * Validates the raw JSON object from the AI model into a typed AIGenerationPlan.
 */
export function validateAIGenerationPlan(data: unknown): AIGenerationPlan {
  if (!data || typeof data !== 'object') {
    throw new Error('AIGenerationPlan must be an object with explanation and files');
  }
  const obj = data as Record<string, unknown>;
  const explanation = typeof obj.explanation === 'string' && obj.explanation.trim().length > 0
    ? obj.explanation.trim()
    : 'Generated changes for Ranu.js application.';

  if (!Array.isArray(obj.files)) {
    throw new Error('AIGenerationPlan "files" property must be an array');
  }

  const files: AIGenerationFile[] = obj.files.map((item, idx) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`File at index ${idx} must be an object`);
    }
    const f = item as Record<string, unknown>;
    if (typeof f.path !== 'string' || !f.path.trim()) {
      throw new Error(`File at index ${idx} must have a non-empty "path"`);
    }
    const actionRaw = typeof f.action === 'string' ? f.action.toLowerCase().trim() : 'create';
    const action: 'create' | 'modify' | 'delete' =
      actionRaw === 'delete' ? 'delete' : actionRaw === 'modify' ? 'modify' : 'create';
    const content = typeof f.content === 'string' ? f.content : '';
    const description = typeof f.description === 'string' ? f.description : undefined;

    return {
      path: f.path.trim().replace(/\\/g, '/'),
      content,
      action,
      description,
    };
  });

  return { explanation, files };
}

/**
 * Standard Schema v1 implementation for AIGenerationPlan.
 */
export const AIGenerationPlanSchema: StandardSchemaV1<unknown, AIGenerationPlan> = {
  '~standard': {
    version: 1,
    vendor: 'ranu-cli',
    validate: (value: unknown) => {
      try {
        const validated = validateAIGenerationPlan(value);
        return { value: validated };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { issues: [{ message }] };
      }
    },
  },
};

/**
 * Sanitizes and verifies that a relative file path stays within the project root.
 */
function sanitizeTargetFilePath(projectRoot: string, relativePath: string): string {
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
  const resolved = path.resolve(projectRoot, normalized);
  if (!resolved.startsWith(projectRoot)) {
    throw new Error(`Path traversal violation: file path "${relativePath}" escapes project root.`);
  }
  return resolved;
}

/**
 * Gathers local file contents specified with `--file`.
 */
function gatherSpecifiedFiles(projectRoot: string, files: readonly string[]): Array<{ path: string; content: string }> {
  const result: Array<{ path: string; content: string }> = [];
  for (const f of files) {
    const fullPath = path.isAbsolute(f) ? f : path.resolve(projectRoot, f);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        // Truncate individual file context if larger than 30KB
        const snippet = content.length > 30000 ? content.slice(0, 30000) + '\n...[truncated]' : content;
        result.push({
          path: path.relative(projectRoot, fullPath).replace(/\\/g, '/'),
          content: snippet,
        });
      } catch {
        // Skip unreadable files
      }
    }
  }
  return result;
}

/**
 * Executes the `ranu ai` code generation command.
 *
 * @param args - CLI arguments (prompt, --model, --provider, --file, --dry-run, --yes, --json)
 * @param logger - CLI logger instance
 * @param options - Optional custom model importer or model instance for testing
 * @returns 0 on success, 1 on failure
 */
export async function runAiCommand(
  args: ParsedCliArgs,
  logger: CliLogger,
  options: AiCommandExecutionOptions = {}
): Promise<number> {
  const isJson = Boolean(args.json || args.format === 'json');
  const isDryRun = Boolean(args.dryRun ?? args['dry-run']);
  const prompt = args.args.join(' ').trim();

  if (!prompt) {
    const errorMsg = 'Missing prompt for "ranu ai". Usage: ranu ai <prompt> [--model <model>] [--provider <provider>] [--dry-run]';
    if (isJson) {
      logger.json({ success: false, error: errorMsg });
    } else {
      logger.error(errorMsg);
    }
    return 1;
  }

  const cwd = process.cwd();
  const rawRoot = args.root ? path.resolve(cwd, args.root) : discoverProjectRoot(cwd);
  const projectRoot = path.resolve(rawRoot);

  try {
    let resolvedInstance: AIModelInstance;
    let providerName: string;
    let modelName: string;

    if (options.model) {
      resolvedInstance = options.model;
      providerName = options.model.provider ?? 'custom';
      modelName = options.model.modelId ?? 'default';
    } else {
      const resolved = await loadAIModel({
        provider: args.provider,
        model: args.model,
        importer: options.importer,
      });
      resolvedInstance = resolved.instance;
      providerName = resolved.provider;
      modelName = resolved.modelId;
    }

    // Discover project context
    const projectInfo = fs.existsSync(projectRoot)
      ? discoverProjectInfo(projectRoot)
      : { dependencies: [], routes: [], hasRanuConfig: false };

    const specifiedFiles = args.files && args.files.length > 0
      ? gatherSpecifiedFiles(projectRoot, args.files)
      : [];

    const contextSections: string[] = [];
    if (projectInfo.name) {
      contextSections.push(`Project Name: ${projectInfo.name}`);
    }
    if (projectInfo.dependencies.length > 0) {
      contextSections.push(`Dependencies: ${projectInfo.dependencies.slice(0, 25).join(', ')}`);
    }
    if (projectInfo.routes.length > 0) {
      contextSections.push(`Existing Routes:\n${projectInfo.routes.slice(0, 30).map((r) => `  - ${r}`).join('\n')}`);
    }
    if (specifiedFiles.length > 0) {
      contextSections.push(
        `Specified File Contents:\n${specifiedFiles
          .map((f) => `--- File: ${f.path} ---\n${f.content}\n--- End File ---`)
          .join('\n\n')}`
      );
    }

    const systemPrompt = `You are an autonomous code generation engine specialized in Ranu.js.
Ranu.js Architectural Invariants:
1. React 19 Streaming SSR is standard.
2. Standard W3C Request and Response are used for API routes (app/routes/**/route.ts).
3. Server Components are the default. Any component that uses hooks (useState, useEffect) or browser APIs MUST have 'use client'; on line 1.
4. Never expose server secrets (process.env.SECRET) to client components; only RANU_PUBLIC_* variables.
5. Only JSON-serializable props can pass across server-to-client JSX boundaries.
6. Generate clean, modular, production-ready TypeScript code.

Produce a plan conforming strictly to the requested schema with:
- "explanation": a concise summary of the architectural changes made
- "files": an array of { path: string, content: string, action: "create" | "modify" | "delete", description?: string }`;

    const userPrompt = `${prompt}

${contextSections.length > 0 ? `\nApplication Context:\n${contextSections.join('\n\n')}` : ''}`;

    if (!isJson && !args.quiet) {
      logger.info(`Generating code with ${providerName} (${modelName})...`);
    }

    const { object: plan } = await generateObject<AIGenerationPlan>({
      model: resolvedInstance,
      schema: AIGenerationPlanSchema,
      schemaName: 'AIGenerationPlan',
      schemaDescription: 'Structured code modification plan with explanation and files array.',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const fileResults: AiCommandFileResult[] = [];

    for (const file of plan.files) {
      const fullPath = sanitizeTargetFilePath(projectRoot, file.path);
      const relPath = path.relative(projectRoot, fullPath).replace(/\\/g, '/');
      const exists = fs.existsSync(fullPath);
      let originalContent = '';

      if (exists) {
        try {
          originalContent = fs.readFileSync(fullPath, 'utf-8');
        } catch {
          originalContent = '';
        }
      }

      let diff = '';
      if (file.action === 'delete') {
        diff = createUnifiedDiff(relPath, originalContent, '');
        if (!isDryRun && exists) {
          fs.rmSync(fullPath, { force: true });
        }
      } else {
        diff = createUnifiedDiff(relPath, originalContent, file.content);
        if (!isDryRun) {
          const parentDir = path.dirname(fullPath);
          if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
          }
          fs.writeFileSync(fullPath, file.content, 'utf-8');
        }
      }

      fileResults.push({
        path: relPath,
        action: file.action,
        diff,
        applied: !isDryRun,
        description: file.description,
      });
    }

    const commandResult: AiCommandResult = {
      success: true,
      provider: providerName,
      model: modelName,
      explanation: plan.explanation,
      dryRun: isDryRun,
      files: fileResults,
    };

    if (isJson) {
      logger.json(commandResult);
    } else {
      logger.success(`AI Generation Plan: ${plan.explanation}`);
      if (fileResults.length === 0) {
        logger.info('No files planned for modification.');
      } else {
        const actionVerb = isDryRun ? 'Proposed changes (dry-run):' : 'Applied changes:';
        logger.info(actionVerb);
        for (const f of fileResults) {
          const badge = f.action === 'create' ? '+ [CREATE]' : f.action === 'delete' ? '- [DELETE]' : '~ [MODIFY]';
          logger.log(`\n  \x1b[36m● ${badge} ${f.path}\x1b[0m ${f.description ? `\x1b[90m(${f.description})\x1b[0m` : ''}`);
          if (f.diff) {
            logger.log(`    \x1b[90m${f.diff.split('\n').slice(0, 10).join('\n    ')}\x1b[0m`);
          }
        }
      }

      if (isDryRun) {
        logger.log('\n\x1b[33mℹ Dry-run mode: no files were written to disk. Re-run without --dry-run to apply.\x1b[0m\n');
      } else {
        logger.log('');
        logger.success(`Successfully applied ${fileResults.length} file change(s).`);
      }
    }

    return 0;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (isJson) {
      logger.json({ success: false, error: errorMsg });
    } else {
      logger.error(`AI generation failed: ${errorMsg}`);
    }
    return 1;
  }
}
