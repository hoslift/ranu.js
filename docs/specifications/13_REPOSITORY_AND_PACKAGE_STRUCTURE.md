# 13_REPOSITORY_AND_PACKAGE_STRUCTURE.md

**Project:** Ranu.js — JavaScript/TypeScript Full-Stack Web Framework  
**Document Type:** Repository & Package Structure Specification  
**Status:** Implementation Baseline  
**Date:** 2026-08-10  
**Depends On:** `00_FRAMEWORK_VISION.md` through `12_DEVELOPMENT_PLAN.md`  
**Repository Model:** Public Open-Source Monorepo  
**Primary Package Manager:** pnpm  
**Workspace Model:** pnpm workspaces  
**Primary Public Package:** `Ranu.js`  
**Primary Scaffold Package:** `create-ranu`  
**Official Adapter Naming:** `@ranu/adapter-*`

---

# 1. Purpose

This document defines the authoritative repository, workspace, package, publication, and directory structure for Ranu.js V1.

It specifies:

- exact monorepo layout;
- package manager and workspace configuration;
- root tooling files;
- public vs internal packages;
- publishable vs workspace-only packages;
- package naming;
- package dependency direction;
- package export maps;
- TypeScript project structure;
- build output layout;
- examples;
- fixtures;
- tests;
- documentation;
- RFC/ADR storage;
- GitHub configuration;
- release tooling location;
- npm publication boundaries;
- generated files;
- repository ignore rules;
- package-level Definition of Done.

This document is the source of truth for creating the Ranu.js GitHub repository and Phase 0 implementation scaffold.

---

# 2. Repository Objective

The Ranu.js repository must support:

```text
framework development
package isolation
cross-package type safety
public npm publishing
open-source contribution
cross-platform CI
integration fixtures
examples
documentation
release automation
```

without forcing every implementation detail to become public API.

---

# 3. Repository Principles

## REP-P01 — One Public Monorepo

Ranu.js V1 is developed in one public GitHub monorepo.

## REP-P02 — Clear Package Ownership

Each package owns one architectural responsibility.

## REP-P03 — Public API Is Smaller Than Repository

Most repository packages may remain internal even though their source is public.

## REP-P04 — Dependency Direction Is Explicit

Packages may depend only on lower-level architectural layers.

## REP-P05 — No Circular Dependencies

Workspace package cycles are not allowed in the V1 architecture.

## REP-P06 — Publish Intentionally

A package is published only when there is a real distribution/runtime reason.

## REP-P07 — Examples Use Public APIs

Official examples must not import internal Ranu.js packages.

## REP-P08 — Fixtures May Use Internals Only When Testing Internals

Test fixtures are not public API examples.

## REP-P09 — Generated Files Stay Generated

Build/cache/generated output never becomes source-of-truth.

## REP-P10 — Tooling Stays Out of Runtime

Linting, testing, release, docs, and repository tooling must not leak into application runtime dependencies.

---

# 4. Canonical Repository Name

Recommended GitHub repository:

```text
Ranu.js
```

Conceptual:

```text
github.com/<org-or-owner>/hfx
```

The final organization/owner may change without changing repository architecture.

---

# 5. Root Repository Layout

Canonical V1 structure:

```text
hfx/
├── packages/
│   ├── hfx/
│   ├── core/
│   ├── config/
│   ├── diagnostics/
│   ├── manifests/
│   ├── router/
│   ├── runtime/
│   ├── runtime-node/
│   ├── server/
│   ├── react/
│   ├── build/
│   ├── dev/
│   ├── cli/
│   └── plugin/
│
├── adapters/
│   ├── node/
│   ├── container/
│   └── vercel/
│
├── create-ranu/
├── examples/
├── fixtures/
├── tests/
├── docs/
├── rfcs/
├── tooling/
├── scripts/
├── .github/
│   ├── workflows/
│   ├── ISSUE_TEMPLATE/
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── dependabot.yml
│
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.base.json
├── tsconfig.json
├── eslint.config.js
├── prettier.config.mjs
├── .editorconfig
├── .gitignore
├── .npmrc
├── README.md
├── LICENSE
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
├── CHANGELOG.md
└── ROADMAP.md
```

Some root files may be introduced later in the release phases, but their locations are locked here.

---

# 6. Package Manager

The Ranu.js monorepo uses:

```text
pnpm
```

as the primary repository package manager.

Reasons:

- strong workspace support;
- efficient dependency storage;
- strict dependency resolution;
- workspace protocol support;
- common open-source monorepo usage.

---

# 7. Package Manager Declaration

Root `package.json` must declare:

```json
{
  "packageManager": "pnpm@<locked-version>"
}
```

The exact pnpm version is selected during repository bootstrap and updated intentionally.

---

# 8. Workspace Configuration

`pnpm-workspace.yaml` should include:

```yaml
packages:
  - "packages/*"
  - "adapters/*"
  - "create-ranu"
  - "examples/*"
  - "fixtures/*"
  - "tooling/*"
```

`tests/`, `docs/`, or other directories may be included if they contain package manifests.

---

# 9. Root Package

The repository root package is:

```text
private
```

Example:

```json
{
  "name": "hfx-monorepo",
  "private": true
}
```

It is never published to npm.

---

# 10. Root Scripts

Recommended root scripts:

```json
{
  "scripts": {
    "build": "pnpm -r build",
    "dev": "pnpm --filter Ranu.js dev",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "test:unit": "...",
    "test:integration": "...",
    "test:e2e": "...",
    "lint": "...",
    "format": "...",
    "format:check": "...",
    "clean": "...",
    "changeset": "changeset",
    "version-packages": "changeset version",
    "release": "changeset publish"
  }
}
```

Exact command implementation may evolve.

---

# 11. Workspace Protocol

Internal workspace dependencies should use:

```text
workspace:*
```

or another intentional workspace range.

