#!/usr/bin/env node
/**
 * scripts/publish-dual-registry.mjs
 * Production Idempotent Dual-Registry Publisher for npmjs.com and GitHub Packages.
 * 
 * Supports:
 * - Direct npmjs.com publishing under canonical scopes (@ranujs/*, @ranu/*, create-ranujs)
 * - Sigstore OIDC provenance isolation (enabled on npmjs, disabled on GitHub Packages)
 * - Scope transformation for GitHub Packages: maps @ranujs/* and @ranu/* to @hoslift/*
 * - Automatic exclusion of unscoped packages (create-ranujs) from GitHub Packages
 * - Safe rollback of package.json files even on errors
 * - Local dry-run simulation mode (--dry-run)
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const monorepoRoot = path.resolve(__dirname, '..');

const isDryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';

// Recursively find all package.json files in workspace packages
function getWorkspacePackageManifests(dir) {
  const manifests = [];
  const searchDirs = ['packages', 'adapters', 'ai', 'create-ranu'];

  for (const relDir of searchDirs) {
    const fullDir = path.join(dir, relDir);
    if (!fs.existsSync(fullDir)) continue;

    const entries = fs.readdirSync(fullDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pkgPath = path.join(fullDir, entry.name, 'package.json');
        if (fs.existsSync(pkgPath)) {
          manifests.push(pkgPath);
        }
      } else if (entry.name === 'package.json') {
        manifests.push(path.join(fullDir, 'package.json'));
      }
    }
  }
  return manifests;
}

export async function publishMonorepo() {
  console.log(`[publish-dual-registry] Starting dual-registry release execution...`);
  console.log(`[publish-dual-registry] Mode: ${isDryRun ? 'DRY-RUN (Simulated)' : 'PRODUCTION'}`);
  console.log(`[publish-dual-registry] Monorepo Root: ${monorepoRoot}`);

  // Step 1: Target Registry 1 - npmjs.com
  console.log(`\n============================================================`);
  console.log(`🚀 Step 1: Target Registry: NPMJS.COM -> https://registry.npmjs.org/`);
  console.log(`   Scope: Canonical (@ranujs/*, @ranu/*, create-ranujs)`);
  console.log(`   Provenance: Sigstore OIDC Enabled`);
  console.log(`============================================================`);

  const npmToken = process.env.NPM_TOKEN || process.env.NODE_AUTH_TOKEN;
  if (!npmToken && !isDryRun) {
    throw new Error(`Missing required authentication token in environment variable: NPM_TOKEN`);
  }

  const npmFlags = [
    '-r',
    'publish',
    '--access public',
    '--no-git-checks',
    '--registry https://registry.npmjs.org/',
    '--@ranujs:registry=https://registry.npmjs.org/',
    '--@ranu:registry=https://registry.npmjs.org/',
    isDryRun ? '--dry-run' : '',
  ].filter(Boolean).join(' ');

  const npmEnv = {
    ...process.env,
    NODE_AUTH_TOKEN: npmToken || 'dry-run-token',
    NPM_TOKEN: npmToken || 'dry-run-token',
    NPM_CONFIG__RANUJS_REGISTRY: 'https://registry.npmjs.org/',
    npm_config__ranujs_registry: 'https://registry.npmjs.org/',
    NPM_CONFIG__RANU_REGISTRY: 'https://registry.npmjs.org/',
    npm_config__ranu_registry: 'https://registry.npmjs.org/',
    NPM_CONFIG_PROVENANCE: isDryRun ? 'false' : 'true',
  };

  try {
    console.log(`[publish-dual-registry] Executing: pnpm ${npmFlags}`);
    execSync(`pnpm ${npmFlags}`, {
      cwd: monorepoRoot,
      stdio: 'inherit',
      env: npmEnv,
    });
    console.log(`✅ [publish-dual-registry] Successfully published/validated to npmjs.com.`);
  } catch (err) {
    console.error(`❌ [publish-dual-registry] npmjs.com publication failed:`, err.message);
    throw err;
  }

  // Step 2: Target Registry 2 - GitHub Packages (npm.pkg.github.com)
  console.log(`\n============================================================`);
  console.log(`🚀 Step 2: Target Registry: GITHUB PACKAGES -> https://npm.pkg.github.com/`);
  console.log(`   Owner: @hoslift (Scope transformed to @hoslift/*)`);
  console.log(`   Provenance: Disabled (GitHub Packages constraint)`);
  console.log(`============================================================`);

  const ghToken = process.env.GITHUB_TOKEN || process.env.CHANGESETS_TOKEN;
  if (!ghToken && !isDryRun) {
    throw new Error(`Missing required authentication token in environment variable: GITHUB_TOKEN`);
  }

  const allManifestPaths = getWorkspacePackageManifests(monorepoRoot);
  const backups = new Map();
  const packageVersions = new Map();

  // First pass: index all package versions
  for (const manifestPath of allManifestPaths) {
    const pkg = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    packageVersions.set(pkg.name, pkg.version);
  }

  try {
    console.log(`[publish-dual-registry] Preparing manifest scope transformation to @hoslift/*...`);

    for (const manifestPath of allManifestPaths) {
      const originalContent = fs.readFileSync(manifestPath, 'utf-8');
      const pkg = JSON.parse(originalContent);

      // Skip unscoped packages (create-ranujs) since GitHub Packages rejects unscoped packages
      if (!pkg.name.startsWith('@')) {
        console.log(`ℹ️ [publish-dual-registry] Skipping unscoped package "${pkg.name}" for GitHub Packages.`);
        continue;
      }

      backups.set(manifestPath, originalContent);

      // Transform name to @hoslift/<pkg-suffix>
      const pkgSuffix = pkg.name.replace(/^@(ranujs|ranu)\//, '');
      const transformedName = `@hoslift/${pkgSuffix}`;

      pkg.name = transformedName;

      // Transform internal dependencies if any and resolve workspace:* protocols
      for (const depType of ['dependencies', 'devDependencies', 'peerDependencies']) {
        if (pkg[depType]) {
          for (const depName of Object.keys(pkg[depType])) {
            if (depName.startsWith('@ranujs/') || depName.startsWith('@ranu/')) {
              const depSuffix = depName.replace(/^@(ranujs|ranu)\//, '');
              const newDepName = `@hoslift/${depSuffix}`;
              let depVersion = pkg[depType][depName];

              // If using workspace protocol, resolve to concrete target version
              if (depVersion.startsWith('workspace:')) {
                const concreteVer = packageVersions.get(depName) || '0.0.0';
                if (depVersion.includes('^')) {
                  depVersion = `^${concreteVer}`;
                } else if (depVersion.includes('~')) {
                  depVersion = `~${concreteVer}`;
                } else {
                  depVersion = concreteVer;
                }
              }

              pkg[depType][newDepName] = depVersion;
              delete pkg[depType][depName];
            }
          }
        }
      }

      // Add repository field expected by GitHub Packages
      pkg.repository = pkg.repository || {
        type: 'git',
        url: 'https://github.com/hoslift/ranu.js.git',
      };

      fs.writeFileSync(manifestPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
      console.log(`🔄 [publish-dual-registry] Transformed manifest: ${transformedName} in ${path.relative(monorepoRoot, manifestPath)}`);
    }

    const ghFlags = [
      '-r',
      '--filter "@hoslift/*"',
      'publish',
      '--access public',
      '--no-git-checks',
      '--registry https://npm.pkg.github.com/',
      '--@hoslift:registry=https://npm.pkg.github.com/',
      isDryRun ? '--dry-run' : '',
    ].filter(Boolean).join(' ');

    const ghEnv = {
      ...process.env,
      NODE_AUTH_TOKEN: ghToken || 'dry-run-token',
      GITHUB_TOKEN: ghToken || 'dry-run-token',
      NPM_CONFIG__HOSLIFT_REGISTRY: 'https://npm.pkg.github.com/',
      npm_config__hoslift_registry: 'https://npm.pkg.github.com/',
      NPM_CONFIG_PROVENANCE: 'false',
    };

    console.log(`[publish-dual-registry] Executing: pnpm ${ghFlags}`);
    execSync(`pnpm ${ghFlags}`, {
      cwd: monorepoRoot,
      stdio: 'inherit',
      env: ghEnv,
    });
    console.log(`✅ [publish-dual-registry] Successfully published/validated to GitHub Packages.`);
  } catch (err) {
    console.error(`❌ [publish-dual-registry] GitHub Packages publication failed:`, err.message);
    throw err;
  } finally {
    // Always restore all modified manifests to their original state
    console.log(`\n🧹 [publish-dual-registry] Restoring original workspace manifests...`);
    for (const [manifestPath, originalContent] of backups.entries()) {
      fs.writeFileSync(manifestPath, originalContent, 'utf-8');
    }
    console.log(`✅ [publish-dual-registry] All manifests restored cleanly.`);
  }

  // Step 3: Git Tagging (only in live release mode)
  if (!isDryRun) {
    console.log(`\n============================================================`);
    console.log(`🏷️ Step 3: Generating Git Release Tags & Changesets Event Log`);
    console.log(`============================================================`);
    execSync('pnpm changeset git-tag', {
      cwd: monorepoRoot,
      stdio: 'inherit',
      env: process.env,
    });
    console.log(`✅ [publish-dual-registry] Release tags generated successfully.`);
  }

  console.log(`\n🎉 [publish-dual-registry] Dual-registry publishing completed successfully across all targets!`);
}

publishMonorepo().catch((err) => {
  console.error(`[publish-dual-registry] Fatal execution error:`, err);
  process.exit(1);
});
