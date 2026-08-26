import type { ParsedCliArgs, CliLogger } from '../types.js';

export const CLI_VERSION = '0.0.0';

/**
 * Displays the CLI version and runtime environment information.
 *
 * @param args - CLI arguments that determine the output format
 * @param logger - Logger used to write the version information
 * @returns Exit code `0`
 */
export function runVersionCommand(args: ParsedCliArgs, logger: CliLogger): number {
  if (args.json) {
    logger.json({
      name: 'ranu',
      version: CLI_VERSION,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    });
    return 0;
  }

  logger.log(`Ranu.js v${CLI_VERSION} (Node.js ${process.version} on ${process.platform}/${process.arch})`);
  return 0;
}
