import type { CliLogger } from './types.js';

export interface CliLoggerOptions {
  quiet?: boolean;
  verbose?: boolean;
  debug?: boolean;
  json?: boolean;
}

export function createCliLogger(options: CliLoggerOptions = {}): CliLogger {
  const isQuiet = Boolean(options.quiet);
  const isDebug = Boolean(options.debug || process.env.DEBUG || process.env.RANU_DEBUG);
  const isJson = Boolean(options.json);

  return {
    log(message: string, ...args: unknown[]) {
      if (isJson) return;
      if (!isQuiet) {
        console.log(message, ...args);
      }
    },
    info(message: string, ...args: unknown[]) {
      if (isJson) return;
      if (!isQuiet) {
        console.log(`\x1b[36mℹ\x1b[0m ${message}`, ...args);
      }
    },
    success(message: string, ...args: unknown[]) {
      if (isJson) return;
      if (!isQuiet) {
        console.log(`\x1b[32m✓\x1b[0m ${message}`, ...args);
      }
    },
    warn(message: string, ...args: unknown[]) {
      if (isJson) return;
      if (!isQuiet) {
        console.warn(`\x1b[33m⚠\x1b[0m ${message}`, ...args);
      }
    },
    error(message: string, ...args: unknown[]) {
      if (isJson) {
        console.error(JSON.stringify({ error: message }));
      } else {
        console.error(`\x1b[31m✖\x1b[0m ${message}`, ...args);
      }
    },
    debug(message: string, ...args: unknown[]) {
      if (isJson) return;
      if (isDebug) {
        console.debug(`\x1b[90m[debug]\x1b[0m ${message}`, ...args);
      }
    },
    json(data: unknown) {
      console.log(JSON.stringify(data, null, 2));
    },
  };
}
