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

  let adapter = ctx.config.deployment?.adapter;

  // CLI flag override: --adapter vercel / @ranu/adapter-vercel
  if (args.adapter) {
    const adapterName = String(args.adapter).toLowerCase();
    if (adapterName === 'vercel' || adapterName === '@ranu/adapter-vercel') {
      try {
        const vercelMod = await import('@ranu/adapter-vercel');
        const loadedAdapter =
          typeof vercelMod.createVercelAdapter === 'function'
            ? vercelMod.createVercelAdapter()
            : typeof vercelMod.default === 'function'
              ? vercelMod.default()
              : vercelMod.default;
        adapter = loadedAdapter as typeof adapter;
      } catch (err: unknown) {
        const msg = (err as Error).message ?? String(err);
        if (args.json) {
          logger.json({
            success: false,
            error: `Failed to load adapter "${args.adapter}": ${msg}`,
          });
        } else {
          logger.error(`Failed to load adapter "${args.adapter}": ${msg}`);
        }
        return 1;
      }
    } else {
      const msg = `Unsupported deployment adapter "${args.adapter}". Supported adapters: "vercel".`;
      if (args.json) {
        logger.json({ success: false, error: msg });
      } else {
        logger.error(msg);
      }
      return 1;
    }
  }

  if (!adapter) {
    if (args.json) {
      logger.json({
        success: false,
        error: 'No deployment adapter configured in ranu.config.ts or passed via --adapter',
      });
      return 1;
    }
    logger.warn('No deployment adapter configured in ranu.config.ts.');
    logger.log(
      'To deploy to a cloud provider, configure an adapter (e.g. @ranu/adapter-vercel) in your ranu.config.ts:',
    );
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
    try {
      const result = await adapter.adapt({
        projectRoot: ctx.projectRoot,
        logger,
      });
      const isSuccess = result?.success !== false;
      if (args.json) {
        logger.json({
          success: isSuccess,
          adapter: adapter.name ?? 'custom',
          outputDirectory: result?.outputDirectory,
          files: result?.files,
        });
      } else {
        if (isSuccess) {
          logger.success(`Deployment preparation complete for ${adapter.name ?? 'custom'}.`);
          if (result?.outputDirectory) {
            logger.log(`Output: ${result.outputDirectory}`);
          }
        } else {
          logger.error(`Deployment preparation failed for ${adapter.name ?? 'custom'}.`);
        }
      }
      return isSuccess ? 0 : 1;
    } catch (err: unknown) {
      const msg = (err as Error).message ?? String(err);
      if (args.json) {
        logger.json({
          success: false,
          error: msg,
          adapter: adapter.name ?? 'custom',
        });
      } else {
        logger.error(`Deployment adaptation failed: ${msg}`);
      }
      return 1;
    }
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
