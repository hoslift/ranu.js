/**
 * scripts/contributor-gate.mjs
 * Smart & Developer-Friendly Gatekeeper for External Contributions.
 *
 * Prevents redundant approvals:
 * 1. Immediate clearance for repository owners, members, collaborators, and existing contributors.
 * 2. Automatic clearance if the PR is linked to an approved Issue (e.g. "Closes #12", "Fixes #45").
 * 3. Automatic clearance if the PR carries the "contribution: approved" label.
 */

const author = process.env.PR_AUTHOR;
const authorAssociation = process.env.PR_ASSOCIATION; // 'OWNER', 'MEMBER', 'COLLABORATOR', 'CONTRIBUTOR', etc.
const prNumber = process.env.PR_NUMBER;
const labels = JSON.parse(process.env.PR_LABELS || '[]');
const prBody = process.env.PR_BODY || '';
const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY || 'hoslift/ranu.js';
const [owner, repoName] = repo.split('/');

console.log(
  `[contributor-gate] Evaluating PR #${prNumber} opened by @${author} (Association: ${authorAssociation})`,
);

// 1. Maintainers, owners, collaborators, and established contributors have immediate full clearance
const trustedRoles = ['OWNER', 'MEMBER', 'COLLABORATOR', 'CONTRIBUTOR'];
if (trustedRoles.includes(authorAssociation)) {
  console.log(
    `✅ [contributor-gate] Author @${author} is a verified ${authorAssociation}. Gate cleared.`,
  );
  process.exit(0);
}

// 2. Check if maintainer has directly applied the 'contribution: approved' label to the PR
if (labels.includes('contribution: approved') || labels.includes('approved')) {
  console.log(`✅ [contributor-gate] PR #${prNumber} has explicit approval label. Gate cleared.`);
  process.exit(0);
}

async function verifyLinkedIssueAndGate() {
  // 3. Smart Issue Link Check: If contributor already discussed an issue, don't ask again!
  const issueMatches = [
    ...prBody.matchAll(/(?:fixes|closed|closes|resolves|issue|ref)\s*[:#]?\s*([0-9]+)/gi),
  ];
  const issueNumbers = [...new Set(issueMatches.map((m) => m[1]))];

  if (issueNumbers.length > 0 && token) {
    console.log(`[contributor-gate] Found linked issue reference(s): #${issueNumbers.join(', #')}`);
    for (const issueNum of issueNumbers) {
      try {
        const issueRes = await globalThis.fetch(
          `https://api.github.com/repos/${owner}/${repoName}/issues/${issueNum}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'User-Agent': 'contributor-gate',
              Accept: 'application/vnd.github.v3+json',
            },
          },
        );

        if (issueRes.ok) {
          const issueData = await issueRes.json();
          const issueLabels = (issueData.labels || []).map((l) =>
            typeof l === 'string' ? l : l.name,
          );
          const isAssigned =
            (issueData.assignees || []).some(
              (a) => a.login?.toLowerCase() === author?.toLowerCase(),
            ) ||
            issueLabels.some(
              (l) =>
                l.toLowerCase() === `assigned: @${author?.toLowerCase()}` ||
                l.toLowerCase() === `assigned: ${author?.toLowerCase()}`,
            );

          // If the issue was approved, assigned to this contributor, or labeled for community contribution:
          const isApproved =
            issueLabels.some((l) =>
              /approved|ready|good first issue|help wanted|feature/i.test(l),
            ) ||
            isAssigned ||
            issueData.state === 'closed';

          if (isApproved) {
            console.log(
              `✅ [contributor-gate] Linked issue #${issueNum} is verified/approved for @${author}. Gate cleared automatically without friction.`,
            );
            process.exit(0);
          }
        }
      } catch (err) {
        console.warn(`[contributor-gate] Issue check warning for #${issueNum}:`, err.message);
      }
    }
  }

  // 4. If completely unknown external PR with zero context, post welcoming guidance
  console.log(
    `ℹ️ [contributor-gate] First-time external PR without linked approved issue from @${author}.`,
  );

  const commentBody = `### 👋 Welcome to Ranu.js, @${author}!

Thank you for your pull request! To keep the framework consistent, stable, and secure:

- If you already opened an issue for this, please make sure your PR description links to it (e.g. \`Closes #123\`).
- If this is a new proposal, maintainers (@hoslift) will review your code shortly. Once reviewed, the \`contribution: approved\` label will be applied.

*Thank you for contributing to the Ranu.js open-source ecosystem!*`;

  if (token && prNumber) {
    try {
      const listRes = await globalThis.fetch(
        `https://api.github.com/repos/${owner}/${repoName}/issues/${prNumber}/comments`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'User-Agent': 'contributor-gate',
            Accept: 'application/vnd.github.v3+json',
          },
        },
      );

      let alreadyCommented = false;
      if (listRes.ok) {
        const existingComments = await listRes.json();
        alreadyCommented = existingComments.some(
          (c) => c.body && c.body.includes('Welcome to Ranu.js'),
        );
      }

      if (!alreadyCommented) {
        await globalThis.fetch(
          `https://api.github.com/repos/${owner}/${repoName}/issues/${prNumber}/comments`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'User-Agent': 'contributor-gate',
              Accept: 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ body: commentBody }),
          },
        );
        console.log(`💬 [contributor-gate] Welcoming guidance comment posted to PR #${prNumber}.`);
      }
    } catch (err) {
      console.error(`Failed to post comment:`, err.message);
    }
  }

  // Pass without hard failure so maintainer can review and merge normally
  process.exit(0);
}

verifyLinkedIssueAndGate();
