# 02_FRAMEWORK_ARCHITECTURE.md

**Project:** Ranu.js — JavaScript/TypeScript Full-Stack Web Framework  
**Document Type:** Framework Architecture Specification  
**Status:** Development Baseline  
**Date:** 2026-08-10  
**Depends On:** `00_FRAMEWORK_VISION.md`, `01_PRODUCT_REQUIREMENTS.md`  
**Primary V1 Renderer:** React  
**Primary V1 Runtime:** Node.js  
**Architecture Style:** Modular monorepo, adapter-driven, manifest-driven production runtime

---

# 1. Purpose

This document defines the authoritative high-level architecture for Ranu.js V1.

It establishes:

- subsystem ownership;
- dependency direction;
- package boundaries;
- runtime/build separation;
- router/render/server contracts;
- client/server graph boundaries;
- plugin boundaries;
- deployment adapter boundaries;
- manifest responsibilities;
- development and production lifecycles;
- security boundaries;
- public API boundaries;
- implementation guardrails.

Detailed behavior is defined by the later subsystem specifications. This document prevents those specifications from evolving into conflicting architectures.

---

# 2. Architectural Goal

Ranu.js is a full-stack JavaScript/TypeScript framework that provides a cohesive developer experience while keeping major systems independently understandable.

The architecture must support:

```text
Application Source
      ↓
Configuration
      ↓
Route Compilation
      ↓
Server / Client Graph Analysis
      ↓
Development Runtime
or
Production Build
      ↓
Manifests + Runtime Entries + Static Assets
      ↓
Deployment Adapter
      ↓
Target Runtime
```

Ranu.js must not become a monolithic implementation in which routing, React, Node.js, build tooling, and hosting-provider behavior are inseparable.

---

# 3. Architectural Principles

## ARC-P01 — Explicit Ownership

Every framework behavior must have one authoritative subsystem owner.

## ARC-P02 — One-Way Dependencies

Lower-level core packages must not import higher-level adapters.

## ARC-P03 — React-First, Core-Neutral

React is the official V1 renderer, but routing, configuration, diagnostics, manifests, and core runtime contracts must not require React.

## ARC-P04 — Node-First, Runtime-Abstracted

Node.js is the V1 production runtime. HTTP semantics should still use Web-standard `Request`, `Response`, `URL`, `Headers`, and streams where practical.

## ARC-P05 — Manifest-Driven Production

Production request handling must consume compiled manifests and runtime entries. It must not rescan the source application tree.

## ARC-P06 — Explicit Server/Client Boundary

Browser-reachable code and server-only code must be separated structurally during build.

## ARC-P07 — Provider-Neutral Core

Vercel, Cloudflare, AWS, or other provider SDKs must not become dependencies of core application semantics.

## ARC-P08 — Controlled Extensibility

Plugins extend defined lifecycle surfaces. Adapters implement architectural boundaries.

## ARC-P09 — No Duplicate Interpretation

Routing, render mode, config, and deployment capability semantics must each be interpreted once by their owning subsystem.

## ARC-P10 — Open-Source Maintainability

Public packages, public APIs, diagnostics, manifests, and extension contracts must be designed for external users and contributors, not only internal project use.

---

# 4. Top-Level Architecture

```text
┌─────────────────────────────────────────────────────────┐
│                    Ranu.js Application                      │
│ app/  server/  public/  ranu.config.ts                  │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                    Ranu.js Configuration                    │
│ defaults + env + plugins + CLI overrides               │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                      Ranu.js Router                         │
│ filesystem discovery → route tree → route manifest     │
└──────────────────────────┬──────────────────────────────┘
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
┌───────────────────────┐    ┌───────────────────────────┐
│   Build / Compiler    │    │    Development System     │
│ client/server graphs  │    │ watch + HMR + dev server  │
└───────────┬───────────┘    └─────────────┬─────────────┘
            │                              │
      ┌─────┴───────────┐                  │
      ▼                 ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌───────────────────┐
│ Server Build │  │ Client Build │  │ Dev Runtime       │
└──────┬───────┘  └──────┬───────┘  └───────────────────┘
       │                 │
       ▼                 ▼
┌──────────────┐  ┌──────────────┐
│ Node Runtime │  │ Browser      │
│ + React SSR  │  │ Hydration    │
└──────┬───────┘  └──────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│               Deployment Adapter Layer                  │
│ Node / Container / Vercel / future targets             │
└─────────────────────────────────────────────────────────┘
```

---

# 5. Authoritative Subsystem Ownership

