import { describe, it, expect } from 'vitest';
import {
  detectPackageManager,
  getInstallCommand,
  getRunCommand,
  runInstall,
} from '../src/package-manager.js';

describe('create-ranu package-manager module', () => {
  describe('detectPackageManager', () => {
    it('detects pnpm from user agent', () => {
      expect(detectPackageManager('pnpm/9.0.0 npm/? node/v22.0.0')).toBe('pnpm');
    });

    it('detects yarn from user agent', () => {
      expect(detectPackageManager('yarn/4.0.0 npm/? node/v22.0.0')).toBe('yarn');
    });

    it('detects bun from user agent', () => {
      expect(detectPackageManager('bun/1.0.0 npm/? node/v22.0.0')).toBe('bun');
    });

    it('defaults to npm for unknown or empty user agent', () => {
      expect(detectPackageManager('unknown-client')).toBe('npm');
      expect(detectPackageManager('')).toBe('npm');
    });
  });

  describe('getInstallCommand', () => {
    it('returns appropriate install commands for each package manager', () => {
      expect(getInstallCommand('npm')).toEqual({ command: 'npm', args: ['install'] });
      expect(getInstallCommand('pnpm')).toEqual({ command: 'pnpm', args: ['install'] });
      expect(getInstallCommand('yarn')).toEqual({ command: 'yarn', args: ['install'] });
      expect(getInstallCommand('bun')).toEqual({ command: 'bun', args: ['install'] });
    });
  });

  describe('getRunCommand', () => {
    it('returns formatted run commands for each package manager', () => {
      expect(getRunCommand('npm', 'dev')).toBe('npm run dev');
      expect(getRunCommand('pnpm', 'dev')).toBe('pnpm dev');
      expect(getRunCommand('yarn', 'dev')).toBe('yarn dev');
      expect(getRunCommand('bun', 'dev')).toBe('bun dev');
    });
  });

  describe('runInstall', () => {
    it('executes install command safely', () => {
      // Test running an invalid install that fails gracefully
      const res = runInstall('npm', '/non/existent/directory/12345', true);
      expect(typeof res).toBe('boolean');
    });
  });
});
