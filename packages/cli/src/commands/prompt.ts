import type { ParsedCliArgs, CliLogger } from '../types.js';
import { buildArchitecturePrompt } from '../prompt-builder.js';
import { copyToClipboard } from '../clipboard.js';

export interface PromptCommandOptions {
  readonly copyFn?: ((text: string) => Promise<boolean>) | undefined;
}

export interface PromptCommandResult {
  readonly success: boolean;
  readonly target: string;
  readonly copied: boolean;
  readonly length: number;
  readonly prompt: string;
  readonly error?: string | undefined;
}

/**
 * Executes the `ranu prompt` command to output or copy target-tailored architecture directives.
 *
 * @param args - CLI arguments (--target, --copy, --stdout, --json)
 * @param logger - CLI logger instance
 * @param options - Optional copy function injection for testing
 * @returns 0 on success, 1 on error
 */
export async function runPromptCommand(
  args: ParsedCliArgs,
  logger: CliLogger,
  options: PromptCommandOptions = {}
): Promise<number> {
  const isJson = Boolean(args.json || args.format === 'json');
  const shouldCopy = Boolean(args.copy);
  const shouldStdout = Boolean(args.stdout);
  const target = (args.target ?? 'all').toLowerCase().trim();

  try {
    const prompt = await buildArchitecturePrompt({
      target,
      projectRoot: args.root,
    });

    let copied = false;
    if (shouldCopy) {
      const copyFn = options.copyFn ?? copyToClipboard;
      copied = await copyFn(prompt);
    }

    if (isJson) {
      const result: PromptCommandResult = {
        success: true,
        target,
        copied,
        length: prompt.length,
        prompt,
      };
      logger.json(result);
      return 0;
    }

    if (shouldCopy) {
      if (copied) {
        logger.success(`Architecture prompt tailored for "${target}" copied to clipboard!`);
        if (shouldStdout) {
          logger.log('');
          logger.log(prompt);
        }
      } else {
        logger.warn('Clipboard utility is unavailable in this environment. Printing prompt to stdout:');
        logger.log('');
        logger.log(prompt);
      }
    } else {
      logger.log(prompt);
    }

    return 0;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (isJson) {
      logger.json({ success: false, error: errorMsg });
    } else {
      logger.error(`Failed to generate architecture prompt: ${errorMsg}`);
    }
    return 1;
  }
}
