# 12_DEVELOPMENT_PLAN.md

**Project:** Ranu.js — JavaScript/TypeScript Full-Stack Web Framework  
**Document Type:** Development & Implementation Plan  
**Status:** Implementation Baseline  
**Date:** 2026-08-10  
**Depends On:** `00_FRAMEWORK_VISION.md` through `11_PUBLIC_API_SPECIFICATION.md`  
**Primary Goal:** Build Ranu.js as a public open-source full-stack JavaScript/TypeScript framework suitable for GitHub and npm distribution  
**Primary V1 Renderer:** React  
**Primary V1 Runtime:** Node.js  
**Primary Public Package:** `Ranu.js`  
**Release Path:** Prototype → Alpha → Beta → RC → `1.0.0`

---

# 1. Purpose

This document converts the Ranu.js V1 product, architecture, subsystem, configuration, deployment, CLI, and public API specifications into an executable development plan.

It defines:

- implementation order;
- package dependency order;
- repository bootstrap stages;
- technical milestones;
- phase-specific scope;
- acceptance criteria;
- test gates;
- quality gates;
- integration gates;
- open-source release gates;
- alpha/beta/RC/stable criteria;
- development priorities;
- deferred features;
- Definition of Done.

This document is the implementation authority for Ranu.js V1 unless a higher-level specification is explicitly amended.

---

# 2. Development Objective

Ranu.js V1 is complete when an external developer can:

```bash
npm create Ranu.js@latest my-app
cd my-app
npm install
npm run dev
npm run build
npm run start
```

and build a real application using:

```text
file-based routing
nested layouts
dynamic routes
SSR
SSG
client rendering
hydration
API routes
middleware
cookies
headers
redirects
not-found handling
TypeScript
CSS
CSS Modules
environment variables
plugins
Node deployment
container deployment
Vercel deployment
```

without importing internal Ranu.js implementation packages.

---

# 3. Development Principles

## DEV-P01 — Architecture Before Optimization

Implement the contracts already approved before adding advanced optimization.

## DEV-P02 — Vertical Milestones

Every major phase should result in a runnable framework capability, not only disconnected packages.

## DEV-P03 — Public API Discipline

Implementation must conform to `11_PUBLIC_API_SPECIFICATION.md`.

## DEV-P04 — Test While Building

Tests are added during each phase, not postponed until the end.

## DEV-P05 — Provider-Neutral First

Generic Node functionality must work before provider-specific deployment optimization.

## DEV-P06 — Correctness Before Performance

Route correctness, server/client safety, and build determinism take precedence over speed.

## DEV-P07 — Minimal V1

Do not add RSC, Server Actions, ISR, Edge runtime, or advanced caching before the V1 baseline is complete.

## DEV-P08 — Open-Source Quality

Repository structure, diagnostics, examples, and public APIs must be understandable by external contributors.

## DEV-P09 — Cross-Platform

Windows and Linux are mandatory development/test targets.

## DEV-P10 — Freeze Core Contracts

After implementation begins, specification changes require a real discovered contradiction, implementation impossibility, or security correction.

---

# 4. V1 Scope

Ranu.js V1 includes:

```text
Configuration system
Diagnostics system
Manifest schemas
File-based router
Layouts
Dynamic routes
Catch-all routes
Route groups
API routes
Middleware
Node runtime
SSR
SSG
Client rendering
Hydration
"use client"
Server-only boundaries
Metadata
Not-found handling
Error boundaries
Loading boundaries
Link/navigation
TypeScript
JSX/TSX
CSS
CSS Modules
Static assets
Environment variables
Build system
Development server
HMR
React Fast Refresh
CLI
create-ranu
Plugin API v1
Generic Node deployment
Container deployment
Vercel adapter
Public API package exports
Open-source release infrastructure
```

---

# 5. Explicitly Deferred from V1

Do not implement these before the V1 baseline is stable:

