#!/usr/bin/env node
/**
 * scripts/verify-payment.mjs
 * Automated Ecosystem Partner Payment Verification & Certification Engine.
 *
 * Supported Providers:
 * 1. PayPal (API verification via Order/Transaction ID + Anti-Duplication check)
 * 2. GitHub Sponsors (GraphQL API verification of active sponsorship tier or Maintainer Approval)
 *
 * Capabilities:
 * - Anti-Fraud & Single-Use Enforcement: Ensures a single transaction ID cannot unlock multiple modules.
 * - Automatic Registry Update: Modifies .ecosystem/certified-modules.json with active sponsorship metadata.
 * - Auto-Labeling & Official Badge Generation for Issue discussions.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const registryPath = path.join(rootDir, '.ecosystem', 'certified-modules.json');
const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY || 'hoslift/ranu.js';
const [owner, repoName] = repo.split('/');

const issueNumber = process.env.ISSUE_NUMBER;
const issueBody = process.env.ISSUE_BODY || '';
const commentBody = process.env.COMMENT_BODY || '';
const commentAuthor = process.env.COMMENT_AUTHOR || '';
const commentAuthorAssociation = process.env.COMMENT_AUTHOR_ASSOCIATION || '';

const paypalClientId = process.env.PAYPAL_CLIENT_ID;
const paypalClientSecret = process.env.PAYPAL_CLIENT_SECRET;

const CORE_OWNERS = new Set(['hoslift', 'draj256']);
const trustedRoles = ['OWNER', 'MEMBER', 'COLLABORATOR'];
const isOwnerAccount = CORE_OWNERS.has(commentAuthor.toLowerCase());
const isMaintainer = trustedRoles.includes(commentAuthorAssociation) || isOwnerAccount;

const ALLOWED_MODULE_NAME_REGEX = /^@hoslift\/[a-z0-9-]+$/;

/**
 * Parses /verify-payment command arguments from comment
 * Example: /verify-payment tx=PAYID-12345 provider=paypal module=@hoslift/stripe-billing
 */
export function parseVerifyCommand(text) {
  const match =
    text.match(/\/verify-payment\s+([^\r\n]+)/i) || text.match(/^\s*(\/verify-payment)\s*$/im);
  if (!match) return null;

  const argStr = match[1] === '/verify-payment' ? '' : match[1].trim();
  const rawArgs = argStr ? argStr.split(/\s+/) : [];
  const args = {
    provider: 'paypal',
    tx: null,
    module: null,
  };

  for (const part of rawArgs) {
    const [key, val] = part.split('=');
    if (key && val) {
      const k = key.toLowerCase().trim();
      const v = val.trim();
      if (k === 'tx' || k === 'transaction' || k === 'id') args.tx = v;
      if (k === 'provider') args.provider = v.toLowerCase();
      if (k === 'module' || k === 'pkg' || k === 'name') args.module = v;
    } else if (!args.tx && part.length > 5) {
      args.tx = part; // positional fallback
    }
  }

  return args;
}

/**
 * Extracts proposed module name from Issue body if not passed in command
 */
export function extractModuleNameFromIssue(body) {
  const match =
    body.match(/Module Name[\r\n\s]+([@a-zA-Z0-9_/-]+)/i) ||
    body.match(/`(@hoslift\/[a-zA-Z0-9_-]+)`/i) ||
    body.match(/`(@ranujs\/[a-zA-Z0-9_-]+)`/i);
  return match ? match[1].trim() : null;
}

/**
 * Verifies transaction with PayPal REST API (Fail-Closed)
 */
