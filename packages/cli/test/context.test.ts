import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
  });

  it('validates Node.js version meets baseline', () => {
    expect(() => validateNodeVersion()).not.toThrow();
  });

  it('discovers project root from directory containing app folder', () => {
    const appDir = path.join(tempDir, 'app');
    fs.mkdirSync(appDir, { recursive: true });

    const nested = path.join(tempDir, 'sub', 'nested');
    fs.mkdirSync(nested, { recursive: true });

    const discovered = discoverProjectRoot(nested);
    expect(discovered).toBe(path.resolve(tempDir));
  });

  it('cleans .ranu artifacts when cleanProjectArtifacts is called', () => {
    const dotRanu = path.join(tempDir, '.ranu', 'cache');
    fs.mkdirSync(dotRanu, { recursive: true });
    fs.writeFileSync(path.join(dotRanu, 'test.txt'), 'cached');

    expect(fs.existsSync(dotRanu)).toBe(true);
    cleanProjectArtifacts(tempDir);
    expect(fs.existsSync(dotRanu)).toBe(false);
  });

  it('resolves project context with default settings', async () => {
    const appDir = path.join(tempDir, 'app');
    fs.mkdirSync(appDir, { recursive: true });

    const logger = createCliLogger({ quiet: true });
    const ctx = await resolveProjectContext(
      { args: [], root: tempDir },
      logger,
      'production'
    );

    expect(ctx.projectRoot).toBe(path.resolve(tempDir));
    expect(ctx.mode).toBe('production');
    expect(ctx.config.server.port).toBe(3000);
  });

  it('rejects regular files supplied to --root with a directory-specific error', async () => {
    const filePath = path.join(tempDir, 'file.txt');
    fs.writeFileSync(filePath, 'hello');

    const logger = createCliLogger({ quiet: true });
    await expect(
      resolveProjectContext({ args: [], root: filePath }, logger, 'production')
    ).rejects.toThrow('Project root path is not a directory');
  });
});
