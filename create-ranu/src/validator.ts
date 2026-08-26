import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { ValidationResult } from './types.js';

const NODE_BUILTIN_MODULES: ReadonlySet<string> = new Set([
  'assert',
  'async_hooks',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'constants',
  'crypto',
  'dgram',
  'diagnostics_channel',
  'dns',
  'domain',
  'events',
  'fs',
  'http',
  'http2',
  'https',
  'inspector',
  'module',
  'net',
  'os',
  'path',
  'perf_hooks',
  'process',
  'punycode',
  'querystring',
  'readline',
  'repl',
  'stream',
  'string_decoder',
  'timers',
  'tls',
  'trace_events',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
  'wasi',
  'worker_threads',
  'zlib',
]);

/**
 * Validates a project name according to npm package naming conventions and framework rules.
 *
 * @param name - The prospective package name.
 * @returns Validation result containing validity flag and error/warning messages.
 */
export function validateProjectName(name: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const trimmed = name.trim();
  if (!trimmed) {
    errors.push('Project name cannot be empty.');
    return { valid: false, errors, warnings };
  }

  if (trimmed.length > 214) {
    errors.push('Project name cannot contain more than 214 characters.');
  }

  if (trimmed !== trimmed.toLowerCase()) {
    errors.push('Project name cannot contain uppercase letters.');
  }

  if (trimmed.startsWith('.') || trimmed.startsWith('_')) {
    errors.push('Project name cannot start with a dot or underscore.');
  }

  if (trimmed.includes('/') || trimmed.includes('\\')) {
    errors.push('Project name cannot contain path separators.');
  }

  if (NODE_BUILTIN_MODULES.has(trimmed.toLowerCase())) {
    errors.push(`Project name "${trimmed}" is a reserved Node.js built-in module name.`);
  }

  // Regex matching valid npm package names (simple or scoped)
  const validNpmPattern = /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
  if (!validNpmPattern.test(trimmed)) {
    errors.push(
      'Project name can only contain lowercase letters, numbers, hyphens, and underscores.'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates target directory safety to prevent destructive overwrites or unsafe paths.
 *
 * @param targetPath - The raw target directory path.
 * @param options - Options including force flag and base working directory.
 * @returns Validation result with resolved absolute path.
 */
export function validateTargetDirectory(
  targetPath: string,
  options: { force?: boolean | undefined; cwd?: string | undefined } = {}
): { valid: boolean; error?: string; resolvedPath: string } {
  const baseCwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const trimmed = targetPath.trim();

  if (!trimmed) {
    return {
      valid: false,
      error: 'Target directory path cannot be empty.',
      resolvedPath: baseCwd,
    };
  }

  const resolvedPath = path.resolve(baseCwd, targetPath);

  // Check if target is root directory
  const parsedRoot = path.parse(resolvedPath).root;
  if (resolvedPath === parsedRoot) {
    return {
      valid: false,
      error: `Cannot create project directly at system root "${resolvedPath}".`,
      resolvedPath,
    };
  }

  // Check if target is user home directory
  const homeDir = os.homedir();
  if (resolvedPath === path.resolve(homeDir)) {
    return {
      valid: false,
      error: `Cannot create project directly in user home directory "${resolvedPath}".`,
      resolvedPath,
    };
  }

  // Check if target directory exists and is non-empty
  try {
    if (fs.existsSync(resolvedPath)) {
      const stat = fs.statSync(resolvedPath);
      if (!stat.isDirectory()) {
        return {
          valid: false,
          error: `Target path "${resolvedPath}" already exists and is not a directory.`,
          resolvedPath,
        };
      }

      const files = fs.readdirSync(resolvedPath);
      if (files.length > 0 && !options.force) {
        return {
          valid: false,
          error: `Target directory "${resolvedPath}" already exists and is not empty. Use --force to proceed.`,
          resolvedPath,
        };
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      error: `Failed to inspect target path "${resolvedPath}": ${msg}`,
      resolvedPath,
    };
  }

  return {
    valid: true,
    resolvedPath,
  };
}
