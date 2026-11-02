import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RANU_VERSION } from '@ranu/core';
import type { ParsedCliArgs, CliLogger } from '../types.js';

function resolveCliVersion(): string {
  try {
    let currentDir = path.dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 5; i++) {
      const candidate = path.join(currentDir, 'package.json');
      if (fs.existsSync(candidate)) {
        const pkg = JSON.parse(fs.readFileSync(candidate, 'utf8'));
        if (pkg.name === '@ranujs/core' && pkg.version) {
          return pkg.version;
        }
      }
      const parent = path.dirname(currentDir);
      if (parent === currentDir) break;
      currentDir = parent;
    }
  } catch {
    // fallback to framework version
  }
  return RANU_VERSION;
}

export const CLI_VERSION = resolveCliVersion();

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
