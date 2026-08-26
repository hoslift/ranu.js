import { parseCliArgs } from './args.js';
import { createCliLogger } from './logger.js';
import { runHelpCommand } from './commands/help.js';
import { runVersionCommand } from './commands/version.js';
import { runDevCommand } from './commands/dev.js';
import { runBuildCommand } from './commands/build.js';
import { runStartCommand } from './commands/start.js';
import { runDeployCommand } from './commands/deploy.js';
import { runCreateCommand } from './commands/create.js';

/**
 * Dispatches CLI arguments to the corresponding command and reports command errors.
 *
 * @param argv - Command-line arguments to process.
 * @returns The command exit code.
 */
export async function runCli(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  let isDebug = false;
  let isJson = false;

  try {
    const args = parseCliArgs(argv);
    isDebug = Boolean(args.debug);
    isJson = Boolean(args.json);

    const logger = createCliLogger({
      quiet: args.quiet,
      verbose: args.verbose,
      debug: args.debug,
      json: args.json,
    });

    if (args.help) {
      return runHelpCommand(args.command, logger, args.json);
    }

    if (args.version) {
      return runVersionCommand(args, logger);
    }

    switch (args.command) {
      case 'dev':
        return await runDevCommand(args, logger);

      case 'build':
        return await runBuildCommand(args, logger);

      case 'start':
        return await runStartCommand(args, logger);

      case 'deploy':
        return await runDeployCommand(args, logger);

      case 'create':
        return runCreateCommand(args, logger);

      case 'help':
        return runHelpCommand(args.args[0], logger, args.json);

      case 'version':
        return runVersionCommand(args, logger);

      default:
        return runHelpCommand(undefined, logger, args.json);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (isJson) {
      console.error(JSON.stringify({ error: message }));
    } else {
      console.error(`\x1b[31m✖\x1b[0m ${message}`);
      if (isDebug && err instanceof Error && err.stack) {
        console.debug(`\x1b[90m${err.stack}\x1b[0m`);
      }
    }
    return 1;
  }
}