```text
React Server Components transport / Flight
Server Actions
ISR
Revalidation API
Framework-wide cache API
Edge runtime
Mixed Node/Edge routes
Image optimization
Font optimization
Partial prerendering
Parallel routes
Intercepted routes
Typed routes
WebSocket framework
Background jobs
Cron abstraction
Queue abstraction
Built-in authentication
Built-in ORM/database
Built-in CMS
Advanced telemetry
Custom Ranu.js bundler written from scratch
```

Any of these require a future RFC/specification.

---

# 6. Repository Strategy

Ranu.js should be built as a monorepo.

Target structure is defined in detail by:

```text
13_REPOSITORY_AND_PACKAGE_STRUCTURE.md
```

The implementation plan assumes a workspace layout conceptually containing:

```text
packages/
adapters/
create-ranu/
examples/
fixtures/
tests/
docs/
rfcs/
tooling/
.github/
```

---

# 7. Recommended Implementation Dependency Order

The dependency order is:

```text
diagnostics
   ↓
shared contracts / manifests
   ↓
configuration
   ↓
router
   ↓
runtime contracts
   ↓
Node runtime
   ↓
React renderer
   ↓
build system
   ↓
client runtime/navigation
   ↓
static generation
   ↓
development system
   ↓
plugin system
   ↓
CLI
   ↓
create-ranu
   ↓
deployment adapters
```

This order minimizes circular dependencies.

---

# 8. Phase 0 — Repository and Tooling Bootstrap

## Goal

Create a clean open-source-ready monorepo that can compile, test, lint, and publish packages.

## Work

Create:

```text
package.json
workspace config
TypeScript base config
package build tooling
test runner
formatter
linting
CI skeleton
changeset/release tooling placeholder
examples/
fixtures/
tests/
.github/
```

Set up package build conventions.

## Initial Packages

Create empty/skeleton packages for:

```text
Ranu.js
core
config
diagnostics
manifests
router
runtime
runtime-node
server
react
build
dev
cli
plugin
```

Adapters:

```text
adapter-node if needed
adapter-container if implemented as package
adapter-vercel
```

## Acceptance Criteria

- workspace installs successfully;
- all package references resolve;
- workspace build succeeds;
- TypeScript project compiles;
- unit test runner works;
- CI runs on Linux and Windows;
- no circular package dependency exists;
- repository has no production framework logic yet.

---

# 9. Phase 1 — Diagnostics, Shared Contracts, and Manifests

Implement foundational packages: `diagnostics`, `manifests`, and `core`.

Required deliverables:

- structured diagnostic model;
- shared framework mode/command/route/render types;
- build ID contract;
- runtime capability types;
- schema-versioned route/server/client/static/build manifests;
- manifest validation;
- deterministic ordering tests.

No later subsystem should define an incompatible diagnostic or manifest model.

---

# 10. Phase 2 — Configuration System

Implement `ranu.config.ts`, `defineConfig()`, runtime validation, defaults, environment loading, plugin normalization, deployment adapter slot, `RANU_PUBLIC_*` classification, and immutable resolved config.

Exit criterion: a minimal project resolves into a valid `ResolvedRanuConfig` without loading router/build/runtime implementation.

---

# 11. Phase 3 — Router V0

Implement file-based routing independently of React.

Initial support:

```text
app/page.tsx
app/about/page.tsx
app/products/[id]/page.tsx
app/docs/[...slug]/page.tsx
app/docs/[[...slug]]/page.tsx
app/(marketing)/about/page.tsx
```

Implement route discovery, segment parsing, dynamic/catch-all/optional catch-all segments, route groups, route IDs, precedence, collision detection, matching, and route manifest generation.

Exit criterion: `/products/42` deterministically resolves with `params.id = "42"`.

---

# 12. Phase 4 — Layout and Boundary Route Metadata

Add discovery and ancestry for:

```text
layout.tsx
loading.tsx
error.tsx
not-found.tsx
```

The renderer must receive complete composition metadata without scanning the filesystem itself.

