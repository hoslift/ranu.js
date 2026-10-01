#!/usr/bin/env node
import { runCli } from '@ranu/cli';

/**
 * Runs the CLI with the provided arguments and exits with its status code.
 *
 * @param argv - Command-line arguments to pass to the CLI
 * @returns The CLI status code, or `1` if execution fails
 */
export function runBin(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  return runCli(argv)
    .then((code) => {
      process.exit(code);
      return code;
    })
    .catch((err) => {
      console.error('Fatal CLI Error:', err);
      process.exit(1);
      return 1;
    });
}

void runBin();
