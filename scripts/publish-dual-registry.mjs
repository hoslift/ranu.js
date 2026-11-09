#!/usr/bin/env node
/**
 * scripts/publish-dual-registry.mjs
 * Production Idempotent Dual-Registry Publisher for npmjs.com and GitHub Packages.
 * 
 * Supports:
 * - Unified 31-package publishing across npmjs.com (@ranujs/*, create-ranujs) and GitHub Packages (@hoslift/*)
 * - Automatic scope transformation:
 *   - npmjs.com: @ranu/* -> @ranujs/*, with disambiguation (@ranu/core -> @ranujs/core-internal)
 *   - GitHub Packages: @ranujs/* and @ranu/* -> @hoslift/* (@ranujs/core -> @hoslift/ranu, @ranu/core -> @hoslift/core-internal, create-ranujs -> @hoslift/create-ranu)
 * - Dynamic manifest transformation of private packages: sets "private": false for release packages
 * - Full resolution of internal dependencies and workspace:* protocols to concrete versions
 * - Registry publication pre-flight check (idempotency): checks registry HEAD to skip already-published
 *   packages (such as create-ranujs@0.4.0), preventing HTTP 403 errors
 * - Robust in-memory backup and atomic disk restoration in finally blocks and on process signals
 * - Local dry-run simulation mode (--dry-run)
 * - Automated git tagging (package tags via Changesets and root v<version> tag)
 * - Remote git tag push and GitHub Release generation
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const monorepoRoot =
  process.env.MONOREPO_ROOT ||
  (fs.existsSync(path.join(process.cwd(), 'pnpm-workspace.yaml'))
    ? process.cwd()
    : path.resolve(__dirname, '..'));

const isDryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';

// In-memory backup map: manifestPath -> originalContent string
const manifestBackups = new Map();
let isRestored = false;

/**
 * Recursively find all package.json files for unified workspace packages
 */
function getWorkspacePackageManifests(dir) {
  const manifests = [];
  const searchDirs = ['packages/ranu', 'adapters', 'ai', 'create-ranu'];

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

/**
 * Filter manifests to strictly include the 31 unified packages from .changeset/config.json
 */
function getUnifiedPackageManifests(dir) {
  const allManifests = getWorkspacePackageManifests(dir);
  const changesetConfigPath = path.join(dir, '.changeset', 'config.json');

  if (fs.existsSync(changesetConfigPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(changesetConfigPath, 'utf-8'));
      const unifiedNames = new Set(config.fixed?.[0] || []);
      if (unifiedNames.size > 0) {
        return allManifests.filter((m) => {
          const pkg = JSON.parse(fs.readFileSync(m, 'utf-8'));
          return unifiedNames.has(pkg.name);
        });
      }
    } catch {
      // Fallback to allManifests if config.json parsing fails
    }
  }
  return allManifests;
}

/**
 * Take an in-memory snapshot of all manifests before any transformation
 */
function backupManifests(manifestPaths) {
  manifestBackups.clear();
  for (const p of manifestPaths) {
    manifestBackups.set(p, fs.readFileSync(p, 'utf-8'));
  }
}

/**
 * Restore all manifests to their exact original state from memory
 */
function restoreManifests() {
  if (manifestBackups.size === 0) return;
  console.log(`\n🧹 [publish-dual-registry] Restoring original workspace manifests...`);
  for (const [manifestPath, originalContent] of manifestBackups.entries()) {
    try {
      fs.writeFileSync(manifestPath, originalContent, 'utf-8');
    } catch (err) {
      console.error(`❌ Failed to restore manifest: ${manifestPath}`, err.message);
    }
  }
  console.log(`✅ [publish-dual-registry] All manifests restored cleanly.`);
}

/**
 * Map package name for npmjs.com
 * Handles @ranu/* -> @ranujs/* and disambiguates @ranu/core -> @ranujs/core-internal
 */
