import fs from 'node:fs';
import path from 'node:path';
import { createProductionServer } from '@ranu/runtime-node';
import type { ParsedCliArgs, CliLogger } from '../types.js';
import { resolveProjectContext } from '../context.js';

/**
 * Starts the production Ranu.js server and waits for a termination signal.
 *
 * @param args - CLI options for configuring the server and output format
 * @returns `0` after the server shuts down
 * @throws Error if the production build is missing or invalid
 */
export async function runStartCommand(args: ParsedCliArgs, logger: CliLogger): Promise<number> {
  const ctx = await resolveProjectContext(args, logger, 'production');

  const buildDir = path.join(ctx.projectRoot, '.ranu', 'build');
  const serverEntry = path.join(buildDir, 'server', 'entry.mjs');
  const buildJson = path.join(buildDir, 'build.json');

  if (!fs.existsSync(serverEntry) || !fs.existsSync(buildJson)) {
    throw new Error(
      `No valid production build found at "${buildDir}". Run "ranu build" first before starting the production server.`,
    );
  }

  // Precedence: CLI flag -> Environment variable -> Config -> Default
  const envPort = process.env.PORT ? parseInt(process.env.PORT, 10) : undefined;
  const envHost = process.env.HOST;

  const port = args.port ?? envPort ?? ctx.config.server.port ?? 3000;
  const host = args.host ?? envHost ?? ctx.config.server.host ?? '0.0.0.0';

  const server = await createProductionServer({
    projectRoot: ctx.projectRoot,
    buildDir,
    port,
    host,
    trustProxy: ctx.config.server.trustProxy,
  });

  const address = await server.listen(port, host);

  if (args.json) {
    logger.json({
      status: 'ready',
      url: `http://${address.host}:${address.port}`,
      mode: 'production',
      root: ctx.projectRoot,
    });
  } else {
    logger.log('');
    logger.success(`Ranu.js production server listening`);
    logger.log(`  \x1b[1mURL:\x1b[0m     \x1b[36mhttp://${address.host}:${address.port}\x1b[0m`);
    logger.log(`  \x1b[1mMode:\x1b[0m    production`);
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
        logger.log('\nShutting down Ranu.js production server...');
      }
      await server.close();
      resolve(0);
    };

    process.once('SIGINT', () => void cleanup());
    process.once('SIGTERM', () => void cleanup());
  });
}
