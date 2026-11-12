#!/usr/bin/env node
/**
 * scripts/issue-triage.mjs
 * Automated Issue Triage, Routing, Contributor Notification, and Assignment Delegation Bot.
 *
 * 1. On New Issue:
 *    - Matches issue content with ecosystem modules (adapters, plugins, integrations, etc.).
 *    - Notifies the module author/maintainer automatically.
 *    - Alerts users if issue contains sensitive security disclosures.
 *
 * 2. On Comment (/assign @username or /approve @username):
 *    - Allows the module author or maintainer to officially delegate/assign the fix to another contributor.
 *    - Applies approval labels and assigns the contributor so their PR is automatically cleared!
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const issueNumber = process.env.ISSUE_NUMBER;
const issueTitle = process.env.ISSUE_TITLE || '';
const issueBody = process.env.ISSUE_BODY || '';
const issueAuthor = process.env.ISSUE_AUTHOR || '';

const commentBody = process.env.COMMENT_BODY || '';
const commentAuthor = process.env.COMMENT_AUTHOR || '';
const commentAuthorAssociation = process.env.COMMENT_AUTHOR_ASSOCIATION || '';

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY || 'hoslift/ranu.js';
const [owner, repoName] = repo.split('/');

console.log(`[issue-triage] Processing Issue #${issueNumber}: "${issueTitle}" by @${issueAuthor}`);

// 1. Build an index of modular ecosystem packages and their authors
const modularDirs = ['adapters', 'plugins', 'integrations', 'templates', 'ai', 'ui', 'tools'];
const packageRegistry = [];

// Index from filesystem package.json files
for (const modDir of modularDirs) {
  const fullModDir = path.join(rootDir, modDir);
  if (!fs.existsSync(fullModDir)) continue;

  const entries = fs.readdirSync(fullModDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name === 'node_modules')
      continue;

    const pkgPath = path.join(fullModDir, entry.name, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkgData = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const authorField = pkgData.author || '';
        let authorHandle = null;

        if (typeof authorField === 'string') {
          const match =
            authorField.match(/github\.com\/([a-zA-Z0-9_-]+)/i) ||
            authorField.match(/@([a-zA-Z0-9_-]+)/);
          if (match) authorHandle = match[1];
        } else if (authorField && typeof authorField === 'object' && authorField.url) {
          const match = authorField.url.match(/github\.com\/([a-zA-Z0-9_-]+)/i);
          if (match) authorHandle = match[1];
        }

        packageRegistry.push({
          name: pkgData.name || entry.name,
          folder: entry.name,
          category: modDir,
          relPath: `${modDir}/${entry.name}`,
          author: authorHandle,
        });
      } catch {
        // ignore unreadable package.json
      }
    }
  }
}

// Index from certified-modules.json
const certifiedPath = path.join(rootDir, '.ecosystem', 'certified-modules.json');
if (fs.existsSync(certifiedPath)) {
  try {
    const certifiedData = JSON.parse(fs.readFileSync(certifiedPath, 'utf8'));
    if (certifiedData.modules) {
      for (const [pkgName, details] of Object.entries(certifiedData.modules)) {
        const existing = packageRegistry.find((p) => p.name === pkgName);
        if (existing && details.maintainer) {
          existing.author = details.maintainer;
        } else if (!existing && details.maintainer) {
          packageRegistry.push({
            name: pkgName,
            folder: pkgName.split('/').pop(),
            category: 'ecosystem',
            relPath: pkgName,
            author: details.maintainer,
          });
        }
      }
    }
  } catch {
    // ignore json read errors
  }
}

// 2. Identify if this issue matches any ecosystem module
const combinedText = `${issueTitle}\n${issueBody}`.toLowerCase();
const matchedModules = packageRegistry.filter((pkg) => {
  const nameMatch = pkg.name && combinedText.includes(pkg.name.toLowerCase());
  const pathMatch = combinedText.includes(pkg.relPath.toLowerCase());
  const folderMatch = combinedText.includes(`${pkg.category}/${pkg.folder}`.toLowerCase());
  return nameMatch || pathMatch || folderMatch;
});

const moduleAuthors = [...new Set(matchedModules.map((m) => m.author).filter(Boolean))];
const trustedRoles = ['OWNER', 'MEMBER', 'COLLABORATOR'];

/**
 * Handle Slash Commands like /assign @username or /verify-payment tx=...
 */
