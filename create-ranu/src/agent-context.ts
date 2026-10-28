import type { PackageManager, AIEngineName } from './types.js';
import { getRunCommand } from './package-manager.js';

export type AIEngineChoice = AIEngineName;

export interface AgentContextOptions {
  readonly projectName: string;
  readonly packageManager: PackageManager;
  readonly aiEngine?: AIEngineName | undefined;
  readonly template?: string | undefined;
  readonly adapter?: string | undefined;
  readonly tests?: boolean | undefined;
}

/**
 * Generates .cursorrules containing strict React 19 SSR, Web Standards, and zero-leak rules.
 */
export function generateCursorRules(options: AgentContextOptions): string {
  const ai = options.aiEngine ?? 'none';

  let aiSection = '';
  if (ai === 'none') {
    aiSection = `## 5. Zero-AI Architecture (Traditional Web App)
- **Pure Full-Stack Web App:** This project is configured as a lean, traditional full-stack web application with Zero AI dependencies.
- **No Phantom AI Imports:** Do NOT import \`@ranu/ai\`, \`@ranu/ai-*\`, or external LLM packages.
- **Standard Routing & Persistence:** Build features using standard React 19 SSR, standard API routes (\`app/routes/**/route.ts\`), and standard database/ORM persistence.`;
  } else if (ai === 'gemini') {
    aiSection = `## 5. AI Engine: Google Gemini (@ranu/ai-gemini)
- **Universal Streaming Kernel:** Import streaming functions from \`@ranu/ai\` and the Gemini driver from \`@ranu/ai-gemini\`.
- **Environment Variable:** \`GEMINI_API_KEY\` (stored in \`.env\`, accessed ONLY on the server).
- **Default Model:** \`gemini-1.5-pro\` (or \`gemini-1.5-flash\`).
- **Multimodal Support:** Gemini natively supports multimodal prompts (text, images, audio, video).
- **API Route Pattern (\`app/routes/api.ai.ts\`):**
\`\`\`typescript
import { streamAI } from '@ranu/ai';
import { gemini } from '@ranu/ai-gemini';

export async function POST(request: Request): Promise<Response> {
  const { prompt, messages } = await request.json();
  return streamAI({
    model: gemini('gemini-1.5-pro'),
    prompt,
    messages,
    signal: request.signal,
  });
}
\`\`\`
- **Client Consumption:** Client components must fetch from server streaming routes using standard \`ReadableStream\` or SSE, NEVER invoke \`gemini()\` directly in browser code.`;
  } else if (ai === 'groq') {
    aiSection = `## 5. AI Engine: Groq LPU Ultra-Fast Inference (@ranu/ai-groq)
- **Universal Streaming Kernel:** Import streaming functions from \`@ranu/ai\` and the Groq driver from \`@ranu/ai-groq\`.
- **Environment Variable:** \`GROQ_API_KEY\` (stored in \`.env\`, server-side only).
- **Default Model:** \`llama-3.3-70b-versatile\` (or \`llama-3.1-8b-instant\`).
- **Sub-10ms Inference:** Leverages Groq LPUs for sub-10ms TTFB streaming.
- **API Route Pattern (\`app/routes/api.ai.ts\`):**
\`\`\`typescript
import { streamAI } from '@ranu/ai';
import { groq } from '@ranu/ai-groq';

export async function POST(request: Request): Promise<Response> {
  const { prompt, messages } = await request.json();
  return streamAI({
    model: groq('llama-3.3-70b-versatile'),
    prompt,
    messages,
    signal: request.signal,
  });
}
\`\`\``;
  } else if (ai === 'claude') {
    aiSection = `## 5. AI Engine: Anthropic Claude (@ranu/ai-claude)
- **Universal Streaming Kernel:** Import streaming functions from \`@ranu/ai\` and the Claude driver from \`@ranu/ai-claude\`.
- **Environment Variable:** \`ANTHROPIC_API_KEY\` (stored in \`.env\`, server-side only).
- **Default Model:** \`claude-3-5-sonnet-20241022\` (or \`claude-3-5-haiku-20241022\`).
- **Tool Use & Reasoning:** Optimized for structured tools, function calling, and complex agent workflows.
- **API Route Pattern (\`app/routes/api.ai.ts\`):**
\`\`\`typescript
import { streamAI } from '@ranu/ai';
import { claude } from '@ranu/ai-claude';

export async function POST(request: Request): Promise<Response> {
  const { prompt, messages } = await request.json();
  return streamAI({
    model: claude('claude-3-5-sonnet-20241022'),
    prompt,
    messages,
    signal: request.signal,
  });
}
\`\`\``;
  } else if (ai === 'openai') {
    aiSection = `## 5. AI Engine: OpenAI (@ranu/ai-openai)
- **Universal Streaming Kernel:** Import streaming functions from \`@ranu/ai\` and the OpenAI driver from \`@ranu/ai-openai\`.
- **Environment Variable:** \`OPENAI_API_KEY\` (stored in \`.env\`, server-side only).
- **Default Model:** \`gpt-4o\` (or \`gpt-4o-mini\`).
- **Structured Outputs:** Pair with Standard-Schema (Zod/Valibot) for typed JSON output.
- **API Route Pattern (\`app/routes/api.ai.ts\`):**
\`\`\`typescript
import { streamAI } from '@ranu/ai';
import { openai } from '@ranu/ai-openai';

export async function POST(request: Request): Promise<Response> {
  const { prompt, messages } = await request.json();
  return streamAI({
    model: openai('gpt-4o'),
    prompt,
    messages,
    signal: request.signal,
  });
}
\`\`\``;
  } else if (ai === 'custom') {
    aiSection = `## 5. AI Engine: Custom / Local Ollama (@ranu/ai-custom)
- **Universal Streaming Kernel:** Import streaming functions from \`@ranu/ai\` and \`createCustomAI\` from \`@ranu/ai-custom\`.
- **Environment Variables:** \`CUSTOM_AI_ENDPOINT\` (e.g. \`http://localhost:11434\`), \`CUSTOM_AI_KEY\` (optional), \`CUSTOM_AI_MODEL\` (e.g. \`llama3\`).
- **Enterprise / Offline:** Supports self-hosted vLLM, Ollama, LocalAI, or private gateway endpoints.
- **API Route Pattern (\`app/routes/api.ai.ts\`):**
\`\`\`typescript
import { streamAI } from '@ranu/ai';
import { createCustomAI } from '@ranu/ai-custom';

const customAI = createCustomAI({
  baseURL: process.env.CUSTOM_AI_ENDPOINT || 'http://localhost:11434',
  apiKey: process.env.CUSTOM_AI_KEY,
});

export async function POST(request: Request): Promise<Response> {
  const { prompt, messages, model } = await request.json();
  return streamAI({
    model: customAI(model || process.env.CUSTOM_AI_MODEL || 'llama3'),
    prompt,
    messages,
    signal: request.signal,
  });
}
\`\`\``;
  }

  return `# Ranu.js Project Rules for Cursor AI

## Identity & Role
You are an expert full-stack TypeScript engineer building on **Ranu.js** (v0.2.0), an AI-native web framework built on React 19 Concurrent Streaming SSR and W3C Web Fetch standards.

## 1. React 19 Streaming SSR Invariants
- **Server Components Default:** All components in \`app/\` and \`app/routes/\` are React Server Components by default. Keep database queries, credentials, and server logic in Server Components or API routes.
- **Client Components ('use client'):** Add \`'use client';\` as the exact first line of a file ONLY when the component requires React client hooks (\`useState\`, \`useEffect\`, \`useCallback\`, \`useContext\`, \`useRef\`) or DOM event listeners (\`onClick\`, \`onChange\`, \`onSubmit\`).
- **No Synthetic Events:** Use standard React 19 event handlers. Do not import legacy React event wrappers.
- **Props Serialization Boundary:** Only pass JSON-serializable primitives (strings, numbers, booleans, null), plain objects, and arrays across the Server-to-Client JSX boundary. NEVER pass functions, callbacks, Promises, class instances, or Date objects across boundaries.
- **Browser API Guard:** Never access \`window\`, \`document\`, \`localStorage\`, or \`navigator\` during SSR. If needed in client components, access them inside \`useEffect\` or guard with \`typeof window !== 'undefined'\`.

## 2. W3C Web Standards Fetch Architecture
- **Web Primitives:** Route handlers receive standard WHATWG \`Request\` and must return standard WHATWG \`Response\` or \`ReadableStream\`. Never use Express-like \`(req, res)\` or proprietary framework wrappers.
- **API Routes:** Placed in \`app/routes/**/route.ts\` or \`app/api/**/route.ts\`. Export named HTTP methods:
\`\`\`typescript
export async function GET(request: Request): Promise<Response> {
  return Response.json({ status: 'ok' });
}
export async function POST(request: Request): Promise<Response> {
  const body = await request.json();
  return Response.json({ received: body }, { status: 201 });
}
\`\`\`
- **Read-Only Headers:** Request headers are immutable. Use \`request.headers.get('name')\`.

## 3. Zero-Leak Security Boundaries
- **Server Secret Isolation:** Private credentials (e.g. database URLs, AI API keys, private tokens) must NEVER be referenced in client components.
- **Public Whitelist:** Only environment variables prefixed with \`RANU_PUBLIC_*\` may be accessed in client code (\`process.env.RANU_PUBLIC_*\` or \`import.meta.env.RANU_PUBLIC_*\`).
- **Forbidden Bypasses:** Do not use bracket notation (\`process['env']['KEY']\`) or destructured imports in client code. The Ranu compiler strictly blocks them with diagnostic \`RANU_BUILD_AI_KEY_CLIENT_LEAK\` or \`RANU_BUILD_ENV_LEAK\`.

## 4. Sub-Second CLI Verification Workflows
- **Sub-Second AST Boundary Check:** Run \`npx ranu check --format json\` to instantly validate routes and boundary invariants without starting a server.
- **Route Topology Inspection:** Run \`npx ranu describe --format compact\` to inspect application route structure (<200 tokens).
- **Auto-Fixing:** Run \`npx ranu fix\` to automatically remediate common boundary and lint errors.

${aiSection}
`;
}

