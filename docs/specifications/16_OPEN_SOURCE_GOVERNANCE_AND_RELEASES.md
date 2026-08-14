# 16_OPEN_SOURCE_GOVERNANCE_AND_RELEASES.md

**Project:** Ranu.js — JavaScript/TypeScript Full-Stack Web Framework  
**Document Type:** Open-Source Governance, Contribution & Release Specification  
**Status:** Implementation Baseline  
**Date:** 2026-08-10  
**Depends On:** `00_FRAMEWORK_VISION.md` through `15_SECURITY_MODEL.md`  
**Repository Model:** Public GitHub Monorepo  
**Package Registry:** npm  
**Versioning Model:** Semantic Versioning  
**Release Tooling:** Changesets  
**Primary Branch:** `main`

---

# 1. Purpose

This document defines how Ranu.js is governed, contributed to, versioned, released, maintained, and secured as a public open-source framework.

It specifies:

- open-source licensing;
- repository governance;
- maintainer responsibilities;
- contributor model;
- issue and pull-request workflow;
- RFC and ADR process;
- package ownership;
- branch and tag policy;
- Semantic Versioning;
- pre-release channels;
- Changesets;
- changelog requirements;
- npm publication;
- package provenance;
- GitHub Releases;
- release qualification;
- deprecation policy;
- compatibility commitments;
- security support;
- vulnerability releases;
- rollback/deprecation/yank handling;
- release automation;
- governance evolution.

This document converts Ranu.js from a private development project into a sustainable public open-source project.

---

# 2. Governance Objective

Ranu.js must remain:

```text
technically coherent
secure
predictable
contributor-friendly
release-disciplined
transparent
maintainable
```

while avoiding governance complexity that is unnecessary for an early-stage framework.

---

# 3. Governance Principles

## GOV-P01 — Technical Integrity First

Public contribution does not mean every proposed feature must be accepted.

## GOV-P02 — Transparent Decisions

Material public API and architecture decisions should be documented.

## GOV-P03 — Maintainers Own Release Quality

Merging code is not sufficient reason to publish it.

## GOV-P04 — Stable Means Supported

Stable public APIs require compatibility discipline.

## GOV-P05 — Security May Override Normal Process

Critical vulnerability fixes may use expedited private handling.

## GOV-P06 — Small Governance First

Ranu.js begins with lightweight maintainer governance and expands only when contributor scale requires it.

## GOV-P07 — Public Discussion by Default

Normal development occurs through public GitHub issues, pull requests, discussions, and RFCs.

## GOV-P08 — Private Only When Necessary

Security reports, embargoed vulnerabilities, credentials, and sensitive operational information remain private.

## GOV-P09 — Releases Are Reproducible

Official releases originate from protected repository workflows.

## GOV-P10 — Package Names Are Canonical

Only documented official Ranu.js packages are considered part of the official distribution.

---

# 4. Open-Source License

Ranu.js V1 uses the:

```text
MIT License
```

for framework source code unless a specific repository asset explicitly requires another compatible license.

---

# 5. Why MIT

MIT is selected because it:

- is widely understood;
- is permissive;
- permits commercial and private use;
- supports broad framework adoption;
- has low integration friction;
- is common in the JavaScript ecosystem.

---

# 6. Root License File

The repository must contain:

```text
LICENSE
```

with the canonical MIT license text and the appropriate copyright holder/year.

---

# 7. Package License Metadata

Every published Ranu.js package must declare:

```json
{
  "license": "MIT"
}
```

unless explicitly exempted by a later governance decision.

---

# 8. Third-Party Licenses

Ranu.js must comply with licenses of dependencies and included assets.

Do not copy third-party code/assets into the repository without compatible licensing and required notices.

---

# 9. Contributor Licensing

Contributions are accepted under the repository's MIT license.

By submitting a contribution, contributors agree that their contribution may be distributed under the project's license.

---

# 10. CLA Policy

Ranu.js V1 does not require a Contributor License Agreement by default.

A CLA may be introduced only if a concrete legal/project need emerges.

---

# 11. DCO Policy

A Developer Certificate of Origin sign-off is not mandatory for initial V1 contributions.

It may be introduced later if governance scale requires it.

---

# 12. Repository Visibility

The canonical Ranu.js source repository is public.

The public repository is the source of truth for:

```text
framework source
issues
pull requests
release tags
public specifications
contribution guidance
security policy
```

---

# 13. Primary Branch

The primary integration branch is:

```text
main
```

`main` should remain releasable or close to releasable.

---

