import { execSync } from 'node:child_process';
import type { PackageManager } from './types.js';

/**
 * Detects the package manager used to invoke create-ranu from environment or user-agent.
 *
 * @param userAgent - Optional user agent string (defaults to process.env.npm_config_user_agent).
 * @returns Detected PackageManager ('npm', 'pnpm', 'yarn', or 'bun').
 */
export function detectPackageManager(userAgent?: string): PackageManager {
  const ua = userAgent ?? process.env.npm_config_user_agent ?? '';

  if (ua.startsWith('pnpm')) {
    return 'pnpm';
  }
  if (ua.startsWith('yarn')) {
    return 'yarn';
  }
  if (ua.startsWith('bun')) {
    return 'bun';
  }
  return 'npm';
}

/**
 * Returns command and arguments for dependency installation using the given package manager.
 *
 * @param pm - Package manager to use.
 * @returns Command name and argument list.
 */
export function getInstallCommand(pm: PackageManager): { command: string; args: string[] } {
  switch (pm) {
    case 'pnpm':
      return { command: 'pnpm', args: ['install'] };
    case 'yarn':
      return { command: 'yarn', args: ['install'] };
    case 'bun':
      return { command: 'bun', args: ['install'] };
    case 'npm':
    default:
      return { command: 'npm', args: ['install'] };
  }
}

/**
 * Executes dependency installation using the given package manager.
 *
 * @param pm - Package manager to use.
 * @param projectPath - Destination directory.
 * @param quiet - Whether to suppress stdout.
 * @returns Whether installation succeeded.
 */
export function runInstall(pm: PackageManager, projectPath: string, quiet?: boolean): boolean {
  try {
    const { command, args } = getInstallCommand(pm);
    execSync(`${command} ${args.join(' ')}`, {
      cwd: projectPath,
      stdio: quiet ? 'ignore' : 'inherit',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns formatted execution string for a package script using the given package manager.
 *
 * @param pm - Package manager to use.
 * @param script - Script name (e.g. 'dev', 'build', 'start').
 * @returns Formatted command string (e.g. 'pnpm dev' or 'npm run dev').
 */
export function getRunCommand(pm: PackageManager, script: string): string {
  switch (pm) {
    case 'pnpm':
      return `pnpm ${script}`;
    case 'yarn':
      return `yarn ${script}`;
    case 'bun':
      return `bun ${script}`;
    case 'npm':
    default:
      return `npm run ${script}`;
  }
}
