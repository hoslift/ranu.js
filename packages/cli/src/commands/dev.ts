import { createDevServer } from '@ranu/dev';
import type { ParsedCliArgs, CliLogger } from '../types.js';
import { resolveProjectContext } from '../context.js';

export async function runDevCommand(args: ParsedCliArgs, logger: CliLogger): Promise<number> {
  const ctx = await resolveProjectContext(args, logger, 'development');

  const server = createDevServer({
    projectRoot: ctx.projectRoot,
    port: ctx.config.server.port,
    host: ctx.config.server.host,
    plugins: ctx.config.plugins,
    watch: true,
  });

  const address = await server.start(ctx.config.server.port, ctx.config.server.host);

  logger.log('');
  logger.success(`Ranu.js development server started`);
  logger.log(`  \x1b[1mLocal:\x1b[0m   \x1b[36m${address.url}\x1b[0m`);
  logger.log(`  \x1b[1mMode:\x1b[0m    development`);
  logger.log(`  \x1b[1mRoot:\x1b[0m    ${ctx.projectRoot}`);
  logger.log('');

  // Handle termination signals
  return new Promise<number>((resolve) => {
    let isExiting = false;

    const cleanup = async () => {
      if (isExiting) return;
      isExiting = true;
      logger.log('\nShutting down Ranu.js development server...');
      await server.close();
      resolve(0);
    };

    process.once('SIGINT', () => void cleanup());
    process.once('SIGTERM', () => void cleanup());
  });
}
