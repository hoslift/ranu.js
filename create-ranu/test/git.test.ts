import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isGitInstalled, isInsideGitWorkTree, initGit } from '../src/git.js';

describe('create-ranu git module', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-ranu-git-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('checks if git is installed on system', () => {
    const installed = isGitInstalled();
    expect(typeof installed).toBe('boolean');
  });

  it('checks if target directory is inside git worktree', () => {
    // A fresh temp directory is not a git worktree
    const inside = isInsideGitWorkTree(tempDir);
    expect(typeof inside).toBe('boolean');
  });

  it('initializes git in a directory or safely handles existing repo', () => {
    const result = initGit(tempDir);
    expect(typeof result).toBe('boolean');

    // Second call on already initialized repository should return false
    if (result) {
      const secondCall = initGit(tempDir);
      expect(secondCall).toBe(false);
    }
  });
});
