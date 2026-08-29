import type { ParsedCliArgs, CliLogger } from '../types.js';

/**
 * Displays commands for scaffolding a new Ranu.js application.
 *
 * @param args - CLI arguments, including the optional target directory and JSON output flag
 * @returns The command exit status, always `0`
 */
export function runCreateCommand(args: ParsedCliArgs, logger: CliLogger): number {
  const targetDir = args.args[0] ?? 'my-ranu-app';

  if (args.json) {
    logger.json({
      command: 'create',
      targetDir,
      commands: [
        `npm create ranu@latest ${targetDir}`,
        `pnpm create ranu ${targetDir}`,
        `yarn create ranu ${targetDir}`,
        `bun create ranu ${targetDir}`,
      ],
    });
    return 0;
  }

  logger.log('');
  logger.info(`To scaffold a new Ranu.js application, run:`);
  logger.log(`  \x1b[36mnpm create ranu@latest ${targetDir}\x1b[0m`);
  logger.log(`  or: \x1b[36mpnpm create ranu ${targetDir}\x1b[0m`);
  logger.log(`  or: \x1b[36myarn create ranu ${targetDir}\x1b[0m`);
  logger.log(`  or: \x1b[36mbun create ranu ${targetDir}\x1b[0m`);
  logger.log('');

  return 0;
}
