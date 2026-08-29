import fs from 'node:fs';
import path from 'node:path';

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
 * Safe JSON serializer with deterministic 2-space indentation and trailing newline.
 */
export function formatJson(data: any): string {
  return JSON.stringify(data, null, 2) + '\n';
}

/**
 * Atomically promotes a temporary build directory to the final destination.
 * If final directory exists, it is safely replaced.
 */
export function promoteBuildArtifacts(tempDir: string, finalDir: string): void {
  // Ensure parent directory exists (.ranu/)
  const parentDir = path.dirname(finalDir);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  // If finalDir exists, remove it
  if (fs.existsSync(finalDir)) {
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
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  }
}
