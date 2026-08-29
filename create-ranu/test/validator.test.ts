import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateProjectName, validateTargetDirectory } from '../src/validator.js';

describe('create-ranu validator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-ranu-val-'));
    vi.restoreAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('validateProjectName', () => {
    it('accepts valid npm package names', () => {
      expect(validateProjectName('my-app').valid).toBe(true);
      expect(validateProjectName('my_app_123').valid).toBe(true);
      expect(validateProjectName('ranu-project-v1').valid).toBe(true);
      expect(validateProjectName('app').valid).toBe(true);
    });

    it('rejects empty or whitespace-only names', () => {
      expect(validateProjectName('').valid).toBe(false);
      expect(validateProjectName('   ').valid).toBe(false);
    });

    it('rejects names exceeding 214 characters', () => {
      const longName = 'a'.repeat(215);
      const res = validateProjectName(longName);
      expect(res.valid).toBe(false);
      expect(res.errors[0]).toContain('more than 214 characters');
    });

    it('rejects uppercase letters', () => {
      const res = validateProjectName('MyApp');
      expect(res.valid).toBe(false);
      expect(res.errors[0]).toContain('cannot contain uppercase letters');
    });

    it('rejects leading dot or underscore', () => {
      expect(validateProjectName('.hidden-app').valid).toBe(false);
      expect(validateProjectName('_private-app').valid).toBe(false);
    });

    it('rejects path separators', () => {
      expect(validateProjectName('path/to/app').valid).toBe(false);
      expect(validateProjectName('path\\to\\app').valid).toBe(false);
    });

    it('rejects reserved Node.js built-in module names', () => {
      expect(validateProjectName('fs').valid).toBe(false);
      expect(validateProjectName('http').valid).toBe(false);
      expect(validateProjectName('crypto').valid).toBe(false);
      expect(validateProjectName('events').valid).toBe(false);
      expect(validateProjectName('path').valid).toBe(false);
    });

    it('rejects invalid characters', () => {
      expect(validateProjectName('my app').valid).toBe(false);
      expect(validateProjectName('my@app!').valid).toBe(false);
      expect(validateProjectName('app#1').valid).toBe(false);
    });
  });

  describe('validateTargetDirectory', () => {
    it('rejects empty or whitespace-only paths', () => {
      const res1 = validateTargetDirectory('');
      expect(res1.valid).toBe(false);
      expect(res1.error).toContain('Target directory path cannot be empty.');

      const res2 = validateTargetDirectory('   ');
      expect(res2.valid).toBe(false);
      expect(res2.error).toContain('Target directory path cannot be empty.');
    });

    it('accepts non-existent directory within allowed paths', () => {
      const target = path.join(tempDir, 'new-app');
      const res = validateTargetDirectory(target);
      expect(res.valid).toBe(true);
      expect(res.resolvedPath).toBe(path.resolve(target));
    });

    it('accepts existing empty directory', () => {
      const emptySub = path.join(tempDir, 'empty-sub');
      fs.mkdirSync(emptySub, { recursive: true });
      const res = validateTargetDirectory(emptySub);
      expect(res.valid).toBe(true);
    });

    it('rejects system root directory', () => {
      const rootDir = path.parse(tempDir).root;
      const res = validateTargetDirectory(rootDir);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Cannot create project directly at system root');
    });

    it('rejects user home directory', () => {
      const homeDir = os.homedir();
      const res = validateTargetDirectory(homeDir);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Cannot create project directly in user home directory');
    });

    it('rejects existing non-empty directory without force', () => {
      const nonEmpty = path.join(tempDir, 'non-empty');
      fs.mkdirSync(nonEmpty, { recursive: true });
      fs.writeFileSync(path.join(nonEmpty, 'existing.txt'), 'hello');

      const res = validateTargetDirectory(nonEmpty, { force: false });
      expect(res.valid).toBe(false);
      expect(res.error).toContain('already exists and is not empty. Use --force to proceed.');
    });

    it('accepts existing non-empty directory with force', () => {
      const nonEmpty = path.join(tempDir, 'non-empty-forced');
      fs.mkdirSync(nonEmpty, { recursive: true });
      fs.writeFileSync(path.join(nonEmpty, 'existing.txt'), 'hello');

      const res = validateTargetDirectory(nonEmpty, { force: true });
      expect(res.valid).toBe(true);
    });

    it('rejects if target path is a regular file', () => {
      const filePath = path.join(tempDir, 'regular-file.txt');
      fs.writeFileSync(filePath, 'content');

      const res = validateTargetDirectory(filePath);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('already exists and is not a directory');
    });

    it('handles filesystem inspection errors gracefully on stat and readdir', () => {
      const target = path.join(tempDir, 'fs-error-app');
      fs.mkdirSync(target, { recursive: true });

      vi.spyOn(fs, 'statSync').mockImplementationOnce(() => {
        throw new Error('EPERM: operation not permitted');
      });

      const res1 = validateTargetDirectory(target);
      expect(res1.valid).toBe(false);
      expect(res1.error).toContain('Failed to inspect target path');
      expect(res1.error).toContain('operation not permitted');

      vi.spyOn(fs, 'readdirSync').mockImplementationOnce(() => {
        throw new Error('EACCES: permission denied');
      });

      const res2 = validateTargetDirectory(target);
      expect(res2.valid).toBe(false);
      expect(res2.error).toContain('Failed to inspect target path');
      expect(res2.error).toContain('permission denied');

      vi.spyOn(fs, 'readdirSync').mockImplementationOnce(() => {
        throw 'Generic raw string failure';
      });

      const res3 = validateTargetDirectory(target);
      expect(res3.valid).toBe(false);
      expect(res3.error).toContain('Generic raw string failure');
    });
  });
});
