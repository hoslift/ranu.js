# 14_TESTING_AND_QUALITY_STRATEGY.md

**Project:** Ranu.js — JavaScript/TypeScript Full-Stack Web Framework  
**Document Type:** Testing & Quality Strategy  
**Status:** Implementation Baseline  
**Date:** 2026-08-10  
**Depends On:** `00_FRAMEWORK_VISION.md` through `13_REPOSITORY_AND_PACKAGE_STRUCTURE.md`  
**Primary Goal:** Establish release-grade correctness, compatibility, regression, security, and performance quality gates for Ranu.js V1  
**Primary CI Platforms:** Linux and Windows  
**Primary V1 Runtime:** Node.js  
**Primary V1 Renderer:** React

---

# 1. Purpose

This document defines the authoritative testing and quality strategy for Ranu.js V1.

It consolidates the test requirements already defined across the router, rendering, runtime, build, plugin, deployment, CLI, configuration, environment, public API, development plan, and repository specifications.

It specifies:

- test architecture;
- test layers;
- package-local unit tests;
- integration tests;
- fixture applications;
- browser E2E;
- CLI E2E;
- deployment E2E;
- security regression tests;
- compatibility matrices;
- performance benchmarks;
- CI workflows;
- coverage policy;
- flaky-test policy;
- snapshot policy;
- quality gates;
- alpha/beta/RC/stable release gates;
- failure triage;
- regression ownership;
- public API conformance;
- cross-platform quality requirements.

This document does not redefine subsystem behavior. It defines how Ranu.js proves that behavior.

---

# 2. Quality Objective

Ranu.js V1 must be safe to publish as a public open-source framework only when:

```text
specified behavior
=
implemented behavior
=
tested behavior
=
documented behavior
```

The quality system must catch:

```text
routing regressions
SSR regressions
SSG regressions
hydration failures
client/server boundary leaks
runtime bugs
CLI regressions
package/export breakage
deployment incompatibilities
security regressions
cross-platform failures
performance regressions
```

before stable release.

---

# 3. Quality Principles

## QLT-P01 — Tests Are Product Contracts

Tests validate public/specification behavior, not incidental implementation details.

## QLT-P02 — Layered Testing

Use the cheapest reliable test layer first, then confirm critical flows end-to-end.

## QLT-P03 — Cross-Platform by Default

Windows and Linux are mandatory CI targets.

## QLT-P04 — Public API First

Stable public APIs require direct conformance tests.

## QLT-P05 — Real Browser for Browser Behavior

Hydration, navigation, HMR, and client runtime behavior require real browser tests.

## QLT-P06 — Real Server for Runtime Behavior

HTTP, cookies, streaming, shutdown, and middleware require real Node server tests.

## QLT-P07 — Packed Package Validation

Workspace success is insufficient; published tarballs must be tested.

## QLT-P08 — Security Regressions Are Release Blockers

Known secret leakage, path traversal, or production error leakage blocks release.

## QLT-P09 — Flaky Tests Are Bugs

Do not normalize instability as acceptable CI noise.

## QLT-P10 — Performance Is Measured, Not Assumed

Optimization decisions require reproducible benchmarks.

---

# 4. Test Layers

Ranu.js uses these layers:

```text
L1  Unit
L2  Package Integration
L3  Cross-Package Integration
L4  Fixture Application
L5  CLI E2E
L6  Browser E2E
L7  Deployment E2E
L8  Security Regression
L9  Performance Benchmark
L10 Release Validation
```

Not every feature needs every layer, but release-critical flows must cross multiple layers.

---

# 5. Repository Test Locations

Package-local tests:

```text
packages/*/test/
adapters/*/test/
create-ranu/test/
```

Repository-level tests:

```text
tests/
├── integration/
├── e2e/
├── cli/
├── browser/
├── deployment/
├── security/
└── performance/
```

Fixtures:

```text
fixtures/
```

Examples:

```text
examples/
```

Examples are not substitutes for tests.

---

# 6. Test Runner Requirements

The primary unit/integration test runner must support:

```text
TypeScript
ESM
watch mode
coverage
Windows
Linux
parallel execution
test filtering
timeouts
structured reporters
```

The exact tool is selected during Phase 0.

The tool choice must not become a public Ranu.js API.

---

# 7. Browser Test Tool Requirements

Browser E2E tooling must support:

```text
Chromium
real navigation
network inspection
console inspection
reload
history
multiple pages/tabs where needed
dev server interaction
screenshots/traces on failure
```

Additional browsers may be added later.

---

# 8. Test Isolation

Every test must isolate:

```text
filesystem state
ports
environment variables
processes
temporary directories
build output
```

Tests must not depend on execution order.

---

# 9. Temporary Projects

Integration/E2E tests should create isolated temporary Ranu.js projects.

Recommended pattern:

