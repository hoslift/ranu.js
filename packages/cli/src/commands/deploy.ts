import path from 'node:path';
import type { ParsedCliArgs, CliLogger } from '../types.js';
import { resolveProjectContext } from '../context.js';
import {
  loadDeploymentAdapter,
  type LoadAdapterOptions,
} from '../adapter-loader.js';

export * from '../adapter-loader.js';

/**
 * Loads the official Vercel deployment adapter (retained for backward compatibility).
 */
export async function loadVercelAdapter(
  importer: (pkg: string) => Promise<unknown> = (pkg) => import(pkg),
): Promise<unknown> {
  return importer('@ranujs/adapter-vercel');
}

/**
 * Loads the official Cloudflare deployment adapter.
 */
export async function loadCloudflareAdapter(
  importer: (pkg: string) => Promise<unknown> = (pkg) => import(pkg),
): Promise<unknown> {
  return importer('@ranujs/adapter-cloudflare');
}

/**
 * Loads the official Node.js deployment adapter.
 */
export async function loadNodeAdapter(
  importer: (pkg: string) => Promise<unknown> = (pkg) => import(pkg),
): Promise<unknown> {
  return importer('@ranujs/adapter-node');
}

/**
 * Loads the official Netlify deployment adapter.
 */
export async function loadNetlifyAdapter(
  importer: (pkg: string) => Promise<unknown> = (pkg) => import(pkg),
): Promise<unknown> {
  return importer('@ranujs/adapter-netlify');
}

/**
 * Loads the official Bun deployment adapter.
 */
export async function loadBunAdapter(
  importer: (pkg: string) => Promise<unknown> = (pkg) => import(pkg),
): Promise<unknown> {
  return importer('@ranujs/adapter-bun');
}

/**
 * Loads the official Deno deployment adapter.
 */
export async function loadDenoAdapter(
  importer: (pkg: string) => Promise<unknown> = (pkg) => import(pkg),
): Promise<unknown> {
  return importer('@ranujs/adapter-deno');
}

/**
 * Executes the configured deployment adapter for the production project.
 *
 * @param args - Command-line options controlling output format
 * @param logger - CLI logger instance
 * @param loaderOptions - Optional overrides for adapter loader (e.g. custom importer for testing)
 * @returns `0` when deployment preparation succeeds, `1` when no valid adapter is configured or adaptation fails
 */
export async function runDeployCommand(
  args: ParsedCliArgs,
  logger: CliLogger,
  loaderOptions?: Partial<LoadAdapterOptions>,
): Promise<number> {
  const ctx = await resolveProjectContext(args, logger, 'production');

  let adapter = ctx.config.deployment?.adapter;

  // CLI flag override: --adapter <shorthand | package | path>
  if (args.adapter) {
    const loadResult = await loadDeploymentAdapter(String(args.adapter), {
      projectRoot: ctx.projectRoot,
      ...(loaderOptions?.importer ? { importer: loaderOptions.importer } : {}),
    });

    if (!loadResult.success) {
      if (args.json) {
        logger.json({
          success: false,
          error: loadResult.error,
          diagnostic: loadResult.diagnostic,
        });
      } else {
        logger.error(loadResult.error);
        if (loadResult.diagnostic?.hint) {
          logger.log(`  Hint: ${loadResult.diagnostic.hint}`);
        }
      }
      return 1;
    }

    adapter = loadResult.adapter;
  } else if (typeof adapter === 'string') {
    const loadResult = await loadDeploymentAdapter(adapter, {
      projectRoot: ctx.projectRoot,
      ...(loaderOptions?.importer ? { importer: loaderOptions.importer } : {}),
    });

    if (!loadResult.success) {
      if (args.json) {
        logger.json({
          success: false,
          error: loadResult.error,
          diagnostic: loadResult.diagnostic,
        });
      } else {
        logger.error(loadResult.error);
        if (loadResult.diagnostic?.hint) {
          logger.log(`  Hint: ${loadResult.diagnostic.hint}`);
        }
      }
      return 1;
    }

    adapter = loadResult.adapter;
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
      'To deploy to a cloud provider, configure an adapter (e.g. @ranujs/adapter-vercel) in your ranu.config.ts:',
    );
    logger.log(`
import { defineConfig } from 'ranu/config';
import vercelAdapter from '@ranujs/adapter-vercel';

export default defineConfig({
  deployment: {
    adapter: vercelAdapter(),
  },
});
`);
    return 1;
  }

  if (typeof adapter.adapt !== 'function') {
    const errMsg = 'The configured deployment adapter does not implement a valid adapt() method.';
    if (args.json) {
      logger.json({
        success: false,
        error: errMsg,
        diagnostic: {
          code: 'RANU_DEPLOY_ADAPTER_INVALID',
          severity: 'error',
          message: errMsg,
          hint: 'Ensure the adapter implements the RanuDeploymentAdapter interface with an adapt(context) method.',
        },
      });
    } else {
      logger.error(errMsg);
      logger.log(
        '  Hint: Ensure the adapter implements the RanuDeploymentAdapter interface with an adapt(context) method.',
      );
    }
    return 1;
  }

  logger.log(`Executing deployment adapter: ${adapter.name ?? 'custom'}...`);
  try {
    const buildDir = path.join(ctx.projectRoot, '.ranu', 'build');
    const result = await adapter.adapt({
      projectRoot: ctx.projectRoot,
      buildDir,
      rootDir: ctx.projectRoot,
      logger,
      config: ctx.config,
    });
    const isSuccess = result?.success !== false;
    if (args.json) {
      logger.json({
        success: isSuccess,
        adapter: adapter.name ?? 'custom',
        outputDirectory: result?.outputDirectory,
        files: result?.files,
        warnings: result?.warnings,
        diagnostics: result?.diagnostics,
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
