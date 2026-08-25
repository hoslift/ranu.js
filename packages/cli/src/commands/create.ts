import type { ParsedCliArgs, CliLogger } from '../types.js';

export async function runCreateCommand(args: ParsedCliArgs, logger: CliLogger): Promise<number> {
  const targetDir = args.args[0] ?? 'my-ranu-app';

  logger.log('');
  logger.info(`To scaffold a new Ranu.js application, run:`);
  logger.log(`  \x1b[36mnpm create ranu@latest ${targetDir}\x1b[0m`);
  logger.log(`  or: \x1b[36mpnpm create ranu ${targetDir}\x1b[0m`);
  logger.log(`  or: \x1b[36myarn create ranu ${targetDir}\x1b[0m`);
  logger.log(`  or: \x1b[36mbun create ranu ${targetDir}\x1b[0m`);
  logger.log('');

  return 0;
}
