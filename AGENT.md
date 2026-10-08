# Ranu.js Universal Agent Instructions

Welcome to **Ranu.js** (current release: `v0.1.5`).

Ranu.js is a high-performance React 19 full-stack framework built with Vite, Turborepo, and Web Standards.

---

## 📌 Critical Architectural Rulebook

Before writing, scaffolding, or refactoring code in this repository or in any downstream Ranu.js application, **you must follow the architectural specifications outlined in**:

👉 **[`skills/ranu-architect/SKILL.md`](skills/ranu-architect/SKILL.md)**

---

## 🤖 Native Specialized AI & Engineering Skills (`skills/`)

When generating code or designing AI-enabled features in Ranu.js, adhere to the corresponding domain skills:

* **Core Architecture:** [`skills/ranu-architect/SKILL.md`](skills/ranu-architect/SKILL.md)
* **Real-time Streaming & SSE:** [`skills/ai-universal-streaming/SKILL.md`](skills/ai-universal-streaming/SKILL.md)
* **Multi-Model Adapters & Routing:** [`skills/ai-model-adapters/SKILL.md`](skills/ai-model-adapters/SKILL.md)
* **Tool Calling & Schema Validation:** [`skills/ai-tool-calling/SKILL.md`](skills/ai-tool-calling/SKILL.md)
* **Vector Retrieval & Embeddings (RAG):** [`skills/ai-vector-retrieval/SKILL.md`](skills/ai-vector-retrieval/SKILL.md)
* **Security Guardrails & Hardening:** [`skills/ai-security-guardrails/SKILL.md`](skills/ai-security-guardrails/SKILL.md)

---

## Quick Reference Summary

### 1. Framework Identity & Dependencies

- Core package: `@ranujs/core`
- UI library: React 19 (`react`, `react-dom` >= 19.0.0)
- Commands: `ranu dev` (port 3000 default), `ranu build`, `ranu start`

### 2. File-System Routing (`app/`)

- Root Layout: `app/layout.tsx` (`<html>` + `<body>`)
- Page: `app/**/page.tsx` (`export default function Page({ params })`)
- Navigation: `import { Link } from '@ranujs/core/react'`
- Configuration: `import { defineConfig } from '@ranujs/core/config'`

### 3. Server API Routes (`app/api/**/route.ts`)

- Methods: `export async function GET(request: Request)`, `POST(request: Request)`, etc.
- Standard Web APIs: uses global `Request` and `Response.json(...)`

### 4. Core Neutrality & Open Contracts

- **Infrastructure Agnostic:** Deployment targets follow open, pluggable runtime adapter contracts. The core engine does not bundle, favor, or mandate any specific cloud infrastructure.
- **Model Agnostic:** AI integrations interface strictly through W3C Web Standards (`ReadableStream`, `Request`, `Response`, Server-Sent Events). The framework does not bundle proprietary AI SDKs.

### 5. Framework Boundaries (Anti-Hallucination Guardrails)

- ❌ **Exclusive Package Imports:** Import routing and framework primitives exclusively from `@ranujs/*`. Never import from foreign meta-framework namespaces.
- ❌ **Standard Web Signatures:** Use standard W3C `Request` and `Response` objects. Never use legacy callback-based `(req, res)` handlers.
- ❌ **React 19 Native:** Use React 19 component and streaming conventions. Avoid deprecated legacy APIs.
