#!/usr/bin/env node
/**
 * scripts/module-review-gate.mjs
 * Multi-Tier Review Pipeline for Ecosystem Modules.
 *
 * Flow:
 * 1. External contributor submits a PR modifying an ecosystem module.
 * 2. PR automatically identifies the module owner and requires their review (Tier 1).
 * 3. Module owner approves via GitHub Review button or by commenting "/approve".
 * 4. Once approved by module owner, Hoslift maintainers are notified for final review (Tier 2).
 * 5. Hoslift maintainer reviews and merges (Tier 3).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY || 'hoslift/ranu.js';
const prNumber = process.env.PR_NUMBER;
const prAuthor = process.env.PR_AUTHOR || '';
const commentBody = process.env.COMMENT_BODY || '';
const commentAuthor = process.env.COMMENT_AUTHOR || '';

const [owner, repoName] = repo.split('/');

console.log(`[module-review-gate] Evaluating PR #${prNumber} by @${prAuthor}`);

// 1. Build an index of modular ecosystem packages and their owners
const modularDirs = ['adapters', 'plugins', 'integrations', 'templates', 'ai', 'ui', 'tools'];
const packageRegistry = [];

// A. Scan directory manifests
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
          relPrefix: `${modDir}/${entry.name}`,
          owner: authorHandle,
        });
      } catch {
        // ignore errors
      }
    }
  }
}

// B. Scan certified-modules.json
const certifiedPath = path.join(rootDir, '.ecosystem', 'certified-modules.json');
if (fs.existsSync(certifiedPath)) {
  try {
    const certifiedData = JSON.parse(fs.readFileSync(certifiedPath, 'utf8'));
    if (certifiedData.modules) {
      for (const [pkgName, details] of Object.entries(certifiedData.modules)) {
        const existing = packageRegistry.find((p) => p.name === pkgName);
        if (existing && details.maintainer) {
          existing.owner = details.maintainer;
        } else if (!existing && details.maintainer) {
          packageRegistry.push({
            name: pkgName,
            folder: pkgName.split('/').pop(),
            category: 'ecosystem',
            relPrefix: pkgName,
            owner: details.maintainer,
          });
        }
      }
    }
  } catch {
    // ignore json read errors
  }
}

// GitHub API Client Helper
async function ghApi(endpoint, options = {}) {
  if (!token) return null;
  const res = await globalThis.fetch(
    `https://api.github.com/repos/${owner}/${repoName}/${endpoint}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'module-review-gate',
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    },
  );
  if (!res.ok) {
    const text = await res.text();
    console.warn(`[ghApi] ${options.method || 'GET'} ${endpoint} failed: ${res.status} ${text}`);
    return null;
  }
  return res.json();
}

async function runReviewGate() {
  if (!token || !prNumber) {
    console.log(`ℹ️ [module-review-gate] Missing token or PR number. Dry execution.`);
    return;
  }

  // 1. Fetch changed files in the PR
  const files = await ghApi(`pulls/${prNumber}/files?per_page=100`);
  if (!Array.isArray(files) || files.length === 0) {
    console.log(`[module-review-gate] No changed files detected.`);
    return;
  }

  // 2. Identify which modular packages were modified
  const modifiedModules = new Map();
  for (const file of files) {
    const filename = file.filename;
    for (const pkg of packageRegistry) {
      if (filename.startsWith(pkg.relPrefix)) {
        if (!modifiedModules.has(pkg.relPrefix)) {
          modifiedModules.set(pkg.relPrefix, pkg);
        }
      }
    }
  }

  if (modifiedModules.size === 0) {
    console.log(
      `ℹ️ [module-review-gate] PR #${prNumber} does not modify external ecosystem modules. Standard core review applies.`,
    );
    return;
  }

  const matchedPackages = Array.from(modifiedModules.values());
  console.log(
    `[module-review-gate] Modified ecosystem modules:`,
    matchedPackages.map((p) => `${p.relPrefix} (Owner: @${p.owner})`).join(', '),
  );

  // Filter modules owned by third-party contributors (not Hoslift core maintainers, and not PR author)
  const thirdPartyModules = matchedPackages.filter((p) => {
    return (
      p.owner &&
      p.owner.toLowerCase() !== 'hoslift' &&
      p.owner.toLowerCase() !== prAuthor.toLowerCase()
    );
  });

  if (thirdPartyModules.length === 0) {
    console.log(
      `ℹ️ [module-review-gate] Modified modules are owned by @hoslift or PR author @${prAuthor}. No third-party module owner approval required.`,
    );
    return;
  }

  const moduleOwners = [...new Set(thirdPartyModules.map((p) => p.owner))];
  console.log(
    `[module-review-gate] Third-party module owner approval required from: @${moduleOwners.join(', @')}`,
  );

  // 3. Check approvals from the module owner(s)
  // A. Check official GitHub PR Reviews
  const reviews = (await ghApi(`pulls/${prNumber}/reviews?per_page=100`)) || [];
  const approvedReviewers = new Set(
    reviews.filter((r) => r.state === 'APPROVED' && r.user).map((r) => r.user.login.toLowerCase()),
  );

  // B. Check PR comments for "/approve" command
  const comments = (await ghApi(`issues/${prNumber}/comments?per_page=100`)) || [];
  for (const c of comments) {
    if (c.user && c.body && /(?:^|\s)\/(?:approve|lgtm)\b/i.test(c.body)) {
      approvedReviewers.add(c.user.login.toLowerCase());
    }
  }

  // Also check current comment if triggered by issue_comment
  if (commentBody && commentAuthor && /(?:^|\s)\/(?:approve|lgtm)\b/i.test(commentBody)) {
    approvedReviewers.add(commentAuthor.toLowerCase());
  }

  const allOwnersApproved = moduleOwners.every((ownerHandle) =>
    approvedReviewers.has(ownerHandle.toLowerCase()),
  );

  // 4. Update Labels and Checklist Comment
  const checklistCommentId = await findExistingChecklistComment(comments);

  if (allOwnersApproved) {
    console.log(
      `✅ [module-review-gate] All required module owners have approved PR #${prNumber}!`,
    );

    // Remove awaiting label, add approved label & needs-hoslift label
    await removeLabel('status: awaiting-module-owner-review');
    await addLabels(['status: module-owner-approved', 'status: ready-for-hoslift-review']);

    const checklistBody = generateChecklistMarkdown(thirdPartyModules, moduleOwners, true);
    if (checklistCommentId) {
      await updateComment(checklistCommentId, checklistBody);
    } else {
      await createComment(checklistBody);
    }
  } else {
    const pendingOwners = moduleOwners.filter((o) => !approvedReviewers.has(o.toLowerCase()));
    console.log(`⏳ [module-review-gate] Awaiting approval from: @${pendingOwners.join(', @')}`);

    // Request review from pending owners
    await requestReviewers(pendingOwners);

    // Apply label
    await addLabels(['status: awaiting-module-owner-review']);
    await removeLabel('status: ready-for-hoslift-review');

    const checklistBody = generateChecklistMarkdown(
      thirdPartyModules,
      moduleOwners,
      false,
      pendingOwners,
    );
    if (checklistCommentId) {
      await updateComment(checklistCommentId, checklistBody);
    } else {
      await createComment(checklistBody);
    }
  }
}

function generateChecklistMarkdown(modules, owners, isApproved, pendingOwners = []) {
  const moduleList = modules.map((m) => `- \`${m.relPrefix}\` (Owner: @${m.owner})`).join('\n');
  const ownerTags = owners.map((o) => `@${o}`).join(', ');

  if (isApproved) {
    return `### 📋 Ecosystem Multi-Tier Review Status

This Pull Request modifies the following ecosystem modules:
${moduleList}

---

#### Review Pipeline:
- [x] **Tier 1: Module Owner Approval** (Approved by ${ownerTags} ✅)
- [ ] **Tier 2: Hoslift Framework Review** (@hoslift maintainers have been notified)
- [ ] **Tier 3: Merge & Dual Registry Release**

🎉 **All module owners have approved!** Maintainers (@hoslift) will now conduct the final review for framework stability, security, and release.`;
  }

  const pendingTags = pendingOwners.map((o) => `@${o}`).join(', ');
  return `### 📋 Ecosystem Multi-Tier Review Status

This Pull Request modifies the following ecosystem modules:
${moduleList}

---

#### Review Pipeline:
- [ ] **Tier 1: Module Owner Approval** (Awaiting approval from: ${pendingTags} ⏳)
- [ ] **Tier 2: Hoslift Framework Review** (Pending Tier 1 approval)
- [ ] **Tier 3: Merge & Dual Registry Release**

👋 **Attention ${pendingTags}:**
As the author/owner of the modified module, please review these proposed changes.
- To approve, click GitHub **"Review changes" ➔ "Approve"**, or simply comment **\`/approve\`** on this PR.
- Once approved, our core maintainers (@hoslift) will perform the final architectural review and merge!`;
}

// Helpers
async function findExistingChecklistComment(comments) {
  for (const c of comments) {
    if (c.body && c.body.includes('Ecosystem Multi-Tier Review Status')) {
      return c.id;
    }
  }
  return null;
}

async function createComment(body) {
  return ghApi(`issues/${prNumber}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

async function updateComment(commentId, body) {
  return ghApi(`issues/comments/${commentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ body }),
  });
}

async function addLabels(labels) {
  return ghApi(`issues/${prNumber}/labels`, {
    method: 'POST',
    body: JSON.stringify({ labels }),
  });
}

async function removeLabel(label) {
  try {
    await globalThis.fetch(
      `https://api.github.com/repos/${owner}/${repoName}/issues/${prNumber}/labels/${encodeURIComponent(label)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'module-review-gate',
        },
      },
    );
  } catch {
    // ignore
  }
}

async function requestReviewers(reviewers) {
  return ghApi(`pulls/${prNumber}/requested_reviewers`, {
    method: 'POST',
    body: JSON.stringify({ reviewers }),
  });
}

runReviewGate().then(() => {
  console.log(`[module-review-gate] Completed review gate evaluation.`);
  process.exit(0);
});