```text
copy fixture
→ create temp dir
→ install/link workspace packages
→ run command/server
→ assert
→ cleanup
```

Do not mutate canonical fixture sources during tests.

---

# 10. Port Allocation

Tests must allocate free ports dynamically.

Avoid fixed shared ports such as:

```text
3000
3001
```

across parallel test workers.

---

# 11. Process Cleanup

Tests that spawn:

```text
Ranu.js dev
Ranu.js start
provider emulator
browser process
child worker
```

must always terminate them.

Test harnesses should kill orphan processes on timeout/failure.

---

# 12. Environment Isolation

Tests must set environment variables explicitly and restore them.

Never let developer-machine env values influence deterministic framework tests.

---

# 13. Unit Tests

Unit tests validate pure/local behavior.

Primary targets:

```text
segment parsing
route precedence
config validation
diagnostic formatting
manifest validation
cookie serialization
header normalization
plugin ordering
CLI argument parsing
adapter capability comparison
```

Unit tests should avoid launching servers/browsers unless the unit truly depends on them.

---

# 14. Package Integration Tests

Package-level integration validates several modules inside one package.

Examples:

```text
router discovery + matching
runtime request + response normalization
build transform + manifest output
plugin setup + hooks
CLI parser + project resolver
```

---

# 15. Cross-Package Integration

Repository-level integration validates architectural boundaries.

Examples:

```text
router + runtime
router + React renderer
runtime + server helpers
build + router + manifests
build + React hydration metadata
plugin + build
config + plugin
CLI + build
adapter + generic build artifact
```

---

# 16. Fixture Applications

Fixtures represent controlled application shapes.

Required V1 fixtures include:

```text
minimal
routing-basic
routing-dynamic
routing-conflicts
api-basic
middleware-basic
react-ssr
react-errors
hydration
static-generation
client-rendering
css-assets
env-boundaries
plugin-basic
plugin-invalid
cli-basic
deployment-node
deployment-vercel
security-secrets
```

---

# 17. Invalid Fixtures

Invalid applications are first-class test fixtures.

Examples:

```text
duplicate routes
invalid dynamic syntax
client imports server-only
private env in client
invalid config
invalid plugin API
incompatible adapter
duplicate static paths
```

Ranu.js quality depends on good failures, not only successful applications.

---

# 18. Snapshot Policy

Snapshots may be used for:

```text
diagnostic text
manifest structures
route tables
generated config snippets
```

Do not use large opaque snapshots for behavior that should have explicit assertions.

Snapshot changes require review.

---

# 19. Golden Files

Generated HTML, manifests, or package output may use golden files only when:

- output is intentionally stable;
- normalization removes nondeterministic fields;
- diffs remain reviewable.

Avoid golden files containing absolute paths, timestamps, or random build IDs unless normalized.

---

# 20. Router Test Strategy

Router is one of the highest-risk subsystems.

Required test areas:

```text
literal routes
dynamic segments
catch-all
optional catch-all
route groups
layout ancestry
error boundary ancestry
not-found ancestry
API routes
middleware route matching
precedence
collisions
case conflicts
Unicode
Windows separators
POSIX separators
reserved /_ranu/
```

---

# 21. Router Precedence Matrix

At minimum test:

```text
/static
/[id]
/[...slug]
/[[...slug]]
```

Ensure deterministic precedence independent of filesystem enumeration order.

---

# 22. Route Collision Tests

Must cover:

```text
two pages same URL
page vs route.ts same URL
route-group collisions
case-only collisions
public asset vs route where relevant
reserved namespace collisions
```

All correctness conflicts must fail clearly.

---

# 23. Rendering Test Strategy

Rendering tests cover:

```text
SSR
SSG
client mode
layouts
async components
metadata
not-found
errors
loading
redirects
hydration
client boundaries
```

---

# 24. SSR Tests

Required:

- root page;
- nested page;
- dynamic params;
- nested layouts;
- async page;
- async layout;
- metadata;
- cookies/headers access;
- redirect;
- notFound;
- render error;
- production-safe error output.

---

# 25. SSG Tests

Required:

- literal static route;
- dynamic static route;
- `generateStaticParams`;
- catch-all params;
- optional catch-all;
- duplicate paths;
- invalid params;
- missing generator;
- build-time env;
- metadata;
- not-found;
- client component inside SSG page;
- static output manifest.

---

# 26. Hydration Tests

Required:

- basic client component;
- nested client component;
- multiple client boundaries;
- state update after hydration;
- event handlers;
- props serialization;
- invalid/non-serializable props;
- hydration mismatch diagnostic;
- no unnecessary server-only code in client bundle.

---

# 27. Client Rendering Mode Tests

Required:

- direct document load;
- browser-only APIs;
- client hooks;
- deep-link reload;
- client navigation;
- server-only import rejection;
- metadata shell behavior.

