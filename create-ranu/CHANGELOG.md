# create-ranujs

## 0.4.0

### Minor Changes

- 0786e42: Ranu.js AI Developer Studio & Upfront Model Sponsorship Ecosystem release certification:
  - Native In-Browser AI Developer Studio dock panel with Visual Diff review & live HMR triggers
  - Standard W3C streaming execution kernel with bounded backpressure (<64KB) and Standard-Schema output generation
  - Promoted upfront model drivers: Google DeepMind, Groq LPU, Anthropic Claude, OpenAI, and local Ollama
  - Modular AI Studio showcase template (`templates/ai-studio`) with dynamic partner switcher
  - Confidential VIP tokenized access middleware with timing-safe SHA-256 validation and 404 security gating
  - AST compile-time client AI API key leak protection (`RANU_BUILD_AI_SECRET_CLIENT_LEAK`)
  - Production zero-footprint tree-shaking audit guaranteeing 0 bytes of devtools code leaked in production
  - 100% monorepo quality gates certified across all workspace packages and tests.
- 9a2dbfc: Add interactive AI engine selector with Zero AI default, CLI --ai and --ai-engine flags, and automated agent context files (.cursorrules, AGENTS.md, CLAUDE.md, .ranu/AGENT_GUIDE.md).
- cac708a: Introduce `@ranujs/adapter-static` zero-runtime static site generation (SSG) adapter, interactive CLI template picker via `@clack/prompts`, and full-stack reference applications.
- 306e0bd: Introduce modular AI Studio showcase template (`templates/ai-studio`) featuring dynamic partner switcher for top AI models (Google DeepMind, Groq LPU, Anthropic Claude, OpenAI, Mistral, Cerebras, Ollama), live streaming metrics, and code generation sandbox.

### Patch Changes

- cac708a: Improve developer onboarding, template configuration validation, and dev server process reliability.
- cac708a: Bump development toolchains across monorepo workspace packages (TypeScript, ESLint, Prettier, build tools).
- cac708a: Resolve 9 Dependabot vulnerabilities in CLI dependency tree and lockfile graph.

## 0.3.0

### Minor Changes

- 3f9084f: Introduce AI-agent DX tooling: `ranu describe` route introspection, `ranu check` sub-second dry-run validation, and machine-readable JSON diagnostics.
- b504087: Introduce turnkey full-stack SaaS starter preset (`--template saas`) with React 19 streaming SSR, Tailwind CSS v4, Drizzle ORM, session auth API endpoints, and a production dashboard.

## 0.2.0

### Minor Changes

- Multi-template scaffolding CLI supporting `default`, `minimal`, `cloudflare`, `node-docker`, and `api-routes`.
- Interactive CLI flags: `--template <name>`, `--adapter <name>`, and `--tests`.
- Synchronized scaffold templates and dependency version constraints to `@ranujs/core` v0.2.0.

## 0.1.6

### Patch Changes

- Synchronize scaffold templates and dependency version constraints to @ranujs/core v0.1.6.

## 0.1.5

### Patch Changes

- Synchronize scaffold templates and dependency version constraints to @ranujs/core v0.1.5.

## 0.1.4

### Patch Changes

- Modernize documentation, bundle MIT LICENSE, and synchronize scaffold templates to @ranujs/core v0.1.4.

## 0.1.3

### Patch Changes

- Fix CLI direct execution in bundled environment when invoked via npm create / npx and align examples to npm create ranujs@latest.

## 0.1.2

### Patch Changes

- 75c7692: Add CLI shebang to create-ranu executable and synchronize dependencies.

## 0.1.1

### Patch Changes

- 6b891e6: Bump all packages to v0.1.1 under @hoslift organization.

## 0.1.0

### Minor Changes

- bf2e58a: Initial Public Alpha release (v0.1.0) of Ranu.js full-stack framework and project scaffolder.
