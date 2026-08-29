/**
 * ci-clean.mjs
 *
 * Cross-platform clean script for CI parity simulation.
 *
 * Removes generated build outputs that can mask failures when running
 * validation from a stale state. Preserves all source code, private
 * directories, and documentation.
 *
 * Safe targets (all are .gitignore-listed generated outputs):
 *   - dist/      in every workspace package
 *   - *.tsbuildinfo  TypeScript incremental build info
 *   - coverage/  test coverage output
 *   - test-results/  Playwright/Vitest HTML reporter output
 *   - playwright-report/
 *   - .ranu/     framework build output directory
 *
 * NEVER removes:
 *   - docs/
 *   - node_modules/
 *   - pnpm-lock.yaml
 *   - src/
 *   - Any source file
 */

import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();

/**
 * Remove a directory if it exists (Node.js built-in — cross-platform).
 */
function removeDir(relPath) {
  const full = path.join(ROOT, relPath);
  if (fs.existsSync(full)) {
    fs.rmSync(full, { recursive: true, force: true });
    console.log(`  removed: ${relPath}/`);
  }
}

/**
 * Recursively remove all *.tsbuildinfo files under a directory,
 * skipping node_modules.
 */
function removeTsbuildinfo(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      removeTsbuildinfo(full);
    } else if (entry.isFile() && entry.name.endsWith('.tsbuildinfo')) {
      fs.rmSync(full, { force: true });
      console.log(`  removed: ${path.relative(ROOT, full)}`);
    }
  }
}

/**
 * Collect all workspace dirs that may contain generated dist/ output.
 * Reads workspace glob roots from pnpm-workspace.yaml (simplified parser).
 */
function getWorkspaceDirs() {
  const workspaceRoots = ['packages', 'adapters', 'create-ranu', 'tooling'];
  const dirs = [];
  for (const root of workspaceRoots) {
    const fullRoot = path.join(ROOT, root);
    if (!fs.existsSync(fullRoot)) continue;
    // 'create-ranu' is itself a workspace member
    if (root === 'create-ranu') {
      dirs.push(root);
      continue;
    }
    const stat = fs.statSync(fullRoot);
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(fullRoot)) {
        const childPath = path.join(fullRoot, child);
        if (fs.statSync(childPath).isDirectory()) {
          dirs.push(path.join(root, child));
        }
      }
    }
  }
  return dirs;
}

console.log('\n=== ranu ci:clean ===\n');

// 1. Remove dist/ in each workspace package directly (no pnpm subprocess needed).
console.log('[1/4] Removing workspace package dist/ directories...');
const workspaceDirs = getWorkspaceDirs();
for (const wsDir of workspaceDirs) {
  removeDir(path.join(wsDir, 'dist'));
}

// 2. Remove TypeScript incremental build cache files.
console.log('[2/4] Removing *.tsbuildinfo files...');
removeTsbuildinfo(ROOT);

// 3. Remove top-level generated test/coverage output directories.
console.log('[3/4] Removing test/coverage output directories...');
removeDir('coverage');
removeDir('test-results');
removeDir('playwright-report');

// 4. Remove the framework build output directory (.ranu/build/).
//    This is the output of `ranu build` / @ranu/build pipeline.
console.log('[4/4] Removing .ranu/ framework build output...');
removeDir('.ranu');

console.log('\n=== ci:clean complete ===\n');
