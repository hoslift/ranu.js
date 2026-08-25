import type { CliCommand, ParsedCliArgs } from './types.js';

const KNOWN_COMMANDS: readonly CliCommand[] = [
  'dev',
  'build',
  'start',
  'create',
  'deploy',
  'help',
  'version',
];

const KNOWN_FLAGS = new Set<string>([
  '--root',
  '-r',
  '--port',
  '-p',
  '--host',
  '-h',
  '--clean',
  '--open',
  '--verbose',
  '--debug',
  '--quiet',
  '-q',
  '--json',
  '--help',
  '--version',
  '-v',
]);

/**
 * Calculates simple Levenshtein distance for command typo suggestions.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Suggests a close known command if user makes a typo.
 */
export function findClosestCommand(input: string): string | undefined {
  let closest: string | undefined;
  let minDistance = 3; // Max tolerance

  for (const cmd of KNOWN_COMMANDS) {
    const dist = levenshtein(input.toLowerCase(), cmd);
    if (dist < minDistance) {
      minDistance = dist;
      closest = cmd;
    }
  }

  return closest;
}

/**
 * Parses raw command-line arguments into a validated ParsedCliArgs object.
 */
export function parseCliArgs(argv: readonly string[]): ParsedCliArgs {
  let command: CliCommand | undefined;
  const positionalArgs: string[] = [];

  let root: string | undefined;
  let port: number | undefined;
  let host: string | undefined;
  let clean = false;
  let open = false;
  let verbose = false;
  let debug = false;
  let quiet = false;
  let json = false;
  let help = false;
  let version = false;

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    if (arg === '--help') {
      help = true;
      i++;
      continue;
    }

    if (arg === '--version' || arg === '-v') {
      version = true;
      i++;
      continue;
    }

    if (arg === '--root' || arg === '-r') {
      i++;
      if (i >= argv.length || argv[i].startsWith('-')) {
        throw new Error('Flag "--root" requires a valid path argument.');
      }
      root = argv[i];
      i++;
      continue;
    }

    if (arg === '--port' || arg === '-p') {
      i++;
      if (i >= argv.length || argv[i].startsWith('-')) {
        throw new Error('Flag "--port" requires a valid integer argument.');
      }
      const rawPort = parseInt(argv[i], 10);
      if (isNaN(rawPort) || rawPort < 1 || rawPort > 65535 || String(rawPort) !== argv[i]) {
        throw new Error(`Invalid port number "${argv[i]}". Port must be an integer between 1 and 65535.`);
      }
      port = rawPort;
      i++;
      continue;
    }

    if (arg === '--host' || arg === '-h') {
      i++;
      if (i >= argv.length || argv[i].startsWith('-')) {
        throw new Error('Flag "--host" requires a valid host argument.');
      }
      host = argv[i];
      i++;
      continue;
    }

    if (arg === '--clean') {
      clean = true;
      i++;
      continue;
    }

    if (arg === '--open') {
      open = true;
      i++;
      continue;
    }

    if (arg === '--verbose') {
      verbose = true;
      i++;
      continue;
    }

    if (arg === '--debug') {
      debug = true;
      i++;
      continue;
    }

    if (arg === '--quiet' || arg === '-q') {
      quiet = true;
      i++;
      continue;
    }

    if (arg === '--json') {
      json = true;
      i++;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown flag "${arg}". Run "ranu --help" to see available options.`);
    }

    // Positional argument
    if (!command) {
      if (KNOWN_COMMANDS.includes(arg as CliCommand)) {
        command = arg as CliCommand;
      } else {
        const suggestion = findClosestCommand(arg);
        const didYouMean = suggestion ? ` Did you mean "${suggestion}"?` : '';
        throw new Error(`Unknown command "${arg}".${didYouMean} Run "ranu --help" for a list of commands.`);
      }
    } else {
      positionalArgs.push(arg);
    }

    i++;
  }

  return {
    command,
    args: positionalArgs,
    root,
    port,
    host,
    clean: clean || undefined,
    open: open || undefined,
    verbose: verbose || undefined,
    debug: debug || undefined,
    quiet: quiet || undefined,
    json: json || undefined,
    help: help || undefined,
    version: version || undefined,
  };
}