function mapPackageNameForNpmjs(rawName) {
  if (rawName === 'create-ranujs') return 'create-ranujs';
  if (rawName === '@ranu/core') return '@ranujs/core-internal';
  if (rawName.startsWith('@ranu/')) {
    return `@ranujs/${rawName.slice('@ranu/'.length)}`;
  }
  return rawName; // already @ranujs/*
}

/**
 * Map package name for GitHub Packages (@hoslift/*)
 * Disambiguates @ranujs/core -> @hoslift/ranu, @ranu/core -> @hoslift/core-internal,
 * and create-ranujs -> @hoslift/create-ranu.
 * All 31 unified packages map to unique names under @hoslift/*.
 */
function mapPackageNameForGitHubPackages(rawName) {
  if (rawName === '@ranujs/core') return '@hoslift/ranu';
  if (rawName === '@ranu/core') return '@hoslift/core-internal';
  if (rawName === 'create-ranujs') return '@hoslift/create-ranu';
  if (rawName.startsWith('@ranujs/')) {
    return `@hoslift/${rawName.slice('@ranujs/'.length)}`;
  }
  if (rawName.startsWith('@ranu/')) {
    return `@hoslift/${rawName.slice('@ranu/'.length)}`;
  }
  if (rawName.startsWith('@hoslift/')) {
    return rawName;
  }
  return `@hoslift/${rawName}`;
}

/**
 * Check if a package at a specific version is already live on a registry
 */
