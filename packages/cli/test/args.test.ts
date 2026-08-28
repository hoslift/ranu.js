import { describe, it, expect } from 'vitest';
import { parseCliArgs, findClosestCommand } from '../src/args.js';

describe('@ranu/cli argument parsing', () => {
  it('parses valid commands and defaults', () => {
    const parsed = parseCliArgs(['dev']);
    expect(parsed.command).toBe('dev');
    expect(parsed.args).toEqual([]);
    expect(parsed.clean).toBeUndefined();
  });

  it('parses global flags: --root, --port, --host, --clean, --open', () => {
    const parsed = parseCliArgs([
      'dev',
      '--root',
      './my-app',
      '--port',
      '4000',
      '--host',
      '0.0.0.0',
      '--clean',
      '--open',
    ]);
    expect(parsed.command).toBe('dev');
    expect(parsed.root).toBe('./my-app');
    expect(parsed.port).toBe(4000);
    expect(parsed.host).toBe('0.0.0.0');
    expect(parsed.clean).toBe(true);
    expect(parsed.open).toBe(true);
  });

  it('parses short flags: -r, -p, -h, -q, -v', () => {
    const parsed = parseCliArgs(['build', '-r', 'src/app', '-p', '5000', '-h', '127.0.0.1', '-q']);
    expect(parsed.command).toBe('build');
    expect(parsed.root).toBe('src/app');
    expect(parsed.port).toBe(5000);
    expect(parsed.host).toBe('127.0.0.1');
    expect(parsed.quiet).toBe(true);
  });

  it('parses output modifiers: --verbose, --debug, --json, --quiet', () => {
    const parsed = parseCliArgs(['build', '--verbose', '--debug', '--json', '--quiet']);
    expect(parsed.verbose).toBe(true);
    expect(parsed.debug).toBe(true);
    expect(parsed.json).toBe(true);
    expect(parsed.quiet).toBe(true);
  });

  it('parses and trims --adapter', () => {
    expect(parseCliArgs(['deploy', '--adapter', '  vercel  ']).adapter).toBe('vercel');
  });

  it.each([
    ['missing', ['deploy', '--adapter']],
    ['flag-like', ['deploy', '--adapter', '--json']],
    ['whitespace-only', ['deploy', '--adapter', '   ']],
  ])('rejects a %s --adapter value', (_label, argv) => {
    expect(() => parseCliArgs(argv)).toThrow('Flag "--adapter" requires a valid adapter name.');
  });

  it('parses --help and --version', () => {
    expect(parseCliArgs(['--help']).help).toBe(true);
    expect(parseCliArgs(['-v']).version).toBe(true);
    expect(parseCliArgs(['--version']).version).toBe(true);
  });

  it('throws when --port is invalid or out of range', () => {
    expect(() => parseCliArgs(['dev', '--port', '0'])).toThrow('Invalid port number "0"');
    expect(() => parseCliArgs(['dev', '--port', '70000'])).toThrow('Invalid port number "70000"');
    expect(() => parseCliArgs(['dev', '--port', 'abc'])).toThrow('Invalid port number "abc"');
    expect(() => parseCliArgs(['dev', '--port'])).toThrow(
      'Flag "--port" requires a valid integer argument.',
    );
  });

  it('throws when --root or --host is missing value', () => {
    expect(() => parseCliArgs(['dev', '--root'])).toThrow(
      'Flag "--root" requires a valid path argument.',
    );
    expect(() => parseCliArgs(['dev', '--host'])).toThrow(
      'Flag "--host" requires a valid host argument.',
    );
  });

  it('throws when an unknown flag is provided', () => {
    expect(() => parseCliArgs(['dev', '--nonexistent'])).toThrow('Unknown flag "--nonexistent"');
  });

  it('throws on unknown command and provides suggestion', () => {
    expect(() => parseCliArgs(['buidl'])).toThrow('Unknown command "buidl". Did you mean "build"?');
    expect(() => parseCliArgs(['strat'])).toThrow('Unknown command "strat". Did you mean "start"?');
    expect(() => parseCliArgs(['xyz123'])).toThrow('Unknown command "xyz123". Run "ranu --help"');
  });

  it('findClosestCommand finds nearest command', () => {
    expect(findClosestCommand('dv')).toBe('dev');
    expect(findClosestCommand('buld')).toBe('build');
    expect(findClosestCommand('strt')).toBe('start');
  });
});
