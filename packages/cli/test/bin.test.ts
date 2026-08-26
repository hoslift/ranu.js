import { describe, it, expect, vi } from 'vitest';
import * as cliModule from '../src/cli.js';
import { runBin } from '../src/bin/ranu.js';

describe('@ranu/cli bin entrypoint', () => {
  it('invokes runCli and calls process.exit with resolved code', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    const runCliSpy = vi.spyOn(cliModule, 'runCli').mockResolvedValue(0);

    const code = await runBin(['--version']);
    expect(runCliSpy).toHaveBeenCalledWith(['--version']);
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(code).toBe(0);

    exitSpy.mockRestore();
    runCliSpy.mockRestore();
  });

  it('handles runCli rejection and calls process.exit with 1', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const runCliSpy = vi.spyOn(cliModule, 'runCli').mockRejectedValue(new Error('Fatal Error'));

    const code = await runBin(['bad-input']);
    expect(errorSpy).toHaveBeenCalledWith('Fatal CLI Error:', expect.any(Error));
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(code).toBe(1);

    exitSpy.mockRestore();
    errorSpy.mockRestore();
    runCliSpy.mockRestore();
  });
});