/**
 * Generates AGENTS.md — universal guide for autonomous coding agents.
 */
export function generateAgentsMarkdown(options: AgentContextOptions): string {
  const ai = options.aiEngine ?? 'none';
  const pm = options.packageManager;

  let aiSection = '';
  if (ai === 'none') {
    aiSection = `## 5. Zero-AI Configuration
This application is configured as a **Zero-AI Traditional Web Application**.
- No AI packages (\`@ranu/ai\`) or external inference endpoints are configured.
- Do NOT generate AI streaming wrappers or hallucinate AI dependencies.
- Build standard full-stack web applications using server-rendered React 19 components and standard HTTP API routes.`;
  } else if (ai === 'gemini') {
    aiSection = `## 5. AI Engine: Google Gemini (@ranu/ai-gemini)
- **Dependencies:** \`@ranu/ai\`, \`@ranu/ai-gemini\`
- **Environment:** \`GEMINI_API_KEY\` (defined in \`.env\`, accessed server-side only).
- **Streaming Endpoint:** \`app/routes/api.ai.ts\`
- **Kernel Function:** \`streamAI({ model: gemini('gemini-1.5-pro'), prompt, messages, signal })\`
- **Streaming Response:** Returns standard WHATWG \`Response\` with SSE stream.
- **Client Consumption:** Consume stream using standard \`fetch()\` and \`ReadableStreamDefaultReader\`.`;
  } else if (ai === 'groq') {
    aiSection = `## 5. AI Engine: Groq LPU (@ranu/ai-groq)
- **Dependencies:** \`@ranu/ai\`, \`@ranu/ai-groq\`
- **Environment:** \`GROQ_API_KEY\` (defined in \`.env\`, accessed server-side only).
- **Streaming Endpoint:** \`app/routes/api.ai.ts\`
- **Kernel Function:** \`streamAI({ model: groq('llama-3.3-70b-versatile'), prompt, messages, signal })\`
- **Characteristics:** Sub-10ms ultra-fast inference streaming.`;
  } else if (ai === 'claude') {
    aiSection = `## 5. AI Engine: Anthropic Claude (@ranu/ai-claude)
- **Dependencies:** \`@ranu/ai\`, \`@ranu/ai-claude\`
- **Environment:** \`ANTHROPIC_API_KEY\` (defined in \`.env\`, accessed server-side only).
- **Streaming Endpoint:** \`app/routes/api.ai.ts\`
- **Kernel Function:** \`streamAI({ model: claude('claude-3-5-sonnet-20241022'), prompt, messages, signal })\`
- **Characteristics:** Tool-use and structured reasoning capabilities.`;
  } else if (ai === 'openai') {
    aiSection = `## 5. AI Engine: OpenAI (@ranu/ai-openai)
- **Dependencies:** \`@ranu/ai\`, \`@ranu/ai-openai\`
- **Environment:** \`OPENAI_API_KEY\` (defined in \`.env\`, accessed server-side only).
- **Streaming Endpoint:** \`app/routes/api.ai.ts\`
- **Kernel Function:** \`streamAI({ model: openai('gpt-4o'), prompt, messages, signal })\`
- **Characteristics:** Structured schemas and general inference.`;
  } else if (ai === 'custom') {
    aiSection = `## 5. AI Engine: Custom / Local Ollama (@ranu/ai-custom)
- **Dependencies:** \`@ranu/ai\`, \`@ranu/ai-custom\`
- **Environment:** \`CUSTOM_AI_ENDPOINT\` (\`http://localhost:11434\`), \`CUSTOM_AI_KEY\`, \`CUSTOM_AI_MODEL\` (\`llama3\`).
- **Streaming Endpoint:** \`app/routes/api.ai.ts\`
- **Kernel Function:** \`streamAI({ model: customAI(model), prompt, messages, signal })\`
- **Characteristics:** Self-hosted local inference with 0 data exfiltration.`;
  }

  return `# AGENTS.md — Universal Agent Operating Guide for ${options.projectName}

Welcome! This repository is built on **Ranu.js (v0.2.0)**, an AI-native full-stack TypeScript framework featuring React 19 Concurrent Streaming SSR and W3C Web Fetch standards.

## 1. Repository Topology & Key Locations
- \`app/layout.tsx\` — Root HTML document layout.
- \`app/page.tsx\` — Home page component (Server Component).
- \`app/routes/\` — Nested filesystem routes.
  - \`page.tsx\` — Route page component.
  - \`route.ts\` — Standard Web API route handler.
  - \`layout.tsx\` — Nested layout wrapper.
  - \`loading.tsx\` — React Suspense fallback.
  - \`error.tsx\` — Route error boundary.
- \`ranu.config.ts\` — Ranu framework configuration (\`defineConfig\`).
- \`public/\` — Static assets served at root (\`robots.txt\`, \`llms.txt\`).
- \`.ranu/AGENT_GUIDE.md\` — Deep framework manual and live route manifest.

## 2. Agent Discovery Protocol (Token Economy)
⚡ **CRITICAL RULE:** Do NOT execute recursive filesystem searches to discover routes.
- **Run Introspection:** \`npx ranu describe --format json\`
  - Emits the complete application route graph, HTTP methods, and render modes in one fast call.
  - Consumes <200 tokens instead of thousands of tokens scanning directories.

## 3. Fast Invariant Validation Protocol
⚡ **CRITICAL RULE:** Do NOT spin up background dev servers to verify syntax or types.
- **Run Sub-Second AST Check:** \`npx ranu check --format json\`
  - Checks route signatures, client/server boundary directives, non-serializable props, and environment secret leaks in <50ms.
- **Run Typecheck:** \`npx tsc --noEmit\`
- **Run Auto-Fix:** \`npx ranu fix\`
- **Run Test Suite:** \`${pm} test\` (if test suites configured).

## 4. Architectural Invariants & Guardrails
1. **Server Components Default:**
   All components are React Server Components unless marked with \`'use client';\` on line 1.
2. **Client Component Discipline:**
   Use \`'use client';\` ONLY when browser hooks (\`useState\`, \`useEffect\`) or event listeners (\`onClick\`) are required.
3. **Props Serialization:**
   Only JSON-serializable data may pass from Server to Client components. Never pass functions, callbacks, Promises, or class instances as JSX props.
4. **Zero Client Secret Leaks:**
   Never reference private credentials in client components. Only variables prefixed with \`RANU_PUBLIC_*\` are exposed to client code.
5. **W3C Standard Web Primitives:**
   Always use standard \`Request\`, \`Response\`, \`Headers\`, and \`ReadableStream\`.

${aiSection}
`;
}

