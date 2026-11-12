#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const isCheckMode = process.argv.includes('--check');

// 1. Read canonical version from packages/ranu/package.json
const ranuPkgPath = path.join(rootDir, 'packages', 'ranu', 'package.json');
if (!fs.existsSync(ranuPkgPath)) {
  console.error(`[sync-docs-version] Error: cannot find ${ranuPkgPath}`);
  process.exit(1);
}

const ranuPkg = JSON.parse(fs.readFileSync(ranuPkgPath, 'utf8'));
const version = ranuPkg.version;

if (!version || typeof version !== 'string') {
  console.error('[sync-docs-version] Error: invalid version in packages/ranu/package.json');
  process.exit(1);
}

console.log(`[sync-docs-version] Canonical framework version: v${version}`);

const createRanuPkgPath = path.join(rootDir, 'create-ranu', 'package.json');
if (!fs.existsSync(createRanuPkgPath)) {
  console.error(`[sync-docs-version] Error: cannot find ${createRanuPkgPath}`);
  process.exit(1);
}

const createRanuPkg = JSON.parse(fs.readFileSync(createRanuPkgPath, 'utf8'));
const scaffolderVersion = createRanuPkg.version;

if (!scaffolderVersion || typeof scaffolderVersion !== 'string') {
  console.error('[sync-docs-version] Error: invalid version in create-ranu/package.json');
  process.exit(1);
}

console.log(`[sync-docs-version] Canonical scaffolder version: v${scaffolderVersion}`);

