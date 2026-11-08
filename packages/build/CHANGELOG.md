# @ranu/build

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
- ab9115f: Implement AST compile-time AI API key client leak protection (`RANU_BUILD_AI_SECRET_CLIENT_LEAK`) blocking AI credentials (GEMINI_API_KEY, GROQ_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY, CUSTOM_AI_KEY, MISTRAL_API_KEY, CEREBRAS_API_KEY) from client component bundles.
- f7a1e94: Implement automated production bundle audit (`auditProductionBundle`) and esbuild tree-shaking virtual stubs for `@ranu/devtools` in browser bundles, asserting zero bytes of devtools code leak into production builds.
- cac708a: Add Standard Schema form actions validation, automated AI context synchronization on build, and developer tooling ergonomics.

### Patch Changes

- Updated dependencies [cac708a]
- Updated dependencies [cac708a]
  - @ranu/react@0.4.0
  - @ranu/runtime@0.4.0
  - @ranu/config@0.4.0
  - @ranu/core@0.4.0
  - @ranu/diagnostics@0.4.0
  - @ranu/manifests@0.4.0
  - @ranu/plugin@0.4.0
  - @ranu/router@0.4.0

## 0.2.0

### Minor Changes

- 8b7d3b2: AST dynamic bracket-notation and destructured environment secret protection:

  - **AST Dynamic Bracket-Notation & Destructured Secret Stripping**: Enhance `@ranu/build` environment AST validation to detect and block bracket-notation accesses (`process['env']`, `import.meta['env']`), destructured references (`const { SECRET } = process.env`), sequence operators (`(0, process)`), and aliased variable pointers in client code, reporting actionable `RanuDiagnostic` entries with exact coordinates.

- 83b7784: Synchronize AI agent architecture guides and llms.txt context documents (`public/llms.txt` and `.ranu/AGENT_GUIDE.md`) during build and development server lifecycle.
- b76c163: Dual-tier JSX props serialization guards and dev streaming overlay:

  - **Dual-Tier JSX Props Serialization Guards**:
    - _Tier 1 Static Guard (`@ranu/build`)_: Deep recursive AST analysis detecting non-serializable props (functions, class instances, symbols, cyclical patterns) passed across JSX client boundaries at compile time.
    - _Tier 2 Runtime Guard (`@ranu/react`)_: React 19 Flight serialization assertions during development SSR streaming, emitting structured diagnostics and browser visual diff overlays for boundary serialization leaks.
  - **Diagnostics Serialization Overlay**: Patch `@ranu/diagnostics` with error codes and interactive visual overlay rendering for boundary serialization diagnostics.

- 7798187: Introduce AST static compiler validation for serverless database connection pool exhaustion (`RANU_BUILD_SERVERLESS_DB_POOL`), warning developers when high connection limits (`max > 1`) are configured for ephemeral serverless and edge deployment targets.

### Patch Changes

- Updated dependencies [bed9282]
- Updated dependencies [bac30c1]
- Updated dependencies [b76c163]
- Updated dependencies [da2ef84]
  - @ranu/core@0.1.0
  - @ranu/plugin@0.1.0
  - @ranu/config@0.1.0
  - @ranu/react@0.1.0
  - @ranu/diagnostics@0.0.1
  - @ranu/manifests@0.0.1
  - @ranu/router@0.0.1
  - @ranu/runtime@0.0.1

## 0.1.0

### Minor Changes

- bf2e58a: Initial Public Alpha release (v0.1.0) of Ranu.js full-stack framework and project scaffolder.

### Patch Changes

- 108909c: Harden route output path generation against polynomial ReDoS and fix optional catch-all route token ordering.