/**
 * Generates CLAUDE.md for Anthropic Claude developer workflows.
 */
export function generateClaudeMarkdown(options: AgentContextOptions): string {
  const ai = options.aiEngine ?? 'none';
  const pm = options.packageManager;
  const devCmd = getRunCommand(pm, 'dev');
  const buildCmd = getRunCommand(pm, 'build');
  const startCmd = getRunCommand(pm, 'start');
  const testCmd = getRunCommand(pm, 'test');

  let aiSection = '';
  if (ai === 'none') {
    aiSection = `## AI Engine Architecture
- **Mode:** Zero AI / Traditional Web App.
- **Constraints:** No AI dependencies installed. Do not import \`@ranu/ai\`. Build standard full-stack React 19 pages and API routes.`;
  } else if (ai === 'gemini') {
    aiSection = `## AI Engine: Google Gemini
- **Dependencies:** \`@ranu/ai\`, \`@ranu/ai-gemini\`
- **API Key:** Set \`GEMINI_API_KEY\` in \`.env\`
- **Streaming Route:** \`app/routes/api.ai.ts\`
- **Import:** \`import { streamAI } from '@ranu/ai'; import { gemini } from '@ranu/ai-gemini';\`
- **Default Model:** \`gemini-1.5-pro\``;
  } else if (ai === 'groq') {
    aiSection = `## AI Engine: Groq LPU
- **Dependencies:** \`@ranu/ai\`, \`@ranu/ai-groq\`
- **API Key:** Set \`GROQ_API_KEY\` in \`.env\`
- **Streaming Route:** \`app/routes/api.ai.ts\`
- **Import:** \`import { streamAI } from '@ranu/ai'; import { groq } from '@ranu/ai-groq';\`
- **Default Model:** \`llama-3.3-70b-versatile\``;
  } else if (ai === 'claude') {
    aiSection = `## AI Engine: Anthropic Claude
- **Dependencies:** \`@ranu/ai\`, \`@ranu/ai-claude\`
- **API Key:** Set \`ANTHROPIC_API_KEY\` in \`.env\`
- **Streaming Route:** \`app/routes/api.ai.ts\`
- **Import:** \`import { streamAI } from '@ranu/ai'; import { claude } from '@ranu/ai-claude';\`
- **Default Model:** \`claude-3-5-sonnet-20241022\``;
  } else if (ai === 'openai') {
    aiSection = `## AI Engine: OpenAI
- **Dependencies:** \`@ranu/ai\`, \`@ranu/ai-openai\`
- **API Key:** Set \`OPENAI_API_KEY\` in \`.env\`
- **Streaming Route:** \`app/routes/api.ai.ts\`
- **Import:** \`import { streamAI } from '@ranu/ai'; import { openai } from '@ranu/ai-openai';\`
- **Default Model:** \`gpt-4o\``;
  } else if (ai === 'custom') {
    aiSection = `## AI Engine: Custom / Local Ollama
- **Dependencies:** \`@ranu/ai\`, \`@ranu/ai-custom\`
- **Configuration:** Set \`CUSTOM_AI_ENDPOINT\` (e.g. \`http://localhost:11434\`), \`CUSTOM_AI_KEY\`, and \`CUSTOM_AI_MODEL\` in \`.env\`
- **Streaming Route:** \`app/routes/api.ai.ts\`
- **Import:** \`import { streamAI } from '@ranu/ai'; import { createCustomAI } from '@ranu/ai-custom';\``;
  }

  return `# CLAUDE.md — Anthropic Claude Developer Guide for ${options.projectName}

## Development Commands
- Start dev server: \`${devCmd}\`
- Build production bundle: \`${buildCmd}\`
- Start production server: \`${startCmd}\`
- Validate invariants & routes: \`npx ranu check --format json\`
- Compact route inspection: \`npx ranu describe --format compact\`
- Auto-fix issues: \`npx ranu fix\`
- Typecheck: \`npx tsc --noEmit\`
${options.tests ? `- Run tests: \`${testCmd}\`\n` : ''}
## Architecture Invariants
- **Framework:** Ranu.js with React 19 Streaming SSR and W3C Web Fetch standards.
- **Server Components:** Default for all components in \`app/\`.
- **Client Components:** Prepend \`'use client';\` on line 1 for components using hooks or DOM events.
- **Props Boundaries:** Pass only JSON-serializable values (no functions, no promises, no class instances) across Server-to-Client JSX boundaries.
- **Environment Security:** Private secrets are server-only. Only \`RANU_PUBLIC_*\` variables are exposed to client bundles.
- **API Routes:** Placed in \`app/routes/**/route.ts\` using standard \`Request\` and \`Response\`.

${aiSection}
`;
}

