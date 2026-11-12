# Changelog

All notable changes to Ranu.js will be documented in this file.

The format follows [Semantic Versioning](https://semver.org/) and changes are managed using [Changesets](https://github.com/changesets/changesets).

## 0.4.1 (Public Alpha)

### Security & Ecosystem Distribution Cleanup

- Sanitized devtools client credentials and hardened AI secret handling across client bundles.
- Restricted npmjs.com publishing scope to canonical ecosystem packages (`@ranujs/core`, `create-ranujs`, deployment adapters, and AI model drivers).
- Synchronized framework (`@ranujs/core`), scaffolder (`create-ranujs`), adapters, and AI packages to `v0.4.1`.

## 0.4.0 (Public Alpha)

### AI Developer Studio, Server Actions & Security Hardening

- **AI Developer Studio & Native Model Ecosystem:**
  - Added universal AI streaming kernel (`@ranu/ai` / `ranu/ai`) with bounded backpressure (`<64KB`) and Standard-Schema structured output generation (`generateObject`).
  - Added native AI model drivers for Google Gemini (`@ranu/ai-gemini`), Anthropic Claude (`@ranu/ai-claude`), OpenAI/Codex (`@ranu/ai-codex`), Groq (`@ranu/ai-groq`), and custom/local Ollama (`@ranu/ai-custom`).
  - Added in-browser AI Developer Studio dock panel with Visual Diff review, live HMR triggers, and modular `templates/ai-studio` showcase template.
  - Added `ranu ai` and `ranu prompt` CLI commands, plus interactive `create-ranujs` AI engine selector (`--ai`, `--ai-engine`, Zero AI default) and automated agent context generation.
- **Server Actions, Static Export & Observability:**
  - Introduced Server Actions RPC wire protocol (`x-ranu-action`), tag-based cache revalidation primitives (`revalidateTag`), and `ranu preview` CLI command.
  - Added `@ranujs/adapter-static` zero-runtime static site generation (SSG) adapter and interactive CLI template picker via `@clack/prompts`.
  - Added production OpenTelemetry observability with distributed tracing kernel, structured span exporters, and `/metrics` Prometheus endpoint.
- **Security & Build Auditing:**
  - Added AST compile-time client AI API key leak protection (`RANU_BUILD_AI_SECRET_CLIENT_LEAK`).
  - Added tokenized preview/VIP access middleware with timing-safe SHA-256 comparison, 404 gating, and `X-Robots-Tag: noindex, nofollow` headers.
  - Added Web Crypto HMAC-SHA256 session token signing and constant-time equality verification.
  - Enforced automated production bundle audit (`auditProductionBundle`) and esbuild tree-shaking stubs ensuring zero bytes of devtools code leak into production builds.

## 0.3.0 (Public Alpha)

### AI-Agent DX, DevTools, Testing & Form Actions

- Introduced AI-agent DX tooling: `ranu describe` route introspection, `ranu check` sub-second dry-run validation, and machine-readable JSON diagnostics.
- Introduced `@ranu/devtools` (`ranu/devtools`) in-browser visual dock with streaming waterfall chunk inspector, route hierarchy viewer, hydration status, and compiler diagnostics display.
- Introduced `@ranu/testing` (`ranu/testing`) headless in-memory test harness (`createTestContext`, `expectStatus`, `expectHeader`, `expectJson`, `expectText`, `expectRedirect`).
- Implemented Standard Schema v1 form actions (`createFormAction`, `useFormAction`) supporting Zod, Valibot, and ArkType schemas.
- Added streaming backpressure and memory bounding utilities (`createBoundedStream`, `pipeWithBackpressure`, `createStreamingDrainTracker`).
- Added turnkey full-stack SaaS starter preset (`--template saas`) in `create-ranujs` with Drizzle ORM, session auth, and Tailwind CSS v4.

## 0.2.0 (Public Alpha)

### Multi-Cloud Adapter Ecosystem & Developer Experience

- Expanded deployment adapter ecosystem with native support for Bun (`@ranujs/adapter-bun`), Deno (`@ranujs/adapter-deno`), Cloudflare Workers (`@ranujs/adapter-cloudflare`), Node.js standalone (`@ranujs/adapter-node`), Netlify (`@ranujs/adapter-netlify`), alongside Vercel (`@ranujs/adapter-vercel`).
- Added browser visual DOM diff overlay diagnostics (`@ranu/diagnostics`) to detect and inspect React 19 hydration mismatches with interactive error inspection.
- Upgraded React ecosystem to React 19.3.x with single-resolution runtime deduplication via workspace overrides.
- Enhanced `create-ranujs` multi-template scaffolding supporting `default`, `minimal`, `cloudflare`, `node-docker`, and `api-routes`.
- Introduced Playwright E2E browser test automation for client-side navigation and React 19 Suspense streaming verification.
- Bumped canonical framework package (`@ranujs/core`) and scaffolder (`create-ranujs`) to `v0.2.0`.

## 0.1.6 (Public Alpha)

### Test & Build Pipeline Stabilization

- Standardized root and workspace test execution pipeline for Vitest v4 compatibility across all 16 monorepo packages.
- Synchronized package version constants and template manifests to `v0.1.6`.
- Verified 100% passage across all test suites (825/825 unit tests, 57 integration tests, 54 examples, performance benchmarks, and architecture audits).

## 0.1.5 (Public Alpha)

### Security Hardening & Tooling Stabilization

- Remediated transitive security advisories across dev tooling: tinypool Prototype Pollution (RCE), js-yaml DoS, and source-map-js DoS via pnpm overrides.
- Upgraded Vitest and `@vitest/coverage-v8` to `v4.1.11` across all workspace packages to remediate path traversal vulnerabilities.
- Migrated monorepo workspace test configuration to root `vitest.config.ts` with `test.projects` support for Vitest 4.
- Hardened Vite 7 alias compatibility with explicit string mapping in `vitest.workspace.ts`.
- Narrowed `MiddlewareHeadersInit` to `[string, string][]` tuple type for `@types/node` v26 compatibility.
- Resolved 24 out of 25 Dependabot security alerts across repository manifests and lockfiles.

## 0.1.4 (Public Alpha)

### Documentation & Repository Modernization

- Comprehensive README redesign with an npm-first quick start guide, framework architectural vision, and responsive dark/light mode logos.
- Modernized documentation across package readmes, `CONTRIBUTING.md`, `SECURITY.md`, and `CODE_OF_CONDUCT.md` with contributor guidelines and response SLAs.
- Bundled MIT `LICENSE` across all publishable packages (`@ranujs/core`, `create-ranujs`, `@ranujs/adapter-vercel`).
- Added financial contributor links and funding metadata (`.github/FUNDING.yml`).
- Scoped Dependabot major version rules in `.github/dependabot.yml` to preserve ecosystem security update PRs.

## 0.1.3 (Public Alpha)

### Core Improvements & Scaffolder Fixes

- Resolved `create-ranujs` CLI execution bug where binary exited silently due to code-splitting chunk mismatch; aligned direct execution with `NODE_ENV !== 'test'`.
- Corrected CLI help text usage examples to canonical `npm create ranujs@latest`.
- Synchronized canonical configuration import in `@ranujs/adapter-vercel` documentation to `@ranujs/core/config`.
- Bumped all packages to `v0.1.3` and synchronized documentation references across the monorepo.

## 0.1.2 (Public Alpha)

### Core Improvements & Bundle Packaging

- Self-contained bundle packaging for framework runtime, bundling internal workspace packages into distribution artifacts.
- Added executable shebangs (`#!/usr/bin/env node`) to `create-ranu` and `ranu` CLI entrypoints.
- Synchronized workspace dependencies across framework packages and adapters.

## 0.1.1 (Public Alpha)

### Organization & Security Updates

- Migrated package namespace under the `@hoslift` organization baseline.
- Security hardening: resolved polynomial ReDoS in route output path generation (Alert #3).
- Bumped TypeScript to 5.9.3 and updated development dependencies.

## 0.1.0 (Public Alpha)

### Initial Release

- Initial Public Alpha release of the Ranu.js full-stack framework (`ranu`), project scaffolding CLI (`create-ranu`), and Vercel deployment adapter (`@ranu/adapter-vercel`).
- Full-stack capabilities: file-based routing, React 19 SSR streaming, SSG, client hydration, API routes, middleware, CSS modules, plugin system, container & Vercel deployment.
- Hardened security baseline: polynomial ReDoS protection, route parameter sanitization, secret separation, and zero information leakage.
