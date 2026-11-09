# @ranu/ai

## 0.4.1

No changes in this release.

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
- 9a2dbfc: Scaffold `@ranu/ai` kernel package and implement universal `createAIProvider` contract supporting Google Gemini, Groq LPU, Anthropic Claude, OpenAI, local Ollama, custom enterprise endpoints, and dynamic monthly subscription bearer authorization.
- 9a2dbfc: Implement streamAI execution kernel with W3C ReadableStream protocol, Server-Sent Events (SSE) event framing (chunk, reasoning, tool-call, finish, error, [DONE]), queue-bounded backpressure drain management (<64KB highWaterMark), and AbortSignal propagation.
- 9a2dbfc: Implement Standard-Schema structured output generation with generateObject, robust JSON extraction from markdown code fences and conversational responses, detailed AIValidationError diagnostics, and multi-provider compatibility.
- cac708a: Add Web Crypto HMAC-SHA256 session token signing, constant-time equality checks, session expiration enforcement, and auth security test suites.