# 14. Branch Protection

Before public beta, `main` should be protected.

Recommended protections:

```text
pull request required
required CI checks
no force push
no branch deletion
restricted direct push
review requirement
```

Exact GitHub rules may evolve with maintainer count.

---

# 15. Direct Push

Normal feature/fix work should not be pushed directly to protected `main`.

Use:

```text
branch
→ pull request
→ CI
→ review
→ merge
```

Emergency security release procedures may be exceptional.

---

# 16. Working Branches

Recommended naming:

```text
feat/<name>
fix/<name>
docs/<name>
refactor/<name>
test/<name>
security/<name>
release/<name>
```

Naming is a contributor convention, not a hard technical requirement.

---

# 17. Long-Lived Branches

Avoid unnecessary long-lived development branches.

V1 primarily uses:

```text
main
short-lived feature/fix branches
```

Release branches are created only when maintenance/backport needs justify them.

---

# 18. Maintainer Role

Maintainers are trusted project contributors who may:

```text
review PRs
merge changes
triage issues
approve RFCs
manage releases
manage repository settings
coordinate security fixes
```

Privileges should match actual responsibilities.

---

# 19. Lead Maintainer

During the initial project stage, one lead maintainer/project owner may make final decisions when consensus is not available.

This avoids governance deadlock while the maintainer group is small.

---

# 20. Additional Maintainers

Additional maintainers should be selected based on sustained contribution quality, technical judgment, reliability, and project alignment.

Maintainer status is not granted solely by contribution count.

---

# 21. Maintainer Expectations

Maintainers should:

- act in the project's long-term interest;
- review respectfully;
- avoid merging known broken code;
- disclose relevant conflicts;
- protect release credentials;
- follow security embargoes;
- document significant architectural decisions.

---

# 22. Maintainer Removal

Repository privileges may be reduced or removed for:

```text
inactivity where access is no longer needed
credential/security risk
serious conduct violations
repeated abuse of maintainer privileges
```

Governance should handle this proportionately.

---

# 23. Contributor Role

Anyone may propose:

```text
bug reports
documentation fixes
tests
code changes
RFCs
examples
performance improvements
```

subject to repository rules.

---

# 24. Contribution Guide

The repository must contain:

```text
CONTRIBUTING.md
```

before public beta.

It should explain:

```text
setup
package manager
development commands
tests
PR expectations
changesets
RFC threshold
security-reporting exception
```

---

# 25. Code of Conduct

The repository should contain:

```text
CODE_OF_CONDUCT.md
```

before public beta.

Recommended baseline:

```text
Contributor Covenant
```

using an appropriate current version.

---

# 26. Issue Templates

GitHub issue templates should cover:

```text
bug report
feature request
documentation issue
```

Security vulnerabilities must be directed away from public issue templates to the private security channel.

---

# 27. Bug Reports

Useful bug reports should request:

```text
Ranu.js version
Node version
OS
package manager
minimal reproduction
expected behavior
actual behavior
logs/diagnostics
```

---

# 28. Reproduction Requirement

Maintainers may request a minimal reproduction before investigating complex bugs.

Security reports are handled differently and must not be forced into public reproductions.

---

# 29. Feature Requests

Feature requests should describe:

```text
problem
use case
proposed behavior
alternatives
compatibility impact
```

A proposed API is helpful but not always required.

---

# 30. Issue Labels

Recommended labels:

```text
bug
feature
documentation
security
performance
router
runtime
rendering
build
dev
cli
plugin
adapter
config
public-api
good first issue
help wanted
needs reproduction
blocked
```

---

# 31. Pull Requests

Every normal code change should use a pull request.

PRs should explain:

```text
what changed
why
testing
public API impact
breaking impact
related issue/RFC
```

---

# 32. PR Size

Prefer focused PRs.

Large unrelated changes should be split where practical.

Framework-wide refactors may remain large when architectural consistency requires it.

---

# 33. PR Quality Gate

A PR is mergeable only when required checks pass and relevant review concerns are resolved.

Required checks are defined by `14_TESTING_AND_QUALITY_STRATEGY.md`.

---

# 34. Review Requirement

Before public beta, at least one maintainer approval is recommended for normal PRs when more than one maintainer exists.

High-risk changes may require additional review.

---

# 35. High-Risk Changes

Examples:

```text
public API
router precedence
server/client boundary
environment exposure
manifest schema
plugin API
deployment security
release workflow
security-sensitive filesystem logic
```

These require deliberate maintainer review.

---

# 36. Self-Merge

