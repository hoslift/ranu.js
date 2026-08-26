import { runCli } from '../cli.js';

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

/* v8 ignore next 3 */
if (process.env.NODE_ENV !== 'test') {
  void runBin();
}