async function isPackagePublished(pkgName, version, registry, token) {
  try {
    const encName = pkgName.startsWith('@')
      ? `@${encodeURIComponent(pkgName.slice(1))}`
      : encodeURIComponent(pkgName);
    const url = new URL(`${encName}/${version}`, registry).toString();
    const headers = {};
    if (token && token !== 'dry-run-token') {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(url, { method: 'HEAD', headers });
    return res.status === 200;
  } catch {
    return false;
  }
}

/**
 * Transform dependencies and resolve workspace:* protocols
 */
function transformDependencies(pkg, nameMapper, packageVersions, defaultVersion = '0.4.0') {
  for (const depType of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    if (!pkg[depType]) continue;
    for (const depName of Object.keys(pkg[depType])) {
      const isWorkspaceDep =
        packageVersions.has(depName) ||
        depName.startsWith('@ranu/') ||
        depName.startsWith('@ranujs/') ||
        depName === 'create-ranujs';

      if (!isWorkspaceDep) continue;

      const newDepName = nameMapper(depName);
      let depVersion = pkg[depType][depName];

      // If workspace protocol, resolve to concrete target version
      if (typeof depVersion === 'string' && depVersion.startsWith('workspace:')) {
        const concreteVer = packageVersions.get(depName) || defaultVersion;
        if (depVersion.includes('^')) {
          depVersion = `^${concreteVer}`;
        } else if (depVersion.includes('~')) {
          depVersion = `~${concreteVer}`;
        } else {
          depVersion = concreteVer;
        }
      }

      if (newDepName && newDepName !== depName) {
        pkg[depType][newDepName] = depVersion;
        delete pkg[depType][depName];
      } else {
        pkg[depType][depName] = depVersion;
      }
    }
  }
}

export async function publishMonorepo() {
  console.log(`[publish-dual-registry] Starting dual-registry release execution...`);
  console.log(`[publish-dual-registry] Mode: ${isDryRun ? 'DRY-RUN (Simulated)' : 'PRODUCTION'}`);
  console.log(`[publish-dual-registry] Monorepo Root: ${monorepoRoot}`);

  const allManifestPaths = getUnifiedPackageManifests(monorepoRoot);
  console.log(`[publish-dual-registry] Identified ${allManifestPaths.length} unified release package manifests.`);

  // 1. Snapshot all original manifests into memory
  backupManifests(allManifestPaths);

  // Register graceful exit handlers
  const handleExit = (signal, code) => {
    if (!isRestored) {
      isRestored = true;
      restoreManifests();
    }
    process.exit(code);
  };
  process.once('SIGINT', () => handleExit('SIGINT', 130));
  process.once('SIGTERM', () => handleExit('SIGTERM', 143));
  process.on('uncaughtException', (err) => {
    console.error('\n❌ [publish-dual-registry] Uncaught exception:', err);
    if (!isRestored) {
      isRestored = true;
      restoreManifests();
    }
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('\n❌ [publish-dual-registry] Unhandled rejection:', reason);
    if (!isRestored) {
      isRestored = true;
      restoreManifests();
    }
    process.exit(1);
  });

  // Index package versions
  const packageVersions = new Map();
  let detectedReleaseVersion = '0.4.0';
  for (const manifestPath of allManifestPaths) {
    const pkg = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    packageVersions.set(pkg.name, pkg.version);
    if (pkg.version && pkg.version !== '0.0.0') {
      detectedReleaseVersion = pkg.version;
    }
  }

  try {
    // ============================================================
    // Step 1: Target Registry 1 - npmjs.com
    // ============================================================
    console.log(`\n============================================================`);
    console.log(`🚀 Step 1: Target Registry: NPMJS.COM -> https://registry.npmjs.org/`);
    console.log(`   Scope: Canonical (@ranujs/*, create-ranujs)`);
    console.log(`   Provenance: Sigstore OIDC Enabled`);
    console.log(`============================================================`);

    const npmToken = process.env.NPM_TOKEN || process.env.NODE_AUTH_TOKEN;
    if (!npmToken && !isDryRun) {
      throw new Error(`Missing required authentication token in environment variable: NPM_TOKEN`);
    }

    console.log(`[publish-dual-registry] Transforming manifests for npmjs.com publication...`);
    let npmSkipCount = 0;
    let npmPublishCount = 0;

    for (const manifestPath of allManifestPaths) {
      const originalContent = manifestBackups.get(manifestPath);
      const pkg = JSON.parse(originalContent);

      const transformedName = mapPackageNameForNpmjs(pkg.name);
      pkg.name = transformedName;

      // Transform internal dependencies
      transformDependencies(pkg, mapPackageNameForNpmjs, packageVersions, detectedReleaseVersion);

      // Pre-flight idempotency check: check if already published
      const alreadyPublished = await isPackagePublished(
        transformedName,
        pkg.version,
        'https://registry.npmjs.org/',
        npmToken
      );

      if (alreadyPublished) {
        console.log(`ℹ️ [publish-dual-registry] ${transformedName}@${pkg.version} is already published on npmjs.com. Marking private to skip.`);
        pkg.private = true;
        npmSkipCount++;
      } else {
        // Expose package for public publishing
        pkg.private = false;
        pkg.publishConfig = {
          ...pkg.publishConfig,
          access: 'public',
        };
        console.log(`📦 [publish-dual-registry] Ready to publish: ${transformedName}@${pkg.version}`);
        npmPublishCount++;
      }

      fs.writeFileSync(manifestPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
    }

    console.log(`[publish-dual-registry] npmjs.com summary: ${npmPublishCount} to publish, ${npmSkipCount} skipped (already published).`);

    const npmFlags = [
      '-r',
      'publish',
      '--access public',
      '--no-git-checks',
      '--registry https://registry.npmjs.org/',
      '--@ranujs:registry=https://registry.npmjs.org/',
      isDryRun ? '--dry-run' : '',
    ].filter(Boolean).join(' ');

    const npmEnv = {
      ...process.env,
      NODE_AUTH_TOKEN: npmToken || 'dry-run-token',
      NPM_TOKEN: npmToken || 'dry-run-token',
      NPM_CONFIG__RANUJS_REGISTRY: 'https://registry.npmjs.org/',
      npm_config__ranujs_registry: 'https://registry.npmjs.org/',
      NPM_CONFIG_PROVENANCE: isDryRun ? 'false' : 'true',
    };

    if (npmPublishCount > 0) {
      console.log(`[publish-dual-registry] Executing: pnpm ${npmFlags}`);
      execSync(`pnpm ${npmFlags}`, {
        cwd: monorepoRoot,
        stdio: 'inherit',
        env: npmEnv,
      });
      console.log(`✅ [publish-dual-registry] Successfully published/validated to npmjs.com.`);
    } else {
      console.log(`ℹ️ [publish-dual-registry] All packages already published to npmjs.com. Skipping pnpm publish.`);
    }

    // Reset manifests back to clean state before Step 2 transformation
    restoreManifests();

    // ============================================================
    // Step 2: Target Registry 2 - GitHub Packages (npm.pkg.github.com)
    // ============================================================
    console.log(`\n============================================================`);
    console.log(`🚀 Step 2: Target Registry: GITHUB PACKAGES -> https://npm.pkg.github.com/`);
    console.log(`   Owner: @hoslift (Scope transformed to @hoslift/*)`);
    console.log(`   Provenance: Disabled (GitHub Packages constraint)`);
    console.log(`============================================================`);

    const ghToken = process.env.GITHUB_TOKEN || process.env.CHANGESETS_TOKEN || process.env.GH_TOKEN;
    if (!ghToken && !isDryRun) {
      throw new Error(`Missing required authentication token in environment variable: GITHUB_TOKEN`);
    }

    console.log(`[publish-dual-registry] Transforming manifests for GitHub Packages (@hoslift/*)...`);
    let ghSkipCount = 0;
    let ghPublishCount = 0;

    for (const manifestPath of allManifestPaths) {
      const originalContent = manifestBackups.get(manifestPath);
      const pkg = JSON.parse(originalContent);

      const transformedName = mapPackageNameForGitHubPackages(pkg.name);
      pkg.name = transformedName;

      // Transform internal dependencies
      transformDependencies(pkg, mapPackageNameForGitHubPackages, packageVersions, detectedReleaseVersion);

      // Add repository field expected by GitHub Packages
      pkg.repository = pkg.repository || {
        type: 'git',
        url: 'https://github.com/hoslift/ranu.js.git',
      };

      // Pre-flight idempotency check: check if already published on GitHub Packages
      const alreadyPublished = await isPackagePublished(
        transformedName,
        pkg.version,
        'https://npm.pkg.github.com/',
        ghToken
      );

      if (alreadyPublished) {
        console.log(`ℹ️ [publish-dual-registry] ${transformedName}@${pkg.version} is already published on GitHub Packages. Marking private to skip.`);
        pkg.private = true;
        ghSkipCount++;
      } else {
        pkg.private = false;
        pkg.publishConfig = {
          ...pkg.publishConfig,
          access: 'public',
        };
        console.log(`📦 [publish-dual-registry] Ready to publish to GPR: ${transformedName}@${pkg.version}`);
        ghPublishCount++;
      }

      fs.writeFileSync(manifestPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
    }

    console.log(`[publish-dual-registry] GitHub Packages summary: ${ghPublishCount} to publish, ${ghSkipCount} skipped.`);

    const ghEnv = {
      ...process.env,
      NODE_AUTH_TOKEN: ghToken || 'dry-run-token',
      GITHUB_TOKEN: ghToken || 'dry-run-token',
      GH_TOKEN: ghToken || 'dry-run-token',
      NPM_CONFIG__HOSLIFT_REGISTRY: 'https://npm.pkg.github.com/',
      npm_config__hoslift_registry: 'https://npm.pkg.github.com/',
      NPM_CONFIG_PROVENANCE: 'false',
    };

    if (ghPublishCount > 0) {
      if (isDryRun) {
        const ghFlags = [
          '-r',
          '--filter "@hoslift/*"',
          'publish',
          '--access public',
          '--no-git-checks',
          '--registry https://npm.pkg.github.com/',
          '--@hoslift:registry=https://npm.pkg.github.com/',
          '--dry-run',
        ].filter(Boolean).join(' ');

        console.log(`[publish-dual-registry] Executing: pnpm ${ghFlags}`);
        execSync(`pnpm ${ghFlags}`, {
          cwd: monorepoRoot,
          stdio: 'inherit',
          env: ghEnv,
        });
        console.log(`✅ [publish-dual-registry] Successfully validated to GitHub Packages.`);
      } else {
        // In live production mode, publish package-by-package to isolate already-published packages
        console.log(`[publish-dual-registry] Publishing ${ghPublishCount} packages individually to GitHub Packages...`);
        for (const manifestPath of allManifestPaths) {
          const pkg = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          if (pkg.private) continue;

          const pkgDir = path.dirname(manifestPath);
          const publishCmd = `pnpm publish --access public --no-git-checks --registry https://npm.pkg.github.com/ --@hoslift:registry=https://npm.pkg.github.com/`;

          try {
            console.log(`📦 [publish-dual-registry] Publishing ${pkg.name}@${pkg.version}...`);
            execSync(publishCmd, {
              cwd: pkgDir,
              stdio: ['inherit', 'pipe', 'pipe'],
              env: ghEnv,
            });
            console.log(`✅ [publish-dual-registry] Published ${pkg.name}@${pkg.version}`);
          } catch (err) {
            const errOutput = (err.stdout?.toString() || '') + ' ' + (err.stderr?.toString() || '') + ' ' + err.message;
            if (/previously published|already exists|cannot publish over|409 Conflict|403 Forbidden/i.test(errOutput)) {
              console.warn(`⚠️ [publish-dual-registry] ${pkg.name}@${pkg.version} already exists on GitHub Packages. Skipping safely.`);
            } else {
              console.error(`❌ [publish-dual-registry] Failed to publish ${pkg.name}:`, errOutput);
              throw err;
            }
          }
        }
        console.log(`✅ [publish-dual-registry] Successfully published to GitHub Packages.`);
      }
    } else {
      console.log(`ℹ️ [publish-dual-registry] All packages already published to GitHub Packages. Skipping publish.`);
    }

  } catch (err) {
    console.error(`❌ [publish-dual-registry] Publication failed:`, err.message);
    throw err;
  } finally {
    // Guaranteed manifest restoration
    if (!isRestored) {
      isRestored = true;
      restoreManifests();
    }
  }

  // ============================================================
  // Step 3: Git Tagging & Release Generation
  // ============================================================
  if (!isDryRun) {
    console.log(`\n============================================================`);
    console.log(`🏷️ Step 3: Generating Git Release Tags & GitHub Release`);
    console.log(`============================================================`);

    // 1. Changesets package tags
    try {
      console.log(`[publish-dual-registry] Creating package git tags via Changesets...`);
      execSync('pnpm changeset git-tag', {
        cwd: monorepoRoot,
        stdio: 'inherit',
        env: process.env,
      });
      console.log(`✅ [publish-dual-registry] Package release tags generated.`);
    } catch (tagErr) {
      console.warn(`⚠️ [publish-dual-registry] Changeset git-tag warning:`, tagErr.message);
    }

    // 2. Root release tag v<version>
    const rootTag = `v${detectedReleaseVersion}`;
    let tagExists = false;
    try {
      execSync(`git rev-parse -q --verify "refs/tags/${rootTag}"`, {
        cwd: monorepoRoot,
        stdio: 'ignore',
      });
      tagExists = true;
      console.log(`ℹ️ [publish-dual-registry] Root tag ${rootTag} already exists locally.`);
    } catch {
      tagExists = false;
    }

    if (!tagExists) {
      console.log(`[publish-dual-registry] Creating annotated root tag ${rootTag}...`);
      execSync(`git tag -a ${rootTag} -m "Release ${rootTag}"`, {
        cwd: monorepoRoot,
        stdio: 'inherit',
        env: process.env,
      });
      console.log(`✅ [publish-dual-registry] Created root release tag ${rootTag}.`);
    }

    // 3. Push tags to origin
    console.log(`[publish-dual-registry] Pushing tags to remote origin...`);
    try {
      execSync('git push origin --tags', {
        cwd: monorepoRoot,
        stdio: 'inherit',
        env: process.env,
      });
      console.log(`✅ [publish-dual-registry] All git tags pushed to origin.`);
    } catch (pushErr) {
      console.error(`❌ [publish-dual-registry] Failed to push git tags:`, pushErr.message);
      throw pushErr;
    }

    // 4. Create GitHub Release
    const ghAuthToken = process.env.GITHUB_TOKEN || process.env.CHANGESETS_TOKEN || process.env.GH_TOKEN;
    console.log(`[publish-dual-registry] Creating GitHub Release for ${rootTag}...`);
    try {
      let releaseExists = false;
      try {
        execSync(`gh release view ${rootTag}`, {
          cwd: monorepoRoot,
          stdio: 'ignore',
          env: { ...process.env, GH_TOKEN: ghAuthToken, GITHUB_TOKEN: ghAuthToken },
        });
        releaseExists = true;
        console.log(`ℹ️ [publish-dual-registry] GitHub Release ${rootTag} already exists.`);
      } catch {
        releaseExists = false;
      }

      if (!releaseExists) {
        // Extract release notes from packages/ranu/CHANGELOG.md
        const changelogPath = path.join(monorepoRoot, 'packages', 'ranu', 'CHANGELOG.md');
        let releaseNotes = '';
        if (fs.existsSync(changelogPath)) {
          const changelog = fs.readFileSync(changelogPath, 'utf8');
          const escapedVer = detectedReleaseVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const match = changelog.match(
            new RegExp(`(?:^|\\r?\\n)##\\s*\\[?${escapedVer}\\]?[^\\r\\n]*\\r?\\n([\\s\\S]*?)(?=\\r?\\n##\\s|$)`)
          );
          if (match && match[1]) {
            releaseNotes = match[1].trim();
          }
        }

        const releaseBody = releaseNotes
          ? `# Ranu.js ${rootTag} (Public Alpha)\n\n${releaseNotes}`
          : `# Ranu.js ${rootTag} (Public Alpha)\n\nRelease ${rootTag} across all 31 unified packages.`;

        const tempNotesFile = path.join(monorepoRoot, `.release-notes-${rootTag}.md`);
        fs.writeFileSync(tempNotesFile, releaseBody, 'utf8');

        try {
          execSync(`gh release create ${rootTag} --title "${rootTag}" --notes-file "${tempNotesFile}"`, {
            cwd: monorepoRoot,
            stdio: 'inherit',
            env: { ...process.env, GH_TOKEN: ghAuthToken, GITHUB_TOKEN: ghAuthToken },
          });
          console.log(`✅ [publish-dual-registry] GitHub Release ${rootTag} created successfully.`);
        } finally {
          if (fs.existsSync(tempNotesFile)) {
            try {
              fs.unlinkSync(tempNotesFile);
            } catch { /* ignore cleanup errors */ }
          }
        }
      }
    } catch (relErr) {
      console.error(`❌ [publish-dual-registry] GitHub Release creation failed:`, relErr.message);
      throw relErr;
    }
  } else {
    console.log(`\n============================================================`);
    console.log(`🏷️ Step 3: Git Tagging & GitHub Release (DRY-RUN - Skipped)`);
    console.log(`============================================================`);
  }

  console.log(`\n🎉 [publish-dual-registry] Dual-registry publishing completed successfully across all targets!`);
}

publishMonorepo().catch((err) => {
  console.error(`[publish-dual-registry] Fatal execution error:`, err);
  process.exit(1);
});