During the single-maintainer bootstrap phase, self-merge is unavoidable.

Even then:

```text
PR
CI
documented change
```

should remain the normal path.

---

# 37. Changeset Requirement

Changes affecting published package behavior should normally include a Changeset.

Exceptions:

```text
internal tests
repository-only tooling
docs with no package behavior impact
CI-only changes
```

---

# 38. Changeset Directory

Repository:

```text
.changeset/
```

---

# 39. Changeset Tool

Ranu.js V1 uses:

```text
Changesets
```

for package version planning and changelog generation.

---

# 40. Changeset Categories

Changesets map to SemVer:

```text
patch
minor
major
```

Pre-1.0 release handling is defined separately below.

---

# 41. RFC Requirement

An RFC is required for changes that materially affect:

```text
public API
routing model
rendering model
server/runtime contract
plugin API
deployment contract
manifest compatibility
configuration semantics
security boundary
major repository architecture
```

---

# 42. RFC Not Required

An RFC is usually unnecessary for:

```text
bug fixes preserving intended behavior
internal refactors
small diagnostics improvements
tests
documentation corrections
performance optimizations without semantic change
```

---

# 43. RFC Location

Repository:

```text
rfcs/
```

Recommended:

```text
rfcs/
├── 0000-template.md
├── active/
├── accepted/
└── rejected/
```

---

# 44. RFC Lifecycle

Recommended lifecycle:

```text
Draft
→ Discussion
→ Accepted / Rejected
→ Implemented
```

An accepted RFC is a design decision, not proof that implementation is complete.

---

# 45. RFC Content

An RFC should include:

```text
summary
motivation
design
public API
alternatives
compatibility
security
migration
testing
unresolved questions
```

---

# 46. RFC Decision

Maintainers decide RFC acceptance after sufficient discussion.

Ranu.js V1 does not use public voting as the binding architecture mechanism.

---

# 47. ADRs

Smaller architectural decisions may use Architecture Decision Records.

ADRs are appropriate when the decision matters long-term but does not require a full public RFC.

---

# 48. Specification Authority

The numbered Ranu.js framework specification files remain authoritative during V1 implementation.

If an accepted RFC changes a locked specification, the relevant specification must be updated.

Do not leave contradictory architecture documents.

---

# 49. Package Ownership

Every published package must have a clear owning subsystem/maintainer responsibility.

Initial ownership may remain with the lead maintainer.

---

# 50. Official Packages

Canonical V1 official package families:

```text
Ranu.js
create-ranu
@ranu/adapter-*
```

Additional published internal packages may exist only when architecture requires them.

---

# 51. Package Namespace

The official scoped namespace is:

```text
@ranu/*
```

subject to actual npm namespace availability/ownership before publication.

If unavailable, the naming specification must be intentionally updated before public release.

---

# 52. Namespace Verification

Before publishing the first public package, verify actual npm ownership/availability of all required package names.

Do not assume registry ownership from documentation alone.

---

# 53. Package Publishing Authority

Only protected official release workflows and authorized maintainers may publish official Ranu.js packages.

---

# 54. Semantic Versioning

Ranu.js follows:

```text
Semantic Versioning 2.0.0
```

for stable releases.

Format:

```text
MAJOR.MINOR.PATCH
```

---

# 55. Stable SemVer Meaning

After `1.0.0`:

### PATCH

Backward-compatible bug/security fixes.

### MINOR

Backward-compatible features and supported API additions.

### MAJOR

Breaking changes to stable supported behavior/API.

---

# 56. Pre-1.0 Versioning

Before `1.0.0`, Ranu.js may make breaking changes in minor versions.

However, breaking changes must still be:

```text
documented
changeset-marked
migration-described where practical
```

Do not treat pre-1.0 as permission for chaotic releases.

---

# 57. Initial Release Progression

Recommended sequence:

```text
0.0.x internal/prototype
0.1.0-alpha.*
0.x alpha
0.x beta
0.x rc
1.0.0
```

Exact minor numbering may reflect development progress.

---

# 58. Pre-Release Identifiers

Use standard identifiers:

```text
alpha
beta
rc
```

Examples:

```text
0.1.0-alpha.0
0.5.0-beta.2
1.0.0-rc.1
```

---

# 59. npm Dist-Tags

Recommended:

```text
alpha → alpha
beta  → beta
rc    → next
stable → latest
```

Dist-tag policy may be refined before first public release.

---

# 60. Stable `latest`

The npm:

```text
latest
```

tag must point only to the current stable release.