async function verifyPayPalTransaction(txId) {
  if (!txId) throw new Error('Missing transaction ID.');

  const cleanTxId = txId.trim();
  const isValidFormat =
    /^[A-Z0-9]{12,24}$/i.test(cleanTxId) ||
    /^PAYID-[A-Z0-9]+$/i.test(cleanTxId) ||
    /^[0-9A-Z]{17}$/i.test(cleanTxId);

  if (!isValidFormat) {
    throw new Error(`Invalid PayPal Transaction ID format: "${cleanTxId}".`);
  }

  // Fail closed if PayPal credentials are not configured
  if (!paypalClientId || !paypalClientSecret) {
    throw new Error(
      'Automated PayPal verification is unavailable (API credentials not configured in workflow). ' +
        'Please request manual verification from repository maintainers (@hoslift).',
    );
  }

  try {
    const auth = Buffer.from(`${paypalClientId}:${paypalClientSecret}`).toString('base64');
    const tokenRes = await globalThis.fetch('https://api-m.paypal.com/v1/oauth2/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!tokenRes.ok) {
      throw new Error(`PayPal authentication failed with status ${tokenRes.status}`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      throw new Error('PayPal authentication failed: missing access token.');
    }

    // Query order / capture details
    const orderRes = await globalThis.fetch(
      `https://api-m.paypal.com/v2/checkout/orders/${encodeURIComponent(cleanTxId)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!orderRes.ok) {
      throw new Error(
        `PayPal transaction "${cleanTxId}" could not be verified (HTTP ${orderRes.status}).`,
      );
    }

    const orderData = await orderRes.json();
    const status = orderData.status; // 'COMPLETED' or 'APPROVED'
    if (status !== 'COMPLETED') {
      throw new Error(
        `PayPal transaction "${cleanTxId}" status is "${status}" (must be "COMPLETED").`,
      );
    }

    return {
      verified: true,
      provider: 'paypal',
      transactionId: cleanTxId,
      payerEmail: orderData.payer?.email_address || 'verified_payer',
      amount: orderData.purchase_units?.[0]?.amount?.value,
      currency: orderData.purchase_units?.[0]?.amount?.currency_code,
    };
  } catch (err) {
    throw new Error(`PayPal verification failed: ${err.message}`);
  }
}

/**
 * Verifies GitHub Sponsors (Fail-Closed, Requires API verification or Maintainer Confirmation)
 */
async function verifyGitHubSponsorship(sponsorLogin) {
  const targetUser = sponsorLogin || commentAuthor;
  if (!targetUser) throw new Error('Missing sponsor GitHub username.');

  // Repository owners and maintainers do not require external sponsorship payment verification
  if (CORE_OWNERS.has(targetUser.toLowerCase()) || isMaintainer) {
    console.log(
      `[verify-payment] Payment verification bypassed for owner/maintainer @${commentAuthor} (target: @${targetUser})`,
    );
    return {
      verified: true,
      provider:
        isOwnerAccount || CORE_OWNERS.has(targetUser.toLowerCase())
          ? 'owner-exempt'
          : 'github-sponsors',
      transactionId:
        isOwnerAccount || CORE_OWNERS.has(targetUser.toLowerCase())
          ? `owner-exempt-${targetUser}`
          : `gh-sponsor-${targetUser}-approved-by-${commentAuthor}`,
      payerEmail: `${targetUser}@users.noreply.github.com`,
      status: 'active',
      verifiedBy: commentAuthor,
    };
  }

  // Attempt GraphQL verification against the organization (hoslift) and viewer
  const sponsorsToken = process.env.SPONSORS_TOKEN || token;
  const sponsorOrg = process.env.SPONSORS_ORG || owner || 'hoslift';
  if (sponsorsToken) {
    try {
      const query = `
        query($org: String!, $login: String!) {
          organization(login: $org) {
            isSponsoredBy(accountLogin: $login)
          }
          user(login: $login) {
            isSponsoringViewer
          }
        }
      `;
      const res = await globalThis.fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sponsorsToken}`,
          'User-Agent': 'verify-payment',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables: { org: sponsorOrg, login: targetUser } }),
      });

      if (res.ok) {
        const data = await res.json();
        const isOrgSponsor = Boolean(data.data?.organization?.isSponsoredBy);
        const isViewerSponsor = Boolean(data.data?.user?.isSponsoringViewer);
        if (isOrgSponsor || isViewerSponsor) {
          return {
            verified: true,
            provider: 'github-sponsors',
            transactionId: `gh-sponsor-${targetUser}`,
            payerEmail: `${targetUser}@users.noreply.github.com`,
            status: 'active',
          };
        }
      }
    } catch (graphErr) {
      console.warn(`[verify-payment] GraphQL sponsors query error:`, graphErr.message);
    }
  }

  // Fail closed: maintainer confirmation required
  throw new Error(
    `Automated GitHub Sponsors verification is unavailable for @${targetUser}. ` +
      `Manual maintainer confirmation is required. Please ask a repository maintainer (@hoslift) to approve your sponsorship.`,
  );
}

