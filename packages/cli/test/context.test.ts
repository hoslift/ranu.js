import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  validateNodeVersion,
  discoverProjectRoot,
  cleanProjectArtifacts,
  resolveProjectContext,
} from '../src/context.js';
import { createCliLogger } from '../src/logger.js';

describe('@ranu/cli context and discovery', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-cli-ctx-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('validates Node.js version meets baseline', () => {
    expect(() => validateNodeVersion()).not.toThrow();
  });

  it('throws if Node.js major version is unsupported', () => {
    const originalVersion = process.version;
    Object.defineProperty(process, 'version', { value: 'v20.10.0', configurable: true });

    expect(() => validateNodeVersion()).toThrow('RANU_NODE_VERSION_UNSUPPORTED');

    Object.defineProperty(process, 'version', { value: originalVersion, configurable: true });
  });

  it('discovers project root from directory containing app folder or ranu.config', () => {
    const appDir = path.join(tempDir, 'app');
    fs.mkdirSync(appDir, { recursive: true });

    const nested = path.join(tempDir, 'sub', 'nested');
    fs.mkdirSync(nested, { recursive: true });

    const discovered1 = discoverProjectRoot(nested);
    expect(discovered1).toBe(path.resolve(tempDir));

    // Also with config file
    const configDir = path.join(tempDir, 'with-config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'ranu.config.js'), 'export default {};');
    const discovered2 = discoverProjectRoot(path.join(configDir, 'nested'));
    expect(discovered2).toBe(path.resolve(configDir));
  });

  it('cleans .ranu artifacts when cleanProjectArtifacts is called', () => {
    const dotRanu = path.join(tempDir, '.ranu', 'cache');
    fs.mkdirSync(dotRanu, { recursive: true });
    fs.writeFileSync(path.join(dotRanu, 'test.txt'), 'cached');

    expect(fs.existsSync(dotRanu)).toBe(true);
    cleanProjectArtifacts(tempDir);
    expect(fs.existsSync(dotRanu)).toBe(false);
  });

  it('resolves project context with default settings and clean flag', async () => {
    const appDir = path.join(tempDir, 'app');
    fs.mkdirSync(appDir, { recursive: true });

    const dotRanu = path.join(tempDir, '.ranu');
    fs.mkdirSync(dotRanu, { recursive: true });

    const logger = createCliLogger({ quiet: true, debug: true });
    const ctx = await resolveProjectContext(
      { args: [], root: tempDir, clean: true, port: 8080, host: '0.0.0.0' },
      logger,
      'production'
    );

    expect(ctx.projectRoot).toBe(path.resolve(tempDir));
    expect(ctx.mode).toBe('production');
    expect(ctx.config.server.port).toBe(8080);
    expect(ctx.config.server.host).toBe('0.0.0.0');
    expect(fs.existsSync(dotRanu)).toBe(false);
  });

  it('rejects regular files supplied to --root with a directory-specific error', async () => {
    const filePath = path.join(tempDir, 'file.txt');
    fs.writeFileSync(filePath, 'hello');

    const logger = createCliLogger({ quiet: true });
    await expect(
      resolveProjectContext({ args: [], root: filePath }, logger, 'production')
    ).rejects.toThrow('Project root path is not a directory');
  });

  it('throws if project root does not exist', async () => {
    const logger = createCliLogger({ quiet: true });
    await expect(
      resolveProjectContext({ args: [], root: '/non/existent/root/path/xyz' }, logger, 'production')
    ).rejects.toThrow('Project root directory does not exist');
  });

  it('throws helpful error on invalid configuration', async () => {
    fs.mkdirSync(path.join(tempDir, 'app'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'ranu.config.ts'),
      'export default { server: { port: "invalid_port" } };'
    );

    const logger = createCliLogger({ quiet: true });
    await expect(
      resolveProjectContext({ args: [], root: tempDir }, logger, 'production')
    ).rejects.toThrow('Invalid configuration');
  });

  it('throws helpful error on syntax failure during config load', async () => {
    fs.mkdirSync(path.join(tempDir, 'app'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'ranu.config.ts'),
      'export default { invalid syntax...'
    );

    const logger = createCliLogger({ quiet: true });
    await expect(
      resolveProjectContext({ args: [], root: tempDir }, logger, 'production')
    ).rejects.toThrow('Failed to load configuration');
  });
});