Do not publish alpha/beta accidentally to `latest`.

---

# 61. Version Alignment

Tightly coupled official Ranu.js packages should initially use aligned versions.

Example:

```text
Ranu.js@0.6.0
@ranu/adapter-vercel@0.6.0
```

Independent adapter versioning may be adopted later by RFC.

---

# 62. Internal Published Packages

If internal packages must be published for dependency reasons, they should follow the same coordinated release unless intentionally decoupled later.

---

# 63. Changelog

Repository must maintain:

```text
CHANGELOG.md
```

or Changesets-generated package changelogs with a clear root release summary.

---

# 64. Changelog Quality

Release notes should distinguish:

```text
features
fixes
breaking changes
security
deprecations
performance
documentation
```

Do not publish meaningless commit dumps as release notes.

---

# 65. Breaking Change Notes

Every breaking release must describe:

```text
what changed
who is affected
old behavior
new behavior
migration path
```

where practical.

---

# 66. Deprecation Policy

Stable APIs should be deprecated before removal whenever practical.

Deprecation should include:

```text
replacement
reason
planned removal window
```

---

# 67. Deprecation Mechanisms

May include:

```text
documentation
TypeScript @deprecated
development warning
release notes
```

Avoid noisy runtime warnings on every request.

---

# 68. Removal Policy

After `1.0`, stable deprecated APIs should normally be removed only in a major release.

Security emergencies may justify faster action.

---

# 69. Experimental APIs

Experimental APIs must be explicitly marked.

Possible markers:

```text
experimental documentation section
experimental subpath
unstable prefix
```

They do not receive the same compatibility guarantee as stable APIs.

---

# 70. Internal APIs

Unexported/deep internal package paths are unsupported.

Changes to them are not public breaking changes unless external use was explicitly documented/supported.

---

# 71. Public API Source of Truth

`11_PUBLIC_API_SPECIFICATION.md` defines the supported V1 application API.

Published export maps must match it.

---

# 72. Compatibility Dimensions

Release compatibility includes:

```text
JavaScript/TypeScript API
CLI
configuration
filesystem routing
manifest schema
plugin API
adapter contract
Node versions
React versions
TypeScript versions
```

Not every dimension follows identical compatibility rules; documentation must state support.

---

# 73. Node Support

Supported Node versions must be documented per release.

Before stable, CI must test:

```text
minimum supported Node
current approved supported version
```

---

# 74. Node Version Removal

After `1.0`, dropping a supported Node major is normally a breaking change unless ecosystem/security policy explicitly treats runtime support changes differently and documents it.

---

# 75. React Support

Supported React peer ranges must be explicit in package metadata and documentation.

Do not claim support for untested major versions.

---

# 76. TypeScript Support

Supported TypeScript range must be tested as defined in the quality strategy.

Type declaration breakage is treated as API compatibility impact.

---

# 77. Release Cadence

Ranu.js V1 does not require a fixed weekly/monthly release cadence.

Release when:

```text
changes are ready
quality gates pass
release notes are prepared
security conditions are satisfied
```

---

# 78. Patch Releases

Patch releases may be frequent when fixes are ready.

Avoid batching important security/correctness fixes solely for calendar convenience.

---

# 79. Feature Releases

Minor feature releases should group coherent changes and include documentation/examples for new public APIs.

---

# 80. Major Releases

Major releases require:

```text
RFCs for major architecture changes
migration guidance
release candidate period
full quality/security gates
```

---

# 81. Release Candidate

Before `1.0.0`, at least one RC should be published and tested by real projects.

RC is feature-frozen except for release-blocking fixes.

---

# 82. Release Qualification

Technical quality gates come from:

```text
14_TESTING_AND_QUALITY_STRATEGY.md
15_SECURITY_MODEL.md
```

Governance cannot override failed critical release gates merely to meet a date.

---

# 83. Release Checklist

Every stable release should verify:

```text
CI green
security gates green
changesets resolved
versions correct
changelog generated
docs updated
examples build
starter works
package tarballs inspected
public exports validated
licenses present
npm metadata correct
provenance configured
Git tag created
GitHub Release created
npm dist-tag correct
```

---

# 84. Release Automation

Official releases should be automated from GitHub Actions or equivalent protected CI.

Manual local `npm publish` should not be the normal release process.

---

# 85. Release Workflow Permissions

Release workflow uses least-privilege permissions.

Only required repository/package permissions should be granted.

---

# 86. npm Authentication

Prefer modern trusted publishing/OIDC-based npm publishing where available and suitable.