Example:

```json
{
  "dependencies": {
    "@ranu/core": "workspace:*"
  }
}
```

Publication tooling must rewrite ranges correctly where needed.

---

# 12. Package Naming Model

There are three naming groups.

## Public framework

```text
Ranu.js
create-ranu
```

## Official public adapters

```text
@ranu/adapter-vercel
```

and other implemented adapters.

## Internal architectural packages

```text
@ranu/core
@ranu/config
@ranu/diagnostics
@ranu/manifests
@ranu/router
@ranu/runtime
@ranu/runtime-node
@ranu/server
@ranu/react
@ranu/build
@ranu/dev
@ranu/cli
@ranu/plugin
```

Internal package names are repository implementation identities, not automatically supported application imports.

---

# 13. Public Package Classification

Each package must declare one of:

```text
PUBLIC_STABLE
PUBLIC_ADAPTER
PUBLISHED_INTERNAL
WORKSPACE_INTERNAL
```

This classification should be documented in package metadata or repository documentation.

---

# 14. Package Classification Table

Recommended V1 classification:

| Directory | Package | Classification | npm publication |
|---|---|---|---|
| `packages/hfx` | `Ranu.js` | PUBLIC_STABLE | Yes |
| `create-ranu` | `create-ranu` | PUBLIC_STABLE | Yes |
| `adapters/vercel` | `@ranu/adapter-vercel` | PUBLIC_ADAPTER | Yes |
| `adapters/node` | `@ranu/adapter-node` | PUBLIC_ADAPTER or internal | Optional |
| `adapters/container` | `@ranu/adapter-container` | PUBLIC_ADAPTER or docs-only | Optional |
| `packages/core` | `@ranu/core` | WORKSPACE_INTERNAL | No by default |
| `packages/config` | `@ranu/config` | PUBLISHED_INTERNAL or workspace | Prefer internal |
| `packages/diagnostics` | `@ranu/diagnostics` | WORKSPACE_INTERNAL | No |
| `packages/manifests` | `@ranu/manifests` | PUBLISHED_INTERNAL if adapters require it | Optional |
| `packages/router` | `@ranu/router` | WORKSPACE_INTERNAL | No |
| `packages/runtime` | `@ranu/runtime` | PUBLISHED_INTERNAL if required | Optional |
| `packages/runtime-node` | `@ranu/runtime-node` | PUBLISHED_INTERNAL if required | Optional |
| `packages/server` | `@ranu/server` | WORKSPACE_INTERNAL | No |
| `packages/react` | `@ranu/react` | WORKSPACE_INTERNAL | No |
| `packages/build` | `@ranu/build` | WORKSPACE_INTERNAL | No |
| `packages/dev` | `@ranu/dev` | WORKSPACE_INTERNAL | No |
| `packages/cli` | `@ranu/cli` | PUBLISHED_INTERNAL or bundled into `Ranu.js` | Optional |
| `packages/plugin` | `@ranu/plugin` | WORKSPACE_INTERNAL | No |

The exact publication of internal packages should minimize npm surface.

---

# 15. Preferred Publication Strategy

Preferred V1:

```text
publish:
  Ranu.js
  create-ranu
  @ranu/adapter-vercel

keep internal:
  most @ranu/* implementation packages
```

If technical packaging requires internal packages to be published, mark them clearly as internal and prevent unsupported direct use through documentation/export policy.

---

# 16. Main `Ranu.js` Package

Directory:

```text
packages/hfx/
```

Purpose:

- public package entry;
- public export map;
- stable TypeScript declarations;
- CLI binary integration if chosen;
- public subpath composition.

---

# 17. `Ranu.js` Package Structure

Recommended:

```text
packages/hfx/
├── src/
│   ├── index.ts
│   ├── config.ts
│   ├── react.ts
│   ├── server.ts
│   └── plugin.ts
├── package.json
├── tsconfig.json
├── README.md
└── test/
```

Build output:

```text
dist/
```

Generated only.

---

# 18. `Ranu.js` Export Map

