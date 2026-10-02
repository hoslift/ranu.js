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

// 2. Define targets and substitution rules
const targets = [
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
    file: 'adapters/vercel/README.md',
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
    file: 'create-ranu/src/template.ts',
    rules: [
      {
        pattern: /'ranu': '\^[0-9]+\.[0-9]+\.[0-9]+[^']*'/g,
        replacement: `'ranu': '^${version}'`,
        description: 'create-ranu scaffold template dependency version',
      },
    ],
  },
];

let hasDiscrepancy = false;
let updatedFilesCount = 0;

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
      console.error(`❌ [OUT OF SYNC] ${target.file} contains outdated version references (expected v${version})`);
    } else {
      fs.writeFileSync(filePath, newContent, 'utf8');
      updatedFilesCount++;
      console.log(`✓ [UPDATED] ${target.file} synchronized to v${version}`);
    }
  }
}

if (isCheckMode) {
  if (hasDiscrepancy) {
    console.error('\n❌ Version check failed! Run "pnpm sync:docs" to synchronize markdown files and templates.');
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