Avoid long-lived npm tokens where a safer supported mechanism exists.

---

# 87. npm Provenance

Official packages should publish with npm provenance where supported.

This helps users verify the relationship between package and source/release workflow.

---

# 88. Two-Factor Authentication

Maintainer npm/GitHub accounts with release authority should enable strong account security and 2FA/passkeys where supported.

---

# 89. Package Tarball Validation

Before publication, release CI must inspect packed artifacts.

Required checks:

```text
dist present
types present
README/LICENSE present
no .env
no credentials
no unnecessary tests/fixtures
exports resolve
package metadata correct
```

---

# 90. Clean Install Validation

Release candidates must be installed from packed artifacts into clean temporary applications.

Do not validate releases only through workspace symlinks.

---

# 91. npm Publication Order

If packages depend on other published Ranu.js packages, release automation must publish in dependency-safe order.

---

# 92. Publication Failure

If publication partially succeeds:

- stop further unsafe steps;
- identify published package versions;
- do not overwrite immutable npm versions;
- publish corrected follow-up versions if needed;
- document incident when user-impacting.

---

# 93. npm Immutability

Published npm versions are treated as immutable.

Never attempt to replace a released version with different code.

---

# 94. Unpublish Policy

Do not routinely unpublish releases.

Unpublish only when justified by:

```text
credential/secret exposure
malicious artifact
legal requirement
catastrophic publication mistake
```

and when registry policy permits.

---

# 95. Deprecating Bad Versions

For non-catastrophic broken releases, prefer:

```text
npm deprecate
corrected patch release
clear release note
```

over unpublishing.

---

# 96. Dist-Tag Rollback

If `latest` points to a broken release, maintainers may move the dist-tag back to a known good version while a fix is prepared.

This does not delete the broken version.

---

# 97. Git Tags

Official release tags use:

```text
v<version>
```

Example:

```text
v1.2.0
```

For coordinated multi-package releases.

---

# 98. Tag Integrity

Release tags should be created by protected release workflow or authorized maintainers after release qualification.

Do not reuse/move an already published release tag casually.

---

# 99. GitHub Releases

Every stable release should have a GitHub Release associated with the canonical tag.

Pre-releases should be marked appropriately.

---

# 100. GitHub Release Notes

Release notes should summarize user-impacting changes rather than only linking to commits.

---

# 101. Release Artifacts

GitHub Releases may include:

```text
source archives
checksums if separately generated
migration notes
```

npm remains the canonical JavaScript package distribution channel.

---

# 102. Security Policy File

Before public beta:

```text
SECURITY.md
```

must be operational.

It must not contain placeholder reporting channels.

---

# 103. Private Security Reports

Security vulnerabilities should be reported privately using an operational channel such as:

```text
GitHub private vulnerability reporting
dedicated security email
```

The exact channel is configured before public beta.

---

# 104. Security Embargo

Maintainers may keep vulnerability details private while:

```text
validating
developing fix
preparing release
coordinating disclosure
```

---

# 105. Security Advisory

Material vulnerabilities should use GitHub Security Advisories/CVE coordination where appropriate.

---

# 106. Security Release Version

A security fix follows SemVer based on compatibility impact, but maintainers should minimize breaking changes where possible.

A critical security fix may justify exceptional compatibility action.

---

# 107. Security Support Window

Initial stable policy:

```text
current stable major receives security support
```

During pre-1.0:

```text
only the current active pre-release/minor line is guaranteed security attention
```

unless maintainers explicitly announce broader support.

---

# 108. Future LTS

Ranu.js V1 does not establish LTS releases.

LTS may be introduced later when adoption and maintenance capacity justify it.

---

# 109. Security Backports

Backports are required only for versions within the announced support window.

---

# 110. Vulnerability Disclosure Notes

Security release notes should explain:

```text
affected versions
fixed versions
impact
mitigation if available
upgrade recommendation
```

without unnecessarily enabling exploitation before users can update.

---

# 111. Release Branches

Ranu.js does not require release branches for normal V1 development.

Maintenance branches may be created after stable when supporting multiple release lines.

Example:

```text
1.x
2.x
```

only if needed.

---

# 112. Hotfix Branches

Emergency fixes may use:

```text
security/<issue>
hotfix/<issue>
```

with protected/private handling as appropriate.

---

# 113. Merge Strategy

Recommended GitHub merge strategy:

```text
squash merge
```

for most contributor PRs, keeping main history readable.

Large carefully structured internal changes may use another strategy when justified.

---

