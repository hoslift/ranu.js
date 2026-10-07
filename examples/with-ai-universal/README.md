# Universal AI Chat Example in Ranu.js

This is an official, turnkey reference application demonstrating **Model-Agnostic, Web Standards First AI Streaming** in **Ranu.js**.

It illustrates how to build a production full-stack streaming chat interface across multiple AI cloud endpoints and local models with **zero proprietary AI SDK wrappers**.

---

## Features

- **Web Standards First:** Built exclusively on native W3C `ReadableStream`, `TransformStream`, and Server-Sent Events (SSE).
- **Multi-Provider Switcher:** Seamlessly switch between OpenAI-compatible endpoints, Google Gemini, Anthropic Claude, and Local LLMs (Ollama) in the frontend or via environment variables.
- **Zero Proprietary SDKs:** Direct HTTP streaming without heavyweight third-party SDK dependencies.
- **React 19 Native:** Pure React 19 Client Component with real-time token rendering and immediate abort cancellation.
- **Compiler Secret Boundaries:** Environment variables without `RANU_PUBLIC_` stay private to the server runtime.
- **Zero-Config Demo Mode:** Includes a built-in simulation mode (`mock`) so you can run and experience the streaming chat immediately without needing an API key.

---

## Getting Started

### 1. Install Dependencies

From the root of the Ranu.js monorepo:

```bash
pnpm install
```

### 2. Configure Environment Variables (Optional)

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Add your API credentials for your chosen provider:

```bash
# OpenAI or OpenAI-compatible (Groq, Together, DeepSeek)
AI_PROVIDER=openai
AI_API_KEY=your_secret_api_key_here
AI_MODEL_NAME=gpt-4o-mini

# Or Google Gemini:
# AI_PROVIDER=gemini
# GEMINI_API_KEY=your_gemini_api_key_here

# Or Local Ollama (127.0.0.1):
# AI_PROVIDER=local
# AI_LOCAL_URL=http://127.0.0.1:11434/api/chat
```

> **Note:** If no API key is provided, the application automatically defaults to Demo Simulation mode so you can test streaming immediately!

---

## Running the Application

Start the local development server using `pnpm`:

```bash
# From the monorepo root:
pnpm --filter example-with-ai-universal dev

# Or directly from this directory:
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to interact with the streaming chat interface.

---

## Building for Production

Build production-optimized server and client bundles:

```bash
pnpm build
pnpm start
```

---

## Architecture Overview

```
examples/with-ai-universal/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts       # Web Standards streaming route (SSE)
│   ├── layout.tsx             # Root layout with responsive styling
│   └── page.tsx               # React 19 interactive streaming client
├── .env.example               # Provider credential template
├── ranu.config.ts             # Framework server configuration
├── tsconfig.json              # TypeScript bundler compiler options
└── package.json               # Package definition and scripts
```
