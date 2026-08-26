import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { scaffoldProject } from '../src/scaffold.js';
import * as gitModule from '../src/git.js';
import * as pmModule from '../src/package-manager.js';

describe('create-ranu scaffoldProject', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-ranu-scaffold-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('scaffolds a valid, canonical Ranu.js project with all template files', () => {
    const targetDir = path.join(tempDir, 'my-ranu-app');
    const result = scaffoldProject({
      projectPath: targetDir,
      packageManager: 'pnpm',
      quiet: true,
    });

    expect(result.success).toBe(true);
    expect(result.projectName).toBe('my-ranu-app');
    expect(result.packageManager).toBe('pnpm');
    expect(result.projectPath).toBe(path.resolve(targetDir));

    // Verify all canonical files exist
    expect(fs.existsSync(path.join(targetDir, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'ranu.config.ts'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'app', 'layout.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'app', 'page.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'tsconfig.json'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, '.gitignore'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'README.md'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'public', 'robots.txt'))).toBe(true);

    // Verify package.json content
    const pkg = JSON.parse(fs.readFileSync(path.join(targetDir, 'package.json'), 'utf-8'));
    expect(pkg.name).toBe('my-ranu-app');
    expect(pkg.private).toBe(true);
    expect(pkg.type).toBe('module');
    expect(pkg.scripts.dev).toBe('ranu dev');
    expect(pkg.scripts.build).toBe('ranu build');
    expect(pkg.scripts.start).toBe('ranu start');
    expect(pkg.dependencies.ranu).toBeDefined();
    expect(pkg.dependencies.react).toBeDefined();

    // Verify tsconfig.json is valid JSON
    const tsconfig = JSON.parse(fs.readFileSync(path.join(targetDir, 'tsconfig.json'), 'utf-8'));
    expect(tsconfig.compilerOptions.jsx).toBe('react-jsx');
    expect(tsconfig.compilerOptions.strict).toBe(true);

    // Verify README mentions the selected package manager
    const readme = fs.readFileSync(path.join(targetDir, 'README.md'), 'utf-8');
    expect(readme).toContain('pnpm dev');
  });

  it('fails if target directory exists and is non-empty without force', () => {
    const targetDir = path.join(tempDir, 'existing-app');
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'index.html'), 'existing');

    const result = scaffoldProject({
      projectPath: targetDir,
      force: false,
      quiet: true,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('already exists and is not empty');
  });

  it('succeeds on non-empty directory if force is true', () => {
    const targetDir = path.join(tempDir, 'forced-app');
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'existing.txt'), 'content');

    const result = scaffoldProject({
      projectPath: targetDir,
      force: true,
      quiet: true,
    });

    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'existing.txt'))).toBe(true);
  });

  it('fails when project name is invalid', () => {
    const targetDir = path.join(tempDir, 'InvalidName!');
    const result = scaffoldProject({
      projectPath: targetDir,
      quiet: true,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid project name');
  });

  it('handles git initialization when requested', () => {
    const gitSpy = vi.spyOn(gitModule, 'initGit').mockReturnValue(true);

    const targetDir = path.join(tempDir, 'git-app');
    const result = scaffoldProject({
      projectPath: targetDir,
      git: true,
      quiet: true,
    });

    expect(result.success).toBe(true);
    expect(result.gitStatus).toBe('initialized');
    expect(gitSpy).toHaveBeenCalledWith(path.resolve(targetDir));
  });

  it('records gitStatus as failed when git init fails', () => {
    vi.spyOn(gitModule, 'initGit').mockReturnValue(false);

    const targetDir = path.join(tempDir, 'git-fail-app');
    const result = scaffoldProject({
      projectPath: targetDir,
      git: true,
      quiet: true,
    });

    expect(result.success).toBe(true);
    expect(result.gitStatus).toBe('failed');
  });

  it('handles dependency installation when requested', () => {
    const installSpy = vi.spyOn(pmModule, 'runInstall').mockReturnValue(true);

    const targetDir = path.join(tempDir, 'install-app');
    const result = scaffoldProject({
      projectPath: targetDir,
      install: true,
      packageManager: 'pnpm',
      quiet: true,
    });

    expect(result.success).toBe(true);
    expect(result.installStatus).toBe('installed');
    expect(installSpy).toHaveBeenCalledWith('pnpm', path.resolve(targetDir), true);
  });

  it('records installStatus as failed when runInstall returns false', () => {
    vi.spyOn(pmModule, 'runInstall').mockReturnValue(false);

    const targetDir = path.join(tempDir, 'install-fail-app');
    const result = scaffoldProject({
      projectPath: targetDir,
      install: true,
      packageManager: 'npm',
      quiet: true,
    });

    expect(result.success).toBe(true);
    expect(result.installStatus).toBe('failed');
  });
});