# 114. Commit Convention

Conventional Commits may be encouraged but are not required as the source of release versioning because Changesets owns release intent.

---

# 115. Changesets vs Commits

Release semantics come from:

```text
Changesets
```

not from guessing SemVer from commit-message prefixes.

---

# 116. Changelog Generation

Changesets generates package changelog entries.

Maintainers may edit generated release summaries for clarity before publication.

---

# 117. Release PR

Preferred release workflow:

```text
merged changesets
→ automated version/release PR
→ maintainer review
→ merge
→ protected publish workflow
```

---

# 118. Pre-Release Mode

Changesets pre-release mode may be used for:

```text
alpha
beta
rc
```

to keep package versions coordinated.

---

# 119. Stable Promotion

A pre-release is not converted into stable solely by changing npm dist-tag.

Stable publication must use a proper stable SemVer version and pass stable release gates.

---

# 120. Package Metadata

Before publication verify:

```text
repository
homepage
bugs
license
engines
exports
types
files
peerDependencies
publishConfig
```

---

# 121. Package README

Every public package must have enough README information to identify:

```text
purpose
installation
compatibility
documentation
official status
```

---

# 122. Internal Package Publication

If technical architecture forces publication of an internal package:

- mark it clearly internal;
- avoid advertising direct installation;
- minimize exports;
- keep compatibility tied to main Ranu.js package.

---

# 123. Adapter Releases

Official adapters must pass their target-specific E2E before stable publication.

An adapter may remain pre-release even if core Ranu.js is stable.

---

# 124. Provider Compatibility

Provider behavior changes over time.

Adapter releases may be required without core framework feature changes.

Provider compatibility fixes may be patch releases when public API remains compatible.

---

# 125. Documentation Release Gate

New public features are not release-complete without user documentation.

Documentation must be available no later than the release that exposes the stable API.

---

# 126. Example Release Gate

Important new framework capabilities should have at least one official example or tested documentation flow.

---

# 127. Migration Guides

Major breaking releases require a migration guide.

Significant pre-1.0 breaking releases should also provide migration notes where practical.

---

# 128. Codemods

Codemods may be provided for high-volume mechanical migrations.

They are not mandatory for every breaking change.

---

# 129. Compatibility Tests

Stable release must pass compatibility matrices defined in `14_TESTING_AND_QUALITY_STRATEGY.md`.

---

# 130. Release Reproducibility

Release builds should run from:

```text
clean checkout
locked dependencies
protected CI
documented Node/pnpm versions
```

---

# 131. Release Environment

Do not publish from an uncommitted developer working tree as the normal process.

---

# 132. Release Build Inputs

Release artifacts must correspond to the tagged source plus declared build dependencies/configuration.

---

# 133. Generated Files

Generated package `dist/` files need not be committed to Git if release CI builds them reproducibly.

---

# 134. Registry Verification

After publishing, automation or maintainer checks should verify:

```text
npm version exists
dist-tag correct
tarball install works
package exports resolve
```

---

# 135. Post-Release Smoke Test

After publication:

```text
create temp project
install registry release
run hfx/create-ranu
build
start
basic request
```

should be performed automatically where practical.

---

# 136. Broken Release Response

If a stable release is broken:

1. assess severity;
2. move dist-tag if necessary;
3. communicate issue;
4. prepare patch;
5. publish new immutable version;
6. add regression test;
7. document incident if material.

---

# 137. Release Incident Review

Material release/security incidents should produce a short internal/public postmortem where useful.

Focus on:

```text
cause
impact
detection
fix
prevention
```

not blame.

---

# 138. Experimental Release Channels

Future experimental builds may use separate npm tags.

Do not overload `latest`.

---

# 139. Nightly Builds

Nightly/canary builds are deferred.

If introduced later, they must use clearly non-stable version identifiers/dist-tags.

---

# 140. Governance Changes

Material governance changes should be made through a documented PR/RFC.

Examples:

```text
license change
CLA introduction
maintainer governance model
versioning model
release channel policy
package namespace strategy
```

---

# 141. License Changes

Changing the license of existing contributions can be legally complex.

Do not change from MIT casually.

Future license changes require legal/maintainer review and contributor-rights analysis.

---

# 142. Project Trademark

Open-source code licensing does not automatically grant unrestricted rights to project names/logos as trademarks.

Formal trademark policy is deferred until needed.

---

# 143. Forks

The MIT license permits forks subject to license terms.

Forks should not be represented as official Ranu.js releases unless authorized.

---

# 144. Official Distribution Identification

