# RANU_FULL_SPECIFICATION_AUDIT.md

**Project:** Ranu.js — JavaScript/TypeScript Full-Stack Web Framework  
**Audit Date:** 2026-08-10  
**Scope:** Full `00–17` specification set, including supporting `11_ENVIRONMENT_VARIABLES.md`  
**Status:** Development-Ready Audited Baseline

---

# 1. Audit Result

**PASS — READY FOR PHASE 0 IMPLEMENTATION**

The complete framework specification set was normalized under the new canonical name **Ranu.js** and checked for the major cross-document contracts required before implementation.

The rename is treated as a namespace migration, not merely a marketing-text change.

---

# 2. Canonical Ranu.js Naming

```text
Framework                 Ranu.js
CLI                       Ranu.js
Main package              Ranu.js
Scaffolder                create-ranu
Public imports            Ranu.js/*
Official adapter scope    @ranu/adapter-*
Public env prefix         RANU_PUBLIC_*
Generated state           .ranu/
Internal URL namespace    /_ranu/
Diagnostic prefix         RANU_*
Configuration             ranu.config.ts
Server-only marker        Ranu.js/server-only
```

Actual npm ownership of `Ranu.js`, `create-ranu`, and `@Ranu.js` must be verified before public publication. The specification must not assume registry ownership.

---

# 3. Corrections Applied During Audit

1. Retired the old HFX identity throughout the active specification set.
2. Replaced CLI commands with `Ranu.js ...`.
3. Replaced public package/subpath examples with `Ranu.js`, `Ranu.js/config`, `Ranu.js/react`, `Ranu.js/server`, and `Ranu.js/plugin`.
4. Replaced official adapter scope with `@ranu/adapter-*`.
5. Replaced `HFX_PUBLIC_*` with `RANU_PUBLIC_*`.
6. Replaced `.hfx/` with `.ranu/`.
7. Replaced `/_hfx/` with `/_ranu/`.
8. Replaced `HFX_*` diagnostic examples with `RANU_*`.
9. Replaced `hfx.config.ts` with `ranu.config.ts`.
10. Replaced `hfx/server-only` with `Ranu.js/server-only`.
11. Corrected stale `10_DEVELOPMENT_PLAN.md` references to `12_DEVELOPMENT_PLAN.md`.
12. Removed any stale build-system requirement that `07_DATA_FETCHING_AND_CACHE.md` must be the next blocking specification.
13. Canonicalized build source-map configuration terminology to `sourceMaps`.
14. Preserved `11_ENVIRONMENT_VARIABLES.md` as an explicitly approved supporting specification without allowing it to replace the core `11_PUBLIC_API_SPECIFICATION.md`.

---

# 4. Document Numbering Decision

There are intentionally two files beginning with `11_`:

```text
11_ENVIRONMENT_VARIABLES.md
11_PUBLIC_API_SPECIFICATION.md
```

This is not treated as two competing core document #11s.

Canonical authority is:

```text
11_PUBLIC_API_SPECIFICATION.md
    = core numbered public API specification

11_ENVIRONMENT_VARIABLES.md
    = supporting environment consolidation specification
```

The environment file refines and consolidates rules owned by build/runtime/config/CLI; it does not silently override those subsystem owners.

Renumbering it now would create unnecessary filename churn after explicit approval, so the supporting status is retained and documented.

---

# 5. Cross-Document Contract Results

## Routing ↔ Rendering — PASS

Router owns matching, route identity, params, hierarchy, precedence, and boundary metadata.

Renderer owns React page/layout composition, SSR, SSG, client mode, hydration, metadata UI, and render error/not-found UI.

## Routing ↔ Runtime — PASS

Router determines the route match.

Runtime owns HTTP normalization, middleware, method dispatch, status, headers, cookies, bodies, redirects, streaming, and transmission.

## Rendering ↔ Runtime — PASS

Runtime invokes rendering for page requests. Rendering does not own Node HTTP transport or API dispatch.

## Build ↔ Runtime — PASS

Production is manifest-driven. `Ranu.js start` executes completed artifacts and does not rescan source routes or rebuild.

## Build ↔ Rendering — PASS

Build orchestrates static generation and server/client graphs while rendering owns route render semantics. Static routes do not silently fall back to SSR.

## Build ↔ Security — PASS

Private environment, server-only transitive imports, Node-only modules, source maps, and public artifacts have explicit boundaries.

## Plugin ↔ Core — PASS

Plugins extend controlled lifecycle hooks and do not become an alternative framework kernel.

## Deployment ↔ Core — PASS

Generic Node/container output remains first-class. Provider-specific behavior remains in adapters. Vercel is not a core dependency.

## CLI ↔ Config — PASS

CLI orchestrates resolved framework configuration instead of defining a competing configuration model.

## Public API ↔ Repository — PASS

Public imports are intentionally smaller than the visible monorepo implementation. Deep/internal packages remain unsupported.

---

# 6. Canonical V1 Architecture

```text
TypeScript-first
JavaScript-supported
React-first
core renderer-neutral
Node-first
Web-standard HTTP APIs
filesystem routing
manifest-driven production
explicit server/client graphs
controlled plugin system
deployment adapters
provider-neutral core
public open source
MIT license
pnpm monorepo development
npm distribution
```