---

# 28. Navigation Tests

Required:

```text
Link
push
replace
back
refresh
usePathname
useSearchParams
modifier-click
external links
full-document fallback
history behavior
query-string handling
```

---

# 29. Server Runtime Test Strategy

Runtime tests require real Node HTTP where behavior depends on transport.

Required:

```text
Request conversion
Response conversion
streaming
abort
headers
cookies
Set-Cookie
HEAD
204/304 body suppression
redirects
body limits
graceful shutdown
concurrency
```

---

# 30. Request Conversion Tests

Cover:

```text
method
URL
query
headers
body
host
protocol/forwarded handling according to trust policy
abort signal
```

---

# 31. Response Conversion Tests

Cover:

```text
status
status text if relevant
multiple headers
multiple Set-Cookie
text
JSON
binary
stream
redirect
HEAD
no-body statuses
```

---

# 32. Streaming Tests

Use real streaming responses.

Verify:

- first chunk arrives before final completion;
- chunks remain ordered;
- cancellation propagates;
- errors are handled safely;
- adapter claiming streaming truly streams.

---

# 33. Cookie Tests

Required:

- read;
- multiple cookies;
- set;
- delete;
- `HttpOnly`;
- `Secure`;
- `SameSite`;
- path/domain;
- multiple `Set-Cookie` preservation;
- invalid values rejected/escaped according to implementation.

---

# 34. Request Context Isolation

Concurrent requests must not leak:

```text
cookies
headers
params
locals
request IDs
```

between each other.

This requires explicit concurrency tests.

---

# 35. Middleware Tests

Required:

- matcher include;
- matcher exclude;
- continuation;
- redirect;
- direct response;
- locals;
- error;
- public asset handling;
- `/_ranu/` bypass;
- API route interaction;
- SSR interaction.

---

# 36. Build System Test Strategy

Build tests cover:

```text
TypeScript
JSX/TSX
server graph
client graph
"use client"
server-only
Node built-ins
env substitution
CSS
assets
code splitting
tree shaking
source maps
static generation
manifests
atomic build
```

---

# 37. Compiler Tests

At minimum:

- `.ts`;
- `.tsx`;
- `.js`;
- `.jsx`;
- valid JSX;
- TypeScript syntax;
- directive parsing;
- source maps;
- route export analysis.

---

# 38. `"use client"` Tests

Required:

- valid top-level directive;
- directive after comments;
- string literal later in module does not count;
- dependency propagation;
- client entry generation;
- nested client boundary.

---

# 39. Server-Only Tests

Required:

```text
Ranu.js/server-only
server/ directory
direct client violation
indirect client violation
Node built-in in client
server-safe Node built-in
```

Build must fail with import chain.

---

# 40. Environment Build Tests

Required:

- `RANU_PUBLIC_*` referenced in client;
- private env referenced in server;
- private env direct client access fails;
- dynamic client access does not expose secret;
- entire `process.env` not injected;
- seeded secret scan.

---

# 41. CSS Tests

Required:

- global CSS;
- CSS Modules;
- deterministic ordering;
- extraction;
- route association;
- production URL;
- invalid CSS diagnostic.

---

# 42. Asset Tests

Required:

- imported image;
- public file;
- content hash;
- MIME;
- missing file;
- reserved namespace;
- no `.env` accidental publication;
- no server file publication.

---

# 43. Build Atomicity Tests

Simulate build failure mid-pipeline.

Verify:

- incomplete new build not promoted;
- previous valid build preserved or clearly separated;
- completion marker absent;
- `Ranu.js start` rejects incomplete output.

---

# 44. Manifest Tests

Required:

- schema version;
- build ID;
- route/server/client/static cross-reference;
- missing referenced chunk;
- deterministic order;
- no absolute private path in public manifest;
- no secret;
- incompatible version rejected.

---

# 45. Development System Test Strategy

Dev tests cover:

```text
startup
route watching
source changes
server invalidation
client HMR
Fast Refresh
config restart
env restart
error recovery
route add/remove/rename
```

---

# 46. Dev Startup Tests

Verify:

- ready state only after valid initialization;
- local host binding;
- explicit port;
- occupied port behavior;
- plugin dev hooks;
- initial route table.

---

# 47. HMR Tests

Required:

- edit client component;
- state preservation when Fast Refresh valid;
- server page edit;
- CSS edit;
- error introduced;
- error corrected;
- full reload fallback;
- no duplicate HMR clients.

---

# 48. Route Watch Tests

Required:

```text
add page
remove page
rename page
add dynamic route
introduce collision
resolve collision
add/remove layout
```

No manual restart should be required where specified.

---

# 49. Config Restart Tests

Required:

- edit config;
- invalid config;
- recover valid config;
- plugin list change;
- port/host change behavior;
- no duplicate watchers;
- cleanup hooks.

---

# 50. Plugin Test Strategy

Required:

```text
definePlugin
identity
API version
compatibility
ordering
async hooks
config hooks
route metadata
build hooks
dev hooks
artifact ownership
collisions
invalid definitions
unknown hooks
```

---

# 51. Third-Party Plugin Fixture

At least one plugin fixture must be written as if maintained externally.

It may import only:

```text
Ranu.js/plugin
```

and other documented public APIs.

No monorepo-internal imports.

---

# 52. Plugin Failure Tests

Ensure plugin failures report:

```text
plugin name
hook
cause
file/context where available
```

and fail build when required.

---

# 53. CLI Test Strategy

CLI tests cover both parser/service layers and real subprocess execution.

Required:

```text
help
version
unknown command
unknown option
root discovery
dev
build
start
create
deploy
JSON output
CI
signals
exit codes
```

---

# 54. CLI Subprocess Tests

Important commands must be executed as real child processes against temp projects.

Workspace-internal direct function tests are insufficient for release validation.

---

# 55. `Ranu.js create` Tests

Required:

- TypeScript default;
- target directory;
- non-empty refusal;
- skip install;
- package-manager selection;
- safe `.gitignore`;
- generated package scripts;
- generated app dev/build/start;
- Windows/Linux.

---

# 56. `Ranu.js build` Tests

Required:

- success;
- route failure;
- type/build failure where enabled;
- static generation failure;
- plugin failure;
- atomic output;
- JSON diagnostics;
- correct exit code.

---

# 57. `Ranu.js start` Tests

Required:

- valid build;
- missing build;
- corrupt build;
- manifest mismatch;
- host/port;
- runtime env;
- graceful shutdown;
- no rebuild;
- no build-plugin rediscovery.

---

# 58. Deployment Test Strategy

Deployment adapter tests must validate target semantics, not just file generation.

Layers:

```text
adapter unit
target package inspection
local/emulated invocation
real provider E2E where practical
```

---

# 59. Generic Node Deployment Tests

Required:

```text
SSR
SSG
API
client hydration
middleware
assets
runtime env
streaming
graceful shutdown
```

on Linux and Windows where applicable.

---

# 60. Container Tests

Required:

- image builds;
- container starts;
- port binding;
- runtime env;
- static assets;
- SSR/API;
- SIGTERM;
- no source dependency;
- read-only app artifact where configured.

---

# 61. Vercel Adapter Tests

Before stable adapter release, verify against current Vercel:

```text
preview deploy
production deploy
SSR
API
static
assets
middleware strategy
streaming
env
cookies
redirects
dynamic routes
```

Use current provider behavior; do not rely only on mocks.

---

# 62. Static Adapter Tests

If static adapter exists:

- static app succeeds;
- dynamic SSG succeeds;
- client-only deep link works;
- SSR app rejected;
- API app rejected;
- runtime middleware rejected.

---

# 63. Public API Conformance Tests

Required imports:

```text
Ranu.js
Ranu.js/config
Ranu.js/react
Ranu.js/server
Ranu.js/plugin
```

Validate:

- types resolve;
- runtime domains correct;
- deep imports blocked;
- public exports match specification;
- examples compile with packed package.

---

# 64. Packed Package Tests

Before release:

```text
pack Ranu.js
pack create-ranu
pack public adapters
```

Install tarballs into clean temp projects.

Run:

```text
typecheck
dev
build
start
```

This is mandatory before RC/stable.

---

# 65. Peer Dependency Tests

Test with supported React versions/ranges.

Ensure:

- no duplicate React bundled;
- peer dependency warnings are correct;
- hydration works across supported versions.

---

# 66. Node Compatibility Matrix

The release policy must define supported Node versions.

CI should cover:

```text
minimum supported Node
latest supported LTS/current approved version
```

At minimum during beta/stable.

---

# 67. TypeScript Compatibility Matrix

Compile public API fixtures against the supported TypeScript range.

Do not rely only on the repository's single TypeScript version.

---

# 68. Browser Compatibility Matrix

At minimum stable release should validate:

```text
Chromium-based browser
```

If official browser support includes Firefox/WebKit, add them to CI or scheduled validation.

The support statement must match actual testing.

---

# 69. Operating System Matrix

Mandatory:

```text
Linux
Windows
```

Recommended before stable:

```text
macOS smoke validation
```

OS-specific tests should focus on:

```text
paths
signals
ports
symlinks
package spawning
watchers
filesystem case behavior
```

---

# 70. Security Regression Strategy

Security tests are first-class.

Required categories:

```text
secret exposure
path traversal
public asset escape
source-map leakage
stack leakage
header injection
cookie correctness
proxy trust
client/server boundary
plugin artifact collision
deployment credential leakage
```