---

# 13. Phase 5 — API Route Compiler

Add `route.ts` endpoint support and method-export analysis for:

```text
GET
HEAD
POST
PUT
PATCH
DELETE
OPTIONS
```

Detect page/API URL collisions and invalid route modules.

---

# 14. Phase 6 — Runtime Contracts

Implement the provider-neutral runtime package using Web `Request`/`Response`, request context, endpoint dispatch, renderer boundary, middleware continuation, static dispatch, and private control signals for redirect/not-found.

---

# 15. Phase 7 — Node Runtime

Implement the reference Node runtime:

- Node request → Web Request;
- Web Response → Node response;
- streaming;
- request abort;
- headers/cookies;
- body limits;
- HEAD handling;
- API route execution;
- graceful shutdown.

Exit criterion: a real Node HTTP server can execute an Ranu.js API `GET` handler returning `Response.json(...)`.

---

# 16. Phase 8 — Server Helpers

Implement stable `Ranu.js/server` APIs:

```text
cookies()
headers()
redirect()
notFound()
getRequestContext()
```

Add `next()` only if required by the finalized middleware contract.

Request state must use Ranu.js request context, not native mutable Node globals.

---

# 17. Phase 9 — React Renderer V0

Implement the first real page rendering pipeline:

```text
URL
→ router
→ layout chain
→ page
→ React SSR
→ HTML response
```

Initial support:

- root layout;
- nested layouts;
- async page;
- async layout;
- params.

This phase does not yet require hydration, SSG, or HMR.

---

# 18. Phase 10 — Metadata, Errors, Not-Found, Loading

Implement:

```text
metadata
generateMetadata()
error.tsx
not-found.tsx
loading.tsx
redirect behavior
notFound behavior
```

Production error output must remain sanitized.

---

# 19. Phase 11 — Build System V0

Select the underlying V1 bundler after a focused technical spike.

Implement:

- TypeScript/JSX transforms;
- server graph;
- production server bundle;
- client graph skeleton;
- source maps;
- manifests;
- build ID;
- `.ranu/build/`;
- production entry.

First milestone: `Ranu.js build` can produce a runnable Node SSR artifact.

---

# 20. Phase 12 — Server/Client Graph Separation

Implement:

- `"use client"` detection;
- client entry discovery;
- client dependency propagation;
- `Ranu.js/server-only`;
- project `server/` boundary;
- Node built-in rejection in client code;
- private environment rejection;
- `RANU_PUBLIC_*` client substitution.

This is a release-blocking security boundary.

---

# 21. Phase 13 — Client Hydration

Implement client bootstrap, route/client asset manifesting, serializable server-to-client props, client-boundary chunks, and React hydration.

A `"use client"` counter embedded in an SSR page must hydrate and become interactive.

---

# 22. Phase 14 — Client Navigation

Implement public APIs:

```text
Link
useRouter
usePathname
useSearchParams
```

Support `push`, `replace`, `back`, `refresh`, browser history, same-origin enhancement, and normal document-navigation fallback.

Correct fallback behavior is more important than sophisticated partial transport.

---

# 23. Phase 15 — Static Generation

Implement `render = "static"`, build-time rendering, `generateStaticParams()`, path validation, duplicate detection, static HTML output, static manifest, and 404 for ungenerated dynamic static paths.

No automatic runtime SSR fallback exists in V1.

---

# 24. Phase 16 — Client Rendering Mode

Implement:

```ts
export const render = "client";
```

Generate the document shell server/build-side and render the route body in the browser. Reject server-only dependencies from client-rendered route graphs.

---

# 25. Phase 17 — CSS and Assets

Implement V1 frontend asset support:

```text
global CSS
CSS Modules
CSS extraction
route CSS association
public/
imported static assets
content hashing
MIME handling
```

---

# 26. Phase 18 — Development System V0

Create `Ranu.js dev` infrastructure:

- dev server;
- route watcher;
- incremental transforms;
- server invalidation;
- browser dev client;
- diagnostics;
- add/remove route updates.

Exit criterion: editing a page updates development output without a manual production rebuild.

---

# 27. Phase 19 — HMR and React Fast Refresh

Implement client HMR, React Fast Refresh, server invalidation, safe full-reload fallback, config-triggered controlled restart, and development error overlay.

---

# 28. Phase 20 — Middleware

Implement project-level `middleware.ts`, matcher config, `next()`, redirects, direct Responses, and request locals.

Preserve the locked behavior for `/_ranu/` and public-file bypass.

---

# 29. Phase 21 — Plugin API v1

Implement:

```text
definePlugin()
plugin identity
Plugin API v1
pre/normal/post ordering
config hooks
route metadata hooks
build hooks
dev hooks
plugin diagnostics
artifact ownership
```

Do not add runtime request-hook injection, custom router syntax, renderer replacement, or arbitrary CLI commands in V1.

---

# 30. Phase 22 — CLI Core

Implement the public `Ranu.js` executable and commands:

```text
Ranu.js dev
Ranu.js build
Ranu.js start
Ranu.js help
Ranu.js version
```

Add `Ranu.js deploy` with deployment-adapter integration.

Support project-root resolution, config/environment modes, host/port, debug/verbose, JSON diagnostics, exit codes, signal handling, and CI behavior.

---

# 31. Phase 23 — create-ranu

Implement `create-ranu` and canonical creation flow:

```bash
npm create Ranu.js@latest my-app
```

Generated apps are TypeScript-first and contain:

```json
{
  "scripts": {
    "dev": "Ranu.js dev",
    "build": "Ranu.js build",
    "start": "Ranu.js start"
  }
}
```

Generated apps must use only stable public Ranu.js APIs.

---

# 32. Phase 24 — Generic Node Production Path

Validate full production lifecycle:

```bash
Ranu.js build
Ranu.js start
```

Required on Linux and Windows, with container Linux validation.

Must support SSR, SSG, client hydration, API routes, middleware, environment variables, assets, and graceful shutdown.

---

# 33. Phase 25 — Container Deployment

Provide official container workflow with multi-stage build guidance, runtime dependency handling, non-root recommendation, health-check guidance, and graceful shutdown.

A dedicated package is optional if templates/documentation are sufficient.

---

# 34. Phase 26 — Vercel Adapter

Implement `@ranu/adapter-vercel` using current Vercel platform contracts.

Required areas:

- capability validation;
- static pages/assets;
- Node server functions;
- route mapping;
- middleware strategy;
- runtime environment variables;
- streaming verification;
- preview and production deployment.

Correctness takes precedence over aggressive function splitting.

---

# 35. Phase 27 — Public API Conformance

Verify:

```text
Ranu.js
Ranu.js/config
Ranu.js/react
Ranu.js/server
Ranu.js/plugin
```

Validate export maps, TypeScript declarations, React peer dependency handling, server/client boundaries, deep-import blocking, and official examples using only supported public APIs.

---

# 36. Phase 28 — Test Infrastructure Consolidation

Align implementation with `14_TESTING_AND_QUALITY_STRATEGY.md`.

Required layers:

```text
unit
integration
fixture
browser E2E
CLI E2E
deployment E2E
cross-platform
security regression
performance benchmark
```

---

# 37. Phase 29 — Security Hardening

Align with `15_SECURITY_MODEL.md`.

Audit:

```text
server/client secret leakage
XSS/hydration serialization
metadata escaping
path traversal
public-file handling
header injection
proxy trust
request-body limits
production error leakage
plugin trust
source-map exposure
deployment artifact leakage
```

No public beta while known high-severity framework vulnerabilities remain unresolved.

---

# 38. Phase 30 — Performance Baseline

Measure reproducibly:

```text
cold dev startup
warm dev startup
HMR latency
production build time
SSR overhead
SSG throughput
client runtime size
route chunk size
Node memory
Vercel cold start where applicable
```