async function handleCommentCommand() {
  // Check for Payment Verification command
  if (commentBody.includes('/verify-payment')) {
    console.log(`[issue-triage] Payment verification command detected in comment.`);
    try {
      const { processPaymentVerification } = await import('./verify-payment.mjs');
      await processPaymentVerification();
      return;
    } catch (payErr) {
      console.error(`[issue-triage] Payment verification error:`, payErr);
      return;
    }
  }

  const assignMatch = commentBody.match(
    /(?:^|\s)\/(?:assign|approve|delegate)\s+@?([a-zA-Z0-9_-]+)/i,
  );
  if (!assignMatch) {
    console.log(
      `[issue-triage] Comment does not contain an assignment or verification command. Exiting.`,
    );
    return;
  }

  const targetUser = assignMatch[1];
  console.log(
    `[issue-triage] Assignment command detected from @${commentAuthor} targeting @${targetUser}`,
  );

  const isModuleAuthor = moduleAuthors.some((a) => a.toLowerCase() === commentAuthor.toLowerCase());
  const isTrustedMaintainer = trustedRoles.includes(commentAuthorAssociation);

  if (!isModuleAuthor && !isTrustedMaintainer) {
    console.warn(`[issue-triage] Unauthorized assignment attempt by @${commentAuthor}`);
    const warningBody = `> ⚠️ **Permission Notice:** Only the module maintainer (${moduleAuthors.map((a) => `@${a}`).join(', ') || '@hoslift'}) or repository maintainers can assign contributors to this issue.`;
    await postIssueComment(warningBody);
    return;
  }

  console.log(`✅ [issue-triage] Assignment authorized. Granting assignment to @${targetUser}...`);

  // 1. Apply labels: 'approved', 'contribution: approved', and 'assigned: @username'
  await addIssueLabels(['approved', 'contribution: approved', `assigned: @${targetUser}`]);

  // 2. Attempt to add assignee via GitHub API
  await assignUserToIssue(targetUser);

  // 3. Post confirmation response
  const authorBadge = isModuleAuthor ? 'Module Maintainer' : 'Maintainer';
  const confirmationBody = `### 🎉 Issue Assignment & Approval

Hello @${targetUser}! 👋

**@${commentAuthor}** (${authorBadge}) has officially approved and assigned you to work on this issue!

#### 🚀 Next Steps:
1. Fork the repository and create your feature/fix branch.
2. Develop the fix and ensure all tests pass cleanly (\`pnpm test\`).
3. If published packages are modified, generate a quick changeset via \`pnpm changeset:quick\`.
4. When opening your Pull Request, include **\`Closes #${issueNumber}\`** in your PR description.

Our automated contributor gate will detect this approval and fast-track your PR without delays!

*Thank you for contributing to the Ranu.js open-source ecosystem!*`;

  await postIssueComment(confirmationBody);
  console.log(`✅ [issue-triage] Assignment comment posted for @${targetUser}.`);
}

/**
 * Handle Initial Issue Creation & Triage
 */
async function handleInitialTriage() {
  const commentsToPost = [];

  // Security Keyword Inspection
  const securityKeywords = [
    'vulnerability',
    'exploit',
    'cve-',
    'rce',
    'sql injection',
    'secret leak',
    'credential leak',
    'security advisory',
  ];
  const isSecuritySensitive = securityKeywords.some((kw) => combinedText.includes(kw));

  if (isSecuritySensitive) {
    commentsToPost.push(
      `> ⚠️ **Security Policy Notice:** If this issue concerns a potential security vulnerability or sensitive credential exposure, please report it privately via [**GitHub Private Vulnerability Reporting**](https://github.com/${owner}/${repoName}/security/advisories/new) in accordance with our [**SECURITY.md**](https://github.com/${owner}/${repoName}/blob/main/SECURITY.md). Public vulnerability reports will be converted to private advisories.`,
    );
  }

  // Notify matched module authors
  for (const module of matchedModules) {
    if (
      module.author &&
      module.author.toLowerCase() !== issueAuthor.toLowerCase() &&
      module.author.toLowerCase() !== 'hoslift'
    ) {
      console.log(`[issue-triage] Matched module ${module.relPath} with author @${module.author}`);
      commentsToPost.push(`### 🔔 Module Notification

Hello @${module.author}! 👋 An issue has been reported regarding **\`${module.name}\`** (\`${module.relPath}\`).

Please review the report when you have a moment. Maintainer @hoslift has also been notified.

> 💡 **Tip for Module Maintainer:** If a community contributor volunteers to fix this issue, you can officially assign and approve them by simply commenting:
> \`/assign @username\``);

      // Attempt to assign the module author
      await assignUserToIssue(module.author);
    }
  }

  if (commentsToPost.length > 0) {
    await postIssueComment(commentsToPost.join('\n\n---\n\n'));
  } else {
    console.log(`ℹ️ [issue-triage] No specific module author to notify.`);
  }
}

// GitHub API Helpers
async function postIssueComment(body) {
  if (!token || !issueNumber) return;
  try {
    await globalThis.fetch(
      `https://api.github.com/repos/${owner}/${repoName}/issues/${issueNumber}/comments`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'issue-triage',
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body }),
      },
    );
  } catch (err) {
    console.error(`[issue-triage] Failed to post comment:`, err.message);
  }
}

async function addIssueLabels(labels) {
  if (!token || !issueNumber) return;
  try {
    await globalThis.fetch(
      `https://api.github.com/repos/${owner}/${repoName}/issues/${issueNumber}/labels`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'issue-triage',
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ labels }),
      },
    );
  } catch (err) {
    console.warn(`[issue-triage] Could not add labels:`, err.message);
  }
}

async function assignUserToIssue(username) {
  if (!token || !issueNumber || !username) return;
  try {
    await globalThis.fetch(
      `https://api.github.com/repos/${owner}/${repoName}/issues/${issueNumber}/assignees`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'issue-triage',
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ assignees: [username] }),
      },
    );
  } catch (err) {
    console.warn(`[issue-triage] Could not assign @${username}:`, err.message);
  }
}

async function main() {
  if (commentBody) {
    await handleCommentCommand();
  } else {
    await handleInitialTriage();
  }
}

main().then(() => {
  console.log(`[issue-triage] Finished.`);
  process.exit(0);
});