---

# 71. Secret Leakage Test

Seed:

```text
RANU_TEST_PRIVATE_SECRET_9f3c...
```

Scan:

```text
client JS
CSS
HTML
browser manifests
public source maps
public static files
deployment public directories
```

Unexpected occurrence fails CI.

---

# 72. Path Traversal Tests

Attack inputs should cover:

```text
../
..\
encoded traversal
symlink traversal
public file escape
generated artifact escape
clean/delete path escape
```

---

# 73. Error Leakage Tests

Production errors must not expose:

```text
absolute filesystem paths
stack traces
environment values
server source
internal package paths
```

unless explicitly configured for secure internal observability.

---

# 74. Proxy Trust Tests

Verify forwarded headers are not trusted when trust is disabled.

When trust is enabled/configured, verify expected behavior only.

---

# 75. Header Injection Tests

Validate user-controlled values cannot create invalid multi-header injection through framework helpers.

---

# 76. Cookie Security Tests

Verify framework serialization preserves:

```text
HttpOnly
Secure
SameSite
Path
Domain
Max-Age
Expires
```

and rejects malformed names/values as required.

---

# 77. Plugin Security Tests

Supported APIs must not permit accidental:

```text
/_ranu/ override
route ID mutation
server module publication
artifact overwrite
private env publication
```

This is structural safety, not sandboxing.

---

# 78. Dependency Security

CI should run dependency vulnerability scanning using ecosystem-supported tooling.

Vulnerability results require triage rather than blindly failing every advisory.

Known exploitable high-severity runtime/build vulnerabilities block release.

---

# 79. Performance Benchmark Strategy

Performance tests are informational early and gating later.

Required baseline metrics:

```text
CLI startup
dev cold start
dev warm start
HMR latency
production build time
SSR latency
SSR throughput
SSG throughput
client runtime size
route chunk size
Node memory
Vercel cold start where practical
```

---

# 80. Benchmark Principles

Benchmarks must:

- use fixed fixtures;
- pin machine/environment where possible;
- record Node/Ranu.js versions;
- warm/cold distinguish;
- report median and variance;
- avoid single-run conclusions.

---

# 81. Performance Regression Gate

Before stable, define thresholds for major regressions.

Example policy:

```text
>20% regression in a stable benchmark
→ investigation required
```

Exact thresholds are set once baseline data exists.

---

# 82. Bundle Size Tracking

Track:

```text
ranu CLIent runtime
minimal hydrated app JS
minimal static app JS
main package tarball size
adapter tarball size
```

Unexpected growth requires review.

---

# 83. Coverage Policy

Coverage is a diagnostic, not a vanity target.

Use coverage to identify untested logic.

Recommended baseline:

- high coverage for parsers, config, manifests, diagnostics, routing;
- integration/E2E for runtime/rendering behavior.

Do not require 100% line coverage across browser/server integration code if it encourages low-value tests.

---

# 84. Coverage Gate

Before beta, set package-specific minimums for critical pure-logic packages.

Possible:

```text
router
config
diagnostics
manifests
```

with stricter thresholds than integration-heavy packages.

---

# 85. Mutation Testing

Mutation testing is optional and deferred.

It may later be applied to high-risk pure logic such as route precedence and config validation.

---

# 86. Fuzz Testing

Fuzz/property-based testing is recommended for:

```text
route parser
URL/path handling
header/cookie parser
manifest validator
```

but not required for initial alpha.

Before stable, targeted property tests for route/path parsing are strongly recommended.

---

# 87. Flaky Test Policy

A flaky test must be:

```text
fixed
or
temporarily quarantined with an issue and owner
```

Never permanently “retry until green” without investigation.

Retries may collect diagnostic evidence but must not hide chronic instability.

---

# 88. Quarantine Policy

If a test is quarantined:

- create issue;
- document reason;
- assign owner;
- set removal deadline/milestone;
- exclude only from specific blocking job if unavoidable.

Stable release must not rely on a large quarantined suite.

---

# 89. Timeouts

Tests must use realistic explicit timeouts.

Avoid excessively long global timeouts that hide deadlocks.

Hanging dev/build/start tests should fail quickly enough to diagnose.

---

# 90. Test Retries

Retries may be enabled for external provider/network E2E due to transient infrastructure.

Core local deterministic tests should not need retries.

---

# 91. CI Workflow Layers

Recommended workflows:

```text
ci-core
ci-windows
ci-browser
ci-security
ci-deployment
ci-release
```

They may be implemented as jobs inside fewer workflow files.

---

# 92. Pull Request Required Checks

Before public beta, PRs should require:

```text
typecheck
lint
unit
integration
Linux package build
Windows package build
public API export check
```

Browser/security jobs may be conditionally required based on changed areas until performance permits full execution.

---

# 93. Scheduled CI

