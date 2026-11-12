#!/usr/bin/env node
/**
 * scripts/verify-badges.mjs
 * Tamper-Proof Badge Verification & Automated Release Badge Injector.
 *
 * Enforces:
 * 1. Anti-Fraud CI Guard: Blocks PRs claiming unauthorized "Sponsored Partner" or "Certified" tiers.
 * 2. Automated Badge Generator: Provides canonical, tamper-proof badge markup for release publishing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const registryPath = path.join(rootDir, '.ecosystem', 'certified-modules.json');
if (!fs.existsSync(registryPath)) {
  console.error(`❌ [verify-badges] Registry file missing at ${registryPath}`);
  process.exit(1);
}

const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const certifiedModules = registry.modules || {};

export const BADGE_DEFINITIONS = {
  'community-free':
    '[![Ranu Ecosystem: Community Free](https://img.shields.io/badge/Ranu%20Ecosystem-Community%20Free-22c55e?style=flat-square&logo=github)](https://github.com/hoslift/ranu.js)',
  'sponsored-partner':
    '[![Ranu Ecosystem: Sponsored Partner](https://img.shields.io/badge/Ranu%20Ecosystem-Sponsored%20Partner-f59e0b?style=flat-square&logo=githubsponsors)](https://github.com/sponsors/hoslift)',
  unverified:
    '[![Ranu Ecosystem: Pending Review](https://img.shields.io/badge/Ranu%20Ecosystem-Pending%20Review-94a3b8?style=flat-square)](https://github.com/hoslift/ranu.js)',
};

/**
 * Resolves a package entry from certified-modules.json, normalizing
 * prefix discrepancies between @ranu/ and @ranujs/.
 */
export function resolveCertifiedEntry(packageName) {
  if (!packageName) return undefined;
  if (certifiedModules[packageName]) {
    return certifiedModules[packageName];
  }
  if (packageName.startsWith('@ranu/')) {
    const alt = '@ranujs/' + packageName.slice('@ranu/'.length);
    if (certifiedModules[alt]) return certifiedModules[alt];
  }
  if (packageName.startsWith('@ranujs/')) {
    const alt = '@ranu/' + packageName.slice('@ranujs/'.length);
    if (certifiedModules[alt]) return certifiedModules[alt];
  }
  return undefined;
}

/**
 * Returns the authentic badge markdown for a given package name.
 */
export function getAuthenticBadge(packageName) {
  const entry = resolveCertifiedEntry(packageName);
  if (entry && entry.certified) {
    return BADGE_DEFINITIONS[entry.tier] || BADGE_DEFINITIONS['community-free'];
  }
  return BADGE_DEFINITIONS['unverified'];
}

/**
 * Scans all ecosystem modules and verifies badge integrity against registry.
 */
export function verifyAllModuleBadges() {
  console.log(`[verify-badges] Starting Anti-Fraud Ecosystem Badge Audit...`);
  const modularDirs = ['adapters', 'ai', 'plugins', 'integrations', 'ui', 'tools', 'templates'];
  let violationCount = 0;

  // 1. Audit child packages in modular directories
  for (const modDir of modularDirs) {
    const fullModDir = path.join(rootDir, modDir);
    if (!fs.existsSync(fullModDir)) continue;

    const entries = fs.readdirSync(fullModDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name === 'node_modules')
        continue;

      const pkgJsonPath = path.join(fullModDir, entry.name, 'package.json');
      const readmePath = path.join(fullModDir, entry.name, 'README.md');

      if (fs.existsSync(readmePath) && fs.existsSync(pkgJsonPath)) {
        try {
          const pkgData = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
          const readmeContent = fs.readFileSync(readmePath, 'utf8');
          const pkgName = pkgData.name || entry.name;
          const registryEntry = resolveCertifiedEntry(pkgName);

          // Check 1: Does README claim Sponsored Partner badge?
          const claimsSponsored =
            /Sponsored%20Partner|Sponsored/i.test(readmeContent) &&
            /img\.shields\.io/i.test(readmeContent);
          if (claimsSponsored) {
            if (
              !registryEntry ||
              registryEntry.tier !== 'sponsored-partner' ||
              !registryEntry.certified
            ) {
              console.error(
                `❌ [FRAUD DETECTED] Unauthorized "Sponsored Partner" badge found in ${modDir}/${entry.name}/README.md.`,
              );
              console.error(
                `   Package "${pkgName}" is NOT registered as a certified sponsored partner in .ecosystem/certified-modules.json.`,
              );
              violationCount++;
            }
          }
        } catch (err) {
          console.warn(`[verify-badges] Warning reading ${modDir}/${entry.name}:`, err.message);
        }
      }
    }
  }

  // 2. Audit the 6 root meta-package READMEs
  const metaPackages = ['adapters', 'ai', 'integrations', 'templates', 'tools', 'ui'];
  for (const metaDir of metaPackages) {
    const metaPkgJsonPath = path.join(rootDir, metaDir, 'package.json');
    const metaReadmePath = path.join(rootDir, metaDir, 'README.md');

    if (fs.existsSync(metaReadmePath) && fs.existsSync(metaPkgJsonPath)) {
      try {
        const pkgData = JSON.parse(fs.readFileSync(metaPkgJsonPath, 'utf8'));
        const readmeContent = fs.readFileSync(metaReadmePath, 'utf8');
        const pkgName = pkgData.name || `@hoslift/${metaDir}`;
        const registryEntry = resolveCertifiedEntry(pkgName);

        const claimsSponsored =
          /Sponsored%20Partner|Sponsored/i.test(readmeContent) &&
          /img\.shields\.io/i.test(readmeContent);
        if (claimsSponsored) {
          if (
            !registryEntry ||
            registryEntry.tier !== 'sponsored-partner' ||
            !registryEntry.certified
          ) {
            console.error(
              `❌ [FRAUD DETECTED] Unauthorized "Sponsored Partner" badge found in ${metaDir}/README.md.`,
            );
            console.error(
              `   Package "${pkgName}" is NOT registered as a certified sponsored partner in .ecosystem/certified-modules.json.`,
            );
            violationCount++;
          }
        }
      } catch (err) {
        console.warn(`[verify-badges] Warning reading ${metaDir}/README.md:`, err.message);
      }
    }
  }

  if (violationCount > 0) {
    console.error(
      `\n❌ [verify-badges] Audit failed with ${violationCount} badge integrity violation(s).`,
    );
    console.error(
      `   Contributors cannot self-assign certification badges without maintainer approval in .ecosystem/certified-modules.json.`,
    );
    return false;
  }

  console.log(`✅ [verify-badges] All ecosystem module badges are authentic and verified.`);
  return true;
}

// Direct execution CLI support
const isCLI =
  process.argv[1] &&
  (process.argv[1].endsWith('verify-badges.mjs') ||
    path.resolve(process.argv[1]).toLowerCase() === __filename.toLowerCase());

if (isCLI) {
  const isOk = verifyAllModuleBadges();
  process.exit(isOk ? 0 : 1);
}
