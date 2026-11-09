# @ranu/server

## 0.4.1

### Patch Changes

- @ranu/core@0.4.1
  - @ranu/runtime@0.4.1

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
- cac708a: Introduce Server Actions RPC wire protocol (`x-ranu-action`), tag-based cache revalidation primitives (`revalidateTag`), and `ranu preview` CLI command.
- cac708a: Add Standard Schema form actions validation, automated AI context synchronization on build, and developer tooling ergonomics.
- 10e5d65: Introduce tokenized preview access middleware with timing-safe SHA-256 byte comparisons, 404 security gating, and automatic `X-Robots-Tag: noindex, nofollow` headers to protect private preview endpoints from indexing and unauthorized access.

### Patch Changes

- Updated dependencies [cac708a]
  - @ranu/runtime@0.4.0
  - @ranu/core@0.4.0
