import { describe, it, expect, vi } from 'vitest';
import { runHelpCommand } from '../src/commands/help.js';
import { runVersionCommand, CLI_VERSION } from '../src/commands/version.js';
import { runCreateCommand } from '../src/commands/create.js';
import { createCliLogger } from '../src/logger.js';
import { runCli } from '../src/cli.js';

describe('@ranu/cli commands', () => {
  it('runs help command for root and subcommands', () => {
    const logger = createCliLogger({ quiet: true });
    expect(runHelpCommand(undefined, logger)).toBe(0);
    expect(runHelpCommand('dev', logger)).toBe(0);
    expect(runHelpCommand('build', logger)).toBe(0);
    expect(runHelpCommand('start', logger)).toBe(0);
  });

  it('runs version command', () => {
    const logger = createCliLogger({ quiet: true });
    expect(runVersionCommand({ args: [] }, logger)).toBe(0);
    expect(runVersionCommand({ args: [], json: true }, logger)).toBe(0);
  });

  it('runs create command in text and json mode', async () => {
    const logger = createCliLogger({ quiet: true });
    expect(await runCreateCommand({ args: ['my-app'] }, logger)).toBe(0);
    expect(await runCreateCommand({ args: ['my-app'], json: true }, logger)).toBe(0);
  });

  it('runs help command in JSON mode', () => {
    const logger = createCliLogger({ quiet: true });
    expect(runHelpCommand(undefined, logger, true)).toBe(0);
    expect(runHelpCommand('dev', logger, true)).toBe(0);
  });

  it('runs CLI dispatcher with --help and --version', async () => {
    expect(await runCli(['--help'])).toBe(0);
    expect(await runCli(['--help', '--json'])).toBe(0);
    expect(await runCli(['--version'])).toBe(0);
    expect(await runCli(['help', 'dev'])).toBe(0);
    expect(await runCli(['version'])).toBe(0);
  });

  it('returns exit code 1 on unknown command or flag error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await runCli(['invalidcommand123'])).toBe(1);
    expect(await runCli(['dev', '--badflag'])).toBe(1);
    errorSpy.mockRestore();
  });
});
