import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import childProcess from 'node:child_process';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isGitInstalled, isInsideGitWorkTree, initGit } from '../src/git.js';

describe('create-ranu git module', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-ranu-git-'));
    vi.restoreAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('checks if git is installed on system', () => {
    const installed = isGitInstalled();
    expect(typeof installed).toBe('boolean');
  });

  it('returns false when git command fails during isGitInstalled', () => {
    vi.spyOn(childProcess, 'execSync').mockImplementationOnce(() => {
      throw new Error('git not found');
    });
    expect(isGitInstalled()).toBe(false);
  });

  it('checks if target directory is inside git worktree', () => {
    const inside = isInsideGitWorkTree(tempDir);
    expect(typeof inside).toBe('boolean');
  });

  it('returns false when git rev-parse fails in isInsideGitWorkTree', () => {
    vi.spyOn(childProcess, 'execSync').mockImplementationOnce(() => {
      throw new Error('not a git repo');
    });
    expect(isInsideGitWorkTree(tempDir)).toBe(false);
  });

  it('initializes git in a directory or safely handles existing repo', () => {
    const result = initGit(tempDir);
    expect(typeof result).toBe('boolean');

    if (result) {
      const secondCall = initGit(tempDir);
      expect(secondCall).toBe(false);
    }
  });

  it('returns false in initGit if git is not installed', () => {
    vi.spyOn(childProcess, 'execSync').mockImplementation((cmd) => {
      if (String(cmd).includes('--version')) {
        throw new Error('command not found');
      }
      return Buffer.from('');
    });
    expect(initGit(tempDir)).toBe(false);
  });

  it('returns false in initGit if target is already inside git worktree', () => {
    vi.spyOn(childProcess, 'execSync').mockImplementation((cmd) => {
      if (String(cmd).includes('--version')) {
        return Buffer.from('git version 2.0');
      }
      if (String(cmd).includes('--is-inside-work-tree')) {
        return Buffer.from('true');
      }
      return Buffer.from('');
    });
    expect(initGit(tempDir)).toBe(false);
  });

  it('returns false in initGit if git init throws', () => {
    vi.spyOn(childProcess, 'execSync').mockImplementation((cmd) => {
      if (String(cmd).includes('--version')) {
        return Buffer.from('git version 2.0');
      }
      if (String(cmd).includes('--is-inside-work-tree')) {
        throw new Error('not in repo');
      }
      if (String(cmd).includes('git init')) {
        throw new Error('permission denied');
      }
      return Buffer.from('');
    });
    expect(initGit(tempDir)).toBe(false);
  });
});
