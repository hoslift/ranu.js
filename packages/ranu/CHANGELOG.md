# @ranujs/core

## 0.3.0

### Minor Changes

- 3f9084f: Introduce AI-agent DX tooling: `ranu describe` route introspection, `ranu check` sub-second dry-run validation, and machine-readable JSON diagnostics.
- 8d438e1: Introduce `@ranu/testing` headless in-memory test harness (`createTestContext`) and assertions (`expectStatus`, `expectHeader`, `expectJson`, `expectText`, `expectRedirect`) for sub-50ms request/response verification without network socket overhead, exposed under `@ranu/testing` and `ranu/testing`.
- 17df3c9: Introduce `@ranu/devtools` in-browser visual dock with streaming waterfall chunk inspector, route hierarchy viewer, hydration status verification, and compiler diagnostics display, exported under `@ranu/devtools` and `ranu/devtools`.
- da2ef84: Implement type-safe Standard Schema v1 form actions (`createFormAction`) and reactive React 19 hook (`useFormAction`) supporting Zod, Valibot, and ArkType schemas with automated validation and pending state management.
- 7c4e0c3: Introduce streaming backpressure management and memory bounding utilities (`createBoundedStream`, `pipeWithBackpressure`, `createStreamingDrainTracker`) with high-water mark throttling, abort signal propagation, and maximum byte protection.

## 0.2.0

### Minor Changes

- Native multi-cloud deployment adapter ecosystem: Bun, Deno, Cloudflare Workers, Node standalone, Netlify, and Vercel.
- Integrated React 19 hydration mismatch visual DOM diff overlay diagnostics (`@ranu/diagnostics`).
- Upgraded React ecosystem to React 19.3.x with single-resolution runtime deduplication via workspace overrides.
- Multi-template scaffolding CLI (`create-ranujs`) supporting `default`, `minimal`, `cloudflare`, `node-docker`, and `api-routes`.
- Playwright browser E2E test suites for navigation and Suspense streaming.

## 0.1.6

### Patch Changes

- Standardize workspace test resolution, synchronize documentation, and bump canonical version to v0.1.6.

## 0.1.5

### Patch Changes

- Upgrade Vitest to v4.1.11, harden Vite 7 module aliases, and update package version metadata.

## 0.1.4

### Patch Changes

- Modernize documentation, bundle MIT LICENSE, and update metadata.

## 0.1.3

### Patch Changes

- Bump version to v0.1.3 and synchronize workspace dependencies.

## 0.1.2

### Patch Changes

- 75c7692: Prepare v0.1.2 self-contained bundles, add CLI shebangs, and synchronize exports.

## 0.1.1

### Patch Changes

- 6b891e6: Bump all packages to v0.1.1 under @hoslift organization.

## 0.1.0

### Minor Changes

- bf2e58a: Initial Public Alpha release (v0.1.0) of Ranu.js full-stack framework and project scaffolder.
