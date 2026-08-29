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

/**
 * Calculates the minimum number of single-character edits needed to transform one string into another.
 *
 * @param a - The source string
 * @param b - The target string
 * @returns The edit distance between `a` and `b`
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0) as number[]);

  for (let i = 0; i <= m; i++) {
    (dp[i] as number[])[0] = i;
  }
  for (let j = 0; j <= n; j++) {
    (dp[0] as number[])[j] = j;
  }

  for (let i = 1; i <= m; i++) {
    const prevRow = dp[i - 1] as number[];
    const currRow = dp[i] as number[];
    for (let j = 1; j <= n; j++) {
      if (a.charAt(i - 1) === b.charAt(j - 1)) {
        currRow[j] = prevRow[j - 1] as number;
      } else {
        currRow[j] = 1 + Math.min(prevRow[j] as number, currRow[j - 1] as number, prevRow[j - 1] as number);
      }
    }
  }

  return (dp[m] as number[])[n] as number;
}

/**
 * Finds the closest recognized command for an input string.
 *
 * @param input - The command text to compare with recognized commands
 * @returns The closest recognized command when its edit distance is less than 3, `undefined` otherwise
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
 * Parses command-line arguments into a validated options object.
 *
 * @param argv - The raw command-line arguments
 * @returns Parsed commands, positional arguments, options, and enabled flags
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
  let adapter: string | undefined;
  let help = false;
  let version = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;

    if (arg === '--help') {
      help = true;
      continue;
    }

    if (arg === '--version' || arg === '-v') {
      version = true;
      continue;
    }

    if (arg === '--root' || arg === '-r') {
      i++;
      const val = argv[i];
      if (val === undefined || val.startsWith('-')) {
        throw new Error('Flag "--root" requires a valid path argument.');
      }
      root = val;
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
      continue;
    }

    if (arg === '--host' || arg === '-h') {
      i++;
      const val = argv[i];
      if (val === undefined || val.startsWith('-')) {
        throw new Error('Flag "--host" requires a valid host argument.');
      }
      host = val;
      continue;
    }

    if (arg === '--clean') {
      clean = true;
      continue;
    }

    if (arg === '--open') {
      open = true;
      continue;
    }

    if (arg === '--verbose') {
      verbose = true;
      continue;
    }

    if (arg === '--debug') {
      debug = true;
      continue;
    }

    if (arg === '--quiet' || arg === '-q') {
      quiet = true;
      continue;
    }

    if (arg === '--json') {
      json = true;
      continue;
    }

    if (arg === '--adapter') {
      i++;
      const val = argv[i];
      if (val === undefined || val.startsWith('-') || !val.trim()) {
        throw new Error('Flag "--adapter" requires a valid adapter name.');
      }
      adapter = val.trim();
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
    adapter,
    help: help ? true : undefined,
    version: version ? true : undefined,
  };
}
