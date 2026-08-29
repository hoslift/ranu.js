import { describe, it, expect } from 'vitest';
import {
  SCAFFOLDER_VERSION,
  scaffoldProject,
  validateProjectName,
  validateTargetDirectory,
  detectPackageManager,
  getInstallCommand,
  getRunCommand,
  generateTemplateFiles,
  initGit,
  isGitInstalled,
  isInsideGitWorkTree,
} from '../src/index.js';

describe('create-ranu index public exports', () => {
  it('exports SCAFFOLDER_VERSION and all expected functions', () => {
    expect(SCAFFOLDER_VERSION).toBe('0.0.0');
    expect(typeof scaffoldProject).toBe('function');
    expect(typeof validateProjectName).toBe('function');
    expect(typeof validateTargetDirectory).toBe('function');
    expect(typeof detectPackageManager).toBe('function');
    expect(typeof getInstallCommand).toBe('function');
    expect(typeof getRunCommand).toBe('function');
    expect(typeof generateTemplateFiles).toBe('function');
    expect(typeof initGit).toBe('function');
    expect(typeof isGitInstalled).toBe('function');
    expect(typeof isInsideGitWorkTree).toBe('function');
  });
});
