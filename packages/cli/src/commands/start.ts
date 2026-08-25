import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createNodeServer } from '@ranu/runtime-node';
import type { ParsedCliArgs, CliLogger } from '../types.js';
import { resolveProjectContext } from '../context.js';

export async function runStartCommand(args: ParsedCliArgs, logger: CliLogger): Promise<number> {
  const ctx = await resolveProjectContext(args, logger, 'production');

  const buildDir = path.join(ctx.projectRoot, '.ranu', 'build');
  const serverEntry = path.join(buildDir, 'server', 'entry.mjs');

  if (!fs.existsSync(serverEntry)) {
    throw new Error(
      `No production build found at "${buildDir}". Run "ranu build" first before starting the production server.`
    );
  }

  const port = args.port ?? ctx.config.server.port ?? 3000;
  const host = args.host ?? ctx.config.server.host ?? '0.0.0.0';

  // Import the production entry module
  const entryUrl = pathToFileURL(serverEntry).href;
  const entryModule = await import(entryUrl);
  const runtime = entryModule.runtime ?? entryModule.default;

  if (!runtime) {
    throw new Error(`Production server entry at "${serverEntry}" did not export a valid runtime instance.`);
  }

  const server = createNodeServer({
    runtime,
    port,
    host,
    trustProxy: ctx.config.server.trustProxy,
  });

  const address = await server.listen(port, host);

  logger.log('');
  logger.success(`Ranu.js production server listening`);
  logger.log(`  \x1b[1mURL:\x1b[0m     \x1b[36mhttp://${address.host}:${address.port}\x1b[0m`);
  logger.log(`  \x1b[1mMode:\x1b[0m    production`);
  logger.log(`  \x1b[1mRoot:\x1b[0m    ${ctx.projectRoot}`);
  logger.log('');

  // Handle termination signals
  return new Promise<number>((resolve) => {
    let isExiting = false;

    const cleanup = async () => {
      if (isExiting) return;
      isExiting = true;
      logger.log('\nShutting down Ranu.js production server...');
      await server.close();
      resolve(0);
    };

    process.once('SIGINT', () => void cleanup());
    process.once('SIGTERM', () => void cleanup());
  });
}