| Concern | Authoritative subsystem |
|---|---|
| Product behavior | Product requirements |
| High-level boundaries | Framework architecture |
| URL/file route semantics | Router |
| Page/layout rendering | Renderer |
| HTTP lifecycle | Server runtime |
| Module graph and artifacts | Build system |
| Dev watch/HMR orchestration | Development/build system |
| Framework extension hooks | Plugin system |
| Target deployment mapping | Deployment adapters |
| CLI command behavior | CLI |
| Framework config resolution | Configuration system |
| Public exports/API stability | Public API specification |
| Release implementation order | Development plan |

No later subsystem should silently take ownership of another subsystem's semantics.

---

# 6. Recommended Monorepo Architecture

The Ranu.js source repository should use a workspace/monorepo.

Recommended baseline:

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
└── .github/
```

Exact package names are finalized by the public API/package specification, but responsibilities must remain separated.

---

# 7. Main Public Package

The main public package is:

```text
Ranu.js
```

It provides the normal developer-facing entry point.

Potential supported subpath exports include:

```text
Ranu.js
Ranu.js/react
Ranu.js/server
Ranu.js/plugin
Ranu.js/config
```

Internal implementation packages must not automatically become stable public API simply because the repository is open source.

---

# 8. Internal vs Public Packages

Open-source visibility does not equal API stability.

Every package/export must be classified as one of:

```text
public stable
public experimental
internal
```

Internal packages may change without application compatibility guarantees.

The public API specification must lock this classification before stable release.

---

# 9. Core Package

`core` owns framework-neutral foundational types and lifecycle contracts.

It may define:

- project identity;
- command/mode types;
- shared context types;
- framework version contracts;
- internal lifecycle abstractions.

It must not depend on React, Vercel, or application-specific services.

---

# 10. Diagnostics Package

`diagnostics` owns:

- structured diagnostic shape;
- error codes;
- source locations;
- import-chain rendering;
- terminal formatting inputs;
- machine-readable diagnostic representation.

Other packages emit diagnostics through this contract instead of inventing incompatible error formats.

---

# 11. Manifest Package

`manifests` owns schemas and validation for:

```text
route manifest
server manifest
client manifest
static manifest
deployment/build descriptor
```

Manifest schemas are versioned.

The production runtime and deployment adapters depend on these contracts.

---

# 12. Configuration Package

`config` owns:

- project config discovery;
- `defineConfig()`;
- environment-aware resolution;
- schema validation;
- plugin registration normalization;
- adapter selection normalization;
- immutable resolved configuration.

It does not execute route matching, rendering, or provider deployment.

---

# 13. Router Package

`router` owns:

- `app/` filesystem interpretation;
- route segment parsing;
- dynamic/catch-all segments;
- groups;
- layout/boundary ancestry metadata;
- collision detection;
- precedence;
- route IDs;
- route matching structure.

It must not import React to decide which URL matches.

---

# 14. Renderer Adapter Boundary

The renderer contract receives compiled route composition and render context.

Conceptually:

```ts
interface Renderer {
  render(request: RenderRequest): Promise<RenderResult>;
}
```

The official V1 implementation is React.

The router and HTTP runtime interact with the renderer through Ranu.js contracts, not React internals.

---

# 15. React Package

`react` owns:

- page/layout React execution;
- SSR;
- static rendering;
- hydration;
- client bootstrap;
- Ranu.js `Link`;
- client router hooks;
- React error/loading integration;
- metadata rendering.

It consumes route/build metadata instead of discovering routes independently.

---

# 16. Server Runtime Boundary

The server runtime owns the HTTP request lifecycle:

```text
Request
→ normalization
→ middleware
→ route/static match
→ endpoint dispatch
→ response finalization
```

It delegates page body rendering to the renderer.

API routes do not pass through React rendering.

---

# 17. Runtime-Neutral HTTP Contract

Application-facing server APIs should use Web standards where possible:

```text
Request
Response
URL
Headers
FormData
ReadableStream
AbortSignal
```

This reduces coupling to Node's native HTTP object shapes.

---

# 18. Node Runtime Adapter

`runtime-node` owns:

```text
IncomingMessage → Web Request
Web Response → ServerResponse
Node socket/listen lifecycle
Node streaming bridge
Node abort/disconnect bridge
graceful shutdown integration
```

It is the V1 reference runtime adapter.

---

# 19. Server Helper Package

`server` exposes application-facing server utilities such as:

```text
cookies()
headers()
redirect()
notFound()
request context helpers
```

These helpers must operate through Ranu.js runtime context rather than direct global Node response mutation.

---

# 20. Build System

The build system owns:

- source transforms;
- TypeScript/JSX processing;
- server/client graph classification;
- bundler integration;
- client-boundary analysis;
- server-only enforcement;
- CSS/assets;
- code splitting;
- static generation orchestration;
- manifests;
- production entries.

It consumes route and rendering contracts.

It does not redefine them.

---

# 21. Underlying Bundler

Ranu.js V1 should leverage an established build toolchain.

The exact bundler is an implementation detail behind an Ranu.js-owned adapter.

The architecture permits Vite-based implementation, but public Ranu.js behavior must not simply equal raw Vite behavior.

---

# 22. Development System

The development subsystem owns:

```text
file watching
incremental transform/build
route graph refresh
client HMR
React Fast Refresh
server module invalidation
config-triggered restart
dev diagnostics channel
```

Development may optimize aggressively, but it must preserve production semantics.

---

# 23. Client/Server Graph Boundary

The build graph has explicit domains:

```text
SERVER GRAPH
  private env
  Node APIs
  database clients
  server-only modules
  API implementations

