/* eslint-disable no-console */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffoldProject } from '../scaffold.js';
import { getRunCommand, detectPackageManager } from '../package-manager.js';
import type { PackageManager } from '../types.js';
import { SCAFFOLDER_VERSION } from '../index.js';

export interface ParsedArgs {
  targetPath?: string | undefined;
  packageManager?: PackageManager | undefined;
  install?: boolean | undefined;
  git?: boolean | undefined;
  force?: boolean | undefined;
  quiet?: boolean | undefined;
  json?: boolean | undefined;
  help?: boolean | undefined;
  version?: boolean | undefined;
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const result: ParsedArgs = {};
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i];
    if (!arg) {
      i++;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      result.help = true;
      i++;
      continue;
    }

    if (arg === '--version' || arg === '-v') {
      result.version = true;
      i++;
      continue;
    }

    if (arg === '--force') {
      result.force = true;
      i++;
      continue;
    }

    if (arg === '--quiet' || arg === '-q') {
      result.quiet = true;
      i++;
      continue;
    }

    if (arg === '--json') {
      result.json = true;
      i++;
      continue;
    }

    if (arg === '--install') {
      result.install = true;
      i++;
      continue;
    }

    if (arg === '--no-install') {
      result.install = false;
      i++;
      continue;
    }

    if (arg === '--git') {
      result.git = true;
      i++;
      continue;
    }

    if (arg === '--no-git') {
      result.git = false;
      i++;
      continue;
    }

    if (arg === '--package-manager' || arg === '-p') {
      i++;
      const val = argv[i];
      if (!val || val.startsWith('-')) {
        throw new Error('Flag "--package-manager" requires a valid package manager argument.');
      }
      if (val !== 'npm' && val !== 'pnpm' && val !== 'yarn' && val !== 'bun') {
        throw new Error(`Invalid package manager "${val}". Supported: npm, pnpm, yarn, bun.`);
      }
      result.packageManager = val;
      i++;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown flag "${arg}". Run "create-ranu --help" for available options.`);
    }

    if (!result.targetPath) {
      result.targetPath = arg;
    }
    i++;
  }

  return result;
}

export function printHelp(): void {
  console.log(`
create-ranu — Canonical project scaffolder for Ranu.js

Usage:
  $ create-ranu <project-directory> [options]
  $ npm create ranu@latest <project-directory> [options]

Options:
  -p, --package-manager <name>  Package manager to configure (npm, pnpm, yarn, bun)
  --install                     Install dependencies after scaffolding
  --no-install                  Skip dependency installation (default)
  --git                         Initialize a Git repository
  --no-git                      Skip Git initialization (default)
  --force                       Overwrite existing non-empty directory safely
  -q, --quiet                   Suppress non-error output
  --json                        Output structured JSON result
  -h, --help                    Show this help message
  -v, --version                 Show create-ranu version

Examples:
  $ npm create ranu@latest my-app
  $ pnpm create ranu my-app --package-manager pnpm
  $ create-ranu ./web-app --git
`);
}

export async function runCreateRanu(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const wantsJson = argv.includes('--json');
  try {
    const parsed = parseArgs(argv);

    if (parsed.help) {
      if (parsed.json) {
        console.log(
          JSON.stringify({
            name: 'create-ranu',
            version: SCAFFOLDER_VERSION,
            usage: 'create-ranu <project-directory> [options]',
          })
        );
      } else {
        printHelp();
      }
      return 0;
    }

    if (parsed.version) {
      if (parsed.json) {
        console.log(JSON.stringify({ version: SCAFFOLDER_VERSION }));
      } else {
        console.log(`create-ranu v${SCAFFOLDER_VERSION}`);
      }
      return 0;
    }

    const targetDir = parsed.targetPath ?? 'my-ranu-app';
    const pm = parsed.packageManager ?? detectPackageManager();

    if (!parsed.quiet && !parsed.json) {
      console.log(`\nCreating a new Ranu.js project in \x1b[36m${targetDir}\x1b[0m...\n`);
    }

    const result = scaffoldProject({
      projectPath: targetDir,
      packageManager: pm,
      install: parsed.install,
      git: parsed.git,
      force: parsed.force,
      quiet: parsed.quiet,
    });

    if (!result.success) {
      if (parsed.json) {
        console.error(JSON.stringify({ success: false, error: result.error }));
      } else {
        console.error(`\x1b[31m✖ Error:\x1b[0m ${result.error}`);
      }
      return 1;
    }

    if (parsed.json) {
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    if (!parsed.quiet) {
      const relDir = path.relative(process.cwd(), result.projectPath) || '.';
      const devCmd = getRunCommand(result.packageManager, 'dev');

      console.log(`\x1b[32m✔ Success!\x1b[0m Created \x1b[1m${result.projectName}\x1b[0m at ${result.projectPath}`);
      console.log('\nInside that directory, you can run several commands:');
      console.log(`\n  \x1b[36m${devCmd}\x1b[0m`);
      console.log('    Starts the development server.\n');
      console.log(`  \x1b[36m${getRunCommand(result.packageManager, 'build')}\x1b[0m`);
      console.log('    Bundles the app for production.\n');
      console.log(`  \x1b[36m${getRunCommand(result.packageManager, 'start')}\x1b[0m`);
      console.log('    Starts the production server.\n');
      console.log('We suggest that you begin by typing:\n');
      if (relDir !== '.') {
        const formattedDir = relDir.includes(' ') ? `"${relDir}"` : relDir;
        console.log(`  \x1b[36mcd ${formattedDir}\x1b[0m`);
      }
      console.log(`  \x1b[36m${devCmd}\x1b[0m\n`);
    }

    return 0;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (wantsJson) {
      console.error(JSON.stringify({ success: false, error: msg }));
    } else {
      console.error(`\x1b[31m✖ Error:\x1b[0m ${msg}`);
    }
    return 1;
  }
}

/* v8 ignore next 6 */
const isDirectExecution =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectExecution) {
  runCreateRanu()
    .then((code) => process.exit(code))
    .catch(() => process.exit(1));
}
