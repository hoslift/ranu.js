import { describe, it, expect, vi } from 'vitest';
import * as cliModule from '../src/cli.js';

describe('@ranu/cli bin entrypoint', () => {
  it('invokes runCli and calls process.exit with resolved code', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    const runCliSpy = vi.spyOn(cliModule, 'runCli').mockResolvedValue(0);

    await import('../src/bin/ranu.js');
    await new Promise((r) => setTimeout(r, 50));

    expect(runCliSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);

    exitSpy.mockRestore();
    runCliSpy.mockRestore();
  });
});