CLIENT GRAPH
  browser runtime
  "use client" entries
  browser-safe dependencies
  RANU_PUBLIC_* build values
```

A client graph may not import server-only code.

---

# 24. Client Boundary

The official React V1 boundary marker is:

```ts
"use client";
```

A server-rendered page may reference a client component, but the client component and its browser-reachable dependencies belong to the client graph.

---

# 25. Server-Only Boundary

Ranu.js supports:

```ts
import "Ranu.js/server-only";
```

and the project convention:

```text
server/
```

to mark server-only code.

Boundary validation is a build correctness requirement, not an optional lint rule.

---

# 26. Rendering Modes

V1 page rendering modes are:

```text
static
server
client
```

The renderer owns their semantics.

The build records them.

Deployment adapters validate them against target capabilities.

No lower layer may silently change them.

---

# 27. Static Generation Architecture

Static generation is build-time server execution:

```text
compiled route
→ static params
→ renderer
→ HTML
→ static manifest
```

There is no incoming user request.

Request-specific runtime APIs are therefore invalid in static generation.

---

# 28. Production Artifact

The generic Ranu.js production artifact includes:

```text
build ID
route manifest
server manifest
client manifest
static manifest
server runtime entries
browser assets
static HTML
runtime metadata
```

It must be complete enough for generic Node deployment.

---

# 29. Production Startup

`Ranu.js start` must:

- load completed build metadata;
- validate manifest/build compatibility;
- initialize the Ranu.js Node runtime;
- start listening.

It must not:

- recompile TypeScript;
- rediscover routes;
- rerun static generation;
- rerun build plugins.

---

# 30. Plugin Architecture

The plugin manager owns:

- plugin validation;
- API compatibility;
- ordering;
- setup;
- config hooks;
- route metadata hooks;
- build hooks;
- dev hooks;
- artifact ownership.

Plugins extend Ranu.js but do not replace router/runtime/renderer/deployment contracts.

---

# 31. Plugin Trust Boundary

Plugins execute trusted Node.js code during config/dev/build.

The plugin system is not a sandbox.

The supported API must still prevent accidental mutation of Ranu.js-owned route identity, manifests, reserved public namespaces, and server/client boundaries.

---

# 32. Deployment Adapter Architecture

Deployment adapters consume generic Ranu.js artifacts.

They may map them to:

```text
standalone Node
container
Vercel Node functions
future compatible targets
```

They do not rediscover application routes.

They do not change page rendering semantics.

---

# 33. Node and Container Baseline

Generic Node and container deployment are first-class V1 targets.

This establishes a provider-independent reference environment before provider adapters are treated as production-ready.

---

# 34. Vercel Adapter

The first provider adapter may target Vercel using its current Node-compatible deployment primitives.

Vercel-specific function grouping, regions, or provider output formats remain inside the adapter.

They do not become generic Ranu.js route APIs.

---

# 35. Edge Runtime Boundary

Edge runtimes are not equivalent to the Node V1 baseline.

A future edge adapter requires a compatible runtime implementation and capability validation.

Ranu.js must not claim that arbitrary Node-based Ranu.js applications can run in edge isolates through packaging alone.

---

# 36. CLI Architecture

The CLI coordinates subsystems.

```text
Ranu.js dev
→ config + plugins + router + dev/build + Node dev runtime

Ranu.js build
→ config + plugins + router + build + static generation + manifests

Ranu.js start
→ completed artifact + Node runtime