Conceptual:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./config": {
      "types": "./dist/config.d.ts",
      "import": "./dist/config.js"
    },
    "./react": {
      "types": "./dist/react.d.ts",
      "import": "./dist/react.js"
    },
    "./server": {
      "types": "./dist/server.d.ts",
      "import": "./dist/server.js"
    },
    "./plugin": {
      "types": "./dist/plugin.d.ts",
      "import": "./dist/plugin.js"
    }
  }
}
```

Undocumented deep paths remain unexported.

---

# 19. Main Package Re-Export Rule

`packages/hfx` should primarily re-export or compose stable APIs from internal implementation packages.

It must not become the implementation home of every subsystem.

---

# 20. `@ranu/core`

Directory:

```text
packages/core/
```

Owns:

- shared foundational framework contracts;
- version/mode/command types;
- low-level shared utilities where architecturally justified.

Must not depend on React, Node adapter, build tool, CLI, or provider SDKs.

---

# 21. `@ranu/diagnostics`

Directory:

```text
packages/diagnostics/
```

Owns:

- diagnostic codes;
- diagnostic data structures;
- diagnostic formatting primitives;
- source location types;
- JSON diagnostic serialization.

It must be dependency-light.

---

# 22. `@ranu/manifests`

Directory:

```text
packages/manifests/
```

Owns:

- route manifest schema;
- server manifest schema;
- client manifest schema;
- static manifest schema;
- build/deployment descriptor schema;
- schema version validation.

It must not depend on application renderer implementations.

---

# 23. `@ranu/config`

Directory:

```text
packages/config/
```

Owns:

- config discovery;
- config loading;
- environment loading;
- schema validation;
- resolved config;
- plugin/adapter normalization contracts.

Depends on:

```text
core
diagnostics
```

and stable plugin/adapter contract types only where necessary.

---

# 24. `@ranu/router`

Directory:

```text
packages/router/
```

Owns:

- filesystem route discovery;
- segment parsing;
- route tree;
- precedence;
- collisions;
- matcher;
- route manifest generation inputs.

Depends on:

```text
core
diagnostics
manifests
```

Must not depend on React.

---

# 25. `@ranu/runtime`

Directory:

```text
packages/runtime/
```

Owns provider-neutral runtime contracts:

- request context;
- control signals;
- route dispatch interfaces;
- renderer contract;
- middleware continuation;
- static dispatch interface.

Depends on:

```text
core
diagnostics
manifests
router contracts where needed
```

Must not depend on Node native transport.

---

# 26. `@ranu/runtime-node`

Directory:

```text
packages/runtime-node/
```

Owns:

- Node HTTP bridge;
- Web Request/Response conversion;
- streaming;
- abort;
- server startup;
- graceful shutdown.

Depends on:

```text
runtime
core
diagnostics
manifests
```

---

# 27. `@ranu/server`

Directory:

```text
packages/server/
```

Owns implementation behind public:

```text
Ranu.js/server
```

Exports internal implementations for:

```text
cookies
headers
redirect
notFound
request context
next if required
```

Depends on runtime contracts.

---

# 28. `@ranu/react`

Directory:

```text
packages/react/
```

Owns:

- React renderer;
- SSR;
- hydration bootstrap;
- layout composition;
- metadata rendering;
- client navigation;
- `Link`;
- React hooks.

Depends on:

```text
core
runtime contracts
router/manifests
diagnostics
```

Peer dependencies:

```text
react
react-dom
```

Must not depend on provider adapters.

---

# 29. `@ranu/build`

Directory:

```text
packages/build/
```

Owns:

- build orchestration;
- bundler adapter;
- graph analysis;
- server/client boundaries;
- TypeScript/JSX integration;
- CSS/assets;
- static generation;
- manifests;
- build output.

Depends on multiple lower-level packages but must not depend on CLI.

---

# 30. `@ranu/dev`

Directory:

```text
packages/dev/
```

Owns:

- dev server orchestration;
- watcher;
- HMR;
- React Fast Refresh integration;
- server invalidation;
- error overlay protocol;
- config restart coordination.

May depend on:

```text
build
runtime-node
react
router
config
diagnostics
```

---

# 31. `@ranu/plugin`

Directory:

```text
packages/plugin/
```

Owns:

- `definePlugin`;
- Plugin API v1 types;
- plugin manager;
- hook runner;
- ordering;
- validation;
- plugin diagnostics;
- artifact ownership contract.

Public API is exposed through:

```text
Ranu.js/plugin
```

---

# 32. `@ranu/cli`

Directory:

```text
packages/cli/
```

Owns:

- argument parsing;
- command definitions;
- project discovery;
- command orchestration;
- logging;
- exit codes;
- signal handling.

Must depend on subsystems rather than duplicate their logic.

---

# 33. `create-ranu`

Directory:

```text
create-ranu/
```

Package:

```text
create-ranu
```

Owns:

- scaffold CLI;
- templates;
- package-manager selection;
- safe target creation.

Must generate code that imports only stable public Ranu.js APIs.

---

# 34. Adapter Directory

Adapters live under:

```text
adapters/
```

not inside core packages.

This visually reinforces deployment-provider isolation.

---

# 35. `adapters/vercel`

Package:

```text
@ranu/adapter-vercel
```

Owns Vercel-specific:

- output generation;
- route mapping;
- function packaging;
- capability validation;
- static asset mapping.

It may depend on stable manifest/deployment contracts, not application source scanning.

---

# 36. `adapters/node`

This may be:

```text
@ranu/adapter-node
```

if a separately packaged deployment adapter is useful.

However, generic:

```bash
Ranu.js build
Ranu.js start
```

must remain functional without requiring application configuration to import it.

---

# 37. `adapters/container`

Container support may be:

```text
docs/templates only
```

or:

```text
@ranu/adapter-container
```

only if target packaging code provides real value.

Do not publish an empty adapter solely for symmetry.

---

# 38. Package Dependency Layers

Recommended dependency layers:

```text
L0
  diagnostics
  core

L1
  manifests
  config

L2
  router
  plugin contracts

L3
  runtime

L4
  runtime-node
  server
  react

L5
  build

L6
  dev

L7
  cli
  Ranu.js

L8
  create-ranu
  deployment adapters
```

This is conceptual; actual dependency graph must remain acyclic.

---

# 39. Forbidden Dependencies

Examples:

```text
core → react
router → react
router → cli
runtime → runtime-node
runtime → vercel
react → build
server → cli
build → cli
adapter-vercel → app source scanner
Ranu.js public entry → test tooling
```

---

# 40. Shared Types

If multiple packages require the same foundational type, place it in the lowest architecturally correct shared package.

Do not resolve cycles by copying type definitions.

---

# 41. Type-Only Dependencies

Use TypeScript `import type` where dependencies are truly type-only.

But do not rely on type-only imports to hide a bad architectural dependency.

---

# 42. TypeScript Root Configuration

Root:

```text
tsconfig.base.json
```

contains shared compiler options.

Recommended baseline:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": false,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "moduleResolution": "Bundler",
    "module": "ESNext",
    "target": "ES2022"
  }
}
```

Exact values may be refined based on build tooling and Node baseline.

---

# 43. Package TypeScript Config

Each package has:

```text
tsconfig.json
```

extending:

```text
../../tsconfig.base.json
```

or correct relative path.

---

# 44. Project References

TypeScript project references may be used if they improve build ordering and IDE performance.

If enabled:

```text
root tsconfig
→ references package tsconfigs
```

The repository must not require manual package build ordering.

---

# 45. Source Layout Per Package

Preferred:

```text
package/
├── src/
├── test/
├── package.json
├── tsconfig.json
└── README.md
```

Complex packages may add:

```text
fixtures/
bench/
scripts/
```

where justified.

---

# 46. Build Output Per Package

Generated package output:

```text
dist/
```

It is never committed unless an explicit publication workflow requires otherwise.

Preferred:

```text
src/
→ package build
→ dist/
```

---

# 47. Package `files` Whitelist

Published packages should use a strict npm `files` whitelist.

Example:

```json
{
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ]
}
```

Do not publish:

```text
tests
fixtures
private scripts
.env files
repository tooling
```

unless intentionally required.

---

# 48. Package `type`

ESM-first packages should use:

```json
{
  "type": "module"
}
```

unless the final tooling requires another strategy.

---

# 49. `engines`

Published runtime/build packages should declare supported Node.js engines.

Example:

```json
{
  "engines": {
    "node": ">=<baseline>"
  }
}
```

The exact baseline is locked by release policy.

---

# 50. React Peer Dependencies

Packages exposing React behavior should use:

```text
peerDependencies:
  react
  react-dom
```

The main `Ranu.js` package may also declare compatible peers if its React subpath requires them.

Avoid bundling duplicate React runtimes.

---

# 51. Package Export Maps

Every published package must define an export map.

Do not rely on arbitrary deep filesystem imports.

---

# 52. Internal Package Export Maps

Even internal packages should expose only intentional internal entry points.

This prevents accidental coupling between workspace packages.

---

# 53. `examples/`

Official user-facing examples live under:

```text
examples/
```

Recommended V1:

```text
examples/
├── minimal/
├── routing/
├── ssr/
├── ssg/
├── client-rendering/
├── api-routes/
├── middleware/
├── full-stack/
├── plugin/
├── docker/
└── vercel/
```

---

# 54. Example Rules

Official examples:

- import only public Ranu.js APIs;
- have their own `package.json` where useful;
- build in CI;
- remain small and focused;
- do not depend on unpublished internal packages except via workspace resolution of public package names.

---

# 55. Example Dependency

During monorepo development, examples may use:

```json
{
  "dependencies": {
    "ranu": "workspace:*"
  }
}
```

This simulates real public package usage.

---

# 56. `fixtures/`

Internal framework test applications live under:

```text
fixtures/
```

Examples:

```text
fixtures/
├── router-basic/
├── router-conflicts/
├── runtime-api/
├── react-ssr/
├── hydration/
├── static-generation/
├── env-boundaries/
├── plugin-basic/
└── deployment-vercel/
```

Fixtures may intentionally test invalid applications.

---

# 57. Fixtures Are Not Documentation

Fixtures may use internal testing hooks if necessary.

They must not be presented as supported application examples.

---

# 58. `tests/`

Cross-package integration/E2E tests live under:

```text
tests/
```

Recommended:

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

Package-local unit tests stay with their package.

---

# 59. Unit Tests

Package-specific unit tests should live near the package:

```text
packages/router/test/
packages/runtime/test/
```

or a consistent equivalent.

---

# 60. Integration Tests

Cross-subsystem tests belong in:

```text
tests/integration/
```

Examples:

```text
router + runtime
runtime + React
build + runtime
plugin + build
```

---

# 61. E2E Tests

Full application workflows:

```text
create
dev
build
start
browser interaction
deployment package
```

belong in:

```text
tests/e2e/
```

---

# 62. Browser Tests

Browser-focused tests:

```text
hydration
Link
client router
HMR
Fast Refresh
```

belong in:

```text
tests/browser/
```

---

# 63. Security Tests

Security regression tests live in:

```text
tests/security/
```

Examples:

```text
secret leakage
path traversal
header injection
source-map exposure
public artifact scan
client/server boundary
```

---

# 64. Performance Tests

Benchmarks live in:

```text
tests/performance/
```

or:

```text
benchmarks/
```

if later separated.

Metrics must be reproducible.

---

# 65. `docs/`

Documentation source lives under:

```text
docs/
```

Initial organization may be:

```text
docs/
├── getting-started/
├── routing/
├── rendering/
├── server/
├── configuration/
├── plugins/
├── deployment/
├── api/
└── contributing/
```

The final docs information architecture is defined by `17_DOCUMENTATION_AND_EXAMPLES_PLAN.md`.

---

# 66. Documentation Website

The docs website may itself be built with Ranu.js once the framework is stable enough.

Before self-hosting is reliable, documentation may use a simpler tooling path.

Self-hosting is a validation goal, not a Phase 0 blocker.

---

# 67. `rfcs/`

Major architectural proposals live under:

```text
rfcs/
```

Recommended structure:

```text
rfcs/
├── 0000-template.md
├── accepted/
├── active/
└── rejected/
```

Exact workflow is finalized by governance/release specification.

---

# 68. ADRs

Small architectural decisions may live under:

```text
rfcs/adr/
```

or a separate:

```text
docs/architecture/adr/
```

Choose one system and use it consistently.

---

# 69. `tooling/`

Repository-only shared tooling lives under:

```text
tooling/
```

Potential packages:

```text
tooling/
├── eslint-config/
├── tsconfig/
├── test-utils/
└── release-utils/
```

These are private/internal.

---

# 70. `scripts/`

One-off/repository orchestration scripts live under:

```text
scripts/
```

Examples:

```text
verify-packages.mjs
check-cycles.mjs
validate-exports.mjs
scan-public-secrets.mjs
```

They are not runtime dependencies.

---

# 71. `.github/`

GitHub integration lives under:

```text
.github/
```

Required eventual layout:

```text
.github/
├── workflows/
│   ├── ci.yml
│   ├── release.yml
│   └── security.yml
├── ISSUE_TEMPLATE/
├── PULL_REQUEST_TEMPLATE.md
└── dependabot.yml
```

Exact workflow names may change.

---

# 72. CI Workflow

Initial CI should run:

```text
Linux
Windows
```

with:

