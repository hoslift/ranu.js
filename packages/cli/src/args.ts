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
  const dp: number[][] = [];

  for (let i = 0; i <= m; i++) {
    const row: number[] = new Array(n + 1).fill(0) as number[];
    row[0] = i;
    dp.push(row);
  }

  const firstRow = dp[0];
  if (firstRow) {
    for (let j = 0; j <= n; j++) {
      firstRow[j] = j;
    }
  }

  for (let i = 1; i <= m; i++) {
    const currRow = dp[i];
    const prevRow = dp[i - 1];
    if (!currRow || !prevRow) continue;

    for (let j = 1; j <= n; j++) {
      const charA = a.charAt(i - 1);
      const charB = b.charAt(j - 1);

      const pVal = prevRow[j - 1] ?? 0;
      const topVal = prevRow[j] ?? 0;
      const leftVal = currRow[j - 1] ?? 0;

      if (charA === charB) {
        currRow[j] = pVal;
      } else {
        currRow[j] = 1 + Math.min(topVal, leftVal, pVal);
      }
    }
  }

  const lastRow = dp[m];
  return lastRow ? (lastRow[n] ?? 0) : 0;
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
    if (arg === undefined) {
      i++;
      continue;
    }

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
      const val = argv[i];
      if (val === undefined || val.startsWith('-')) {
        throw new Error('Flag "--root" requires a valid path argument.');
      }
      root = val;
      i++;
      continue;
    }

    if (arg === '--port' || arg === '-p') {
      i++;
      const val = argv[i];
      if (val === undefined || val.startsWith('-')) {
        throw new Error('Flag "--port" requires a valid integer argument.');
      }
      const rawPort = parseInt(val, 10);
      if (isNaN(rawPort) || rawPort < 1 || rawPort > 65535 || String(rawPort) !== val) {
        throw new Error(`Invalid port number "${val}". Port must be an integer between 1 and 65535.`);
      }
      port = rawPort;
      i++;
      continue;
    }

    if (arg === '--host' || arg === '-h') {
      i++;
      const val = argv[i];
      if (val === undefined || val.startsWith('-')) {
        throw new Error('Flag "--host" requires a valid host argument.');
      }
      host = val;
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
    clean: clean ? true : undefined,
    open: open ? true : undefined,
    verbose: verbose ? true : undefined,
    debug: debug ? true : undefined,
    quiet: quiet ? true : undefined,
    json: json ? true : undefined,
    help: help ? true : undefined,
    version: version ? true : undefined,
  };
}