Ranu.js deploy
→ completed artifact + deployment adapter
```

The CLI must not duplicate subsystem logic.

---

# 37. Configuration Architecture

Configuration is resolved once into a stable snapshot.

Subsystems receive only their normalized settings.

Raw executable config is not copied wholesale into production artifacts or browser code.

---

# 38. Environment Architecture

Environment values have three important roles:

```text
build-time private
runtime server-private
build-time browser-public (RANU_PUBLIC_*)
```

The build system and configuration system must preserve those boundaries.

A separate environment specification is not required to implement V1 because the authoritative rules are already owned by the build/config/runtime specifications.

---

# 39. Public API Architecture

Because Ranu.js is intended for public open-source use, stable imports must be intentionally designed.

The project must eventually lock:

```text
package names
subpath exports
stable types
experimental exports
Node/React peer dependencies
deprecation policy
```

This is a release-blocking architecture concern.

---

# 40. Open-Source Repository Architecture

The repository should support external contribution.

Required repository-level areas include:

```text
packages/
adapters/
examples/
fixtures/
tests/
docs/
rfcs/
.github/
```

Release and governance files are defined by the open-source release plan rather than runtime architecture.

---

# 41. Dependency Direction

Recommended high-level direction:

```text
diagnostics / manifests / shared contracts
             ↑
 core / config / router
             ↑
 runtime contracts / build
       ↑                 ↑
 runtime-node        react
       ↑                 ↑
          application server
                 ↑
        deployment adapters
