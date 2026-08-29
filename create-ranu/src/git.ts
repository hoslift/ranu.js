import childProcess from 'node:child_process';

/**
 * Checks whether git CLI is available on PATH.
 */
export function isGitInstalled(): boolean {
  try {
    childProcess.execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks whether the target directory is already part of an existing Git repository.
 */
export function isInsideGitWorkTree(targetDir: string): boolean {
  try {
    childProcess.execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: targetDir,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Initializes a new Git repository in the target directory if git is available and not already initialized.
 *
 * @param targetDir - Directory to initialize repository in.
 * @returns Whether Git initialization succeeded.
 */
export function initGit(targetDir: string): boolean {
  try {
    if (!isGitInstalled()) {
      return false;
    }
    if (isInsideGitWorkTree(targetDir)) {
      return false;
    }
    childProcess.execFileSync('git', ['init'], { cwd: targetDir, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