Canonical official distribution should be identified through:

```text
official GitHub repository
official npm packages
official documentation domain
```

once those properties are established.

---

# 145. Dependency Governance

Adding a dependency should consider:

```text
maintenance
license
security
size
runtime impact
browser impact
necessity
```

---

# 146. Core Dependency Bar

Core/runtime packages should maintain a higher dependency bar than development tooling.

Avoid large dependencies for trivial functionality.

---

# 147. Provider Dependencies

Provider-specific dependencies belong in adapter packages.

They do not justify adding provider SDKs to the main framework package.

---

# 148. Release Dependency Audit

Before stable major releases, review important runtime/build dependencies for:

```text
known vulnerabilities
abandonment
license changes
unnecessary weight
```

---

# 149. Contributor Security

Contributors must never place real credentials in:

```text
issues
PRs
fixtures
tests
screenshots
logs
```

Accidentally exposed secrets should be revoked immediately.

---

# 150. CI From Forks

Fork PR CI must operate without protected release/provider secrets.

Trusted deployment/release jobs run only in protected contexts.

---

# 151. Bot Contributions

Automated dependency/update bots may open PRs.

They are subject to the same CI/review gates as human contributions.

---

# 152. AI-Assisted Contributions

Ranu.js does not prohibit AI-assisted code contributions.

The submitting contributor remains responsible for:

```text
correctness
license compliance
security
tests
understanding the change
```

AI-generated output receives no reduced review standard.

---

# 153. Generated Code

Generated code included in the repository must have a clear generation source/process.

Do not hand-edit generated files when regeneration is authoritative.

---

# 154. Governance Acceptance Criteria

This governance/release specification is complete when:

1. MIT is selected as the V1 license;
2. root license requirements are defined;
3. contribution licensing is defined;
4. CLA/DCO baseline is defined;
5. `main` is the primary branch;
6. branch protection expectations are defined;
7. maintainer/contributor roles are defined;
8. `CONTRIBUTING.md` is required;
9. Code of Conduct is required;
10. issue/PR workflow is defined;
11. high-risk changes are identified;
12. Changesets is the release-intent mechanism;
13. RFC threshold/process is defined;
14. ADR role is defined;
15. package ownership is defined;
16. official package families are defined;
17. npm namespace availability must be verified;
18. SemVer is adopted;
19. pre-1.0 behavior is defined;
20. alpha/beta/RC channels are defined;
21. npm dist-tag policy is defined;
22. aligned package versioning is defined;
23. changelog requirements are defined;
24. deprecation policy is defined;
25. experimental/internal API policy is defined;
26. Node/React/TypeScript support responsibility is defined;
27. release qualification is tied to quality/security specs;
28. release checklist is defined;
29. protected automated publishing is required;
30. provenance is required where supported;
31. package tarball validation is required;
32. npm versions are immutable;
33. broken release rollback policy is defined;
34. Git tag/release policy is defined;
35. private security reporting is required;
36. security support window is defined;
37. LTS is explicitly deferred;
38. release PR model is defined;
39. post-release registry verification is defined;
40. governance evolution path is defined.

---

# 155. Locked V1 Governance Decisions

The following are locked:

1. Ranu.js is released as an open-source project.
2. Ranu.js V1 source code uses the MIT License.
3. The canonical source repository is public.
4. `main` is the primary integration branch.
5. Normal changes use pull requests.
6. `main` receives branch protection before public beta.
7. Direct push to protected `main` is not the normal workflow.
8. Ranu.js begins with lightweight maintainer governance.
9. A lead maintainer may make final decisions during the initial small-team stage.
10. Maintainer privileges are based on trust and sustained project contribution.
11. `CONTRIBUTING.md` is required before public beta.
12. `CODE_OF_CONDUCT.md` is required before public beta.
13. Security vulnerabilities use a private reporting channel.
14. Public API/architecture changes require RFC-level consideration.
15. Small architecture decisions may use ADRs.
16. Accepted RFCs that change locked specifications require specification updates.
17. Changesets is the V1 package version/release-intent system.
18. Ranu.js follows Semantic Versioning.
19. Pre-1.0 breaking changes are permitted but must be documented intentionally.
20. Standard pre-release identifiers are `alpha`, `beta`, and `rc`.
21. Stable npm releases use the `latest` dist-tag.
22. Pre-release packages must not accidentally replace `latest`.
23. Tightly coupled official packages use aligned versions initially.
24. Stable public APIs receive SemVer compatibility protection after `1.0.0`.
25. Internal/deep imports are unsupported.
26. Experimental APIs must be explicitly marked.
27. Stable APIs should normally be deprecated before removal.
28. Stable API removal normally requires a major release.
29. Official releases must satisfy quality and security gates.
30. Protected CI is the normal npm publishing mechanism.
31. Local manual `npm publish` is not the normal release path.
32. Trusted/OIDC publishing is preferred where supported.
33. npm provenance is enabled where supported.
34. Official package tarballs are inspected before publication.
35. Releases are tested from packed artifacts rather than workspace links alone.
36. Published npm versions are immutable.
37. Broken versions are normally deprecated/followed by a patch rather than unpublished.
38. Dist-tags may be rolled back to a known good release.
39. Official coordinated release tags use `v<version>`.
40. Stable releases receive GitHub Releases.
41. Security support initially covers the current stable major.
42. During pre-1.0, only the current active line is guaranteed security attention unless otherwise announced.
43. V1 has no LTS program.
44. Provider adapters must pass target E2E before stable adapter release.
45. New stable public features require documentation.
46. Major breaking releases require migration guidance.
47. Release builds originate from clean, protected CI.
48. Post-publication registry smoke verification is required.
49. Fork PRs never receive protected release/provider secrets.
50. Governance changes affecting license/versioning/maintainer model require documented review.

