# Ranu.js Roadmap

> **Status:** Pre-alpha development
> **Current Phase:** Phase 24–26 — Deployment (Next)
> **Target:** Ranu.js 1.0.0

This roadmap reflects the planned development phases for **Ranu.js V1** and tracks the project's progress toward its first stable release.

Ranu.js is currently under active development. APIs, internal architecture, and implementation details may change before the stable release.

## Status Legend

| Status | Meaning     |
| ------ | ----------- |
| ✅      | Completed   |
| 🚧     | In Progress |
| ⏳      | Planned     |

---

## Phase 0 — Repository / Tooling Bootstrap ✅

* Monorepo structure
* TypeScript, ESLint, Prettier
* Test runner (Vitest)
* Package skeletons
* CI skeleton
* Release tooling (Changesets)

---

## Phase 1 — Diagnostics, Shared Contracts, and Manifests ✅

* Structured diagnostic model
* Shared framework types
* Route/server/client/static manifest schemas

---

## Phase 2 — Configuration System ✅

* `ranu.config.ts` / `defineConfig()`
* Environment loading
* Resolved config

---

## Phase 3–5 — Router ✅

* File-based routing
* Dynamic/catch-all segments
* Route groups
* API routes

---

## Phase 6 — Runtime Contracts ✅

* Provider-neutral runtime contracts

---

## Phase 7 — Node Runtime ✅

* Node.js HTTP runtime
* Web Request and Response bridging
* Streaming and body limit handling
* Graceful server lifecycle

---

## Phase 8 — Server Helpers ✅

* Server helpers (`cookies()`, `headers()`, `redirect()`, `notFound()`, `getRequestContext()`)
* Request context and server lifecycle integration

---

## Phase 9–10 — React Renderer ✅

* React 19 streaming SSR
* Root and nested layouts
* Async pages and layouts
* Metadata resolution and `<head>` generation
* Redirect and not-found control flow
* Segment-scoped loading/Suspense
* Production-safe render error handling

---

## Phase 11–12 — Build System ✅

* Production build pipeline and deterministic output structure
* TypeScript, JavaScript, JSX, and TSX compilation
* Server build graph and production server bundles
* Client/server module boundary classification and `"use client"` detection
* Transitive client graph propagation and security boundary enforcement
* `ranu/server-only` boundary validation
* Route, server, client, and static build manifests
* Production entry generation and Node.js SSR production artifact
* Cross-platform build and asset packaging behavior

---

## Phase 13–16 — Client ✅

* Hydration
* Client navigation (`Link`, `useRouter`)
* Static generation (SSG)
* Client rendering mode

---

## Phase 17–19 — CSS/Assets and Dev Server ✅

* CSS, CSS Modules
* HMR and React Fast Refresh

---

## Phase 20–23 — Middleware, Plugins, CLI ✅

* Middleware
* Plugin API v1
* `Ranu.js` CLI
* `create-ranu` scaffolder

---

## Phase 24–26 — Deployment ⏳

**Next phase (Upcoming)**

* Generic Node.js production
* Container deployment
* Vercel adapter (`@ranu/adapter-vercel`)

---

## Phase 27–32 — Quality, Security, Docs, Governance ⏳

* Public API conformance
* Security hardening
* Performance baseline
* Documentation
* Open-source release infrastructure

---

## Current Development Progress

```text
Phase 0      Repository / Tooling        ✅ Completed
Phase 1      Contracts & Manifests       ✅ Completed
Phase 2      Configuration               ✅ Completed
Phase 3–5    Router                      ✅ Completed
Phase 6      Runtime Contracts           ✅ Completed
Phase 7      Node Runtime                ✅ Completed
Phase 8      Server Helpers              ✅ Completed
Phase 9–10   React Renderer              ✅ Completed
Phase 11–12  Build System                ✅ Completed
Phase 13–16  Client                      ✅ Completed
Phase 17–19  CSS / Assets / Dev Server   ✅ Completed
Phase 20–23  Middleware / Plugins / CLI  ✅ Completed
Phase 24–26  Deployment                  ⏳ Next / Upcoming
Phase 27–32  Quality / Security / Docs   ⏳ Planned
```

---

## Release Path

```text
Prototype → Alpha → Beta → RC → Ranu.js 1.0.0
```

Ranu.js will progress through each release stage only after the corresponding implementation, testing, stability, and quality requirements have been satisfied.


---

## About This Roadmap

This roadmap represents the current development direction for Ranu.js V1.

Development priorities may evolve as implementation, testing, performance analysis, and community feedback reveal new requirements. Significant roadmap changes will be reflected in this document.

For the latest project overview, see [`README.md`](./README.md).

---

**Next development focus: Phase 24–26 — Deployment**