// 2. Define targets and substitution rules
const targets = [
  {
    file: 'packages/ranu/src/index.ts',
    rules: [
      {
        pattern: /export const RANU_VERSION = '[^']+';/,
        replacement: `export const RANU_VERSION = '${version}';`,
        description: 'RANU_VERSION public source constant',
      },
    ],
  },
  {
    file: 'packages/core/src/index.ts',
    rules: [
      {
        pattern: /export const RANU_VERSION = '[^']+';/,
        replacement: `export const RANU_VERSION = '${version}';`,
        description: 'RANU_VERSION foundational constant',
      },
    ],
  },
  {
    file: 'create-ranu/src/index.ts',
    rules: [
      {
        pattern: /export const SCAFFOLDER_VERSION = '[^']+';/,
        replacement: `export const SCAFFOLDER_VERSION = '${scaffolderVersion}';`,
        description: 'SCAFFOLDER_VERSION public source constant',
      },
    ],
  },
  {
    file: 'README.md',
    rules: [
      {
        pattern: /Public Alpha \(v[0-9]+\.[0-9]+\.[0-9]+[^)]*\)/g,
        replacement: `Public Alpha (v${version})`,
        description: 'Public Alpha (v...) badges and notes',
      },
    ],
  },
  {
    file: 'packages/ranu/README.md',
    rules: [
      {
        pattern: /Public Alpha \(v[0-9]+\.[0-9]+\.[0-9]+[^)]*\)/g,
        replacement: `Public Alpha (v${version})`,
        description: 'Public Alpha (v...) badges and notes',
      },
    ],
  },
  {
    file: 'create-ranu/README.md',
    rules: [
      {
        pattern: /Public Alpha \(v[0-9]+\.[0-9]+\.[0-9]+[^)]*\)/g,
        replacement: `Public Alpha (v${version})`,
        description: 'Public Alpha (v...) badges and notes',
      },
    ],
  },

  {
    file: 'ROADMAP.md',
    rules: [
      {
        pattern: />\s*\*\*Status:\*\*\s*Public Alpha \(v[0-9]+\.[0-9]+\.[0-9]+[^)]*\)/g,
        replacement: `> **Status:** Public Alpha (v${version})`,
        description: 'ROADMAP status banner',
      },
    ],
  },
  {
    file: 'SECURITY.md',
    rules: [
      {
        pattern: /\|\s*[0-9]+\.[0-9]+\.[0-9]+\s*\(Public Alpha\)\s*\|/g,
        replacement: `| ${version} (Public Alpha) |`,
        description: 'Supported version table row',
      },
      {
        pattern: /<\s*[0-9]+\.[0-9]+\.[0-9]+/g,
        replacement: `< ${version}`,
        description: 'Unsupported prior version table row',
      },
      {
        pattern: /public alpha development \(v[0-9]+\.[0-9]+\.[0-9]+[^)]*\)/gi,
        replacement: (match) => {
          return match.startsWith('P')
            ? `Public Alpha development (v${version})`
            : `public alpha development (v${version})`;
        },
        description: 'Public alpha development version notes',
      },
    ],
  },
  {
    file: 'CONTRIBUTING.md',
    rules: [
      {
        pattern: /public alpha development \(v[0-9]+\.[0-9]+\.[0-9]+[^)]*\)/gi,
        replacement: (match) => {
          return match.startsWith('P')
            ? `Public Alpha development (v${version})`
            : `public alpha development (v${version})`;
        },
        description: 'CONTRIBUTING early development note',
      },
    ],
  },
  {
    file: 'AGENT.md',
    rules: [
      {
        pattern: /current release:\s*`v[0-9]+\.[0-9]+\.[0-9]+[^`]*`/g,
        replacement: `current release: \`v${version}\``,
        description: 'AGENT.md current release version banner',
      },
    ],
  },
  {
    file: 'skills/ranu-architect/SKILL.md',
    rules: [
      {
        pattern: /current release:\s*`v[0-9]+\.[0-9]+\.[0-9]+[^`]*`/g,
        replacement: `current release: \`v${version}\``,
        description: 'skills/ranu-architect/SKILL.md current release version banner',
      },
    ],
  },
  {
    file: 'test-app/AGENTS.md',
    rules: [
      {
        pattern: /Ranu\.js \(v[0-9]+\.[0-9]+\.[0-9]+[^)]*\)/g,
        replacement: `Ranu.js (v${version})`,
        description: 'test-app/AGENTS.md version banner',
      },
    ],
  },
  {
    file: 'my-ai-app/AGENTS.md',
    rules: [
      {
        pattern: /Ranu\.js \(v[0-9]+\.[0-9]+\.[0-9]+[^)]*\)/g,
        replacement: `Ranu.js (v${version})`,
        description: 'my-ai-app/AGENTS.md version banner',
      },
    ],
  },
  {
    file: 'create-ranu/src/template.ts',
    rules: [
      {
        pattern: /(?:'@ranujs\/core'|@ranujs\/core):\s*'\^[0-9]+\.[0-9]+\.[0-9]+[^']*'/g,
        replacement: `'@ranujs/core': '^${version}'`,
        description: 'create-ranujs scaffold template dependency version',
      },
    ],
  },
];

// Dynamically discover and register markdown targets across all modular ecosystem directories
const modularEcosystemDirs = ['adapters', 'templates', 'plugins', 'integrations', 'ui', 'tools'];
for (const ecoDir of modularEcosystemDirs) {
  const fullEcoDir = path.join(rootDir, ecoDir);
  if (!fs.existsSync(fullEcoDir)) continue;

  const folders = fs.readdirSync(fullEcoDir).filter((f) => {
    return fs.statSync(path.join(fullEcoDir, f)).isDirectory();
  });

  for (const folder of folders) {
    const pkgPath = path.join(fullEcoDir, folder, 'package.json');
    const readmeRelPath = path.join(ecoDir, folder, 'README.md');
    if (fs.existsSync(path.join(rootDir, readmeRelPath))) {
      let targetVersion = version;
      if (fs.existsSync(pkgPath)) {
        try {
          const pkgData = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          if (pkgData.version) targetVersion = pkgData.version;
        } catch {
          // fallback to core version
        }
      }

      targets.push({
        file: readmeRelPath,
        rules: [
          {
            pattern: /Public Alpha \(v[0-9]+\.[0-9]+\.[0-9]+[^)]*\)/g,
            replacement: `Public Alpha (v${targetVersion})`,
            description: `${folder} ${ecoDir} Public Alpha badge`,
          },
        ],
      });
    }
  }
}