Nightly/regular scheduled jobs should run:

```text
full browser matrix
provider deployment E2E
dependency security scans
performance benchmarks
extended fuzz/property tests
```

when too expensive for every PR.

---

# 94. Changeset/Release Validation

Release CI must verify:

```text
version changes
changelog
package dependency ranges
tarballs
public exports
npm files
license metadata
provenance configuration
```

---

# 95. Quality Gate — V0 Prototype

Must pass:

```text
router unit tests
Node runtime integration
React SSR integration
API GET integration
basic diagnostics
Linux CI
Windows smoke CI
```

---

# 96. Quality Gate — Public Alpha

Must pass:

```text
core unit/integration
CLI dev/build/start
create-ranu
basic browser hydration
basic secret scan
Linux + Windows
packed Ranu.js smoke install
```

Known limitations may remain documented.

---

# 97. Quality Gate — Public Beta

Must pass:

```text
full routing matrix
SSR/SSG/client matrix
middleware
HMR/Fast Refresh
plugin API
Node/container deployment
Vercel deployment
security regression suite
public API conformance
docs example builds
Node version matrix
```

No unresolved high-severity security defects.

---

# 98. Quality Gate — RC

RC requires:

```text
feature freeze
public API freeze
manifest freeze
package export freeze
full E2E green
packed package E2E green
provider E2E green
security suite green
performance baseline recorded
no critical flaky tests
```

---

# 99. Quality Gate — 1.0.0

Stable requires:

```text
all RC gates
release workflow proven
npm packages verified
GitHub release artifacts verified
documentation links verified
starter verified from npm
security disclosure process active
no known release blockers
```

---

# 100. Release Blocker Severity

Classify defects:

```text
Critical
High
Medium
Low
```

Examples:

### Critical

```text
remote code execution
secret leakage by default
arbitrary file read/write escape
broken package publication
```

### High

```text
route misdispatch
cross-request context leak
production stack leakage
major hydration breakage
```

Critical/High unresolved framework defects block beta/stable depending on severity/context.

---

# 101. Regression Ownership

Every regression should identify owning subsystem:

```text
router
runtime
react
build
dev
plugin
cli
deployment
config
public-api
```

Fixes should add a regression test at the lowest appropriate layer.

---

# 102. Bug Fix Rule

A bug fix is incomplete without:

- reproduction;
- regression test where feasible;
- fix;
- relevant docs/changelog update if public behavior changed.

---

# 103. Spec Conformance Review

At milestone boundaries, compare implementation/tests against:

```text
03 routing
04 rendering
05 runtime
06 build
07 plugin
08 deployment
09 CLI
10 config
11 public API
12 development plan
13 repository structure
```

Any mismatch must be resolved intentionally.

---

# 104. Public API Snapshot

Before beta, create an API surface snapshot for `Ranu.js`.

Track:

```text
exports
types
deprecated symbols
experimental symbols
```

Unexpected changes fail or require explicit review.

---

# 105. Manifest Compatibility Tests

Before stable, maintain fixture manifests from previous compatible versions where relevant.

Verify runtime/adapter behavior according to version compatibility policy.

If cross-version manifest compatibility is not promised, fail clearly rather than silently misread.

---

# 106. Backward Compatibility Tests

After 1.0, maintain representative applications from prior minor versions where practical.

Test upgrades across supported 1.x versions.

---

# 107. Documentation Test Strategy

Docs code examples should be validated.

Preferred:

```text
compile snippets
build example apps
link checking
API symbol validation
```

Do not allow documentation to drift from public API.

---

# 108. Example Build Gate

Every official example must:

```text
install
typecheck
build
```

in CI.

Interactive/browser examples should additionally run targeted E2E.

---

# 109. Starter Gate

`create-ranu` default starter must be tested against packed npm-like artifacts.

Workspace linking alone is insufficient.

---

# 110. Open-Source Contributor Quality

Contributor PRs should receive clear failures.

CI output must identify:

```text
package
test
diagnostic
platform
```

Avoid opaque mega-jobs where one failure hides everything.

---

# 111. Local Developer Commands

