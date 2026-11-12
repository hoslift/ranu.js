#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const summary = args[0] || process.env.CHANGESET_MESSAGE || 'Ecosystem update and template release';
const bumpType = (args[1] || 'patch').toLowerCase();

if (!['patch', 'minor', 'major'].includes(bumpType)) {
  console.error(`Invalid bump type: "${bumpType}". Must be "patch", "minor", or "major".`);
  process.exit(1);
}

const changesetConfigPath = path.join(rootDir, '.changeset', 'config.json');
if (!fs.existsSync(changesetConfigPath)) {
  console.error(`Cannot find .changeset/config.json at ${changesetConfigPath}`);
  process.exit(1);
}

const changesetConfig = JSON.parse(fs.readFileSync(changesetConfigPath, 'utf8'));
const fixedPackages = changesetConfig.fixed?.[0] || ['@ranujs/core', 'create-ranujs'];

const headerLines = fixedPackages.map((pkg) => `"${pkg}": ${bumpType}`).join('\n');
const content = `---
${headerLines}
---

${summary}
`;

const id = crypto.randomBytes(4).toString('hex');
const filename = `changeset-${id}.md`;
const filePath = path.join(rootDir, '.changeset', filename);

fs.writeFileSync(filePath, content, 'utf8');
console.log(`✅ [create-changeset] Created new ${bumpType} changeset: .changeset/${filename}`);
console.log(`   Summary: "${summary}"`);