```text
install
typecheck
lint
unit tests
integration tests
package build
fixture build
```

Browser/deployment/security suites are added as corresponding phases become available.

---

# 73. Release Tooling

Recommended V1 release/versioning tool:

```text
Changesets
```

Location:

```text
.changeset/
```

at repository root.

If another tool is chosen, governance/release specification must update this decision before public release.

---

# 74. Changeset Rules

Public package changes require changesets according to package/release policy.

Internal-only changes may not require npm-facing changesets unless they affect published packages.

---

# 75. Root License

The root `LICENSE` applies to repository code unless a subdirectory explicitly requires a different license.

License choice is finalized by:

```text
16_OPEN_SOURCE_GOVERNANCE_AND_RELEASES.md
```

---

# 76. README

Root:

```text
README.md
```

must eventually contain:

```text
what Ranu.js is
status
quick start
installation
basic example
documentation link
contributing link
license
```

---

# 77. Package READMEs

Published packages should include package-specific README content.

The main `Ranu.js` package README may reuse/adapt the root README.

---

# 78. `.gitignore`

Root `.gitignore` should include at minimum:

```text
node_modules/
.pnpm-store/
.ranu/
dist/
coverage/
.env.local
.env.*.local
*.log
.DS_Store
```

Add tool-specific generated directories as needed.

---

# 79. `.npmignore`

Prefer npm `files` whitelist over `.npmignore`.

Do not rely on broad ignore patterns for publication security.

---

# 80. `.editorconfig`

Root `.editorconfig` should standardize basic whitespace/newline behavior across contributors.

---

# 81. Formatting

Use one repository formatter configuration.

Recommended:

```text
Prettier
```

or equivalent.

Formatting should not become part of runtime packages.

---

# 82. Linting

Use one repository ESLint flat configuration or equivalent.

Lint rules should emphasize:

```text
correctness
imports
package boundaries
unused code
Node/browser boundaries
```

Avoid style rules already handled by formatter.

---

# 83. Package Boundary Linting

Repository tooling should detect forbidden dependency directions.

Possible enforcement:

```text
custom script
ESLint import rules
dependency-cruiser
madge
workspace graph validation
```

Tool choice is implementation detail.

---

# 84. Circular Dependency Check

CI must include a package-level circular dependency check before beta.

Package cycles are architecture failures.

---

# 85. Build Tooling

Repository package builds may use:

```text
tsup
Rollup
esbuild
TypeScript
```

depending on package needs.

Framework application bundling choice is separate from package build tooling.

Do not confuse:

```text
building Ranu.js npm packages
```

with:

```text
Ranu.js building user applications
```

---

# 86. Package Build Output

Published packages should generate:

```text
ESM JavaScript
TypeScript declarations
source maps according to release policy
```

Internal packages may use source directly in workspace development if tooling supports it, but publication artifacts must be explicit.

---

# 87. Source Maps

Package source maps may be published if intentionally approved.

Server/framework internal source-map policy for user application builds remains separate.

---

# 88. Test Runner

Use one primary unit/integration test runner where practical.

The exact choice is made during Phase 0.

The tool must support:

```text
TypeScript
ESM
Windows/Linux
watch mode
coverage
```

---

# 89. Browser E2E Tool

Use a real browser automation tool for hydration/navigation/HMR E2E.

Tool choice belongs to test strategy.

---

# 90. Package Visibility Rule

A workspace package being named `@ranu/*` does not mean external users should install it.

Publication status and public API documentation define support.

---

# 91. Main Package Composition

The public `Ranu.js` package may depend on internal packages at runtime/build time.

External developers see:

```text
hfx/*
```

not the internal composition graph.

---

# 92. Internal Package SemVer

Internal workspace packages may use aligned repository versions even if not public.

If published internal packages are necessary, their compatibility relationship with `Ranu.js` must be explicit.

---

# 93. Version Alignment

Preferred V1:

```text
all official tightly-coupled published Ranu.js packages share version
```

Example:

```text
Ranu.js@0.5.0
@ranu/adapter-vercel@0.5.0
```

Adapters may move to independent versions later if ecosystem needs justify it.

---

# 94. Private Packages

Workspace-only packages must declare:

```json
{
  "private": true
}
```

This prevents accidental npm publication.

---

# 95. Published Package Access

Public packages must set intentional npm access.

Scoped official packages typically require:

```json
{
  "publishConfig": {
    "access": "public"
  }
}
```

---

# 96. Npm Provenance

When supported by the release workflow, official packages should publish with npm provenance.

Exact release setup is finalized in governance/release plan.

---

# 97. Package Entry Safety

Published packages must not require:

```text
repository-relative files
tests
source-only workspace paths
unpublished sibling package source
```

at runtime.

Package tarballs must be tested before publication.

---

# 98. Tarball Validation

Release CI should run:

```text
npm pack / pnpm pack
```

and inspect package contents.

Ensure:

- required dist files present;
- types present;
- README/LICENSE present;
- no secrets;
- no test fixtures unless intentional.

---

# 99. Public API Export Validation

CI should verify that documented exports resolve from packed artifacts, not only workspace source aliases.

This prevents local-workspace success with broken npm releases.

---

# 100. `create-ranu` Templates

Templates live under:

```text
create-ranu/templates/
```

Recommended:

```text
create-ranu/
├── src/
├── templates/
│   └── default/
└── test/
```

V1 needs one canonical default template.

---

# 101. Template Rules

The default template must:

- use TypeScript;
- use public `Ranu.js` imports only;
- contain no framework internals;
- have minimal dependencies;
- include safe `.gitignore`;
- include `.env.example` only when useful.

---

# 102. Template Versioning

Templates ship with `create-ranu` and should align with the Ranu.js version they scaffold.

Do not fetch an unversioned remote template by default.

---

# 103. Example vs Template

Templates are minimal creation sources.