---

# 7. Canonical V1 Rendering Modes

```text
server   ← default
static
client
```

Static routes are generated at build time and do not silently become request-time SSR routes.

---

# 8. Canonical Routing Contract

```text
Root: app/

Reserved modules:
page.*
layout.*
route.*
loading.*
error.*
not-found.*

Segments:
[param]
[...param]
[[...param]]
(group)
_private

Precedence:
static
→ dynamic
→ catch-all
→ optional catch-all
```

Reserved framework URL namespace:

```text
/_ranu/
```

---

# 9. Canonical Runtime Contract

Primary V1 runtime:

```text
Node.js
```

Application-facing HTTP semantics prefer:

```text
Request
Response
Headers
URL
Web Streams
```

Provider transport remains behind runtime/deployment adapters.

---

# 10. Canonical Build Contract

Generated application state:

```text
.ranu/
```

Production build:

```text
.ranu/build/
```

Build owns compilation, server/client graphs, CSS/assets, SSG orchestration, manifests, build IDs, source maps, and atomic build completion.

The underlying bundler is not the public Ranu.js API.

---

# 11. Canonical Public API

```text
Ranu.js
Ranu.js/config
Ranu.js/react
Ranu.js/server
Ranu.js/plugin
```

Official deployment adapters:

```text
@ranu/adapter-*
```

---

# 12. Canonical CLI

```bash
Ranu.js create
Ranu.js dev
Ranu.js build
Ranu.js start
```

The CLI remains provider-neutral at core.

---

# 13. Canonical Environment Model

Private is default.

Only:

```text
RANU_PUBLIC_*
```

is browser-public through Ranu.js environment handling.

Public values are not secrets.

The complete server process environment is never injected into browser bundles.

---

# 14. Canonical Security Model

Locked security properties remain:

- browser/request input is untrusted;
- server-only code cannot enter browser graphs;
- server-to-browser data is public;
- hydration serialization must prevent script breakout;
- public/static filesystem access is root-contained;
- `.env*` is never automatically public;
- production errors are sanitized;
- forwarded headers are trusted only through explicit policy;
- request-local state cannot leak across concurrent requests;
- plugins are trusted Node code and are not sandboxed;
- provider credentials never become browser/public artifacts.

---

# 15. Canonical Open-Source Release Model

```text
MIT
public GitHub monorepo
Semantic Versioning
Changesets
alpha → beta → RC → stable
protected CI publishing
npm provenance where supported
packed-package release validation
```

Stable releases remain subject to the quality and security gates already defined.

---

# 16. Deferred V1 Features

The audit preserves the existing deferral of:

```text
RSC/Flight transport
Server Actions
ISR/revalidation
advanced automatic caching
Edge runtime
mixed runtime routes
built-in database/ORM
built-in authentication
image optimization
font optimization
partial prerendering
custom bundler written from scratch
```

These require later RFC/spec work and must not enter V1 accidentally.

---

# 17. External Verification Still Required

Before public npm/GitHub/domain launch, verify:

```text
Ranu.js npm package availability/ownership
create-ranu npm package availability/ownership
@Ranu.js npm scope availability/ownership
canonical GitHub organization/repository
canonical documentation domain
operational private security-reporting channel
```

If a package namespace is unavailable, change it intentionally across the specification set before publication.

---

# 18. Canonical Specification Set

```text
00_FRAMEWORK_VISION.md
01_PRODUCT_REQUIREMENTS.md
02_FRAMEWORK_ARCHITECTURE.md
03_ROUTING_SPECIFICATION.md
04_RENDERING_MODEL.md
05_SERVER_RUNTIME_SPEC.md
06_BUILD_SYSTEM.md
07_PLUGIN_SYSTEM.md
08_DEPLOYMENT_ADAPTERS.md
09_CLI_SPECIFICATION.md
10_CONFIGURATION_SYSTEM.md
11_ENVIRONMENT_VARIABLES.md        [supporting specification]
11_PUBLIC_API_SPECIFICATION.md     [core public API specification]
12_DEVELOPMENT_PLAN.md
13_REPOSITORY_AND_PACKAGE_STRUCTURE.md
14_TESTING_AND_QUALITY_STRATEGY.md
15_SECURITY_MODEL.md
16_OPEN_SOURCE_GOVERNANCE_AND_RELEASES.md
17_DOCUMENTATION_AND_EXAMPLES_PLAN.md
```

---

# 19. Implementation Decision

No additional major planning specification is required before coding.

The next project stage is:

```text
PHASE 0 — REPOSITORY / TOOLING BOOTSTRAP
```

Implementation must follow `12_DEVELOPMENT_PLAN.md`, with repository structure from `13_REPOSITORY_AND_PACKAGE_STRUCTURE.md` and continuous quality/security requirements from documents `14–17`.

---

# 20. Final Decision

The old HFX working identity is retired.

**Ranu.js** is the canonical framework identity.

The audited specification set now forms the development baseline for the Ranu.js V1 open-source full-stack framework.

---

**End of RANU_FULL_SPECIFICATION_AUDIT.md**
