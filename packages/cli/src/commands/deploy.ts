import type { ParsedCliArgs, CliLogger } from '../types.js';
import { resolveProjectContext } from '../context.js';

/**
 * Executes the configured deployment adapter for the production project.
 *
 * @param args - Command-line options controlling output format
 * @returns `0` when deployment preparation succeeds, `1` when no valid adapter is configured
 */
export async function runDeployCommand(args: ParsedCliArgs, logger: CliLogger): Promise<number> {
  const ctx = await resolveProjectContext(args, logger, 'production');

  const adapter = ctx.config.deployment?.adapter;
  if (!adapter) {
    if (args.json) {
      logger.json({
        success: false,
        error: 'No deployment adapter configured in ranu.config.ts',
      });
      return 1;
    }
    logger.warn('No deployment adapter configured in ranu.config.ts.');
    logger.log('To deploy to a cloud provider, configure an adapter (e.g. @ranu/adapter-vercel) in your ranu.config.ts:');
    logger.log(`
import { defineConfig } from 'ranu/config';
import vercelAdapter from '@ranu/adapter-vercel';

export default defineConfig({
  deployment: {
    adapter: vercelAdapter(),
  },
});
`);
    return 1;
  }

  if (typeof adapter.adapt === 'function') {
    logger.log(`Executing deployment adapter: ${adapter.name ?? 'custom'}...`);
    await adapter.adapt({
      projectRoot: ctx.projectRoot,
      logger,
    });
    if (args.json) {
      logger.json({
        success: true,
        adapter: adapter.name ?? 'custom',
      });
    } else {
      logger.success('Deployment preparation complete.');
    }
    return 0;
  }

  if (args.json) {
    logger.json({
      success: false,
      error: 'The configured deployment adapter does not implement a valid adapt() method',
    });
  } else {
    logger.error('The configured deployment adapter does not implement a valid adapt() method.');
  }
  return 1;
}
