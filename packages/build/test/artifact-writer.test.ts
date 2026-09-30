import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  normalizePath,
  isPathContained,
  formatJson,
  promoteBuildArtifacts,
  cleanupTempArtifacts,
  assertSafeDeletePath,
} from '../src/output/artifact-writer.js';

describe('artifact-writer', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-artifact-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('normalizes paths to POSIX forward slashes', () => {
    expect(normalizePath('server\\routes\\page-root.mjs')).toBe('server/routes/page-root.mjs');
    expect(normalizePath('manifest/routes.json')).toBe('manifest/routes.json');
  });

  it('detects and prevents path traversal out of base directory', () => {
    const base = path.join(tempDir, 'project', '.ranu', 'build');
    expect(isPathContained(path.join(base, 'server', 'entry.mjs'), base)).toBe(true);
    expect(isPathContained(path.join(base, '..', '..', 'etc', 'passwd'), base)).toBe(false);
    expect(isPathContained('C:\\Windows\\System32', base)).toBe(false);
  });

  it('formats JSON with 2-space indentation and trailing newline', () => {
    const formatted = formatJson({ name: 'ranu', version: '1.0' });
    expect(formatted).toBe('{\n  "name": "ranu",\n  "version": "1.0"\n}\n');
  });

  it('promotes temporary build directory to final destination atomically', () => {
    const stagingDir = path.join(tempDir, '.build_temp_123');
    const finalDir = path.join(tempDir, 'build');

    fs.mkdirSync(stagingDir, { recursive: true });
    fs.writeFileSync(path.join(stagingDir, 'BUILD_ID'), '123\n');

    expect(fs.existsSync(finalDir)).toBe(false);
    promoteBuildArtifacts(stagingDir, finalDir);

    expect(fs.existsSync(finalDir)).toBe(true);
    expect(fs.existsSync(stagingDir)).toBe(false);
    expect(fs.readFileSync(path.join(finalDir, 'BUILD_ID'), 'utf8')).toBe('123\n');
  });

  it('safely overwrites existing final directory during promotion', () => {
    const stagingDir = path.join(tempDir, '.build_temp_456');
    const finalDir = path.join(tempDir, 'build');

    fs.mkdirSync(finalDir, { recursive: true });
    fs.writeFileSync(path.join(finalDir, 'BUILD_ID'), 'old\n');

    fs.mkdirSync(stagingDir, { recursive: true });
    fs.writeFileSync(path.join(stagingDir, 'BUILD_ID'), 'new\n');

    promoteBuildArtifacts(stagingDir, finalDir);
    expect(fs.readFileSync(path.join(finalDir, 'BUILD_ID'), 'utf8')).toBe('new\n');
  });

  it('cleans up temporary staging artifacts', () => {
    const stagingDir = path.join(tempDir, '.build_temp_clean');
    fs.mkdirSync(stagingDir, { recursive: true });
    expect(fs.existsSync(stagingDir)).toBe(true);
    cleanupTempArtifacts(stagingDir);
    expect(fs.existsSync(stagingDir)).toBe(false);
  });

  it('re-throws when cleanupTempArtifacts targets an unsafe deletion path', () => {
    expect(() => cleanupTempArtifacts(os.homedir())).toThrow('Refusing to delete user home directory');
  });

  it('silently ignores cleanup I/O errors when fs.rmSync fails for ordinary errors', () => {
    const stagingDir = path.join(tempDir, '.build_temp_io_err');
    fs.mkdirSync(stagingDir, { recursive: true });
    const spy = vi.spyOn(fs, 'rmSync').mockImplementationOnce(() => {
      throw new Error('EPERM: operation not permitted');
    });
    expect(() => cleanupTempArtifacts(stagingDir)).not.toThrow();
    spy.mockRestore();
  });

  describe('assertSafeDeletePath', () => {
    it('allows valid deletion paths within .ranu and temp folders', () => {
      const validRanu = path.join(tempDir, '.ranu', 'build');
      expect(() => assertSafeDeletePath(validRanu)).not.toThrow();

      const validTemp = path.join(tempDir, 'staging');
      expect(() => assertSafeDeletePath(validTemp)).not.toThrow();
    });

    it('rejects invalid or empty target paths', () => {
      expect(() => assertSafeDeletePath('')).toThrow('Refusing to delete invalid path');
      expect(() => assertSafeDeletePath(null as any)).toThrow('Refusing to delete invalid path');
      expect(() => assertSafeDeletePath('   ')).toThrow('Refusing to delete invalid path');
    });

    it('rejects deletion of filesystem root', () => {
      expect(() => assertSafeDeletePath('/')).toThrow('Refusing to delete filesystem root');
      const rootDrive = path.parse(process.cwd()).root;
      expect(() => assertSafeDeletePath(rootDrive)).toThrow('Refusing to delete filesystem root');
    });

    it('rejects deletion of user home directory', () => {
      expect(() => assertSafeDeletePath(os.homedir())).toThrow('Refusing to delete user home directory');
    });

    it('rejects deletion of system temporary root', () => {
      expect(() => assertSafeDeletePath(os.tmpdir())).toThrow('Refusing to delete system temporary directory itself');
    });

    it('rejects deletion outside allowed boundaries when not in .ranu or temp', () => {
      const outsideDir = path.join(path.parse(process.cwd()).root, 'my-arbitrary-folder');
      expect(() => assertSafeDeletePath(outsideDir)).toThrow('Refusing to delete unauthorized path');

      const pseudoRanu = path.join(path.parse(process.cwd()).root, '.ranu-backup');
      expect(() => assertSafeDeletePath(pseudoRanu)).toThrow('Refusing to delete unauthorized path');

      const ranurc = path.join(path.parse(process.cwd()).root, '.ranurc');
      expect(() => assertSafeDeletePath(ranurc)).toThrow('Refusing to delete unauthorized path');
    });
  });
});
