# 06_BUILD_SYSTEM.md

**Project:** Ranu.js — JavaScript/TypeScript Full-Stack Web Framework  
**Document Type:** Build System Specification  
**Status:** Development Baseline  
**Date:** 2026-08-10  
**Depends On:** `00_FRAMEWORK_VISION.md`, `01_PRODUCT_REQUIREMENTS.md`, `02_FRAMEWORK_ARCHITECTURE.md`, `03_ROUTING_SPECIFICATION.md`, `04_RENDERING_MODEL.md`, `05_SERVER_RUNTIME_SPEC.md`  
**Primary Language:** TypeScript / JavaScript  
**Primary V1 Renderer:** React  
**Primary V1 Runtime:** Node.js

---

# 1. Purpose

This document defines the Ranu.js V1 build system.

It specifies:

- source discovery;
- configuration loading;
- compiler/transformation responsibilities;
- bundler architecture;
- development and production build modes;
- client/server graph separation;
- `"use client"` processing;
- server-only enforcement;
- environment variables;
- route compilation integration;
- React transformation;
- TypeScript handling;
- CSS processing;
- static assets;
- public assets;
- code splitting;
- tree shaking;
- static generation orchestration;
- build manifests;
- production server output;
- source maps;
- cache/incremental build architecture;
- build IDs;
- output layout;
- diagnostics;
- `Ranu.js build`;
- `Ranu.js start` artifact requirements;
- reproducibility;
- production security requirements.

This document does not redefine routing, rendering, or HTTP semantics.

---

# 2. Build Objective

Ranu.js must transform a developer-friendly source project into a deterministic production application containing everything required for:

```text
Static Delivery
+
Browser Execution
+
Node.js Server Execution
```

without requiring the production runtime to inspect application source files.

Conceptual pipeline:

```text
Project Source
     ↓
Config Resolution
     ↓
Route Compilation
     ↓
Module Classification
     ↓
Server Graph + Client Graph
     ↓
Transforms
     ↓
Bundling
     ↓
Static Generation
     ↓
Manifest Generation
     ↓
Production Output
```

---

# 3. Build Principles

## BLD-P01 — Explicit Graph Boundaries

Server and browser module graphs must be separated before production execution.

## BLD-P02 — Server Safety

Server-only code, secrets, and dependencies must never silently enter client bundles.

## BLD-P03 — Deterministic Production Output

Equivalent source, configuration, dependency lockfile, and environment inputs should produce functionally equivalent output.

## BLD-P04 — Manifest-Driven Runtime

Production runtime behavior is driven by build manifests rather than source discovery.

## BLD-P05 — Fast Development

Development should avoid unnecessary full-project rebuilds.

## BLD-P06 — Correctness Before Optimization

Tree shaking, minification, caching, and chunking must not alter framework semantics.

## BLD-P07 — Toolchain Isolation

Bundler/compiler implementation details must remain behind Ranu.js build contracts.

## BLD-P08 — Actionable Diagnostics

Build failures must identify route/module/source context and a practical correction.

## BLD-P09 — Web-Compatible Output

Browser output must use standard web assets and module/runtime semantics.

## BLD-P10 — Runtime Portability

Server output must target the documented Ranu.js runtime contract rather than a hosting provider SDK.

---

# 4. Recommended Package Boundaries

Conceptual internal packages:

```text
@ranu/build
@ranu/compiler
@ranu/dev
@ranu/config
@ranu/manifest
```

Responsibilities:

```text
@ranu/build
  production build orchestration

@ranu/compiler
  source analysis and Ranu.js-specific transforms

@ranu/dev
  development module/build orchestration

@ranu/config
  configuration discovery and normalization

@ranu/manifest
  manifest schemas, validation, versioning
```

Exact package names may change without changing these architectural boundaries.

---

# 5. Bundler Strategy

Ranu.js V1 should use an existing production-grade JavaScript bundler rather than implementing a bundler from scratch.

The Ranu.js architecture must wrap the bundler behind an internal adapter.

Conceptual:

```ts
interface RanuBundler {
  buildServerGraph(...): Promise<BundleResult>;
  buildClientGraph(...): Promise<BundleResult>;
  watch?(...): Promise<WatchHandle>;
}
```

The first implementation may use a tool such as:

```text
Vite/Rollup-compatible infrastructure
or
esbuild-compatible infrastructure
```

after an implementation spike.

The public Ranu.js framework contract must not depend on a specific bundler's configuration language.

---

# 6. Bundler Selection Gate

Before implementation is locked to a bundler, the project must validate:

1. client/server graph control;
2. custom module resolution hooks;
3. directive detection;
4. CSS support;
5. asset handling;
6. code splitting;
7. tree shaking;
8. source maps;
9. development watch/HMR integration;
10. SSR bundling;
11. Node production output;
12. plugin isolation;
13. build performance;
14. license compatibility;
15. ability to enforce Ranu.js server/client boundaries.

The selected toolchain becomes an implementation dependency, not an Ranu.js application API.

---

# 7. Compiler Strategy

Ranu.js V1 does not need to implement a general JavaScript/TypeScript compiler.

It uses established parsing/transformation infrastructure for:

```text
TypeScript syntax removal
JSX/TSX transformation
ECMAScript transformation where needed
source analysis
Ranu.js directives/exports
```

Ranu.js-specific compiler logic is limited to framework semantics.

---

# 8. Ranu.js-Specific Compiler Responsibilities

The Ranu.js compiler/analyzer must understand at least:

```text
"use client"
Ranu.js/server-only
page render export
generateStaticParams
metadata export
generateMetadata
route handler HTTP exports
middleware config
route module identity
client/server import boundaries
public environment references where statically transformed
```

It must not attempt to reinterpret ordinary application business logic.

---

# 9. TypeScript

Ranu.js supports TypeScript as a first-class source language.

Supported source extensions should include:

```text
.ts
.tsx
```

and JavaScript equivalents:

```text
.js
.jsx
.mjs
.mts
```

The exact accepted extension list must be shared with routing rules.

---

# 10. TypeScript Transpilation vs Type Checking

Ranu.js separates:

```text
transpilation
```

from:

```text
type checking
```

The build transform removes TypeScript syntax.

Type correctness is validated through a dedicated type-check stage or TypeScript integration.

This prevents the bundler transform from becoming the source of TypeScript semantic truth.

---

# 11. Production Type Checking

Default `Ranu.js build` should run project type checking unless explicitly disabled through documented configuration/CLI.

A type-check failure should fail the production build by default.

Conceptual opt-out:

```ts
typescript: {
  check: false
}
```

If such an escape hatch exists, Ranu.js must warn that type errors are not being validated.

---

# 12. TypeScript Configuration

Ranu.js should respect a project:

```text
tsconfig.json
```

for ordinary TypeScript settings where compatible.

Ranu.js may generate or recommend required compiler settings.

Framework-required settings must be documented and validated rather than silently overridden where possible.

---

# 13. Generated Type Definitions

Ranu.js may generate framework route types under a generated directory such as:

```text
.ranu/types/
```

These may include:

```text
route params
route IDs
generated Ranu.js environment declarations
framework helper types
```

Generated types are build/dev artifacts and should not require manual editing.

---

# 14. JSX

The official React renderer requires JSX/TSX transformation.

The build system must preserve the React transformation strategy selected by `@ranu/react`.

Applications should not need to configure Babel merely to use ordinary React JSX.

---

# 15. Babel

Babel is not required as the default Ranu.js V1 compiler layer.

If custom Babel compatibility is later supported, it must not be necessary for core framework operation.

Reducing compiler layers simplifies the V1 toolchain.

---

# 16. Source Root

The project root is the directory containing the active Ranu.js configuration/package context.

Primary application routes live under:

```text
app/
```

according to `03_ROUTING_SPECIFICATION.md`.

Other source directories may be organized freely.

---

# 17. Build Output Directory

Ranu.js V1 uses:

```text
.ranu/
```

as framework-generated local/build state.

Production build output lives under:

```text
.ranu/build/
```

This namespace is framework-owned.

Applications must not place source-of-truth files inside `.ranu/`.

