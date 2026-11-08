/**
 * scripts/contributor-gate.mjs
 * Gatekeeper verifying external contributors have prior approval.
 */

const author = process.env.PR_AUTHOR;
const authorAssociation = process.env.PR_ASSOCIATION; // 'OWNER', 'MEMBER', 'COLLABORATOR', etc.
const prNumber = process.env.PR_NUMBER;
const labels = JSON.parse(process.env.PR_LABELS || '[]');
const token = process.env.GITHUB_TOKEN;

console.log(`[contributor-gate] Evaluating PR #${prNumber} opened by @${author} (Association: ${authorAssociation})`);

// 1. Maintainers, owners, and repository collaborators have immediate full access
const trustedRoles = ['OWNER', 'MEMBER', 'COLLABORATOR'];
if (trustedRoles.includes(authorAssociation)) {
  console.log(`✅ [contributor-gate] Author @${author} is a verified maintainer/collaborator (${authorAssociation}). Gate cleared.`);
  process.exit(0);
}

// 2. Check if maintainer has applied the 'contribution: approved' label to the PR
if (labels.includes('contribution: approved')) {
  console.log(`✅ [contributor-gate] PR #${prNumber} has explicit maintainer approval ('contribution: approved'). Gate cleared.`);
  process.exit(0);
}

// 3. For external contributors without prior approval, post guidance and block
console.error(`❌ [contributor-gate] External contributor @${author} does not have prior approval for PR #${prNumber}.`);

const issueLink = 'https://github.com/hoslift/ranu.js/issues/new?template=contribution_request.yml';
const commentBody = `### 🛑 Prior Permission Required for External Contributions

Hello @${author}! 👋 Thank you for your interest in contributing to **Ranu.js**.

In accordance with our [**CONTRIBUTING.md**](https://github.com/hoslift/ranu.js/blob/main/CONTRIBUTING.md), direct pull requests from outside contributors are not accepted without prior approval.

#### 📋 How to request permission:
1. Please open a [**Contribution & Permission Request**](${issueLink}) issue describing your proposed change.
2. Once maintainers review and approve your proposal, they will apply the \`contribution: approved\` label to this PR to unlock it for review.

*This check ensures framework stability, API consistency, and security during our public alpha phase.*`;

async function postComment() {
  if (!token || !prNumber) {
    process.exit(1);
  }

  const repo = process.env.GITHUB_REPOSITORY || 'hoslift/ranu.js';
  const [owner, repoName] = repo.split('/');

  try {
    // Check if already commented
    const listRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/issues/${prNumber}/comments`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'contributor-gate',
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (listRes.ok) {
      const existingComments = await listRes.json();
      const alreadyCommented = existingComments.some(c => c.body && c.body.includes('Prior Permission Required for External Contributions'));
      if (alreadyCommented) {
        console.log(`ℹ️ [contributor-gate] Comment already exists on PR #${prNumber}.`);
        process.exit(1);
      }
    }

    // Post comment
    await fetch(`https://api.github.com/repos/${owner}/${repoName}/issues/${prNumber}/comments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'contributor-gate',
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body: commentBody }),
    });
    console.log(`💬 [contributor-gate] Guidance comment posted to PR #${prNumber}.`);
  } catch (err) {
    console.error(`Failed to post comment:`, err.message);
  }

  process.exit(1);
}

postComment();