let hasDiscrepancy = false;
let updatedFilesCount = 0;

// 3. Automatically synchronize .changeset/config.json with all workspace packages
const changesetConfigPath = path.join(rootDir, '.changeset', 'config.json');
if (fs.existsSync(changesetConfigPath)) {
  try {
    const changesetConfig = JSON.parse(fs.readFileSync(changesetConfigPath, 'utf8'));
    const fixedPackages = new Set(changesetConfig.fixed?.[0] || []);
    let changesetModified = false;

    const workspaceDirs = [
      'packages',
      'adapters',
      'ai',
      'create-ranu',
      'templates',
      'plugins',
      'integrations',
      'ui',
      'tools',
    ];
    for (const wsDir of workspaceDirs) {
      const fullWsDir = path.join(rootDir, wsDir);
      if (!fs.existsSync(fullWsDir)) continue;

      const entries = fs.readdirSync(fullWsDir, { withFileTypes: true });
      for (const entry of entries) {
        let pkgJsonPath = null;
        if (entry.isDirectory()) {
          const nested = path.join(fullWsDir, entry.name, 'package.json');
          if (fs.existsSync(nested)) pkgJsonPath = nested;
        } else if (entry.name === 'package.json') {
          pkgJsonPath = path.join(fullWsDir, 'package.json');
        }

        if (pkgJsonPath) {
          try {
            const pkgData = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
            if (pkgData.name && !fixedPackages.has(pkgData.name)) {
              if (
                !pkgData.name.startsWith('example-') &&
                !pkgData.name.startsWith('fixture-') &&
                pkgData.name !== 'ranu-monorepo' &&
                pkgData.name !== 'test-app' &&
                !pkgData.name.endsWith('-template')
              ) {
                changesetConfig.fixed = changesetConfig.fixed || [[]];
                changesetConfig.fixed[0].push(pkgData.name);
                fixedPackages.add(pkgData.name);
                changesetModified = true;
                console.log(
                  `✓ [CHANGESET SYNC] Auto-registered ${pkgData.name} in .changeset/config.json`,
                );
              }
            }
          } catch {
            // Ignore unreadable package.json
          }
        }
      }
    }

    if (changesetModified) {
      if (isCheckMode) {
        hasDiscrepancy = true;
        console.error(
          '❌ [OUT OF SYNC] .changeset/config.json is missing one or more workspace packages.',
        );
      } else {
        fs.writeFileSync(
          changesetConfigPath,
          JSON.stringify(changesetConfig, null, 2) + '\n',
          'utf8',
        );
        updatedFilesCount++;
        console.log(`✓ [UPDATED] .changeset/config.json synchronized with workspace packages.`);
      }
    }
  } catch (err) {
    console.warn(
      `[sync-docs-version] Warning: failed to check .changeset/config.json:`,
      err.message,
    );
  }
}

/**
 * Extracts top-level change bullet blocks for a specific version from a Changesets CHANGELOG.md.
 */