---

# 18. Cleaning Build Output

A normal production build must not mix stale artifacts from an incompatible previous build.

Ranu.js should either:

- build into a fresh build directory; or
- use content-addressed/versioned output and atomically update the active build.

Stale chunks/manifests must not survive as authoritative artifacts accidentally.

---

# 19. Development State

Development-generated caches/state may live under:

```text
.ranu/dev/
.ranu/cache/
```

Production runtime must not depend on development-only state.

---

# 20. Git Ignore

Ranu.js project initialization/documentation should recommend:

```gitignore
.ranu/
```

Generated build output should not normally be committed to source control unless a deployment workflow intentionally requires it.

---

# 21. Configuration File

Ranu.js V1 should support a root configuration file such as:

```text
ranu.config.ts
```

with JavaScript equivalents where supported.

Conceptual:

```ts
import { defineConfig } from "Ranu.js/config";

export default defineConfig({
  server: {},
  build: {}
});
```

---

# 22. Config Loading

Config loading occurs before route/build compilation.

The configuration system must:

- locate the supported config file;
- execute/parse it in a controlled Node build environment;
- validate known fields;
- normalize defaults;
- produce a serializable normalized config where required.

---

# 23. Config Errors

Invalid configuration must fail early.

Example:

```text
RANU_CONFIG_INVALID_VALUE

build.sourceMaps expected:
  true | false | "hidden"

Received:
  "sometimes"
```

Configuration errors should not surface later as unrelated bundler failures.

---

# 24. Config Environment

The config file executes during development/build startup.

It may read build environment variables.

Configuration values needed by production runtime must be serialized into normalized build/runtime metadata.

Production should not need to execute TypeScript config source merely to start the server.

---

# 25. Build Command

Primary production command:

```bash
Ranu.js build
```

Its responsibility is to produce a complete validated production artifact.

Success means the artifact is ready for:

```bash
Ranu.js start
```

or deployment adaptation.

---

# 26. Build Pipeline

Authoritative conceptual pipeline:

```text
1. Resolve project root
2. Load environment files
3. Load and validate Ranu.js config
4. Validate package/runtime compatibility
5. Discover and compile routes
6. Analyze route modules
7. Classify server/client/shared modules
8. Validate graph boundaries
9. Generate intermediate route/build metadata
10. Build server graph
11. Build client graph
12. Process CSS/assets
13. Run type checking
14. Generate static routes
15. Generate final manifests
16. Generate production runtime entry
17. Validate artifact integrity
18. Write build summary
```

Independent stages may run concurrently where safe.

---

# 27. Fail-Fast vs Aggregate Diagnostics

Ranu.js should aggregate independent build diagnostics where practical.

Example:

```text
three route collisions
two client/server boundary violations
one type error
```

may be reported together.

However, stages that cannot safely continue after a foundational failure may stop early.

---

# 28. Route Compilation Integration

The build system consumes routing rules from `03_ROUTING_SPECIFICATION.md`.

It must compile:

```text
page routes
API routes
layout ancestry
loading boundaries
error boundaries
not-found boundaries
dynamic parameter metadata
route precedence
```

into production route metadata.

The bundler must not independently infer URL routing.

---

# 29. Route IDs

Every compiled endpoint receives a stable build-local route ID.

Conceptual:

```text
page:/
page:/products/[id]
api:/api/users/[id]
```

The exact encoding is internal but must be deterministic and unique.

---

# 30. Module IDs

Build manifests should reference logical/content-safe module/chunk IDs rather than absolute source paths for browser-visible metadata.

Internal server manifests may contain output-relative file references.

Absolute developer filesystem paths must not be exposed to browser manifests.

---

# 31. Module Classification

Every relevant module is classified through graph reachability and explicit markers.

Conceptual classes:

```text
server-only
client-entry
client-reachable
shared
build-only
```

A module may be used by both server and client graphs only if it is browser-safe and not server-only.

---

# 32. `"use client"` Detection

The compiler must detect a top-level directive prologue:

```ts
"use client";
```

before ordinary executable statements.

Comments and legal directive-prologue syntax must be handled correctly.

A string literal occurring later in the file must not classify the module as a client boundary.

---

# 33. Client Entry

A `"use client"` module imported from a server/static route becomes a client entry/boundary.

The build system creates browser-reachable chunks for it and its client-safe dependencies.

The server graph retains enough representation to render/associate the boundary correctly.

---

# 34. Client Propagation

Given:

```text
A.tsx  "use client"
  ↓ imports
B.ts
  ↓ imports
C.ts
```

the browser graph includes:

```text
A
B
C
```

unless tree shaking proves some imports unreachable.

`B` and `C` must therefore satisfy client safety constraints.

---

# 35. Server-Only Marker

The build system recognizes:

```ts
import "Ranu.js/server-only";
```

as an explicit server-only marker.

The marker itself need not produce runtime code.

It exists to enforce build graph boundaries.

---

# 36. `server/` Convention

Modules under the project:

```text
server/
```

directory are server-only according to `04_RENDERING_MODEL.md`.

They may be bundled into server output.

They must not enter browser output.

---

# 37. Client → Server Violation

If client-reachable code imports a server-only module, build/dev fails.

Required information:

```text
client entry
server-only target
full relevant import chain
source locations where possible
```

Ranu.js must not replace the import with an undefined stub and continue.

---

# 38. Server → Client Import

Server modules may import client boundary modules for rendering composition.

The compiler/bundler must transform this relationship into:

```text
server-side client reference
+
browser client chunk
```

rather than executing browser-only behavior incorrectly on the server.

The exact implementation is renderer-adapter specific.

---

# 39. No Public RSC Requirement

The server/client graph mechanism must support Ranu.js V1 without requiring a React Flight/RSC public transport protocol.

Client boundary metadata may be Ranu.js-specific build metadata used for hydration.

---

# 40. Shared Module Safety

A shared module imported by both graphs must not:

- import server-only modules;
- use private environment variables in client-reachable code;
- rely on Node-only built-ins in the browser graph;
- perform unsafe browser-only initialization in the server graph.

Build diagnostics should identify incompatible dependencies.

---

# 41. Node Built-ins in Client Graph

Imports such as:

```text
node:fs
node:path
node:net
node:tls
```

must fail when reachable from browser bundles unless the build system explicitly supports a safe browser replacement.

Ranu.js V1 should not automatically polyfill Node built-ins in browser code.

This keeps client behavior explicit.

---

# 42. Browser Globals in Server Graph

The compiler does not need to reject every use of:

```text
window
document
navigator
```

in server-capable modules statically.

However, server execution may fail if browser globals execute during SSR.

Development diagnostics should provide useful context.

Client-only code should be isolated behind `"use client"`.

---

# 43. Package Conditions

Module resolution should use environment-appropriate package export conditions.

Conceptually:

```text
server graph → node/import/default conditions
client graph → browser/import/default conditions
```

The exact condition set must be tested against Node package `exports` semantics.

---

# 44. ESM Strategy

Ranu.js V1 should use ESM as the primary framework/build output model.

Server bundles target modern Node.js ESM-compatible execution.

Compatibility shims for CommonJS dependencies may be handled by the selected bundler.

Application code should not need to understand internal interop wrappers.

---

# 45. CommonJS Dependencies

Ranu.js must support reasonable use of ecosystem CommonJS packages in server applications.

Browser compatibility depends on the package and bundler.

Unsupported dynamic CommonJS patterns should produce clear build diagnostics rather than silent runtime corruption.

---

# 46. Dynamic Import

Ordinary:

```ts
import("./module")
```

is supported subject to bundler capabilities.

Client dynamic imports may create asynchronous chunks.

Server dynamic imports must resolve into production server output or externalized dependencies correctly.

---

# 47. Arbitrary Dynamic Paths

Patterns such as:

```ts
import("./modules/" + name)
```

may not be statically analyzable.

Ranu.js should rely on supported bundler behavior and report unsupported dynamic imports clearly.

The framework must not recursively include the entire filesystem without warning.

---

# 48. Server Dependency Bundling

The server build may choose per dependency to:

```text
bundle
or
externalize
```

based on compatibility and deployment strategy.

The choice must be deterministic.

Production output must declare any runtime dependencies that remain external.

---

# 49. Standalone Output Goal

Ranu.js V1 should support a production output that can run with minimal deployment requirements.

Preferred goal:

```text
application server bundles
+
required runtime packages
+
external production dependencies only where necessary
```

A future fully standalone packaging mode may copy traced dependencies.

---

# 50. Dependency Tracing

If server dependencies remain external, Ranu.js should support tracing which production packages/files are required.

This is important for container/serverless deployment adapters.

Tracing must not accidentally include secrets or unrelated project files.

---

# 51. Native Node Addons

Dependencies using native `.node` addons may need to remain external to JavaScript bundling.

The build system must preserve them as runtime dependencies and report deployment requirements where possible.

---

# 52. Environment Variable Model

Environment variables are classified:

```text
build/server-private
client-public
runtime-server
```

Private is the default.

Client exposure requires an explicit public prefix.

---

# 53. Public Environment Prefix

Ranu.js V1 uses:

```text
RANU_PUBLIC_
```

as the public environment variable prefix.

Example:

```text
RANU_PUBLIC_API_BASE_URL
```

may be included in browser output.

Example:

```text
DATABASE_URL
```

must remain server-only.

---

# 54. Public Environment Semantics

Public environment values are build-visible and may be embedded into browser bundles.

They are therefore not secrets.

Documentation must explicitly state:

```text
Anything prefixed RANU_PUBLIC_ may be visible to users.
```

---

# 55. Private Environment Variables

Variables without the public prefix remain server/build-only unless application code explicitly leaks them.

The build system must never automatically serialize all `process.env` values into client code.

---

# 56. Client Environment Access

Client code should use a documented environment access mechanism.

V1 may support:

```ts
process.env.RANU_PUBLIC_NAME
```

through compile-time replacement, or a dedicated:

```ts
import.meta.env.RANU_PUBLIC_NAME
```

style contract.

Ranu.js must choose one stable public contract before implementation completion.

V1 recommended contract:

```ts
import.meta.env.RANU_PUBLIC_*
```

for client/build code.

---

# 57. Server Environment Access

Server code may use:

```ts
process.env.NAME
```

under Node.js.

Ranu.js does not need to replace all private server environment references at build time.

This allows production runtime secrets to be injected at process startup.

---

# 58. Public Env Build Timing

`RANU_PUBLIC_*` values used by browser code are considered build-time values.

Changing them after `Ranu.js build` does not guarantee client output changes.

A new build is required unless a future runtime-public-config system is explicitly introduced.

---

# 59. Runtime Server Env

Private server environment variables may be read at request/runtime execution.

This permits deployment-time secrets without rebuilding the application.

Static generation that reads such values naturally uses the values available during build.

---

# 60. Environment Files

Ranu.js should support conventional environment files such as:

```text
.env
.env.local
.env.development
.env.production
```

with a documented precedence model.

Secret-bearing local files should be gitignored by project templates.

---

# 61. Environment File Precedence

A stable precedence must be implemented and documented.

Conceptually, more specific/local files override generic files.

The exact ordering must be tested and must not change silently between releases.

---

# 62. Environment Leakage Validation

The client build must detect direct references to clearly private environment access where possible.

Invalid example:

```tsx
"use client";

console.log(process.env.DATABASE_URL);
```

must fail or be prevented from resolving to the private value.

It must never silently embed the secret.

---

# 63. `process.env` Object Serialization

Client builds must not replace:

```ts
process.env
```

with the entire server environment object.

Dynamic access such as:

```ts
process.env[name]
```

cannot be used to retrieve arbitrary private values in client code.

---

# 64. Environment Diagnostic

Example:

```text
RANU_BUILD_PRIVATE_ENV_CLIENT

Client module attempted to access a private environment variable.

Module:
  app/dashboard/Client.tsx

Variable:
  DATABASE_URL

Only RANU_PUBLIC_* variables may be exposed to browser code.
```

---

# 65. Render Mode Analysis

The build system reads page exports:

```ts
export const render = "static";
export const render = "server";
export const render = "client";
```

If omitted:

```text
server
```

is recorded.

The build manifest must preserve this mode explicitly.

---

# 66. Static Route Analysis

For static routes, the build must determine whether the route is:

```text
literal/static pathname
dynamic pathname requiring generateStaticParams
```

Dynamic static routes without `generateStaticParams()` fail before static generation.

---

# 67. Static Generation Orchestration

Static generation runs after server code needed for build-time rendering has been compiled/loaded.

Conceptual:

```text
Static Route Manifest
      ↓
Resolve Param Sets
      ↓
Validate Paths
      ↓
Run Renderer
      ↓
Write HTML
      ↓
Record Assets/Metadata
      ↓
Update Static Manifest
```

---

# 68. Static Generation Environment

Static generation executes in the build process/environment.

It may use:

- server code;
- databases reachable from build;
- network requests;
- build environment variables.

It does not have an incoming user request.

Request-only APIs must fail as defined in `04_RENDERING_MODEL.md`.

---

# 69. Static Generation Concurrency

Ranu.js should render multiple independent static paths concurrently.

Concurrency must be bounded.

Conceptual configuration:

```ts
build: {
  staticGenerationConcurrency: 8
}
```

The default should be chosen based on stability rather than maximum CPU usage.

---

# 70. Static Generation Determinism

Ranu.js cannot force application data sources to be deterministic.

However, for a given generated path, the framework must not intentionally render it multiple times with conflicting outputs during one build.

Duplicate path generation must fail.

---

# 71. Static Output Path

Static HTML should be stored in a build-owned structure independent of source path layout.

Conceptually:

```text
.ranu/build/static/pages/
```

The static manifest maps URL path to output artifact.

The runtime must use the manifest rather than filename guessing.

---

# 72. Static HTML Naming

The build may use encoded route/path IDs or hashed filenames.

Example conceptual:

```text
static/pages/p_8f4d2.html
```

URL semantics must not depend on output filename structure.

---

# 73. Static Metadata

Precomputed metadata for static routes may be embedded directly in generated HTML.

The static manifest may also record status/headers/assets required to serve the page.

---

# 74. Static 404

The build should generate a root custom 404 artifact when applicable.

Nested not-found behavior for static generated routes must preserve the routing/rendering specification.

Runtime 404 dispatch may use prebuilt not-found output where valid.

---

# 75. Client Build

The client build produces browser assets for:

```text
client-rendered routes
client boundaries inside SSR routes
client boundaries inside SSG routes
ranu CLIent runtime
navigation/hydration support
CSS/assets
```

It must not include arbitrary server route code.

---

# 76. Client Entry Discovery

Client entries come from:

- `"use client"` boundaries reachable from pages/layouts;
- `render = "client"` route entries;
- Ranu.js browser runtime;
- development-only client runtime in dev mode.

The browser build must not simply bundle the entire `app/` tree.

---

# 77. Client Manifest

The production client manifest maps logical client references/routes to generated browser assets.

Conceptual:

```json
{
  "version": 1,
  "buildId": "...",
  "entries": {
    "client:app/products/Counter.tsx": {
      "js": ["/_ranu/assets/counter.abcd.js"],
      "css": []
    }
  }
}
```

Browser-visible manifest content must not reveal absolute local source paths.

Logical IDs may be opaque in final output.

---

# 78. Route Asset Manifest

The renderer/runtime needs route-level asset association.

Conceptual:

```json
{
  "page:/products/[id]": {
    "js": [
      "/_ranu/assets/runtime.a1.js",
      "/_ranu/assets/product.b2.js"
    ],
    "css": [
      "/_ranu/assets/product.c3.css"
    ]
  }
}
```

This may be part of the client manifest or a separate manifest.

---

# 79. Server Build

The server build produces executable Node.js modules for:

```text
server-rendered pages
layouts/server components
API routes
middleware
server helpers/runtime integration
metadata generation
static-generation server execution
```

Client-only dependencies must not execute as ordinary server browser code.

---

# 80. Server Manifest

