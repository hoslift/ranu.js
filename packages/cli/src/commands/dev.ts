import { createDevServer } from '@ranu/dev';
import type { ParsedCliArgs, CliLogger } from '../types.js';
import { resolveProjectContext } from '../context.js';

/**
 * Starts the development server and waits for a termination signal before shutting it down.
 *
 * @param args - Command-line options controlling output formatting and server behavior
 * @param logger - Logger used to report server status
 * @returns The process exit code after the server shuts down
 */
export async function runDevCommand(args: ParsedCliArgs, logger: CliLogger): Promise<number> {
  const ctx = await resolveProjectContext(args, logger, 'development');

  const server = createDevServer({
    projectRoot: ctx.projectRoot,
    port: ctx.config.server.port,
    host: ctx.config.server.host,
    watch: true,
  });

  const address = await server.start(ctx.config.server.port, ctx.config.server.host);

  if (args.json) {
    logger.json({
      status: 'ready',
      url: address.url,
      mode: 'development',
      root: ctx.projectRoot,
    });
  } else {
    logger.log('');
    logger.success(`Ranu.js development server started`);
    logger.log(`  \x1b[1mLocal:\x1b[0m   \x1b[36m${address.url}\x1b[0m`);
    logger.log(`  \x1b[1mMode:\x1b[0m    development`);
    logger.log(`  \x1b[1mRoot:\x1b[0m    ${ctx.projectRoot}`);
    logger.log('');
  }

  // Handle termination signals
  return new Promise<number>((resolve) => {
    let isExiting = false;

    const cleanup = async () => {
      if (isExiting) return;
      isExiting = true;
      if (!args.json) {
        logger.log('\nShutting down Ranu.js development server...');
      }
      await server.close();
      resolve(0);
    };

    process.once('SIGINT', () => void cleanup());
    process.once('SIGTERM', () => void cleanup());
  });
}