```

The exact package graph will be finalized during repository implementation.

---

# 42. Forbidden Dependency Directions

Examples that must be avoided:

```text
router → react
core → vercel adapter
runtime core → Vite internals
configuration → provider SDK
deployment adapter → application source route scanner
client runtime → server-only package
```

---

# 43. Cyclic Package Dependencies

Public/internal packages should avoid dependency cycles.

If two subsystems need each other's types, shared contracts should move to an appropriate lower-level package rather than introducing a cycle.

---

# 44. Runtime State Ownership

Request-specific state lives in request context.

It must not live in mutable process-global variables.

Build state and dev watcher state are separate from request state.

---

# 45. Build State Ownership

Build caches are disposable.

Generated artifacts live under Ranu.js-owned directories.

No framework cache is the authoritative datastore for application business data.

---

# 46. Error Architecture

Subsystems produce structured Ranu.js diagnostics.

Production request errors additionally use safe runtime error handling.

Developer diagnostics may contain source context; browser production responses must not expose internal details by default.

---

# 47. Observability Architecture

The runtime should expose future-compatible structured events around:

```text
request
middleware
route match
SSR
API handler
build phases
plugin hooks
deployment adaptation
```

No vendor-specific observability backend is required.

---

# 48. Security Boundaries

Key architectural security boundaries:

1. private server code vs browser bundle;
2. private environment vs public build data;
3. public static root vs server build files;
4. application routes vs reserved `/_ranu/`;
5. trusted/untrusted forwarded proxy metadata;
6. development diagnostics vs production error output;
7. plugin trusted-code execution vs Ranu.js structural invariants.

---

# 49. Reserved Framework Namespace

The public URL namespace:

```text
/_ranu/
```

belongs exclusively to framework runtime/browser assets.

Router, build system, plugins, and deployment adapters must preserve this reservation.

---

# 50. Source Directory Boundaries

Canonical application areas include:

```text
app/      route source
server/   server-only application modules
public/   intentional public static files
```

Other directories are ordinary application modules unless a later specification assigns semantics.

---

# 51. Manifest Architecture

Manifests are the contract between build-time and runtime/deployment-time systems.

They must be:

- schema-versioned;
- build-ID consistent;
- validated before production startup;
- free of private secret values;
- free of unnecessary browser-visible server paths.

---

# 52. Development Lifecycle

```text
CLI
→ resolve config/env/plugins
→ compile routes
→ initialize dev transforms
→ initialize Ranu.js Node dev runtime
→ browser runtime/HMR
→ watch
→ invalidate/recompile
```

Config changes cause controlled restart when required.

---

# 53. Production Build Lifecycle

```text
CLI
→ resolve config/env/plugins
→ compile routes
→ classify server/client graphs
→ build server/client outputs
→ static generation
→ manifests
→ integrity validation
→ completed generic artifact
```

Only a fully validated artifact is marked successful.

---

# 54. Deployment Lifecycle

```text
completed generic build
→ adapter capability validation
→ target packaging
→ target validation
→ optional publish by adapter/provider tooling
```

The generic build remains unchanged if adaptation fails.

---

# 55. Public Release Architecture

Before stable public release, the project must have:

```text
stable public package/export map
semver policy
license
security reporting process
CI release gates
npm publication workflow
GitHub contribution workflow
documentation
examples
reference acceptance application
```

These are product/release requirements rather than runtime subsystem internals.

---

# 56. Architecture Decision Records

Major irreversible or ecosystem-facing architecture decisions should be recorded through ADR/RFC-style documents once public development begins.

Examples:

```text
bundler choice
public package names
render mode API
plugin API changes
manifest schema changes
new runtime targets
```

This allows contributors to understand why major decisions were made.

---

# 57. Architecture Acceptance Criteria

The V1 architecture is correctly implemented when:

1. routing works without importing React;
2. API routes work without the React renderer;
3. Node transport details remain behind the Node adapter;
4. React owns page/layout rendering;
5. build owns graph separation and artifacts;
6. client code cannot import server-only code;
7. production uses manifests instead of source scanning;
8. plugins cannot silently redefine route identity;
9. deployment adapters consume generic artifacts;
10. generic Node deployment works without provider SDKs;
11. configuration is resolved before subsystem initialization;
12. `Ranu.js start` does not rebuild;
13. `/_ranu/` is preserved across router/build/runtime/adapters;
14. public/browser artifacts exclude private server metadata by default;
15. subsystem tests can run independently;
16. repository package dependencies remain acyclic or intentionally layered;
17. stable public APIs are explicitly identified before public release.

---

# 58. Locked V1 Architecture Decisions

The following are locked:

1. Ranu.js is a modular full-stack framework.
2. React is the official V1 renderer.
3. Core routing/runtime/config contracts are not React-dependent.
4. Node.js is the V1 server runtime baseline.
5. Web-standard HTTP APIs are preferred at application boundaries.
6. File-based routing is owned solely by the router.
7. Page rendering is owned by the renderer.
8. HTTP execution is owned by the server runtime.
9. Compilation/artifacts are owned by the build system.
10. Plugin extension and deployment adaptation are separate architectural concepts.
11. Production is manifest-driven.
12. Production never depends on source route scanning.
13. Server/client graphs are structurally separated.
14. `"use client"` is the official React V1 client-boundary directive.
15. `Ranu.js/server-only` and `server/` protect server-only code.
16. Rendering modes are `static`, `server`, and `client`.
17. Deployment adapters cannot silently rewrite rendering modes.
18. Generic Node and container deployment are first-class V1 paths.
19. Vercel integration is an adapter, not a core dependency.
20. Edge runtime support is deferred until an explicit compatible runtime exists.
21. `/_ranu/` is framework-reserved.
22. Config is resolved once and treated as immutable.
23. Build-time plugins do not rerun during `Ranu.js start`.
24. Public package/export stability must be explicitly specified before stable release.
25. Ranu.js is intended to be developed and published as a public open-source framework.

---

# 59. Deferred Architecture Features

Deferred unless separately approved:

- custom JavaScript bundler written from scratch;
- proprietary runtime;
- required React Flight/RSC transport;
- server actions;
- ISR/revalidation architecture;
- edge runtime;
- mixed Node/Edge route runtimes;
- built-in database/ORM;
- built-in authentication service;
- built-in queue/workflow platform;
- runtime plugin middleware injection;
- arbitrary plugin route syntax;
- alternate renderer implementation;
- multi-cloud orchestration.

---

# 60. Relationship to Later Specifications

This file defines subsystem boundaries.

The following documents define details:

```text
03_ROUTING_SPECIFICATION.md
04_RENDERING_MODEL.md
05_SERVER_RUNTIME_SPEC.md
06_BUILD_SYSTEM.md
07_PLUGIN_SYSTEM.md
08_DEPLOYMENT_ADAPTERS.md
09_CLI_SPECIFICATION.md
10_CONFIGURATION_SYSTEM.md
```

Later documents must comply with the ownership and dependency rules defined here.

---

# 61. Final Architecture Baseline

Ranu.js V1 is a TypeScript-first, React-first, Node-first full-stack framework built as a modular open-source system.

The router defines route identity.

The React renderer defines page rendering.

The server runtime defines HTTP execution.

The build system separates server/client code and produces validated manifests and artifacts.

The plugin system extends controlled lifecycle surfaces.

Deployment adapters map generic artifacts to compatible infrastructure.

The CLI orchestrates these subsystems.

The configuration system resolves framework behavior once.

Production uses compiled artifacts rather than source discovery.

No hosting provider, renderer, or underlying bundler is allowed to become the hidden definition of Ranu.js itself.

This specification is the authoritative high-level Ranu.js V1 architecture contract.

---

**End of 02_FRAMEWORK_ARCHITECTURE.md**