Optimize only after correctness is established.

---

# 39. Phase 31 — Documentation and Examples

Align with `17_DOCUMENTATION_AND_EXAMPLES_PLAN.md`.

Minimum examples:

```text
hello-world
routing
dynamic-routing
SSR
SSG
API routes
middleware
client-interactivity
full-stack dashboard
Docker
Vercel
plugin example
```

All examples use only public APIs.

---

# 40. Phase 32 — Open-Source Repository Release Infrastructure

Align with `16_OPEN_SOURCE_GOVERNANCE_AND_RELEASES.md`.

Required repository files:

```text
README.md
LICENSE
CONTRIBUTING.md
CODE_OF_CONDUCT.md
SECURITY.md
CHANGELOG.md
ROADMAP.md
```

GitHub setup includes issue templates, PR template, CI, release workflow, and dependency/security automation.

---

# 41. Release Stages

## Alpha

Goal: external experimentation.

Requirements:

```text
public repository
license
basic router
SSR
API routes
Node build/start
basic hydration
CLI
create-ranu
npm prerelease
known limitations documented
```

## Beta

Requirements:

```text
core V1 rendering modes
middleware
plugin API v1
HMR/Fast Refresh
SSG
Node/container production
Vercel deployment
security baseline
Windows/Linux CI
documentation substantially complete
```

## Release Candidate

No new major V1 features.

Required freeze:

```text
public API
package names
CLI commands
manifest schemas
plugin API v1
Node/React compatibility policy
```

## Ranu.js 1.0.0

Stable release requires all core, deployment, quality, security, API, documentation, and open-source governance gates to pass.

---

# 42. Milestone Dependency Graph

```text
Repository
   ↓
Diagnostics / Manifests
   ↓
Configuration
   ↓
Router
   ↓
Runtime Contracts
   ↓
Node Runtime
   ↓
React SSR
   ↓
Build V0
   ↓
Server/Client Boundaries
   ↓
Hydration
   ↓
Navigation
   ↓
SSG / Client Mode
   ↓
CSS / Assets
   ↓
Dev / HMR
   ↓
Middleware
   ↓
Plugin API
   ↓
CLI / create-ranu
   ↓
Node / Container / Vercel
   ↓
Quality / Security / Docs / Governance
   ↓
Alpha → Beta → RC → 1.0.0
```

---

# 43. First Runnable Prototype

The first meaningful prototype must prove:

```text
routing + Node runtime + React SSR
```

Minimal source:

```text
app/
├── layout.tsx
└── page.tsx
```

Prototype success means:

1. page discovered;
2. root layout composed;
3. Node server receives request;
4. React renders HTML;
5. dynamic route works;
6. API GET works;
7. invalid routes produce structured diagnostics.

This prototype is not a public release.

---

# 44. Definition of Done — Package

A package is Done when:

- ownership is clear;
- public/internal status is clear;
- TypeScript compiles;
- tests pass;
- no unintended dependency cycle exists;
- diagnostics use shared contracts;
- relevant Windows/Linux tests pass;
- public exports are documented if applicable;
- no undocumented higher-layer dependency is introduced.

---

# 45. Definition of Done — Public API

A public API is Done when:

- import path finalized;
- TypeScript type finalized;
- runtime domain classified;
- documentation exists;
- example exists;
- tests exist;
- misuse diagnostics exist where practical;
- internal implementation types do not leak.

---

# 46. Definition of Done — Feature

A feature is Done when:

1. specification behavior is implemented;
2. unit tests pass;
3. integration tests pass;
4. dev behavior works;
5. production build behavior works;
6. production runtime behavior works where applicable;
7. public documentation exists if user-facing;
8. errors are actionable;
9. security boundaries are tested;
10. no known critical regression remains.

---

# 47. Reference Applications

Maintain reference fixtures/apps for:

```text
minimal
routing
SSR
SSG
client-only
full-stack API
middleware
plugin
Docker
Vercel
```

These are release gates.

---

# 48. CI Baseline

Initial mandatory CI:

```text
Linux
Windows
```

Stages:

```text
install
typecheck
unit tests
integration tests
package build
fixture build
```

Later add:

```text
browser E2E
deployment E2E
security regression
performance regression
```

---

# 49. Pull Request Quality Gate

Every implementation PR should require:

- focused scope;
- tests;
- typecheck;
- lint/format;
- no specification contradiction;
- dependency review;
- public API review if exports change;
- changelog/changeset when release-facing.

---

# 50. Specification Change Rule

After implementation begins, `00`–`11` may be changed only when:

```text
implementation proves the contract impossible
security requires correction
two specifications conflict
an explicitly approved public API change is required
```

Do not rewrite specs to justify accidental implementation shortcuts.

---

# 51. ADR / RFC Rule

Create an ADR/RFC before major architecture changes such as:

```text
bundler choice after lock
router syntax
render-mode model
new plugin hook family
public package layout
new runtime target
manifest compatibility changes
server/client boundary changes
```

---

# 52. Bundler Selection Rule

Evaluate at least a Vite/Rollup-centered path and an esbuild-centered path against:

```text
SSR
client splitting
HMR
CSS
source maps
custom transforms
package conditions
server/client graph control
plugin isolation
```

Choose the lowest-risk toolchain that satisfies Ranu.js contracts.

Do not build a custom bundler in V1.

---

# 53. Security Priorities

Highest-priority invariants:

```text
no private env in client
no server-only code in client
no public path traversal
no production stack leakage
no unsafe forwarded-header trust
correct Set-Cookie handling
no plugin artifact overwrite
no deployment secret publication
```

---

# 54. Open-Source Release Sequence

Recommended:

```text
local/private implementation
→ public GitHub repository
→ npm alpha
→ community feedback
→ beta
→ RC
→ 1.0.0
```

GitHub may become public before the npm stable release.

---

# 55. Public Package Release Gates

Before any public package release:

- package name confirmed;
- license confirmed;
- README/package description present;
- exports controlled;
- files whitelist correct;
- no embedded secrets;
- source-map policy correct;
- npm release/provenance strategy reviewed.

`create-ranu` additionally requires generated apps to pass `dev`, `build`, and `start` using only public APIs.

---

# 56. Documentation Gate

Before beta, minimum documentation:

```text
Getting Started
Project Structure
Routing
Rendering
API Routes
Middleware
Client Components
Configuration
Environment Variables
Deployment
CLI
```

Before 1.0 add:

```text
Plugins
Public API Reference
Migration
Troubleshooting
Security Guidance
Contributing
```

---

# 57. Stable Release Blockers

These block Ranu.js 1.0.0:

```text
known secret leakage
known path traversal
known production stack leakage
unreliable route matching
broken Windows support
broken production build
broken hydration
broken API dispatch
invalid package exports
create-ranu generated app failure
manifest incompatibility
major public API contradiction
```

---

# 58. Non-Blocking V1 Limitations

These are acceptable documented limitations:

```text
no Edge runtime
no ISR
no Server Actions
no built-in Image optimization
no advanced cache API
no typed routes
no RSC transport
```

They are intentionally deferred, not V1 defects.

---

# 59. Suggested Workstreams

For parallel development:

```text
A — Core / Diagnostics / Config
B — Router
C — Runtime / API
D — React Renderer
E — Build / Client Runtime
F — Dev / HMR
G — CLI / create-ranu
H — Deployment
I — Tests / Security / Docs
```

Parallel work must respect dependency order.

---

# 60. Development Status Tracking

Use GitHub issues/milestones/project tracking with simple states:

```text
Not Started
In Progress
Blocked
Review
Done
```

Recommended milestones:

```text
V0 Prototype
Public Alpha
Public Beta
1.0 RC
Ranu.js 1.0
```

