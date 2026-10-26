import fs from 'node:fs';
import path from 'node:path';
import type { RouteEntryInfo } from '../pipeline/stage-routes.js';

/**
 * Generates an up-to-date Markdown guide and llms.txt context document for AI coding agents.
 */
export function generateAgentGuideMarkdown(projectRoot: string, routes: RouteEntryInfo[]): string {
  const routeTable = routes.length > 0
    ? routes
        .map((r) => {
          const modeStr = r.kind === 'page' ? ` [${r.renderMode}]` : '';
          return `- **${r.kind.toUpperCase()}** \`${r.pathnameTemplate}\`${modeStr} -> \`${r.sourceFile}\``;
        })
        .join('\n')
    : '- *(No routes discovered)*';

  return `# Ranu.js Project Architecture & AI Agent Guide

## Overview
This application is built on **Ranu.js**, an AI-native, TypeScript-first web framework pairing streaming React 19 SSR with deterministic standard Web APIs.

## Application Route Graph (${routes.length} route${routes.length === 1 ? '' : 's'})
${routeTable}

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
`;
}

/**
 * Automatically synchronizes public/llms.txt and .ranu/AGENT_GUIDE.md with discovered routes.
 */
export function syncAgentContextGuide(projectRoot: string, routes: RouteEntryInfo[]): void {
  try {
    const publicDir = path.join(projectRoot, 'public');
    const ranuDir = path.join(projectRoot, '.ranu');

    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    if (!fs.existsSync(ranuDir)) {
      fs.mkdirSync(ranuDir, { recursive: true });
    }

    const content = generateAgentGuideMarkdown(projectRoot, routes);
    fs.writeFileSync(path.join(publicDir, 'llms.txt'), content, 'utf8');
    fs.writeFileSync(path.join(ranuDir, 'AGENT_GUIDE.md'), content, 'utf8');
  } catch {
    // Non-fatal if filesystem is restricted or read-only
  }
}