The server manifest maps route/runtime identities to compiled server entries.

Conceptual:

```json
{
  "version": 1,
  "buildId": "...",
  "routes": {
    "page:/dashboard": {
      "entry": "./server/routes/page-dashboard.mjs"
    },
    "api:/api/users": {
      "entry": "./server/routes/api-users.mjs"
    }
  },
  "middleware": {
    "entry": "./server/middleware.mjs"
  }
}
```

---

# 81. Route Manifest

Routing metadata is stored independently enough that the runtime can match requests without loading every route module.

Conceptual fields:

```text
route ID
route kind
pattern
precedence
params
render mode
layout/boundary IDs
```

Exact schema belongs to shared route/manifest definitions.

---

# 82. Static Manifest

Conceptual:

```json
{
  "version": 1,
  "buildId": "...",
  "paths": {
    "/": {
      "file": "./static/pages/home.html",
      "status": 200
    },
    "/docs/routing": {
      "file": "./static/pages/docs-routing.html",
      "status": 200
    }
  }
}
```

It may additionally reference headers/assets.

---

# 83. Build Manifest Versioning

Every Ranu.js-owned production manifest must include a schema version.

Runtime startup validates supported versions.

Manifest schemas may evolve independently of human-readable framework version strings.

---

# 84. Build ID

Every successful production build receives a build ID.

Requirements:

- unique enough to distinguish deployments;
- safe for filenames/headers;
- available to server/client artifact compatibility checks;
- not contain secrets.

It may be generated from:

```text
random/ULID-like value
or
content/revision-derived input
```

The exact algorithm is implementation-specific.

---

# 85. Custom Build ID

Ranu.js may allow CI/deployment systems to provide a build ID or source revision.

If allowed, values must be validated and normalized.

Duplicate build IDs across incompatible artifacts are an operator responsibility, but Ranu.js should discourage unsafe usage.

---

# 86. Production Output Layout

Recommended conceptual structure:

```text
.ranu/
└── build/
    ├── BUILD_ID
    ├── manifest/
    │   ├── routes.json
    │   ├── server.json
    │   ├── client.json
    │   └── static.json
    ├── server/
    │   ├── entry.mjs
    │   ├── runtime/
    │   ├── routes/
    │   └── chunks/
    ├── static/
    │   ├── pages/
    │   └── assets/
    └── types/
```

The final implementation may refine names while preserving separation.

---

# 87. `/_ranu/` Asset Mapping

Browser build assets under build output map to public URLs under:

```text
/_ranu/
```

Example:

```text
.ranu/build/static/assets/app.abc.js
```

may map to:

```text
/_ranu/assets/app.abc.js
```

The server runtime/deployment adapter owns the physical mapping.

---

# 88. Content Hashing

Production browser assets should use content hashes.

Benefits:

- immutable caching;
- cache busting;
- deployment coexistence;
- safe long-lived CDN caching.

HTML filenames do not need to be public content-hashed URLs because runtime/static manifests map them.

---

# 89. Code Splitting

Client code must be split so users do not download the entire application for every route.

At minimum, splitting should occur around:

```text
route/client entries
dynamic imports
shared runtime/vendor chunks where beneficial
```

Chunking is an optimization and must preserve route correctness.

---

# 90. Shared Client Chunks

The bundler may extract shared client dependencies used by multiple routes.

Examples:

```text
React runtime
ranu CLIent runtime
common UI libraries
```

Chunk strategy should avoid both extreme duplication and one giant application bundle.

---

# 91. Server Code Splitting

Production server routes may be split into route-level or shared chunks.

The runtime loads only the route entry needed for a request where practical.

Server chunking must not break module singleton expectations unexpectedly beyond normal bundler semantics.

---

# 92. Tree Shaking

Production builds should enable tree shaking for ESM-compatible code.

Ranu.js must respect package side-effect declarations and bundler correctness.

The build must not remove route exports merely because they appear unused to a generic bundler.

Framework entry exports must be marked/referenced explicitly.

---

# 93. Minification

Production browser JavaScript should be minified by default.

Server minification is optional.

Server output readability may be preferable for diagnostics unless size/deployment requirements justify minification.

Ranu.js may expose separate controls.

---

# 94. CSS Model

Ranu.js V1 supports at minimum:

```text
global CSS
CSS Modules
```

Additional preprocessors are not required by core V1.

---

# 95. Global CSS

Global CSS should normally be imported from the root layout or documented application entry.

The build system tracks it as global output.

Ranu.js should prevent unpredictable duplicate ordering where possible.

---

# 96. CSS Modules

Files such as:

```text
Component.module.css
```

produce locally scoped class mappings.

Example:

```tsx
import styles from "./Button.module.css";

<button className={styles.primary} />
```

The exact generated class name is implementation-specific.

---

# 97. CSS Extraction

Production CSS should be emitted as browser CSS assets where practical rather than requiring all CSS to be injected through JavaScript.

The route asset manifest associates required styles with routes/client boundaries.

---

# 98. CSS Ordering

The build must define deterministic CSS ordering.

Nested layouts/page/client component styles must not reorder unpredictably between development and production.

CSS cascade remains standard CSS behavior.

---

# 99. CSS Errors

Invalid CSS or unsupported processing syntax must produce source-aware build diagnostics.

Ranu.js should not silently drop invalid styles.

---

# 100. CSS Preprocessors

Sass/Less/PostCSS plugins may be added later or through plugin/toolchain integration.

They are not mandatory to prove Ranu.js V1 full-stack functionality.

Core CSS must work without additional preprocessors.

---

# 101. Static Asset Imports

The client/server build may support imports such as:

```ts
import logo from "./logo.svg";
```

returning a build-generated asset URL or metadata according to asset type.

The exact supported imported asset extensions must be documented.

---

# 102. Asset Hashing

Imported production assets should receive content-hashed filenames where appropriate.

Their URLs are generated by the build system.

Applications must not depend on physical build filenames.

---

# 103. Inline Asset Threshold

The build may inline very small assets as data URLs.

If implemented, the threshold must be configurable or stable and must not inline sensitive/server files.

Inlining is an optimization, not a framework semantic requirement.

---

# 104. Public Assets

Files under:

```text
public/
```

are copied/referenced as public static assets rather than bundled module imports.

Their URL paths remain stable according to the public-directory contract.

---

# 105. Public Asset Collision Validation

The build must compare public paths with application route paths.

Collisions must follow `03_ROUTING_SPECIFICATION.md`.

The build should fail or warn according to the locked routing rule rather than leave behavior ambiguous.

---

# 106. Reserved Namespace Validation

The build must reject application/public output that attempts to own:

```text
/_ranu/
```

This namespace is framework-reserved.

---

# 107. JSON Imports

JSON module imports should be supported where the selected toolchain/target supports them safely.

The build may bundle JSON content.

Large runtime data should not automatically become browser bundles merely because it is imported from client code.

---

# 108. WASM

WebAssembly import integration is deferred unless required by implementation dependencies.

Ordinary public/static `.wasm` delivery may still work as a static asset.

---

# 109. Worker Bundles

Web Worker-specific bundling is not a core V1 requirement.

Applications may use supported bundler-native patterns only if Ranu.js explicitly documents them.

Worker semantics must not be assumed in the initial framework contract.

---

# 110. Client Target

The browser compilation target should be modern browsers defined through a documented support policy.

Ranu.js V1 should not ship large legacy polyfills by default.

The exact browser matrix belongs to release policy.

---

# 111. Server Target

The server build targets the supported Node.js V1 runtime.

This permits modern JavaScript syntax supported by that Node baseline.

Unnecessary transpilation should be avoided.

---

# 112. Polyfills

Ranu.js should not automatically polyfill arbitrary Node APIs into browser bundles.

Web platform polyfills should be added only when required by the supported browser policy and framework runtime.

---

# 113. Source Maps

Ranu.js V1 supports source map modes:

```text
false
true
hidden
```

Recommended production default:

```text
hidden
```

for server diagnostics, with client map publication disabled unless explicitly requested.

Exact server/client options may be separated.

---