The specification itself should not become a mutable task tracker.

---

# 61. Development Plan Acceptance Criteria

This plan is complete when:

1. package implementation order is defined;
2. first prototype target is defined;
3. router phases are defined;
4. server runtime phases are defined;
5. React rendering phases are defined;
6. build phases are defined;
7. hydration/client phases are defined;
8. SSG is planned;
9. CSS/assets are planned;
10. dev/HMR is planned;
11. middleware is planned;
12. plugin API is planned;
13. CLI/create-ranu are planned;
14. Node/container deployment is planned;
15. Vercel adapter is planned;
16. public API conformance is planned;
17. quality/security/performance gates are planned;
18. alpha/beta/RC/stable gates are defined;
19. deferred features are explicit;
20. implementation can begin without another blocking core subsystem specification.

---

# 62. Locked Development Decisions

The following are locked:

1. Ranu.js is implemented as a monorepo.
2. Shared contracts/diagnostics precede higher-level systems.
3. Router precedes React renderer integration.
4. Node runtime precedes provider adapters.
5. React SSR is proven before hydration/HMR optimization.
6. Production build V0 precedes deployment adapters.
7. Server/client boundary enforcement is release-blocking.
8. Hydration follows SSR.
9. SSG follows stable rendering/build foundations.
10. Client rendering mode follows hydration/navigation infrastructure.
11. CSS and CSS Modules are V1 core features.
12. HMR and React Fast Refresh are V1 requirements.
13. Middleware uses the Node runtime contract.
14. Plugin API v1 follows build/dev lifecycle implementation.
15. CLI orchestrates implemented subsystems rather than duplicating them.
16. `create-ranu` uses only public APIs.
17. Generic Node is the reference deployment.
18. Container deployment is first-class.
19. Vercel is the first provider adapter.
20. Tests are developed throughout implementation.
21. Windows and Linux are mandatory targets.
22. Security hardening occurs before public beta.
23. Public API freezes before RC.
24. No new major V1 feature is added after RC.
25. RSC, Server Actions, ISR, Edge runtime, advanced caching, image/font optimization remain deferred.
26. Ranu.js does not build a custom bundler in V1.
27. Specifications are changed only through justified corrections/approved decisions.
28. GitHub may become public before stable npm release.
29. Ranu.js 1.0.0 requires all quality/security/API/open-source gates.

---

# 63. Required Next Document

The next required document is:

```text
13_REPOSITORY_AND_PACKAGE_STRUCTURE.md
```

It must lock:

- exact monorepo directories;
- package names;
- workspace configuration;
- public vs internal packages;
- package dependency graph;
- package export maps;
- TypeScript project structure;
- tooling layout;
- examples/fixtures/tests/docs layout;
- `.github/` layout;
- release tooling location;
- npm publication boundaries.

After that document is approved, Ranu.js Phase 0 repository implementation can begin.

---

# 64. Final Development Baseline

Ranu.js V1 development proceeds in dependency order from repository foundations to routing, Node runtime, React rendering, build output, client hydration, development tooling, plugins, CLI, deployment, and public release.

The target is not to clone every Next.js feature before first release.

The target is a coherent, reliable, production-capable, public open-source full-stack framework with a small stable API and strong architectural boundaries.

The implementation sequence is:

```text
Repository
→ Core Contracts
→ Configuration
→ Router
→ Node Runtime
→ React SSR
→ Production Build
→ Server/Client Boundaries
→ Hydration
→ Navigation
→ SSG
→ Client Mode
→ CSS/Assets
→ Dev/HMR
→ Middleware
→ Plugins
→ CLI/create-ranu
→ Node/Container
→ Vercel
→ Quality/Security/Docs/Governance
→ Alpha
→ Beta
→ RC
→ Ranu.js 1.0.0
```

This document is the authoritative Ranu.js V1 implementation and release-development plan.

---

**End of 12_DEVELOPMENT_PLAN.md**