Examples are focused demonstrations.

Do not turn the default scaffold into a large showcase application.

---

# 104. Local Development Links

Workspace development may use pnpm symlinks/workspace protocol.

Tests must still validate packed-package behavior before release.

---

# 105. Generated Ranu.js Project State

Applications generated by Ranu.js create:

```text
.ranu/
```

during dev/build.

The Ranu.js repository itself may also create `.ranu/` in examples/fixtures.

It remains gitignored.

---

# 106. Repository Cache

Repository tooling caches may include:

```text
node_modules/.cache
.ranu/cache
test browser caches
```

All are disposable.

---

# 107. No Business Data

No repository-generated cache/build directory may become the authoritative store for project decisions, specs, or release metadata.

Specs and source belong in version control.

---

# 108. Documentation Specifications

The existing framework `.md` specifications should be stored in a dedicated version-controlled location once repository scaffold begins.

Recommended:

```text
docs/specifications/
```

with filenames:

```text
00_FRAMEWORK_VISION.md
...
13_REPOSITORY_AND_PACKAGE_STRUCTURE.md
```

---

# 109. Specification Storage

Recommended:

```text
docs/
└── specifications/
    ├── 00_FRAMEWORK_VISION.md
    ├── 01_PRODUCT_REQUIREMENTS.md
    ├── 02_FRAMEWORK_ARCHITECTURE.md
    ├── ...
    └── 13_REPOSITORY_AND_PACKAGE_STRUCTURE.md
```

Supporting documents such as environment consolidation may also live there with clear status.

---

# 110. Specification vs Public Docs

Technical specification files are implementation/design contracts.

Public user documentation is a separate docs layer.

Do not expose raw internal specification language as the only user documentation.

---

# 111. Repository Status Files

Implementation status should live in:

```text
GitHub issues/projects/milestones
```

or a dedicated status file.

Do not continuously mutate architectural specs as task trackers.

---

# 112. Git Branch Assumption

Until governance plan locks branching:

```text
main
```

is the primary integration branch.

Feature work uses short-lived branches/PRs.

Do not create complex release branches during Phase 0 without need.

---

# 113. Commit Scope

Recommended commit scopes may align with packages:

```text
router:
runtime:
react:
build:
cli:
plugin:
adapter-vercel:
docs:
tests:
```

This is convention, not a framework runtime requirement.

---

# 114. Package Ownership

As community grows, CODEOWNERS may be added under:

```text
.github/CODEOWNERS
```

Not required for initial single-maintainer bootstrap.

---

# 115. Public Repository Security

The repository must never commit:

```text
npm tokens
GitHub PATs
Vercel tokens
private signing keys
real production .env files
customer/application secrets
```

Use CI secret stores.

---

# 116. Secret Scanning

GitHub secret scanning and repository CI secret checks should be enabled where available.

---

# 117. Dependency Updates

Use Dependabot/Renovate or equivalent for repository dependencies.

The choice is finalized by open-source governance/release plan.

---

# 118. Package Lockfile

The repository commits:

```text
pnpm-lock.yaml
```

to make development and CI dependency resolution reproducible.

---

# 119. No Multiple Lockfiles

Do not commit:

```text
package-lock.json
yarn.lock
bun.lock
```

at repository root alongside `pnpm-lock.yaml` unless a specific fixture intentionally tests another package manager.

Fixture lockfiles must remain fixture-scoped.

---

# 120. Example Package Managers

`create-ranu` may support npm/pnpm/yarn/bun for generated users even though the framework repository itself uses pnpm.

Repository package manager choice does not restrict application package-manager support.

---

# 121. Root Node Tooling

Use one documented Node version baseline for repository development.

A file such as:

```text
.node-version
```

or:

```text
.nvmrc
```

may be included.

Exact mechanism is optional.

---

# 122. Corepack

Repository setup may recommend:

```bash
corepack enable
```

for pnpm version consistency.

This is tooling guidance, not application runtime behavior.

---

# 123. Package README Classification

Internal packages may use short READMEs:

```text
Internal Ranu.js package. Not public application API.
```

This avoids ecosystem confusion if source is browsed or package is accidentally discovered.

---

# 124. Adapter README

Public adapters need dedicated README sections for:

```text
install
configure
supported capabilities
limitations
deployment usage
compatible Ranu.js versions
```

---

# 125. Repository Documentation Hierarchy

Recommended:

```text
README.md
  ↓
docs/
  ├── user docs
  ├── contributor docs
  ├── architecture
  └── specifications
```

---

# 126. Contributor Setup

`CONTRIBUTING.md` should eventually document:

```bash
git clone
pnpm install
pnpm build
pnpm test
```

and package-specific development workflows.

---

# 127. Local Linking

Contributors should not need to globally install Ranu.js.

Use workspace commands and local package binaries.

---

# 128. CLI Development

The CLI should be runnable from repository root through:

```bash
pnpm Ranu.js ...
```

or a documented workspace command.

Exact script is Phase 0 implementation detail.

---

# 129. Fixture Execution

Tests should create isolated temporary application directories rather than mutating fixture source where possible.

This enables parallel tests.

---

# 130. Temporary Test Directories

Use OS temporary directories or repository-owned generated test temp paths.

Always clean safely.

Never write temporary builds over source fixtures.

---

# 131. Test Port Management

E2E tests must allocate ports safely rather than hard-code one shared port across parallel CI jobs.

---

# 132. Test Package Isolation

Fixtures should declare only dependencies they actually use.

This catches hidden undeclared dependency leakage from monorepo root.

---

# 133. Strict pnpm Benefit

pnpm's strict dependency structure should be used to detect accidental undeclared imports.

Do not weaken it by hoisting everything globally without reason.

---

# 134. Workspace Hoisting

Avoid broad shameful-hoist style settings unless a verified tool requires them.

If required, document the exception.

---

# 135. Build Artifacts in Git