---

# 156. Deferred Governance Features

Deferred until project scale requires them:

- formal steering committee;
- technical council;
- foundation ownership;
- public binding voting system;
- mandatory CLA;
- mandatory DCO;
- LTS release lines;
- paid support governance;
- enterprise edition governance;
- trademark policy;
- formal partner certification;
- canary/nightly release infrastructure;
- multi-repository governance;
- independent adapter versioning;
- release train calendar;
- maintainer election process;
- formal appeals board.

These must not block Ranu.js V1.

---

# 157. Relationship to Repository Structure

`13_REPOSITORY_AND_PACKAGE_STRUCTURE.md` defines:

```text
packages
.github
rfcs
.changeset
release tooling locations
```

This document defines how those structures are governed and used publicly.

---

# 158. Relationship to Quality Strategy

`14_TESTING_AND_QUALITY_STRATEGY.md` defines technical release quality gates.

A release cannot be declared stable if those required gates fail.

---

# 159. Relationship to Security Model

`15_SECURITY_MODEL.md` defines security release gates and vulnerability handling requirements.

This document defines the public governance and release process surrounding those requirements.

---

# 160. Required Repository Governance Files

Before public beta, repository should contain at minimum:

```text
README.md
LICENSE
CONTRIBUTING.md
CODE_OF_CONDUCT.md
SECURITY.md
CHANGELOG.md
```

plus relevant GitHub templates/workflows.

---

# 161. Required Next Document

The next required planning document is:

```text
17_DOCUMENTATION_AND_EXAMPLES_PLAN.md
```

It should define:

- documentation information architecture;
- Getting Started;
- installation;
- project structure;
- routing docs;
- rendering docs;
- server runtime docs;
- config/env docs;
- plugin docs;
- deployment docs;
- CLI docs;
- public API reference;
- migration/versioning docs;
- examples;
- tutorials;
- documentation testing;
- docs versioning;
- search/navigation;
- self-hosting of Ranu.js docs when framework maturity allows.

---

# 162. Final Governance Baseline

Ranu.js is a public MIT-licensed open-source framework developed in a GitHub monorepo.

The project begins with lightweight maintainer governance rather than a complex committee structure.

Normal work flows through issues, branches, pull requests, CI, review, and Changesets.

Significant public API and architecture changes use RFCs.

Smaller durable architecture decisions may use ADRs.

The `main` branch is protected before public beta.

Ranu.js follows Semantic Versioning and uses explicit alpha, beta, and release-candidate channels before stable releases.

Official packages are published to npm through protected CI, preferably using trusted/OIDC publishing and npm provenance.

Published versions are immutable.

Broken releases are corrected with new versions and, when necessary, dist-tag rollback or package deprecation.

Stable public APIs receive compatibility protection after `1.0.0`.

Security vulnerabilities use private coordinated handling.

The current stable major receives security support; V1 does not promise LTS.

Every stable release must pass the quality gates in `14_TESTING_AND_QUALITY_STRATEGY.md` and security gates in `15_SECURITY_MODEL.md`.

This document is the authoritative Ranu.js V1 open-source governance and release baseline.

---

**End of 16_OPEN_SOURCE_GOVERNANCE_AND_RELEASES.md**