# 114. Hidden Source Maps

A hidden source map is generated without adding a browser-facing sourceMappingURL reference.

This permits private error-symbolication workflows without automatically publishing source.

---

# 115. Client Source Map Safety

If client source maps are enabled publicly, developers must understand that original client source may become inspectable.

Server-only source must never be included in client source maps.

---

# 116. Server Source Maps

Server source maps may contain local source paths/content.

They must remain server-side/deployment-private unless explicitly uploaded to an observability service.

They must not be copied under `/_ranu/`.

---

# 117. Development Mode

Primary command:

```bash
Ranu.js dev
```

Development uses an incremental/on-demand module pipeline.

It should not run the full production build after every source change.

---

# 118. Development Startup

Conceptual:

```text
load env/config
→ discover routes
→ create dev route manifest
→ start transform/bundler service
→ start Ranu.js Node dev runtime
→ start HMR client/channel
→ accept requests
```

---

# 119. Development Route Updates

Adding/removing/renaming route files must update route matching without requiring a manual server restart where practical.

The dev system watches route-relevant filesystem paths.

Route collision errors should surface immediately.

---

# 120. HMR

Ranu.js V1 should provide browser Hot Module Replacement for client code.

React Fast Refresh may be integrated through the React renderer/toolchain.

Server module changes may trigger targeted invalidation or server-side reload behavior.

---

# 121. HMR Correctness

If a change cannot be safely hot-updated, development must fall back to:

```text
full browser reload
or
server module restart/reload
```

Correctness is more important than preserving component state.

---

# 122. Route HMR

Changes to:

```text
page
layout
loading
error
not-found
route
middleware
```

must invalidate the relevant route/runtime state.

A stale route manifest must never continue serving removed routes indefinitely.

---

# 123. Config Changes

Changes to `ranu.config.*` may require a dev server restart.

Ranu.js should detect the change and restart automatically where practical or clearly request restart.

---

# 124. Environment File Changes

Changes to environment files may require:

- client rebuild;
- server module invalidation;
- dev restart.

Ranu.js should avoid pretending runtime-private env changes have updated modules when they have not.

---

# 125. Development Source Maps

Development source maps should prioritize useful debugging.

They may be inline or served through dev tooling.

They are not production artifacts.

---

# 126. Development Error Overlay

The browser dev runtime may display compilation/runtime errors.

It must never ship in production.

The overlay should include Ranu.js diagnostics and source context.

---

# 127. Development Client Boundary Validation

Client/server import boundary violations must be detected during development as early as possible.

Developers should not need to wait for `Ranu.js build` to discover obvious violations.

---

# 128. Build Cache

Ranu.js may maintain a local cache under:

```text
.ranu/cache/
```

for:

- transformed modules;
- dependency metadata;
- route analysis;
- type information;
- bundle intermediates.

Cache contents are disposable.

Deleting the cache must never break the project permanently.

---

# 129. Cache Keys

Cache validity must consider relevant inputs such as:

```text
source content
Ranu.js version
compiler/bundler version
config
environment values that affect build output
dependency lockfile/package graph
target
```

Incomplete cache keys can produce dangerous stale builds and are unacceptable.

---

# 130. Incremental Production Builds

Incremental build caching is desirable but not required for first functional V1.

A clean build must always remain supported.

Cached and clean builds must produce equivalent functional artifacts.

---

# 131. Remote Build Cache

Remote/distributed build caching is deferred.

The architecture should permit future content-addressed cache storage without changing application semantics.

---

# 132. Lockfile Awareness

Build diagnostics/cache invalidation should account for the active package manager lockfile.

Supported ecosystems may include:

```text
npm
pnpm
yarn
```

The framework should not require a custom package manager.

---

# 133. Package Manager

ranu CLI should work when installed/run through ordinary Node package-manager workflows.

Examples:

```text
npm
pnpm
yarn
```

Exact project scaffolding behavior belongs to CLI specification.

---

# 134. Build Reproducibility

Ranu.js should avoid embedding unstable timestamps into content-hashed browser assets unless necessary.

Build IDs may differ while application chunks remain content-identical.

Reproducibility must not require suppressing legitimate environment-dependent application output.

---

# 135. File Ordering

Filesystem discovery results must be sorted/normalized before deterministic manifest generation.

Build output must not depend on OS directory enumeration order.

---

# 136. Path Normalization

Internal source/build paths must normalize cross-platform separators.

Windows and POSIX development environments should generate equivalent route identities.

Browser URLs always use `/`.

---

# 137. Case Sensitivity

The build should detect route/source naming conflicts that behave differently on case-sensitive vs case-insensitive filesystems where practical.

Example:

```text
Users/
users/
```

Ambiguous cross-platform route output should be rejected or warned clearly.

---

# 138. Symlinks

Symlink handling must be explicit.

Ranu.js should resolve real paths for security/boundary checks while preserving package-manager workspace compatibility.

Symlinks must not allow public asset traversal outside permitted roots.

---

# 139. Monorepos

Basic monorepo/workspace dependency usage should be possible in V1.

The build may import packages from workspace dependencies.

Advanced monorepo orchestration is not the responsibility of the Ranu.js build system.

---

# 140. Transpiling Workspace Packages

If workspace packages publish TypeScript/uncompiled modern source, Ranu.js may transpile them when configured or detected safely.

The behavior must not cause the build to recursively treat all `node_modules` as application source.

---

# 141. External Packages in Client Graph

A package imported by client code must be browser-compatible.

The build system should surface failures involving Node built-ins or incompatible package exports with the importing client chain.

---

# 142. External Packages in Server Graph

Server dependencies may use Node APIs.

They remain subject to runtime target compatibility.

The build should not browser-polyfill them.

---

# 143. Tree-Shaken Secrets

Security must not rely solely on tree shaking.

A private environment reference in unreachable client code should ideally be removed, but Ranu.js boundary policy must still prevent intentional client access to private values.

---

# 144. Build-Time Code Execution

Ranu.js build may execute application code for:

```text
config
generateStaticParams
static page rendering
static metadata generation
```

This is trusted application code.

Build environments must treat projects as executable code.

---

# 145. Build Sandbox

Ranu.js V1 does not promise sandboxed execution of application build code.

This must be documented for CI/security expectations.

---

# 146. Static Generation Side Effects

Because static generation executes application code, developers should avoid destructive side effects in rendering/generation functions.

Ranu.js may execute static paths concurrently.

Build functions must not assume serial execution unless documented.

---

# 147. Build Network Access

Ranu.js does not prohibit network access during static generation.

CI/deployment environments may restrict it.

Network failure should surface with route/build context.

---

# 148. Build Logging

Production build output should provide a concise stage summary.

Example:

```text
Ranu.js 1.x

✓ Config
✓ Routes: 24
✓ Server graph
✓ Client graph
✓ Types
✓ Static pages: 18
✓ Manifests
✓ Production artifact

Build completed in 8.4s
```

Verbose mode may show more detail.

---

# 149. Route Build Summary

The build may summarize route modes:

```text
○ static
λ server
● client
ƒ api
```

Symbols are optional.

The textual meaning must remain clear and accessible.

---

# 150. Build Warnings

Warnings do not fail the build unless configured.

Examples:

- very large client chunk;
- unused public asset collision risk;
- public source maps enabled;
- static generation unusually slow;
- dynamic import prevents optimal splitting.

Security/correctness violations must be errors, not warnings.

---

# 151. Build Errors

Build errors include:

```text
route collision
invalid route export
client/server boundary violation
private env exposure
static route without params generator
static generation failure
type-check failure
manifest integrity failure
reserved path conflict
unresolved required module
invalid config
```

---

# 152. Diagnostic Structure

Conceptual:

```ts
interface RanuDiagnostic {
  code: string;
  severity: "error" | "warning";
  message: string;
  file?: string;
  line?: number;
  column?: number;
  routeId?: string;
  hint?: string;
  importChain?: string[];
}
```

Diagnostics should be renderable in terminal, IDE, and future machine-readable formats.

---

# 153. Build Diagnostic Codes

Required conceptual categories include:

```text
RANU_BUILD_ROUTE_COMPILE
RANU_BUILD_CLIENT_SERVER_BOUNDARY
RANU_BUILD_SERVER_ONLY_CLIENT
RANU_BUILD_NODE_BUILTIN_CLIENT
RANU_BUILD_PRIVATE_ENV_CLIENT
RANU_BUILD_INVALID_RENDER_MODE
RANU_BUILD_STATIC_PARAMS_REQUIRED
RANU_BUILD_STATIC_PARAMS_INVALID
RANU_BUILD_STATIC_DUPLICATE_PATH
RANU_BUILD_STATIC_RENDER_FAILED
RANU_BUILD_TYPECHECK_FAILED
RANU_BUILD_ASSET_COLLISION
RANU_BUILD_RESERVED_PATH
RANU_BUILD_MANIFEST_INVALID
RANU_BUILD_MODULE_RESOLUTION
RANU_BUILD_UNSUPPORTED_DYNAMIC_IMPORT
RANU_BUILD_CONFIG_INVALID
```

Exact stable codes may be refined before release.

---

# 154. Import Chain Diagnostics

Boundary and resolution errors should show the shortest useful import chain.

Example:

```text
app/dashboard/Counter.tsx
→ lib/user.ts
→ server/db.ts
```

This is significantly more actionable than reporting only `server/db.ts`.

---

# 155. Static Generation Diagnostic

Example:

```text
RANU_BUILD_STATIC_RENDER_FAILED

Failed to generate static route:
  /docs/routing

Route:
  app/docs/[slug]/page.tsx

Cause:
  Documentation source "routing" was not found.

Static routes must render successfully during Ranu.js build.
```

---

# 156. Client Chunk Size Warning

The build may warn when an entry/chunk exceeds a configurable threshold.

The warning should identify major contributors where bundler metadata permits.

It must not automatically change route rendering mode.

---

# 157. Build Analyzer

A bundle analyzer is useful but deferred from core functionality.

The manifest/build architecture should expose enough metadata to implement one later.

---

# 158. Manifest Integrity Validation

Before declaring build success, Ranu.js must validate:

- all route entries exist;
- all referenced chunks exist;
- all static files exist;
- build IDs agree;
- manifest schema versions are valid;
- client asset references are valid;
- no server-only asset is referenced publicly;
- production entry exists.

---

# 159. Atomic Build Completion

A failed build must not leave a partially written artifact that `Ranu.js start` mistakes for a valid new build.

Ranu.js should write to a temporary/versioned directory and mark/promote only after validation.

---

# 160. Build Success Marker

A production artifact may include a final marker/manifest indicating successful completion.

`Ranu.js start` must refuse incomplete artifacts.

---

# 161. Production Entry

The build generates a Node production entry.

Conceptually:

```text
.ranu/build/server/entry.mjs
```

It initializes:

```text
runtime config
route matcher
server manifest
static manifest
React renderer
middleware
Node runtime adapter
```

---

# 162. `Ranu.js start`

`Ranu.js start` runs a previously successful production build.

It must not:

- compile TypeScript;
- perform static generation;
- discover source routes;
- run type checking;
- rebuild browser bundles.

If build output is missing, it fails and instructs the user to run:

```bash
Ranu.js build
```

---

# 163. Start-Time Environment

Private server runtime environment values are read when the production process starts/executes.

Public browser environment values remain those embedded at build time.

This distinction must be documented clearly.

---

# 164. Start Artifact Compatibility

`Ranu.js start` validates:

```text
manifest schema
framework/runtime compatibility
build completion
required files
```

before listening for traffic.

---

# 165. Deployment Artifact

The production output must be deployable to a generic Node environment.

Minimum deployment inputs:

```text
Ranu.js build output
required external production dependencies if any
Node.js supported runtime
runtime environment variables
public/static assets
```

No Vercel-specific files are required for core operation.

---

# 166. Deployment Adapter Boundary

A deployment adapter may transform generic Ranu.js build output into:

```text
serverless functions
provider routing config
CDN asset mappings
container image layout
```

It must consume Ranu.js manifests rather than rediscover application routes.

---

# 167. Build Plugins

A general public plugin system is not required for the first stable build.

The internal build architecture should expose controlled extension points so future plugins do not require rewriting the compiler.

---

# 168. Plugin Safety

When a public plugin API is introduced, plugins execute trusted build code and may access project files.

This must be explicit.

Plugins must not be allowed to silently violate server/client safety contracts without opting into documented low-level behavior.

---

# 169. Custom Bundler Config

Ranu.js V1 should not expose the entire underlying bundler configuration object as the primary framework config API.

Doing so would couple applications to implementation details.

Ranu.js may expose narrowly scoped build options.

---

# 170. Aliases

Ranu.js may support import aliases through TypeScript paths or Ranu.js config.

Example:

```text
@/components/Button
```

Alias resolution must work consistently in server/client/type-checking pipelines.

---

# 171. `tsconfig` Paths

Where practical, Ranu.js should honor `compilerOptions.paths` and `baseUrl` consistently.

Differences between TypeScript resolution and bundler resolution must be detected/tested.

---

# 172. Package Aliasing

Low-level package aliasing may be supported later.

It must not permit accidental replacement of framework internal virtual modules without explicit extension APIs.

---

# 173. Virtual Modules

Ranu.js may use internal virtual modules for:

```text
route manifest access
client references
build metadata
environment exposure
runtime bootstrap
```

Virtual module identifiers are internal unless explicitly documented.

Applications must not depend on undocumented virtual IDs.

---

# 174. Generated Files

Generated code/manifests must be clearly separated from application source.

Developers should never need to manually edit:

```text
.ranu/
```

Changes there are disposable.

---

# 175. Build Cleanup Security

Build cleanup must only remove Ranu.js-owned paths.

A bug/configuration error must not recursively delete arbitrary project directories.

The output directory must be validated before destructive cleanup.

---

# 176. Public File Copy Security

If public files are copied into build output, symlink/path handling must prevent copying unintended secret files outside the public root.

---

# 177. Secret File Exclusion

The build must never automatically copy project files such as:

```text
.env*
.git/
private keys
server source
database files
```

into browser/public output merely because they exist in the repository.

Only explicit public/imported browser assets are published.

---

# 178. Browser Manifest Security

Browser-accessible metadata must not contain:

- private environment values;
- server-only absolute paths;
- server module filenames if avoidable;
- database URLs;
- source-map paths to private server code;
- provider credentials.

---

# 179. Build Artifact Security Audit

Before stable V1, automated tests should scan production public output for known seeded secrets.

Example test fixture:

```text
DATABASE_URL=RANU_TEST_SECRET_...
```

The secret must not appear in:

```text
client JS
CSS
HTML unless application explicitly renders it
browser manifests
public source maps
```

---

# 180. Static HTML Secret Caveat

Server/static application code can intentionally render a secret into HTML.

No build system can safely infer all semantic leaks.

Ranu.js guarantees boundary/env defaults, not protection against application code explicitly returning secret values.

Documentation must make this distinction clear.

---

# 181. Dependency Vulnerabilities

Ranu.js build does not replace package-manager security auditing.

Framework releases should maintain their own dependency hygiene.

Applications remain responsible for dependency review.

---

# 182. Build Telemetry

Ranu.js should not require network telemetry for builds to succeed.

If anonymous telemetry is ever added, it must follow a separately documented privacy/opt-out policy.

Core V1 can operate entirely without telemetry.

---

# 183. Offline Build

An Ranu.js application whose own build logic/dependencies require no network should be buildable without Ranu.js contacting external services.

Package installation itself is outside this guarantee.

Static application code may independently use network requests.

---

# 184. Build Test Layers

Required:

```text
config tests
route/build integration tests
compiler directive tests
graph-boundary tests
server bundle tests
client bundle tests
environment tests
CSS tests
asset tests
SSG tests
manifest tests
development/HMR tests
production start tests
cross-platform tests
security artifact tests
```

---

# 185. Compiler Test Matrix

At minimum:

- `.ts`;
- `.tsx`;
- `.js`;
- `.jsx`;
- JSX transform;
- TypeScript syntax;
- `"use client"` valid directive;
- fake later `"use client"` string;
- `Ranu.js/server-only`;
- route exports;
- metadata exports;
- generateStaticParams detection;
- source maps.

---

# 186. Boundary Test Matrix

At minimum:

- server page → client component;
- client → shared utility;
- client → server-only direct;
- client → shared → server-only indirect;
- client → `server/`;
- client → Node built-in;
- server → Node built-in;
- shared server/client safe module;
- private env in client;
- public env in client;
- private env in server.

---

# 187. Environment Test Matrix

At minimum:

- generic `.env`;
- development env;
- production env;
- local override;
- `RANU_PUBLIC_*` client replacement;
- private server runtime env;
- static generation env;
- dynamic `process.env[name]` in client;
- no full `process.env` client injection;
- secret scan of public build.

---

# 188. Client Build Test Matrix

At minimum:

- client route;
- client boundary in SSR route;
- client boundary in static route;
- shared chunks;
- dynamic import;
- CSS;
- CSS Module;
- imported image;
- hashed asset;
- source map modes;
- tree shaking;
- minification;
- browser package conditions.

---

# 189. Server Build Test Matrix

At minimum:

- SSR route;
- API route;
- middleware;
- async page;
- server-only module;
- Node built-in;
- CommonJS dependency;
- ESM dependency;
- dynamic import;
- external dependency;
- native addon fixture if supported;
- source maps;
- production entry.

---

# 190. Static Generation Test Matrix

At minimum:

- literal static page;
- dynamic static params;
- catch-all params;
- optional catch-all params;
- duplicate generated path;
- missing generator;
- invalid param shape;
- request-only API failure;
- metadata generation;
- not-found;
- client boundary;
- concurrent generation;
- build failure cleanup.

---

# 191. Manifest Test Matrix

At minimum:

- route manifest valid;
- server manifest valid;
- client manifest valid;
- static manifest valid;
- shared build ID;
- missing referenced file detected;
- incompatible version rejected;
- no absolute path in public manifest;
- no server-only public reference;
- deterministic ordering.

---

# 192. Development Test Matrix

At minimum:

- dev startup;
- page edit;
- client component Fast Refresh;
- server page edit;
- API route edit;
- add route;
- remove route;
- rename route;
- middleware edit;
- config edit handling;
- env edit handling;
- route collision;
- boundary violation;
- full reload fallback.

---

# 193. Cross-Platform Test Matrix

CI should cover at least:

```text
Linux
Windows
```

and preferably macOS where resources permit.

Tests must include:

- path separators;
- route discovery;
- case behavior;
- symlinks/workspaces;
- output paths;
- Node execution.

---

# 194. Build Performance Measurements

Before stable V1, measure:

- cold dev startup;
- warm dev startup;
- client edit HMR latency;
- server edit reload latency;
- cold production build;
- cached production build if supported;
- static generation throughput;
- peak build memory;
- output sizes.

Targets should be established from real reference applications.

---

# 195. Reference Applications

The build system should be validated against at least:

```text
minimal app
SSR application
static documentation/blog app
client-heavy dashboard
full-stack API + page app
dynamic routing app
```

One synthetic test project is not sufficient.

---

# 196. Build Acceptance Criteria

Ranu.js V1 build system is complete when:

1. `Ranu.js build` loads and validates Ranu.js config.
2. TypeScript/JavaScript route source compiles.
3. TSX/JSX React source compiles.
4. routing is compiled once into production metadata.
5. page/API route IDs are deterministic.
6. `"use client"` boundaries are detected.
7. client dependency propagation works.
8. `Ranu.js/server-only` is enforced.
9. `server/` is enforced as server-only.
10. indirect client→server violations fail.
11. Node built-ins are rejected from browser graphs.
12. private environment values are not exposed to client builds.
13. `RANU_PUBLIC_*` values can be used by client code.
14. private server environment values can remain runtime-resolved.
15. server and client graphs build separately.
16. SSR server entries are generated.
17. API server entries are generated.
18. middleware server entry is generated.
19. client-rendered route entries are generated.
20. client components in SSR/SSG routes generate browser assets.
21. global CSS works.
22. CSS Modules work.
23. imported static assets work.
24. browser assets use production-safe URLs.
25. browser assets support content hashing.
26. route-level asset associations are generated.
27. static literal routes generate HTML.
28. dynamic static routes use `generateStaticParams`.
29. invalid/duplicate static params fail.
30. static request-only API usage fails.
31. static output is recorded in a static manifest.
32. route manifest is generated.
33. server manifest is generated.
34. client manifest is generated.
35. all manifests contain compatible schema/build IDs.
36. manifest integrity is validated before build success.
37. production entry is generated.
38. `Ranu.js start` can run the artifact without source scanning.
39. `Ranu.js start` does not rebuild the application.
40. development route changes update without manual rebuild where practical.
41. client HMR/Fast Refresh works.
42. unsafe HMR falls back safely.
43. source map modes work.
44. server source maps are not publicly exposed by default.
45. build output does not publish seeded private secrets.
46. `/_ranu/` namespace collisions are rejected.
47. public path collisions follow routing rules.
48. failed builds cannot be mistaken for valid completed builds.
49. build works on Linux and Windows.
50. required build/security test matrices pass.

---

# 197. Locked V1 Build Decisions

The following are locked by this specification:

1. Ranu.js uses an established bundler/compiler toolchain rather than building a bundler from scratch.
2. The underlying bundler is an implementation detail behind Ranu.js adapters.
3. Ranu.js V1 is TypeScript-first but supports JavaScript.
4. TypeScript transpilation and type checking are separate responsibilities.
5. Production build type checking is enabled by default.
6. React JSX/TSX works without requiring user Babel configuration.
7. `.ranu/` is framework-owned generated state.
8. production output is under `.ranu/build/`.
9. production runtime does not scan source routes.
10. route compilation produces manifests consumed by runtime.
11. server and client graphs are distinct.
12. `"use client"` creates client boundaries.
13. client reachability propagates through imports.
14. `Ranu.js/server-only` prevents client inclusion.
15. project `server/` modules are server-only.
16. Node built-ins are not automatically polyfilled for browsers.
17. server modules may use Node APIs.
18. ESM is the primary Ranu.js output model.
19. server/client package resolution uses environment-appropriate conditions.
20. private environment variables are default.
21. `RANU_PUBLIC_` is the V1 public environment prefix.
22. public environment values may be embedded in browser output.
23. private server env may remain runtime-resolved.
24. Ranu.js never injects the entire `process.env` into browser code.
25. page render mode is recorded explicitly in build metadata.
26. static generation happens during `Ranu.js build`.
27. dynamic static routes require `generateStaticParams`.
28. static generation concurrency is bounded.
29. static URL mapping is manifest-driven.
30. static output filenames do not define URL semantics.
31. client build includes only browser-reachable framework/application code.
32. production browser assets use content hashing where appropriate.
33. code splitting is required.
34. tree shaking is enabled for production where safe.
35. browser JS is minified by default.
36. core V1 CSS supports global CSS and CSS Modules.
37. production CSS should be extracted where practical.
38. `public/` assets are not treated as source modules.
39. `/_ranu/` is reserved and cannot be overridden.
40. source maps are configurable.
41. server source maps are private by default.
42. `Ranu.js dev` uses incremental/on-demand development compilation.
43. client HMR/Fast Refresh is required.
44. unsafe HMR may fall back to full reload.
45. local build cache is disposable.
46. clean production builds always remain supported.
47. remote build cache is not required in V1.
48. build manifests are schema-versioned.
49. every production build has a build ID.
50. build completion is validated before artifact activation.
51. `Ranu.js start` runs an existing artifact and never performs a production build.
52. production artifact supports generic Node deployment.
53. provider deployment adapters consume Ranu.js manifests.
54. Ranu.js does not expose raw underlying bundler config as its main public build API.
55. build-time application code is trusted and not sandboxed.
56. Ranu.js build itself does not require external telemetry/network services.
57. browser/public output must not contain server-only absolute paths or private manifest data.
58. public secret-leak regression tests are required.
59. Linux and Windows build behavior must be validated.
60. build correctness and boundary safety take priority over aggressive optimization.

