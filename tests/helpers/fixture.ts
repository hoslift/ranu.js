import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface FixtureProject {
  projectDir: string;
  cleanup: () => Promise<void>;
}

/**
 * Deep copy directory recursively.
 */
export function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Remove directory with retries on Windows for EBUSY / EPERM file locking.
 */
export async function removeDirWithRetry(dirPath: string, maxRetries = 10): Promise<void> {
  if (!fs.existsSync(dirPath)) return;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true, maxRetries: 3 });
      return;
    } catch (err: any) {
      if (attempt === maxRetries - 1) throw err;
      await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
    }
  }
}

/**
 * Normalize path separators to canonical forward slashes across platforms.
 */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Copy an existing fixture into an isolated temporary project directory.
 */
export async function createTemporaryFixture(
  fixtureName: string,
  rootDir: string,
): Promise<FixtureProject> {
  const sourceFixture = path.join(rootDir, 'fixtures', fixtureName);
  if (!fs.existsSync(sourceFixture)) {
    throw new Error(`Fixture "${fixtureName}" does not exist at ${sourceFixture}`);
  }

  const tempBase = os.tmpdir();
  const id = 'ranu-test-' + Math.random().toString(36).substring(2, 10);
  const projectDir = path.join(tempBase, id);

  copyDirSync(sourceFixture, projectDir);

  return {
    projectDir,
    cleanup: async () => {
      await removeDirWithRetry(projectDir);
    },
  };
}
