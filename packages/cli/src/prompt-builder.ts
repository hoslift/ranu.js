import fs from 'node:fs';
import path from 'node:path';
import { discoverProjectRoot } from './context.js';

export type PromptTarget = 'claude' | 'chatgpt' | 'gemini' | 'all';

export interface PromptBuilderOptions {
  readonly target?: PromptTarget | (string & {}) | undefined;
  readonly projectRoot?: string | undefined;
}

export interface DiscoveredProjectInfo {
  readonly name?: string | undefined;
  readonly version?: string | undefined;
  readonly dependencies: readonly string[];
  readonly routes: readonly string[];
  readonly hasRanuConfig: boolean;
}

/**
 * Discovers project metadata and route structure if inside a Ranu project.
 */
export function discoverProjectInfo(projectRoot: string): DiscoveredProjectInfo {
  let name: string | undefined;
  let version: string | undefined;
  const dependencies: string[] = [];
  const routes: string[] = [];
  let hasRanuConfig = false;

  const pkgPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
        name?: string;
        version?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      name = pkg.name;
      version = pkg.version;
      if (pkg.dependencies) {
        dependencies.push(...Object.keys(pkg.dependencies));
      }
      if (pkg.devDependencies) {
        dependencies.push(...Object.keys(pkg.devDependencies));
      }
    } catch {
      // Ignore parse failure
    }
  }

  for (const ext of ['ts', 'js', 'mjs', 'cjs']) {
    if (fs.existsSync(path.join(projectRoot, `ranu.config.${ext}`))) {
      hasRanuConfig = true;
      break;
    }
  }

  const appRoutesDir = path.join(projectRoot, 'app', 'routes');
  if (fs.existsSync(appRoutesDir)) {
    function scanDir(dir: string, base: string) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const res = path.join(dir, entry.name);
          const rel = path.join(base, entry.name).replace(/\\/g, '/');
          if (entry.isDirectory()) {
            scanDir(res, rel);
          } else if (/\.(tsx|jsx|ts|js)$/.test(entry.name)) {
            routes.push(`app/routes/${rel}`);
          }
        }
      } catch {
        // Ignore read errors
      }
    }
    scanDir(appRoutesDir, '');
  }

  return {
    name,
    version,
    dependencies,
    routes,
    hasRanuConfig,
  };
}

/**
 * Builds an authoritative, target-tailored Ranu.js architecture prompt for AI models.
 *
 * @param options - Target formatting and project root options
 * @returns Formatted architecture prompt string
 */