/**
 * Generates .ranu/AGENT_GUIDE.md containing the in-framework manifest and manual.
 */
export function generateAgentGuide(options: AgentContextOptions): string {
  const ai = options.aiEngine ?? 'none';
  const routes: string[] = ['- **PAGE** `/` [server] -> `app/page.tsx`'];

  if (ai !== 'none') {
    routes.push('- **API** `/api/ai` -> `app/routes/api.ai.ts`');
  }
  if (options.template === 'api-routes') {
    routes.push('- **API** `/api/hello` -> `app/api/hello/route.ts`');
  } else if (options.template === 'saas') {
    routes.push('- **PAGE** `/dashboard` [server] -> `app/dashboard/page.tsx`');
    routes.push('- **API** `/api/auth/session` -> `app/api/auth/session/route.ts`');
  }

  let aiManifest = '';
  if (ai === 'none') {
    aiManifest = `## AI Engine Manifest: Zero AI
- **Status:** Inactive (Traditional Web App Mode)
- **Recommendation:** Do not install or import \`@ranu/ai\` unless explicitly requested by the user.`;
  } else {
    aiManifest = `## AI Engine Manifest: ${ai.toUpperCase()}
- **Status:** Active
- **Provider Driver:** \`@ranu/ai-${ai}\`
- **Streaming Helper:** \`streamAI\` from \`@ranu/ai\`
- **Route Endpoint:** \`app/routes/api.ai.ts\``;
  }

  return `# Ranu.js Project Architecture & AI Agent Guide

## Overview
This application is built on **Ranu.js**, an AI-native, TypeScript-first web framework pairing streaming React 19 SSR with deterministic standard Web APIs.

## Application Route Graph (${routes.length} route${routes.length === 1 ? '' : 's'})
${routes.join('\n')}

## Core Architectural Invariants for AI Coding Agents & Human Developers

1. **W3C Standard Web Primitives:**
   - Handlers receive standard WHATWG \`Request\` and must return standard \`Response\` or \`ReadableStream\`.
   - Never import proprietary framework wrappers or assume monkey-patched \`fetch\`.

2. **Component Boundaries:**
   - Server Components are the default. Client components must begin with \`'use client';\` on the very first line.
   - Never pass functions, closures, or non-plain class instances across JSX server-to-client boundaries.

3. **Environment Security:**
   - Client components can only access \`process.env.RANU_PUBLIC_*\` or \`import.meta.env.RANU_PUBLIC_*\`.
   - Private secrets (e.g. database credentials, API keys) must be accessed only in server components or \`route.ts\` handlers.

4. **Introspection & Validation:**
   - Run \`ranu check --format json\` for sub-second AST and boundary verification.
   - Run \`ranu describe --format compact\` to retrieve minified route metadata (<200 tokens).
   - Run \`ranu fix\` to automatically patch common diagnostic errors.

## Compiler Diagnostic Codes & Remediation

- **\`RANU_BUILD_ENV_LEAK\`**: A client component accessed a server-only environment variable.
  - *Remediation*: Prefix the variable with \`RANU_PUBLIC_\` or access it from a server component.
- **\`RANU_BUILD_NON_SERIALIZABLE_PROP\`**: Non-serializable prop passed to a client component.
  - *Remediation*: Pass serializable IDs or primitives; move closures into the client component.
- **\`RANU_BUILD_AI_KEY_CLIENT_LEAK\`**: AI API key detected in a client bundle.
  - *Remediation*: Move AI model execution to a server route handler (\`app/routes/api.ai.ts\`).

${aiManifest}
`;
}

/**
 * Generates the complete set of automated agent context files for a new Ranu project.
 */
export function generateAgentContextFiles(options: AgentContextOptions): Record<string, string> {
  const guide = generateAgentGuide(options);
  return {
    '.cursorrules': generateCursorRules(options),
    'AGENTS.md': generateAgentsMarkdown(options),
    'CLAUDE.md': generateClaudeMarkdown(options),
    '.ranu/AGENT_GUIDE.md': guide,
    'public/llms.txt': guide,
  };
}