Recommended root quality commands:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:browser
pnpm test:security
pnpm test:performance
```

Exact scripts may evolve.

---

# 112. Fast PR Loop

Provide a fast local/PR path:

```text
typecheck
lint
affected unit
affected integration
```

Full expensive suites run separately.

---

# 113. Affected Testing

Repository tooling may later run only affected packages/tests on PRs.

However, stable release always runs the full matrix.

---

# 114. Test Data

Use deterministic fake data.

Never use real customer/user data in fixtures.

---

# 115. Network Dependence

Core local tests should avoid external internet access.

Provider E2E and package-registry tests may require network and should be isolated/tagged.

---

# 116. Mocking Policy

Mock only external boundaries where needed.

Do not over-mock the framework itself.

Example:

- router unit tests may mock filesystem abstraction;
- runtime integration should use real Web Request/Response;
- browser E2E should use real browser;
- provider adapter unit may mock provider primitives, but real provider E2E is still required before stable.

---

# 117. Test Helpers

Create shared internal test utilities under:

```text
tooling/test-utils
```

or equivalent.

Potential helpers:

```text
createTempProject
runCli
startRanu
waitForReady
fetchPage
openBrowser
readManifest
scanDirectory
```

These remain internal.

---

# 118. Test Helper Stability

Test helper APIs are repository-internal.

Do not expose them through public Ranu.js packages.

---

# 119. Determinism

Normalize or control:

```text
timestamps
random build IDs
temp paths
port numbers
OS path separators
```

before snapshot/golden comparisons.

---

# 120. Randomized Build IDs

Tests may inject a deterministic build-ID generator when validating manifest snapshots.

Production algorithm remains independent.

---

# 121. Concurrency Tests

Explicitly test concurrent:

```text
SSR requests
API requests
middleware locals
static generation workers
build operations where supported
```

to catch shared-state bugs.

---

# 122. Resource Leak Tests

Long-running suites should detect:

```text
open handles
orphan servers
unclosed watchers
child processes
browser processes
```

after tests.

---

# 123. Memory Regression

Before stable, measure repeated request/dev rebuild memory growth.

Persistent unbounded growth is a release concern.

---

# 124. HMR Reliability Metric

Track representative HMR success and latency on fixed fixture.

HMR must not require frequent manual restarts.

---

# 125. Error Overlay Tests

Development browser tests should validate:

```text
compile error shown
source location
error disappears after fix
application recovers
```

---

# 126. Diagnostics Quality Tests

Important diagnostics should have explicit tests for:

```text
code
message
file
hint
import chain
plugin/adapter attribution
```

Do not assert only that “an error happened.”

---

# 127. Machine-Readable Diagnostics Tests

`--json` output must remain valid parseable JSON/NDJSON according to contract.

No human banners or ANSI noise in machine output.

---

# 128. Accessibility of CLI Output

Color/symbols must not be required to understand failures.

Test `NO_COLOR` and non-TTY output.

---

# 129. Windows-Specific Quality

Mandatory Windows tests include:

```text
backslash paths
drive paths
spawn behavior
file locks
signals/fallback shutdown
symlink/workspace behavior
watcher behavior
case-insensitive filesystem issues
```

---

# 130. Linux-Specific Quality

Mandatory Linux tests include:

```text
case-sensitive paths
signals
container execution
Node production runtime
permissions
symlinks
```

---

# 131. macOS

Recommended smoke tests before stable, especially for developer experience and filesystem case behavior.

Not mandatory as the first CI platform.

---

# 132. Container CI

Use container build/run tests on Linux CI.

Validate the documented Docker workflow directly.

---

# 133. Provider Secrets in CI

Real provider E2E uses protected CI secrets.

Fork PRs without secrets must skip remote deployment jobs safely rather than fail unrelated checks.

---

# 134. Fork Safety

Public open-source CI must not expose repository secrets to untrusted fork code.

Provider publish/deploy jobs must run only in trusted contexts.

---

# 135. Release Workflow Security

Release jobs require protected branch/tag conditions and restricted permissions.

Package publishing must not run on arbitrary pull requests.

---

# 136. Artifact Retention

On failed E2E/browser/deployment jobs, retain useful artifacts:

```text
logs
browser traces
screenshots
generated manifests
build summaries
```

Do not retain secret-bearing env files.

---

# 137. Log Redaction

CI logs must not print secrets.

Provider CLI output should be reviewed/configured to avoid credential leakage.

---

# 138. Test Naming

Test names should describe behavior.

Good:

```text
rejects client import of server-only transitive dependency
```

Bad:

```text
test 4
```

---

# 139. Directory Naming

Keep test suites discoverable by subsystem and layer.

Avoid a single huge `tests.ts` per package.

---

# 140. Quality Metrics Dashboard

Optional post-alpha dashboard may track:

```text
CI pass rate
flake rate
coverage
bundle size
build time
HMR latency
SSR latency
open critical bugs
```

Not required for initial implementation.

---

# 141. Testing Acceptance Criteria

The Ranu.js V1 quality strategy is complete when:

1. test layers are defined;
2. repository locations are defined;
3. package-local unit tests are required;
4. cross-package integration tests are required;
5. invalid fixtures are first-class;
6. browser E2E is required for hydration/navigation/HMR;
7. real Node server tests are required for runtime behavior;
8. CLI subprocess tests are required;
9. packed-package tests are required before release;
10. Node compatibility matrix is defined;
11. TypeScript compatibility testing is defined;
12. Linux and Windows are mandatory;
13. security regression categories are defined;
14. seeded secret scanning is required;
15. path traversal tests are required;
16. production error leakage tests are required;
17. deployment adapter testing is defined;
18. Vercel real E2E is required before stable adapter release;
19. performance baselines are required;
20. flaky-test policy is defined;
21. release quality gates are defined;
22. alpha/beta/RC/stable criteria are testable;
23. documentation/example testing is required;
24. public API conformance is required;
25. release CI protects secrets;
26. stable release cannot rely only on workspace-linked packages;
27. full stable release matrix runs before `1.0.0`.

---

# 142. Locked V1 Quality Decisions

The following are locked:

1. Ranu.js uses layered testing.
2. Tests are written during implementation, not only after feature completion.
3. Windows and Linux are mandatory CI platforms.
4. Router correctness receives extensive unit/fixture testing.
5. Runtime HTTP behavior requires real server integration tests.
6. Browser behavior requires real browser E2E.
7. Hydration, navigation, HMR, and Fast Refresh require browser tests.
8. CLI critical commands require real subprocess tests.
9. Deployment adapters require target-level validation.
10. Vercel adapter needs real current-platform E2E before stable release.
11. Packed npm artifacts are tested before RC/stable.
12. Official examples use public APIs and build in CI.
13. `create-ranu` output is tested end-to-end.
14. Public API export maps are tested.
15. Deep internal imports are tested as unsupported.
16. Client/server boundary regressions are release blockers.
17. Seeded private-secret scans are mandatory.
18. Path traversal regression tests are mandatory.
19. Production stack/source leakage tests are mandatory.
20. Flaky tests are treated as defects.
21. Core deterministic tests should not rely on retries.
22. Provider/network E2E may use controlled retries.
23. Performance is measured against fixed fixtures.
24. Coverage is used as a quality signal, not a universal vanity target.
25. Critical pure-logic packages should receive stronger coverage requirements.
26. Full release qualification is stricter than PR qualification.
27. RC requires public API/package/manifest freeze.
28. Stable release requires all critical quality gates green.
29. Security-critical regressions block release.
30. Every bug fix should add a regression test where feasible.

---

# 143. Deferred Quality Features

Deferred unless later justified:

- mandatory mutation testing;
- mandatory full browser matrix on every PR;
- mandatory macOS CI on every PR;
- large-scale distributed load testing;
- fuzzing every subsystem;
- formal verification;
- chaos engineering;
- multi-region provider test fleet;
- permanent performance dashboard service;
- automatic bisect service.

These must not block a strong V1 quality baseline.

---

# 144. Relationship to Development Plan

`12_DEVELOPMENT_PLAN.md` defines implementation phases.

This document defines the quality gates that accompany those phases.

No phase should be marked Done without its required tests.

---

# 145. Relationship to Repository Structure

`13_REPOSITORY_AND_PACKAGE_STRUCTURE.md` defines where tests, fixtures, examples, workflows, and tooling live.

This document defines what those directories must prove.

---

# 146. Relationship to Security Model

`15_SECURITY_MODEL.md` will define the detailed threat model.

This document already locks the security regression test categories required by V1.

---

# 147. Relationship to Open-Source Releases

`16_OPEN_SOURCE_GOVERNANCE_AND_RELEASES.md` will define release workflow and governance.

This document defines the technical quality gates that release governance must enforce.

---

# 148. Required Next Document

The next required planning document is:

```text
15_SECURITY_MODEL.md
```

It should define:

- threat model;
- trust boundaries;
- attacker capabilities;
- client/server boundary risks;
- environment/secret threats;
- routing/path traversal;
- XSS/serialization;
- header/cookie security;
- proxy trust;
- plugin supply-chain trust;
- build/deployment artifact security;
- production error exposure;
- vulnerability severity/response;
- required security tests.

---

# 149. Final Quality Baseline

Ranu.js V1 quality is proven through layered tests, real Node runtime integration, real browser E2E, packed-package validation, cross-platform CI, deployment E2E, security regression scans, and reproducible performance benchmarks.

The framework does not consider a feature complete because it compiles locally.

A feature is complete only when its specification behavior is implemented, tested at the correct layers, integrated with the rest of the framework, and safe for public use.

Linux and Windows are mandatory.

Browser behavior is tested in a real browser.

HTTP behavior is tested through real servers.

Published package behavior is tested from packed artifacts.

Security regressions such as secret leakage, path traversal, production error leakage, and client/server boundary failures block release.

Alpha, beta, RC, and stable releases have progressively stronger quality gates.

Ranu.js `1.0.0` is released only when the complete release matrix passes and no known critical quality or security blocker remains.

This specification is the authoritative Ranu.js V1 testing and quality contract.

---

**End of 14_TESTING_AND_QUALITY_STRATEGY.md**