Do not commit:

```text
dist/
.ranu/
coverage/
test-results/
playwright-report/
```

unless a specific release workflow needs an artifact in a release, not source control.

---

# 136. Generated Type Files

Framework-generated application type files live under:

```text
.ranu/types/
```

Repository package declaration outputs live under each package `dist/`.

These are separate concepts.

---

# 137. Public Package Source

Published packages may include source files if intentional for source maps/debugging, but this is optional.

The stable API is defined by exports/types, not source folder visibility.

---

# 138. Licenses in Packages

Published package tarballs should include or reference the root license appropriately.

Avoid packages being published without license metadata.

---

# 139. Package Metadata

Published package `package.json` should include:

```text
name
version
description
license
repository
homepage
bugs
keywords
engines
exports
types
files
peerDependencies where needed
```

---

# 140. Repository URL Metadata

Official packages should point to the Ranu.js GitHub repository.

Subdirectory metadata may identify package path where npm supports it.

---

# 141. Issue URL

Published package metadata should point users to the official GitHub issue tracker.

---

# 142. Public Package Keywords

Potential:

```text
framework
javascript
typescript
react
full-stack
ssr
ssg
web
router
```

This is release metadata, not API behavior.

---

# 143. No Provider SDK in Main Package

The `Ranu.js` package must not depend on:

```text
Vercel SDK
Cloudflare SDK
AWS SDK
Netlify SDK
```

solely for provider deployment.

Those belong in adapter packages.

---

# 144. No Test Dependencies in Runtime

Published runtime dependency lists must not include:

```text
Vitest
Playwright
ESLint
Prettier
Changesets
```

unless a specific package is itself a tooling package and needs them at execution.

---

# 145. CLI Dependencies

Heavy CLI-only dependencies belong in CLI/build dependency graph, not browser/runtime code paths.

---

# 146. Optional Provider Dependencies

Provider adapters may use provider-specific dependencies without forcing them on generic Ranu.js users.

---

# 147. Package Graph Verification

CI should generate/verify a package dependency graph.

Any forbidden edge fails CI.

---

# 148. Package Cycle Diagnostic

Repository tooling should produce an actionable error:

```text
RANU_REPO_PACKAGE_CYCLE

Detected:
  @ranu/react
  → @ranu/build
  → @ranu/react
```

This must be fixed architecturally, not suppressed casually.

---

# 149. Public Export Verification

CI should compare expected public exports against actual package export maps.

Unexpected new exports should require deliberate review.

---

# 150. API Surface Snapshot

A generated API snapshot may be stored/tested for stable packages.

Potential tools:

```text
API Extractor
custom TypeScript export snapshot
```

Tool choice is optional.

---

# 151. Release Package Set

Before each release, tooling identifies the publishable package set.

Workspace-only private packages are excluded automatically.

---

# 152. Adapter Compatibility Metadata

Official adapters should declare compatible Ranu.js ranges if independently versioned.

If aligned-version strategy is used, repository release tooling may enforce synchronized versions.

---

# 153. Publication Order

If published packages depend on other published internal packages, release tooling must publish in dependency order.

Preferred V1 reduces this need by bundling/keeping most internals private.

---

# 154. Repository Bootstrap Order

Phase 0 should create files in this order:

```text
1. root package.json
2. pnpm-workspace.yaml
3. tsconfig.base.json
4. formatting/lint config
5. package skeletons
6. package tsconfigs
7. package build scripts
8. test runner
9. CI
10. examples/fixtures skeleton
11. changeset/release placeholder
12. root docs/legal contribution files as release plan matures
```

---

# 155. Minimum Phase 0 Package Skeleton

Each core package needs at minimum:

```text
package.json
tsconfig.json
src/index.ts
test/
```

Public packages also need:

```text
README.md
exports
types
```

---

# 156. Package Build Command

Every package that produces distributable output should support:

```bash
pnpm build
```

through its local package script.

---

# 157. Package Typecheck Command

Each package should support:

```bash
pnpm typecheck
```

or participate in root TypeScript project-reference checking.

---

# 158. Package Test Command

Each package should expose:

```bash
pnpm test
```

or root orchestration must clearly include it.

---

# 159. Clean Command

Repository clean removes only generated state:

```text
dist/
.ranu/
coverage/
test temp output
```

It must not delete:

```text
source
docs
specifications
examples
pnpm-lock.yaml
```

---

# 160. Repository Definition of Done — Phase 0

Phase 0 repository structure is complete when:

1. a clean clone installs with pnpm;
2. root build command runs;
3. package skeletons compile;
4. unit test runner runs;
5. Windows/Linux CI runs;
6. workspace dependency graph is acyclic;
7. public/internal package classifications are recorded;
8. `Ranu.js` package export map skeleton exists;
9. `create-ranu` package exists;
10. Vercel adapter package skeleton exists;
11. examples/fixtures/tests directories exist;
12. specifications are stored in version control;
13. generated directories are gitignored;
14. private packages cannot be published accidentally.

---

# 161. Repository Acceptance Criteria

The Ranu.js repository/package architecture is complete when:

1. one public monorepo structure is defined;
2. pnpm is the repository package manager;
3. root package is private;
4. workspace globs are defined;
5. package naming is consistent;
6. public package is `Ranu.js`;
7. scaffold package is `create-ranu`;
8. official adapters use `@ranu/adapter-*`;
9. internal package names are defined;
10. publication classification exists for every package;
11. most internal packages remain unpublished by default;
12. public `Ranu.js` export-map structure matches `11_PUBLIC_API_SPECIFICATION.md`;
13. React stays a peer dependency;
14. provider SDKs stay out of core/main package;
15. package dependency direction is documented;
16. circular dependencies are forbidden;
17. examples use only public APIs;
18. fixtures are separated from examples;
19. cross-package tests have a dedicated location;
20. docs/specifications have defined locations;
21. GitHub workflow/config directories are defined;
22. release tooling location is defined;
23. generated files are excluded from source control;
24. package tarball contents are validated before release;
25. private packages are protected from accidental publication;
26. Windows/Linux tooling behavior is supported;
27. Phase 0 scaffold can begin without further repository-structure decisions.

