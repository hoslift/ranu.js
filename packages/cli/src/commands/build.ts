import { build } from '@ranu/build';
import type { ParsedCliArgs, CliLogger } from '../types.js';
import { resolveProjectContext } from '../context.js';

export async function runBuildCommand(args: ParsedCliArgs, logger: CliLogger): Promise<number> {
  const ctx = await resolveProjectContext(args, logger, 'production');

  logger.log('Creating an optimized production build...');

  const result = await build({
    projectRoot: ctx.projectRoot,
    mode: 'production',
    minify: ctx.config.build.minify,
    sourceMaps: ctx.config.build.sourceMaps ? 'inline' : false,
  });

  if (!result.success) {
    if (args.json) {
      logger.json({
        success: false,
        diagnostics: result.diagnostics,
      });
    } else {
      logger.error(`Production build failed with ${result.diagnostics.length} diagnostic error(s):`);
      for (const diag of result.diagnostics) {
        logger.error(`  [${diag.code}] ${diag.message}`);
        if (diag.location?.file) {
          logger.log(`    at ${diag.location.file}${diag.location.line ? `:${diag.location.line}` : ''}`);
        }
      }
    }
    return 1;
  }

  if (args.json) {
    logger.json({
      success: true,
      buildId: result.buildId,
      outDir: result.outDir,
      durationMs: result.duration,
    });
  } else {
    logger.success(`Ranu.js production build completed in ${(result.duration / 1000).toFixed(2)}s`);
    logger.log(`  \x1b[1mOutput:\x1b[0m    ${result.outDir}`);
    logger.log(`  \x1b[1mBuild ID:\x1b[0m  ${result.buildId}`);
    logger.log('');
  }

  return 0;
}
