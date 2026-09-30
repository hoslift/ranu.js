import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Normalizes any filesystem path to POSIX format (forward slashes).
 */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Checks if a target path is safely within the expected base directory.
 * Prevents directory traversal attacks (e.g. `../../etc`).
 */
export function isPathContained(targetPath: string, basePath: string): boolean {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedBase = path.resolve(basePath);
  const relative = path.relative(resolvedBase, resolvedTarget);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Validates that a path is safe for recursive deletion.
 * Protects against accidental or malicious deletion of filesystem roots,
 * user home directories, project source files, or arbitrary system paths.
 * Deletions are strictly authorized only within `.ranu` directories or
 * dedicated temporary test/build subdirectories.
 */
export function assertSafeDeletePath(targetPath: string): void {
  if (!targetPath || typeof targetPath !== 'string' || targetPath.trim() === '') {
    throw new Error('Refusing to delete invalid path: target path must be a non-empty string.');
  }

  const resolved = path.resolve(targetPath);

  // 1. Filesystem root check (/ on POSIX, C:\ on Windows)
  const parsed = path.parse(resolved);
  if (resolved === parsed.root) {
    throw new Error(`Refusing to delete filesystem root directory: "${resolved}".`);
  }

  // 2. User home directory check
  const home = path.resolve(os.homedir());
  if (resolved === home) {
    throw new Error(`Refusing to delete user home directory: "${resolved}".`);
  }

  // 3. System temp directory itself check (do not wipe entire /tmp or Temp)
  const tmp = path.resolve(os.tmpdir());
  if (resolved === tmp) {
    throw new Error(`Refusing to delete system temporary directory itself: "${resolved}".`);
  }

  // 4. Must contain an exact '.ranu' directory segment OR be inside system temporary directory
  const normalized = path.normalize(resolved);
  const segments = normalized.split(/[\\/]/);
  const isInsideRanu = segments.includes('.ranu');
  const isInsideTmp = isPathContained(resolved, tmp);

  if (!isInsideRanu && !isInsideTmp) {
    throw new Error(
      `Refusing to delete unauthorized path "${resolved}". Deletion is strictly restricted to .ranu or temporary build directories.`,
    );
  }
}

/**
 * Safe JSON serializer with deterministic 2-space indentation and trailing newline.
 */
export function formatJson(data: any): string {
  return JSON.stringify(data, null, 2) + '\n';
}

/**
 * Atomically promotes a temporary build directory to the final destination.
 * If final directory exists, it is safely replaced after containment authorization.
 */
export function promoteBuildArtifacts(tempDir: string, finalDir: string): void {
  // Ensure parent directory exists (.ranu/)
  const parentDir = path.dirname(finalDir);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  // If finalDir exists, remove it after verifying path safety
  if (fs.existsSync(finalDir)) {
    assertSafeDeletePath(finalDir);
    fs.rmSync(finalDir, { recursive: true, force: true });
  }

  // Rename tempDir to finalDir
  fs.renameSync(tempDir, finalDir);
}

/**
 * Cleans up temporary build directory on error or cancellation.
 */
export function cleanupTempArtifacts(tempDir: string): void {
  if (fs.existsSync(tempDir)) {
    try {
      assertSafeDeletePath(tempDir);
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (err: unknown) {
      if (err instanceof Error && err.message.startsWith('Refusing to delete')) {
        throw err;
      }
      // Ignore cleanup I/O error
    }
  }
}