/**
 * Main execution function
 */
export async function processPaymentVerification() {
  const command = parseVerifyCommand(commentBody);
  if (!command) {
    console.log(`[verify-payment] No /verify-payment command found in comment.`);
    return false;
  }

  console.log(`[verify-payment] Processing verification command from @${commentAuthor}:`, command);

  if (!fs.existsSync(registryPath)) {
    throw new Error(`Registry not found at ${registryPath}`);
  }

  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const modules = registry.modules || {};

  // Determine and validate target module
  let targetModule = command.module || extractModuleNameFromIssue(issueBody);
  if (!targetModule && issueNumber) {
    targetModule = `@hoslift/module-issue-${issueNumber}`;
  }

  if (targetModule) {
    targetModule = targetModule.trim().toLowerCase();
  }

  if (!targetModule || !ALLOWED_MODULE_NAME_REGEX.test(targetModule)) {
    console.error(`❌ [verify-payment] Invalid or missing target module: "${targetModule}"`);
    await postIssueComment(
      `❌ **Verification Failed:** Invalid module name "${targetModule || 'unspecified'}".\n` +
        `Target module must match pattern \`@hoslift/<name>\` (lowercase alphanumeric and hyphens only).\n` +
        `Example: \`/verify-payment tx=${command.tx || 'PAYID-XXXXX'} module=@hoslift/your-module\``,
    );
    return false;
  }

  // Prevent hijacking existing modules maintained by others
  if (modules[targetModule] && modules[targetModule].maintainer) {
    const existingMaintainer = modules[targetModule].maintainer;
    if (existingMaintainer.toLowerCase() !== commentAuthor.toLowerCase() && !isMaintainer) {
      console.error(
        `❌ [verify-payment] Unauthorized attempt to re-certify module ${targetModule} owned by ${existingMaintainer}`,
      );
      await postIssueComment(
        `🚨 **Security Alert:** Module \`${targetModule}\` is already registered by maintainer \`@${existingMaintainer}\`. Only the module owner or core maintainers can re-verify payment.`,
      );
      return false;
    }
  }

  // Anti-Duplication Rule: Ensure tx is not already used by another module
  if (command.tx) {
    for (const [modName, modData] of Object.entries(modules)) {
      if (
        modData.payment &&
        modData.payment.transactionId &&
        modData.payment.transactionId.toLowerCase() === command.tx.toLowerCase()
      ) {
        if (modName !== targetModule) {
          console.error(
            `❌ [FRAUD ATTEMPT] Transaction ${command.tx} was already used by ${modName}!`,
          );
          await postIssueComment(
            `🚨 **Security Alert:** Transaction ID \`${command.tx}\` has already been redeemed by another module (\`${modName}\`). Each payment activates exactly one module.`,
          );
          return false;
        }
      }
    }
  }

  // Verify payment with provider (core owners @draj256 / @hoslift are exempt unless validating an explicit external tx)
  let paymentDetails;
  try {
    if (isOwnerAccount && !command.tx) {
      console.log(
        `[verify-payment] Owner @${commentAuthor} is exempt from payment verification for ${targetModule}.`,
      );
      paymentDetails = {
        verified: true,
        provider: 'owner-exempt',
        transactionId: `owner-exempt-${targetModule.replace(/[^a-z0-9-]/gi, '-')}-by-${commentAuthor}`,
        payerEmail: `${commentAuthor}@users.noreply.github.com`,
        status: 'active',
      };
    } else if (command.provider === 'paypal') {
      paymentDetails = await verifyPayPalTransaction(command.tx);
    } else if (command.provider === 'sponsors') {
      paymentDetails = await verifyGitHubSponsorship(commentAuthor);
    } else {
      throw new Error(`Unsupported provider: "${command.provider}". Supported: paypal, sponsors.`);
    }
  } catch (err) {
    console.error(`[verify-payment] Verification rejected:`, err.message);
    await postIssueComment(
      `❌ **Payment Verification Failed:** ${err.message}\n\nPlease check your Transaction ID or contact maintainers (@hoslift) for assistance.`,
    );
    return false;
  }

  // Update registry
  console.log(`✅ [verify-payment] Payment verified! Updating registry for ${targetModule}...`);
  modules[targetModule] = {
    ...(modules[targetModule] || {}),
    tier: 'sponsored-partner',
    certified: true,
    maintainer:
      commentAuthor || (modules[targetModule] && modules[targetModule].maintainer) || 'unknown',
    payment: {
      provider: paymentDetails.provider,
      transactionId: paymentDetails.transactionId,
      verifiedAt: new Date().toISOString(),
      issueNumber: issueNumber ? parseInt(issueNumber, 10) : undefined,
      status: 'active',
    },
  };

  registry.modules = modules;
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');
  console.log(`✅ [verify-payment] ${registryPath} updated successfully.`);

  // Auto-commit registry changes using execFileSync (no shell interpolation)
  try {
    if (process.env.GITHUB_ACTIONS === 'true') {
      execFileSync('git', ['config', 'user.name', 'github-actions[bot]'], {
        stdio: 'ignore',
      });
      execFileSync(
        'git',
        ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com'],
        {
          stdio: 'ignore',
        },
      );
    }
    execFileSync('git', ['add', registryPath], { stdio: 'ignore' });
    execFileSync(
      'git',
      ['commit', '-m', `chore(ecosystem): verify partner payment for ${targetModule} [skip ci]`],
      { stdio: 'ignore' },
    );
    if (token) {
      execFileSync('git', ['push', 'origin', 'HEAD:main'], { stdio: 'ignore' });
      console.log(`✅ [verify-payment] Pushed certified-modules.json update to main.`);
    }
  } catch (gitErr) {
    console.warn(`[verify-payment] Git commit/push note:`, gitErr.message);
  }

  // Label Issue & Post Congratulatory Comment
  await addIssueLabels(['sponsored: partner-verified', 'contribution: approved', 'approved']);

  const successMessage = `### 🌟 Payment Verified & Certified Partner Status Granted!

Congratulations @${commentAuthor}! 🎉

Your **${paymentDetails.provider.toUpperCase()}** payment (\`${paymentDetails.transactionId}\`) for **\`${targetModule}\`** has been verified and permanently registered in our official ecosystem registry!

---

#### 🛡️ Official Certified Partner Badge
You are now authorized to embed the official **Hoslift Partner Certified** badge in your module's \`README.md\`:

\`\`\`markdown
[![Ranu Ecosystem: Sponsored Partner](https://img.shields.io/badge/Ranu%20Ecosystem-Sponsored%20Partner-f59e0b?style=flat-square&logo=githubsponsors)](https://github.com/sponsors/hoslift)
\`\`\`

#### 🚀 Next Steps:
1. Submit your module code via Pull Request referencing **\`Closes #${issueNumber}\`**.
2. Our automated multi-tier review gate will detect your certified partner status and fast-track your PR!

*Thank you for partnering with Hoslift to grow the Ranu.js Ecosystem!*`;

  await postIssueComment(successMessage);
  return true;
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
          'User-Agent': 'verify-payment',
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body }),
      },
    );
  } catch (err) {
    console.error(`[verify-payment] Failed to post comment:`, err.message);
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
          'User-Agent': 'verify-payment',
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ labels }),
      },
    );
  } catch (err) {
    console.warn(`[verify-payment] Failed to add labels:`, err.message);
  }
}

// Execute if run directly
if (
  process.argv[1] &&
  (process.argv[1].endsWith('verify-payment.mjs') ||
    path.resolve(process.argv[1]).toLowerCase() === __filename.toLowerCase())
) {
  processPaymentVerification().then(() => {
    process.exit(0);
  });
}