function extractChangelogBullets(changelogPath, targetVersion) {
  if (!fs.existsSync(changelogPath)) return [];
  const content = fs.readFileSync(changelogPath, 'utf8');
  const escaped = targetVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headingMatch = new RegExp(`^##\\s+${escaped}(?:\\s|$)`, 'm').exec(content);
  if (!headingMatch) return [];

  const rest = content.slice(headingMatch.index + headingMatch[0].length);
  const nextHeadingIdx = rest.search(/^##\s+/m);
  const section = nextHeadingIdx === -1 ? rest : rest.slice(0, nextHeadingIdx);

  const blocks = [];
  let current = [];
  for (const line of section.split(/\r?\n/)) {
    if (/^###\s+/.test(line) || line.trim() === 'No changes in this release.') continue;
    if (/^- /.test(line)) {
      if (current.length > 0) blocks.push(current.join('\n'));
      const cleaned = line.replace(/^- [0-9a-f]{7,12}:\s+/i, '- ');
      current = /Updated dependencies(?:\s+\[|$)/.test(cleaned) ? [] : [cleaned];
    } else if (current.length > 0 && (/^\s+/.test(line) || line.trim() !== '')) {
      current.push(line);
    } else if (current.length > 0 && line.trim() === '') {
      blocks.push(current.join('\n'));
      current = [];
    }
  }
  if (current.length > 0) blocks.push(current.join('\n'));
  return blocks;
}

/**
 * Ensures the root CHANGELOG.md contains an entry for the current canonical framework version.
 * Called automatically during `pnpm version-packages` (Changesets release bot PRs).
 */
function syncRootChangelog() {
  const rootChangelogPath = path.join(rootDir, 'CHANGELOG.md');
  if (!fs.existsSync(rootChangelogPath)) return;

  const original = fs.readFileSync(rootChangelogPath, 'utf8');
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`^##\\s+${escaped}(?:\\s|\\(|$)`, 'm').test(original)) {
    return;
  }

  if (isCheckMode) {
    hasDiscrepancy = true;
    console.error(`❌ [OUT OF SYNC] CHANGELOG.md is missing release notes for v${version}`);
    return;
  }

  const sources = [
    path.join(rootDir, 'packages', 'ranu', 'CHANGELOG.md'),
    path.join(rootDir, 'create-ranu', 'CHANGELOG.md'),
    path.join(rootDir, 'packages', 'cli', 'CHANGELOG.md'),
  ];
  const seen = new Set();
  const bullets = [];
  for (const src of sources) {
    for (const block of extractChangelogBullets(src, version)) {
      const normalized = block.trim();
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        bullets.push(block.trimEnd());
      }
    }
  }

  if (bullets.length === 0) {
    bullets.push(`- Release v${version} across Ranu.js workspace packages.`);
  }

  const newSection = `## ${version} (Public Alpha)\n\n### Changes\n\n${bullets.join('\n')}\n\n`;
  const firstHeading = original.search(/^##\s+/m);
  const updated =
    firstHeading === -1
      ? `${original.trimEnd()}\n\n${newSection}`
      : `${original.slice(0, firstHeading)}${newSection}${original.slice(firstHeading)}`;

  fs.writeFileSync(rootChangelogPath, updated, 'utf8');
  updatedFilesCount++;
  console.log(`✓ [UPDATED] CHANGELOG.md synchronized with v${version}`);
}

syncRootChangelog();

for (const target of targets) {
  const filePath = path.join(rootDir, target.file);
  if (!fs.existsSync(filePath)) {
    console.warn(`[sync-docs-version] Warning: target file not found: ${target.file}`);
    continue;
  }

  const originalContent = fs.readFileSync(filePath, 'utf8');
  let newContent = originalContent;

  for (const rule of target.rules) {
    if (typeof rule.replacement === 'function') {
      newContent = newContent.replace(rule.pattern, rule.replacement);
    } else {
      newContent = newContent.replace(rule.pattern, rule.replacement);
    }
  }

  if (newContent !== originalContent) {
    hasDiscrepancy = true;
    if (isCheckMode) {
      console.error(
        `❌ [OUT OF SYNC] ${target.file} contains outdated version references (expected v${version})`,
      );
    } else {
      fs.writeFileSync(filePath, newContent, 'utf8');
      updatedFilesCount++;
      console.log(`✓ [UPDATED] ${target.file} synchronized to v${version}`);
    }
  }
}

if (isCheckMode) {
  if (hasDiscrepancy) {
    console.error(
      '\n❌ Version check failed! Run "pnpm sync:docs" to synchronize markdown files and templates.',
    );
    process.exit(1);
  } else {
    console.log('✓ All documentation version references are synchronized with ranu@' + version);
    process.exit(0);
  }
} else {
  if (updatedFilesCount === 0) {
    console.log(`✓ All files already up to date with v${version}.`);
  } else {
    console.log(`\n✓ Successfully synchronized ${updatedFilesCount} file(s) to v${version}.`);
  }
}