---

# 198. Deferred Build Features

The following are deferred unless later specifications explicitly add them:

- custom Ranu.js bundler written from scratch;
- alternative first-party bundlers exposed to users;
- public low-level bundler configuration passthrough;
- SWC/Babel plugin compatibility guarantees;
- remote build cache;
- distributed build execution;
- Rust compiler rewrite;
- advanced partial prerendering;
- ISR/revalidation build infrastructure;
- React Flight/RSC transport bundling as a public requirement;
- server actions compiler;
- built-in image optimization pipeline;
- built-in font optimization service;
- Sass/Less as mandatory dependencies;
- Web Worker framework abstraction;
- WASM module framework abstraction;
- bundle analyzer UI;
- dependency license scanner;
- deployment-provider-specific build output in core;
- Edge runtime bundles;
- Bun runtime bundles;
- Deno runtime bundles;
- native mobile targets;
- browser legacy/IE compatibility;
- automatic monorepo task orchestration.

These must not block a reliable V1.

---

# 199. Relationship to Framework Architecture

`02_FRAMEWORK_ARCHITECTURE.md` defines the high-level subsystem boundaries.

This build system must preserve those boundaries.

In particular:

```text
router defines route semantics
renderer defines page rendering semantics
server runtime defines HTTP semantics
build system compiles/packages them
```

The build system must not become a second router or second runtime.

---

# 200. Relationship to Routing

`03_ROUTING_SPECIFICATION.md` owns:

```text
filesystem conventions
URL generation
dynamic params
route groups
layouts
route collisions
route precedence
```

The build system:

```text
discovers source
invokes route compiler
validates results
writes route manifest
builds route entries
```

It must not change public URLs as a chunking optimization.

---

# 201. Relationship to Rendering

`04_RENDERING_MODEL.md` owns:

```text
static/server/client modes
React composition
client boundaries
hydration
metadata
static params semantics
```

The build system implements the required graph and artifact support.

It must not silently change rendering mode based on optimization heuristics.

---

# 202. Relationship to Server Runtime

`05_SERVER_RUNTIME_SPEC.md` owns:

```text
HTTP pipeline
middleware execution
API dispatch
static serving
streaming
cookies/headers
production startup semantics
```

The build system produces the manifests and executable entries required by that runtime.

---

# 203. Build/Renderer Integration Contract

The build system must provide the React renderer with:

```text
server route entry
ordered component references
client boundary references
route assets
CSS assets
build ID
render mode
```

The renderer must not inspect bundler internals directly.

---

# 204. Build/Runtime Integration Contract

The production runtime must receive:

```text
normalized runtime config
route manifest
server manifest
static manifest
client/asset metadata
build ID
production server entry
```

All references must resolve inside the production artifact or declared external runtime dependencies.

---

# 205. Build Manifest Conceptual Schema

A shared top-level build descriptor may conceptually contain:

```json
{
  "schemaVersion": 1,
  "buildId": "01J...",
  "frameworkVersion": "1.x",
  "runtime": "node",
  "manifests": {
    "routes": "./manifest/routes.json",
    "server": "./manifest/server.json",
    "client": "./manifest/client.json",
    "static": "./manifest/static.json"
  }
}
```

The exact schema must be versioned before implementation.

---

# 206. Route Record Concept

Conceptual page record:

```json
{
  "id": "page:/products/[id]",
  "kind": "page",
  "pattern": "/products/[id]",
  "render": "server",
  "serverEntry": "route-entry-id",
  "assets": "route-assets-id"
}
```

Conceptual API record:

```json
{
  "id": "api:/api/users",
  "kind": "api",
  "pattern": "/api/users",
  "serverEntry": "api-entry-id",
  "methods": ["GET", "POST"]
}
```

---

# 207. Static Record Concept

Conceptual:

```json
{
  "pathname": "/docs/routing",
  "routeId": "page:/docs/[slug]",
  "file": "./static/pages/p_123.html",
  "status": 200,
  "assets": "route-assets-id"
}
```

The runtime uses the pathname mapping directly.

---

# 208. Client Entry Concept

Conceptual:

```json
{
  "id": "c_123",
  "js": [
    "/_ranu/assets/c_123.abc.js"
  ],
  "css": [
    "/_ranu/assets/c_123.def.css"
  ]
}
```

The browser does not need source filesystem names.

---

# 209. Production Build Security Boundary

The most important build-time security boundary is:

```text
SERVER WORLD
─────────────
private env
database clients
filesystem
Node built-ins
server modules
API implementation
middleware implementation

          X

BROWSER WORLD
─────────────
RANU_PUBLIC_* values
client components
client-safe shared modules
browser runtime
public assets
CSS
```

The build system is responsible for enforcing this boundary structurally.

---

# 210. Build Security Failure Policy

If Ranu.js cannot prove that an import required by a client graph is browser-safe because it is explicitly server-only, the build must fail.

It must not:

- stub the module;
- replace secrets with empty strings and continue;
- move execution to the browser unexpectedly;
- expose server implementation metadata.

---

# 211. Development/Production Parity

Development may use a different bundling strategy internally, but these semantics must match production:

```text
route identity
render mode
client/server boundaries
public/private env rules
CSS module semantics
reserved paths
API exports
middleware behavior
```

A development-only success that predictably fails production is a framework defect where avoidable.

---

# 212. Optimization Boundary

Ranu.js may optimize:

```text
chunk layout
minification
preloading
shared dependencies
asset inlining
module caching
```

It must not optimize by silently changing:

```text
SSR ↔ SSG
server ↔ client
route URL
HTTP method behavior
server-only boundaries
environment privacy
```

---

# 213. Build Evolution Rule

Future compiler/bundler changes must preserve the documented Ranu.js application contract.

A project should not need to rewrite its application merely because Ranu.js replaces its internal bundler.

Where behavior necessarily changes, it requires a framework migration/versioning decision.

---

# 214. Required Next Specification

The next document in the Ranu.js V1 specification sequence is:

```text
07_PLUGIN_SYSTEM.md
```

It defines the controlled framework extension model, plugin lifecycle, hook ordering, build/dev integration, compatibility, and safety boundaries.

Data fetching and caching remain intentionally minimal in V1 and do not require a separate blocking specification before core implementation.
---

# 215. Final Build Baseline

Ranu.js V1 uses an established JavaScript build toolchain behind Ranu.js-owned compiler and bundler adapters.

The public framework does not depend on the underlying bundler's configuration model.

The build system compiles TypeScript/JavaScript, JSX/TSX, routes, React client boundaries, server code, CSS, and static assets into separate server and browser graphs.

`"use client"` defines browser boundaries.

`Ranu.js/server-only` and the project `server/` convention protect server code from client inclusion.

Node built-ins are not automatically polyfilled into browser bundles.

Environment variables are private by default.

Only values explicitly prefixed:

```text
RANU_PUBLIC_
```

may become browser-visible framework environment values.

Static generation runs during:

```bash
Ranu.js build
```

and uses the rendering model exactly as declared by each route.

The build does not silently convert static routes to server rendering or server routes to static output.

Production output is manifest-driven and stored under:

```text
.ranu/build/
```

with versioned route, server, client, and static metadata plus a build ID and production Node entry.

Browser assets use the reserved:

```text
/_ranu/
```

namespace and content hashing where appropriate.

Global CSS and CSS Modules are core V1 features.

Development uses incremental/on-demand compilation with client HMR/Fast Refresh and safe full-reload fallback.

Production `Ranu.js start` executes an already completed artifact and performs no source discovery, static generation, type checking, or rebuilding.

Build output is validated atomically before it becomes runnable.

Server source information and private environment values remain outside public output by default.

The generic production artifact targets the Ranu.js Node runtime and remains independent of deployment-provider SDKs.

This specification is the authoritative Ranu.js V1 compilation, bundling, static-generation, and production-artifact contract.

---

**End of 06_BUILD_SYSTEM.md**
