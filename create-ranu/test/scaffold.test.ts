import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { scaffoldProject } from '../src/scaffold.js';
import * as gitModule from '../src/git.js';
import * as pmModule from '../src/package-manager.js';
import * as validatorModule from '../src/validator.js';

describe('scaffoldProject', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-ranu-scaffold-'));
    vi.restoreAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('scaffolds all project files correctly', () => {
    const dest = path.join(tempDir, 'my-test-app');
    const result = scaffoldProject({
      projectPath: dest,
      packageManager: 'pnpm',
    });

    expect(result.success).toBe(true);
    expect(result.projectName).toBe('my-test-app');
    expect(result.packageManager).toBe('pnpm');
    expect(result.filesCreated).toContain('package.json');
    expect(result.filesCreated).toContain('ranu.config.ts');
    expect(result.filesCreated).toContain('app/layout.tsx');
    expect(result.filesCreated).toContain('app/page.tsx');
    expect(result.filesCreated).toContain('tsconfig.json');
    expect(result.filesCreated).toContain('.gitignore');
    expect(result.filesCreated).toContain('README.md');
    expect(result.filesCreated).toContain('public/robots.txt');

    expect(fs.existsSync(path.join(dest, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(dest, 'app', 'layout.tsx'))).toBe(true);
  });

  it('fails when target directory validation fails', () => {
    const rootDir = path.parse(tempDir).root;
    const result = scaffoldProject({
      projectPath: rootDir,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot create project directly at system root');
  });

  it('handles target directory validation failure with custom projectName and undefined error fallback', () => {
    vi.spyOn(validatorModule, 'validateTargetDirectory').mockReturnValueOnce({
      valid: false,
      resolvedPath: '/invalid/path',
      error: undefined,
    });

    const result = scaffoldProject({
      projectPath: 'bad-dir',
      projectName: 'custom-name',
      packageManager: 'yarn',
    });

    expect(result.success).toBe(false);
    expect(result.projectName).toBe('custom-name');
    expect(result.packageManager).toBe('yarn');
    expect(result.error).toBe('Invalid target directory');
  });

  it('fails when project name validation fails', () => {
    const dest = path.join(tempDir, 'INVALID_NAME_UPPERCASE');
    const result = scaffoldProject({
      projectPath: dest,
      packageManager: 'bun',
    });

    expect(result.success).toBe(false);
    expect(result.packageManager).toBe('bun');
    expect(result.error).toContain('Invalid project name');
  });

  it('uses explicitly passed projectName over directory name', () => {
    const dest = path.join(tempDir, 'dir-name');
    const result = scaffoldProject({
      projectPath: dest,
      projectName: 'custom-app',
      packageManager: 'npm',
    });

    expect(result.success).toBe(true);
    expect(result.projectName).toBe('custom-app');
    const pkgJson = JSON.parse(fs.readFileSync(path.join(dest, 'package.json'), 'utf-8'));
    expect(pkgJson.name).toBe('custom-app');
  });

  it('handles write errors gracefully', () => {
    const dest = path.join(tempDir, 'fail-app');

    vi.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
      throw new Error('EACCES: permission denied');
    });

    const result = scaffoldProject({
      projectPath: dest,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to write template files: EACCES: permission denied');
  });

  it('handles non-Error thrown during template writing', () => {
    const dest = path.join(tempDir, 'string-err-app');

    vi.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
      throw 'Unknown disk error';
    });

    const result = scaffoldProject({
      projectPath: dest,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to write template files: Unknown disk error');
  });

  it('initializes git when git flag is true', () => {
    const dest = path.join(tempDir, 'git-app');
    vi.spyOn(gitModule, 'initGit').mockReturnValueOnce(true);

    const result = scaffoldProject({
      projectPath: dest,
      git: true,
    });

    expect(result.success).toBe(true);
    expect(result.gitStatus).toBe('initialized');
  });

  it('handles git init failure and throws when git flag is true', () => {
    const dest1 = path.join(tempDir, 'git-fail-app-1');
    vi.spyOn(gitModule, 'initGit').mockReturnValueOnce(false);

    const result1 = scaffoldProject({
      projectPath: dest1,
      git: true,
    });

    expect(result1.success).toBe(true);
    expect(result1.gitStatus).toBe('failed');

    const dest2 = path.join(tempDir, 'git-fail-app-2');
    vi.spyOn(gitModule, 'initGit').mockImplementationOnce(() => {
      throw new Error('git crashed');
    });

    const result2 = scaffoldProject({
      projectPath: dest2,
      git: true,
    });

    expect(result2.success).toBe(true);
    expect(result2.gitStatus).toBe('failed');
  });

  it('runs install when install flag is true', () => {
    const dest = path.join(tempDir, 'install-app');
    vi.spyOn(pmModule, 'runInstall').mockReturnValueOnce(true);

    const result = scaffoldProject({
      projectPath: dest,
      install: true,
      quiet: true,
    });

    expect(result.success).toBe(true);
    expect(result.installStatus).toBe('installed');
  });

  it('handles install failure and throws when install flag is true', () => {
    const dest1 = path.join(tempDir, 'install-fail-app-1');
    vi.spyOn(pmModule, 'runInstall').mockReturnValueOnce(false);

    const result1 = scaffoldProject({
      projectPath: dest1,
      install: true,
    });

    expect(result1.success).toBe(true);
    expect(result1.installStatus).toBe('failed');

    const dest2 = path.join(tempDir, 'install-fail-app-2');
    vi.spyOn(pmModule, 'runInstall').mockImplementationOnce(() => {
      throw new Error('npm failed');
    });

    const result2 = scaffoldProject({
      projectPath: dest2,
      install: true,
    });

    expect(result2.success).toBe(true);
    expect(result2.installStatus).toBe('failed');
  });
});