---

# 162. Locked V1 Repository Decisions

The following are locked:

1. Ranu.js uses one public monorepo.
2. pnpm is the primary repository package manager.
3. pnpm workspaces are used.
4. the repository root package is private.
5. primary public package is `Ranu.js`.
6. scaffold package is `create-ranu`.
7. official adapters use `@ranu/adapter-*`.
8. internal packages use the `@ranu/*` namespace.
9. internal package names do not automatically define public application APIs.
10. public exports are exposed through the `Ranu.js` package and documented subpaths.
11. package export maps are required for published packages.
12. unsupported deep imports are not public API.
13. most internal packages remain workspace-only/private unless publication is technically necessary.
14. provider-specific SDKs remain in adapter packages.
15. React remains a peer dependency.
16. build/test/release tooling does not leak into browser/runtime dependencies.
17. package dependency cycles are forbidden.
18. examples and fixtures are separate.
19. examples use public APIs only.
20. fixtures may test internals/invalid cases.
21. unit tests stay package-local where practical.
22. integration/E2E/security/performance tests have repository-level locations.
23. specifications live under version-controlled docs/specification storage.
24. generated `dist/`, `.ranu/`, coverage, and test-result output are not committed.
25. release tooling is repository-level.
26. Changesets is the preferred V1 version/release mechanism unless governance later explicitly changes it.
27. package tarballs are validated before publishing.
28. private packages use `"private": true`.
29. published scoped packages use public npm access where required.
30. the repository lockfile is `pnpm-lock.yaml`.
31. root does not maintain competing package-manager lockfiles.
32. repository development package manager does not restrict end-user package-manager support.
33. TypeScript strict mode is the baseline.
34. repository package build output is `dist/`.
35. application Ranu.js generated output remains `.ranu/`.
36. `create-ranu` templates ship versioned with the package.
37. no unversioned remote template is required for normal scaffolding.
38. main package does not depend on hosting provider SDKs.
39. GitHub CI initially covers Linux and Windows.
40. Phase 0 implementation begins from this structure.

---

# 163. Deferred Repository Features

Deferred unless later needed:

- multi-repository package split;
- separate docs repository;
- separate adapter repositories;
- Bazel;
- Nx requirement;
- Turborepo requirement;
- custom package manager;
- custom package registry;
- vendored node_modules;
- mandatory Docker-based local development;
- complex release branches;
- monorepo-wide CODEOWNERS from day one;
- multiple canonical starter templates;
- automatic repository generator;
- binary/native package distribution;
- separate enterprise/private package tree.

These must not block Phase 0.

---

# 164. Relationship to Public API

`11_PUBLIC_API_SPECIFICATION.md` owns what external users may import.

This document maps those stable imports to repository packages.

Repository layout must not expand the public API accidentally.

---

# 165. Relationship to Development Plan

`12_DEVELOPMENT_PLAN.md` owns implementation order.

This document provides the concrete package/directory structure used by Phase 0 and all later phases.

---

# 166. Relationship to Plugin System

`07_PLUGIN_SYSTEM.md` owns plugin semantics.

The repository package:

```text
@ranu/plugin
```

implements that contract, while public plugin authoring remains exposed through:

```text
Ranu.js/plugin
```

---

# 167. Relationship to Deployment Adapters

`08_DEPLOYMENT_ADAPTERS.md` owns adapter semantics.

Adapters physically live under:

```text
adapters/
```

to keep provider-specific code out of core packages.

---

# 168. Relationship to CLI

`09_CLI_SPECIFICATION.md` owns CLI behavior.

CLI implementation lives under:

```text
packages/cli/
```

or may be bundled into the public `Ranu.js` package during publication.

The executable remains:

```text
Ranu.js
```

---

# 169. Required Next Work

After this document is approved:

```text
Ranu.js PHASE 0 REPOSITORY IMPLEMENTATION MAY BEGIN
```

The next planning documents are release/quality gates rather than blockers for the first code scaffold:

```text
14_TESTING_AND_QUALITY_STRATEGY.md
15_SECURITY_MODEL.md
16_OPEN_SOURCE_GOVERNANCE_AND_RELEASES.md
17_DOCUMENTATION_AND_EXAMPLES_PLAN.md
```

`14_TESTING_AND_QUALITY_STRATEGY.md` should be created while Phase 0/Phase 1 CI and test infrastructure are being implemented.

---

# 170. Final Repository Baseline

Ranu.js V1 is implemented in one public pnpm monorepo.

The main public package is:

```text
Ranu.js
```

Project scaffolding is distributed as:

```text
create-ranu
```

Official deployment adapters use:

```text
@ranu/adapter-*
```

Most architectural implementation packages remain internal workspace packages even though their source is publicly visible.

The repository separates:

```text
framework packages
provider adapters
project scaffolding
examples
fixtures
cross-package tests
documentation
RFCs
repository tooling
GitHub automation
```

Published packages use explicit export maps, strict file whitelists, typed ESM output, safe dependency boundaries, and intentional npm metadata.

React is a peer dependency.

Provider SDKs do not enter the main Ranu.js package.

Examples depend on public Ranu.js APIs only.

Fixtures may test internal and invalid conditions.

Linux and Windows are primary CI targets.

Generated framework, package, test, and coverage output remains outside version control.

Package dependency cycles are forbidden and verified.

This structure is the authoritative Ranu.js V1 repository and package architecture, and it is sufficient to begin Phase 0 implementation.

---

**End of 13_REPOSITORY_AND_PACKAGE_STRUCTURE.md**
