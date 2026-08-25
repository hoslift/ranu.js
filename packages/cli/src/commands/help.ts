import type { CliLogger } from '../types.js';

export function runHelpCommand(subcommand?: string, logger?: CliLogger, isJson?: boolean): number {
  if (isJson && logger) {
    logger.json({
      name: 'ranu',
      command: subcommand ?? 'root',
      usage: subcommand ? `ranu ${subcommand} [options]` : 'ranu <command> [options]',
      commands: ['dev', 'build', 'start', 'create', 'deploy', 'help', 'version'],
      options: [
        { flag: '-r, --root <path>', description: 'Project root directory' },
        { flag: '-p, --port <number>', description: 'Port number to listen on' },
        { flag: '-h, --host <string>', description: 'Host address to bind to' },
        { flag: '--clean', description: 'Clean caches and generated files before running' },
        { flag: '--open', description: 'Open browser after server start' },
        { flag: '--verbose', description: 'Display verbose output' },
        { flag: '--debug', description: 'Enable debug diagnostics and stack traces' },
        { flag: '-q, --quiet', description: 'Suppress non-essential console output' },
        { flag: '--json', description: 'Output results in machine-readable JSON format' },
        { flag: '--help', description: 'Show help for command' },
        { flag: '-v, --version', description: 'Show CLI version' },
      ],
    });
    return 0;
  }

  const log = (msg: string) => (logger ? logger.log(msg) : console.log(msg));

  if (!subcommand) {
    log(`
Ranu.js — Modern JavaScript/TypeScript Full-Stack Web Framework

Usage:
  $ ranu <command> [options]

Commands:
  dev      Start the Ranu.js development server with HMR and Fast Refresh
  build    Create an optimized production build
  start    Start the production HTTP server
  create   Scaffold a new Ranu.js application
  deploy   Prepare deployment artifacts for hosting adapter
  help     Show help information for commands
  version  Show Ranu.js framework and CLI version

Options:
  -r, --root <path>     Project root directory (default: current working directory)
  -p, --port <number>   Port number to listen on (default: 3000)
  -h, --host <string>   Host address to bind to (default: 127.0.0.1 for dev, 0.0.0.0 for start)
  --clean               Clean caches and generated files before running
  --open                Open browser after server start
  --verbose             Display verbose output
  --debug               Enable debug diagnostics and stack traces
  -q, --quiet           Suppress non-essential console output
  --json                Output results in machine-readable JSON format
  --help                Show help for command
  -v, --version         Show CLI version

Examples:
  $ ranu dev
  $ ranu dev --port 4000 --open
  $ ranu build --clean
  $ ranu start --host 0.0.0.0
`);
    return 0;
  }

  switch (subcommand) {
    case 'dev':
      log(`
Usage:
  $ ranu dev [options]

Description:
  Starts the local development server with Fast Refresh, route compilation,
  and filesystem watching.

Options:
  -r, --root <path>     Project root directory
  -p, --port <number>   Port to listen on (default: 3000)
  -h, --host <string>   Host address to bind (default: 127.0.0.1)
  --clean               Clean development caches before starting
  --open                Open browser after server start
  --debug               Enable debug diagnostics
  -q, --quiet           Suppress banner and info logs
`);
      break;

    case 'build':
      log(`
Usage:
  $ ranu build [options]

Description:
  Compiles and bundles the application into optimized production artifacts
  under .ranu/build/.

Options:
  -r, --root <path>     Project root directory
  --clean               Clean previous build artifacts before building
  --json                Output build summary in JSON format
  --debug               Enable debug logs and stack traces
  -q, --quiet           Suppress non-error build logs
`);
      break;

    case 'start':
      log(`
Usage:
  $ ranu start [options]

Description:
  Starts the production HTTP server using artifacts from .ranu/build/.

Options:
  -r, --root <path>     Project root directory
  -p, --port <number>   Port to listen on (default: 3000)
  -h, --host <string>   Host address to bind (default: 0.0.0.0)
  --debug               Enable debug logs
`);
      break;

    case 'create':
      log(`
Usage:
  $ ranu create [project-name] [options]

Description:
  Scaffolds a new Ranu.js application.
  (Equivalent to "npm create ranu@latest <project-name>")
`);
      break;

    case 'deploy':
      log(`
Usage:
  $ ranu deploy [options]

Description:
  Prepares and executes deployment adapter build hooks.
`);
      break;

    default:
      log(`No detailed help available for command "${subcommand}". Run "ranu --help" for available commands.`);
      break;
  }

  return 0;
}