export async function buildArchitecturePrompt(options: PromptBuilderOptions = {}): Promise<string> {
  await Promise.resolve();
  const target = (options.target ?? 'all').toLowerCase().trim();
  const cwd = process.cwd();
  const rawRoot = options.projectRoot ? path.resolve(cwd, options.projectRoot) : discoverProjectRoot(cwd);
  const projectRoot = path.resolve(rawRoot);

  const info = fs.existsSync(projectRoot) ? discoverProjectInfo(projectRoot) : { dependencies: [], routes: [], hasRanuConfig: false };

  const projectContextText = [
    info.name ? `Project Name: ${info.name}` : undefined,
    info.version ? `Project Version: ${info.version}` : undefined,
    info.dependencies.length > 0 ? `Key Dependencies: ${info.dependencies.slice(0, 20).join(', ')}` : undefined,
    info.routes.length > 0 ? `Existing Routes:\n${info.routes.map((r) => `  - ${r}`).join('\n')}` : undefined,
  ]
    .filter(Boolean)
    .join('\n');

  if (target === 'claude') {
    return `<ranu_architecture_guide>
  <system_instructions>
    You are an expert full-stack TypeScript engineer building applications on Ranu.js, a modern web framework based on React 19 Streaming SSR and W3C Web Standards.
  </system_instructions>

  <framework_invariants>
    1. React 19 Streaming SSR: Uses React 19 Suspense streaming with out-of-order HTML chunking.
    2. W3C Web Fetch Standards: Use standard Request, Response, Headers, and ReadableStream. Never use proprietary runtime wrappers.
    3. Server Components by Default: All components in app/routes/ are React Server Components by default.
    4. Client Directive: Any component utilizing client-side hooks (useState, useEffect, useRef) or browser DOM APIs MUST begin with 'use client'; on line 1.
    5. Security Boundaries: Never access server secrets (process.env.SECRET) in client components. Only environment variables prefixed with RANU_PUBLIC_ are exposed to the client.
    6. Prop Serialization: Only JSON-serializable props (strings, numbers, booleans, plain objects, arrays) may be passed across server-to-client JSX boundaries. Never pass functions, Promises, or class instances.
    7. Universal AI Ecosystem: Import AI streaming and structured generation from 'ranu/ai' and model drivers from 'ranu/ai/gemini', 'ranu/ai/groq', 'ranu/ai/claude', 'ranu/ai/openai', 'ranu/ai/custom'.
    8. Fast Invariant Validation: Verify routing, syntax, and boundary rules instantly via 'ranu check --format json'.
  </framework_invariants>

  <routing_conventions>
    - app/routes/**/page.tsx: Page React component
    - app/routes/**/route.ts: Standard W3C API route handler (export async function GET, POST, PUT, DELETE)
    - app/routes/**/layout.tsx: Nested layout wrapper component
    - app/routes/**/loading.tsx: React Suspense loading fallback
    - app/routes/**/error.tsx: React Error Boundary component
  </routing_conventions>

  <code_examples>
    <example name="API Route Handler">
\`\`\`typescript
import type { RouteHandlerContext } from '@ranu/core';

export async function GET(request: Request, context: RouteHandlerContext): Promise<Response> {
  return Response.json({ status: 'ok', timestamp: Date.now() });
}
\`\`\`
    </example>
    <example name="Universal AI Streaming Route">
\`\`\`typescript
import { streamAI } from 'ranu/ai';
import { groq } from 'ranu/ai/groq';

export async function POST(request: Request): Promise<Response> {
  const { prompt } = await request.json();
  const result = await streamAI({
    model: groq('llama-3.3-70b-versatile'),
    prompt,
  });
  return result.toDataStreamResponse();
}
\`\`\`
    </example>
  </code_examples>
${
  projectContextText
    ? `\n  <project_context>\n${projectContextText
        .split('\n')
        .map((line) => `    ${line}`)
        .join('\n')}\n  </project_context>`
    : ''
}
</ranu_architecture_guide>`.trim();
  }

  if (target === 'chatgpt') {
    return `# Ranu.js Architectural Context & Directives

## System Directives
You are an expert full-stack developer specializing in **Ranu.js**, a high-performance web framework built with React 19 and Web Standards.

## Core Framework Invariants
- **React 19 Streaming SSR**: Native out-of-order Suspense streaming with sub-millisecond TTFB.
- **W3C Web Standards**: Always use standard Web Platform APIs (\`Request\`, \`Response\`, \`Headers\`, \`ReadableStream\`). Never use proprietary server wrappers.
- **Server Components Default**: All components are React Server Components by default. Keep database queries, credentials, and server logic on the server.
- **Client Directives**: Add \`'use client';\` as the very first line of components that use client hooks (\`useState\`, \`useEffect\`) or browser event handlers.
- **Security Boundaries**: Never reference private server environment variables in client code. Only \`RANU_PUBLIC_*\` variables are exposed to the browser.
- **Serializable Boundaries**: Only JSON-serializable props can pass across server-to-client JSX boundaries.
- **Universal AI Ecosystem**: Native subpath imports via \`ranu/ai\` (\`streamAI\`, \`generateObject\`), \`ranu/ai/gemini\`, \`ranu/ai/groq\`, \`ranu/ai/claude\`, \`ranu/ai/openai\`, and \`ranu/ai/custom\`.
- **Sub-Second Verification**: Run \`ranu check --format json\` to instantly validate AST boundaries and route structures.

## File & Routing Conventions
- \`app/routes/**/page.tsx\`: Page component
- \`app/routes/**/route.ts\`: API handler (\`GET\`, \`POST\`, \`PUT\`, \`DELETE\`)
- \`app/routes/**/layout.tsx\`: Layout component wrapper
- \`app/routes/**/loading.tsx\`: Suspense loading fallback
- \`app/routes/**/error.tsx\`: Route error boundary

${projectContextText ? `## Current Project Context\n${projectContextText}` : ''}`.trim();
  }

  if (target === 'gemini') {
    return `# Ranu.js Architecture Directives for Google Gemini

## Directives:
- Role: Act as an authoritative Ranu.js expert software architect.
- Principles: Adhere strictly to React 19 Streaming SSR, W3C Web Fetch standards, and explicit boundaries.

## Invariants:
- Default to React Server Components for maximum performance and security.
- Prepend \`'use client';\` on line 1 only when React client hooks or browser events are required.
- Prohibit leaking server secrets into client bundles (only \`RANU_PUBLIC_*\` is public).
- Only pass JSON-serializable props across server-to-client JSX boundaries.
- Universal AI streaming and structured output using \`ranu/ai\` (\`streamAI\`, \`generateObject\`).
- Validate code using \`ranu check --format json\`.

## Project Routing & Conventions:
- \`app/routes/**/page.tsx\` -> Route page component
- \`app/routes/**/route.ts\` -> Standard Web API route handler
- \`app/routes/**/layout.tsx\` -> Nested layout wrapper
- \`app/routes/**/loading.tsx\` -> Suspense loading fallback
- \`app/routes/**/error.tsx\` -> Error boundary

${projectContextText ? `## Project Context:\n${projectContextText}` : ''}`.trim();
  }

  // Target 'all' or default
  return `# Ranu.js Universal Architecture & AI Prompt Guide

## Overview
Ranu.js is a high-performance full-stack web framework pairing React 19 Concurrent Streaming SSR with standard W3C Web Platform APIs.

## Core Architectural Invariants
1. W3C Web Standards: Always use standard \`Request\`, \`Response\`, \`Headers\`, and \`ReadableStream\`.
2. React 19 Server Components Default: Components are server-side by default.
3. Client Directive: Prepend \`'use client';\` on line 1 for components using hooks (\`useState\`, \`useEffect\`) or browser APIs.
4. Security Invariants: Never reference private server environment variables in client code. Only \`RANU_PUBLIC_*\` variables are exposed to browsers.
5. Props Serialization: Only JSON-serializable props can pass across server-to-client JSX boundaries.
6. Universal AI Ecosystem: Native imports via \`ranu/ai\`, \`ranu/ai/gemini\`, \`ranu/ai/groq\`, \`ranu/ai/claude\`, \`ranu/ai/openai\`, \`ranu/ai/custom\`.
7. Sub-Second Validation: Use \`ranu check --format json\` to validate routes and boundaries without running a server.

## Directory & Routing Conventions
- \`app/routes/**/page.tsx\`: Page component
- \`app/routes/**/route.ts\`: Web API route handler (\`GET\`, \`POST\`, \`PUT\`, \`DELETE\`)
- \`app/routes/**/layout.tsx\`: Persistent layout wrapper
- \`app/routes/**/loading.tsx\`: Suspense loading fallback
- \`app/routes/**/error.tsx\`: Route error boundary

${projectContextText ? `## Project Context\n${projectContextText}` : ''}`.trim();
}
