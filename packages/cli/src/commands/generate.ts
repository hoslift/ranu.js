import fs from 'node:fs';
import path from 'node:path';
import type { ParsedCliArgs, CliLogger } from '../types.js';
import { resolveProjectContext } from '../context.js';

export interface GenerateResult {
  readonly success: boolean;
  readonly type: string;
  readonly target: string;
  readonly createdFiles: readonly string[];
  readonly error?: string;
}

/**
 * Normalizes a route pathname, ensuring it begins with a slash and contains no trailing slash.
 */
function normalizeRoutePath(input: string): string {
  let cleaned = input.trim();
  if (!cleaned.startsWith('/')) {
    cleaned = '/' + cleaned;
  }
  if (cleaned.length > 1 && cleaned.endsWith('/')) {
    cleaned = cleaned.slice(0, -1);
  }
  return cleaned;
}

/**
 * Converts a route path (e.g. /dashboard/analytics) to filesystem relative segments.
 */
function routePathToRelativeDir(routePath: string): string {
  const normalized = normalizeRoutePath(routePath);
  if (normalized === '/') {
    return '';
  }
  return normalized.slice(1).split('/').join(path.sep);
}

/**
 * Template for a server page component.
 */
function createPageRouteTemplate(routePath: string, isClient: boolean): string {
  const componentName = routePath === '/' ? 'HomePage' : routePath.split('/').filter(Boolean).map(s => s.replace(/[^a-zA-Z0-9]/g, '')).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('') + 'Page';

  const clientPragma = isClient ? "'use client';\n\n" : '';

  return `${clientPragma}import React from 'react';

export default function ${componentName}(): React.JSX.Element {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Route: ${routePath}</h1>
      <p>This is a canonical Ranu.js page component.</p>
    </main>
  );
}
`;
}

/**
 * Template for a type-safe standard W3C API route handler.
 */
function createApiRouteTemplate(routePath: string): string {
  return `import type { RouteHandlerContext } from '@ranu/core';

export async function GET(request: Request, context: RouteHandlerContext): Promise<Response> {
  return Response.json({
    status: 'ok',
    route: '${routePath}',
    timestamp: new Date().toISOString(),
  });
}

export async function POST(request: Request, context: RouteHandlerContext): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  return Response.json({
    status: 'created',
    route: '${routePath}',
    received: body,
  }, { status: 201 });
}
`;
}

/**
 * Template for a shared UI component.
 */
function createComponentTemplate(name: string, isClient: boolean): string {
  const clientPragma = isClient ? "'use client';\n\n" : '';

  return `${clientPragma}import React from 'react';

export interface ${name}Props {
  readonly title?: string;
  readonly children?: React.ReactNode;
}

export function ${name}({ title, children }: ${name}Props): React.JSX.Element {
  return (
    <div className="${name.toLowerCase()}-container">
      {title && <h3>{title}</h3>}
      {children}
    </div>
  );
}
`;
}

/**
 * Template for llms.txt and .ranu/AGENT_GUIDE.md
 */
function createAgentGuideContent(projectRoot: string): string {
  return `# Ranu.js Project Architecture & AI Agent Guide

## Overview
This project is built on **Ranu.js**, a TypeScript-first, high-performance web framework pairing a minimal deterministic runtime with streaming React 19 SSR and type-safe routing.

## Core Architectural Invariants for AI Agents & Developers

1. **W3C Web Standards:**
   - Always use standard Web Platform APIs: \`Request\`, \`Response\`, \`Headers\`, \`ReadableStream\`.
   - Never import proprietary framework wrappers or assume monkey-patched \`fetch\`.

2. **Server vs Client Component Isolation:**
   - Server Components are the default. Keep database queries, secret credentials, and server utilities in server components or \`route.ts\`.
   - Client components MUST include the \`'use client';\` directive at the very top line.
   - Non-serializable props (functions, class instances, Symbols) MUST NOT be passed across JSX server-to-client boundaries.

3. **Explicit HTTP Caching:**
   - Caching is never implicit. When caching is needed, set standard HTTP \`Cache-Control\` response headers.

4. **Fast Dry-Run Verification:**
   - Verify code syntax, routing validity, and boundary rules instantly using:
     \`\`\`bash
     ranu check --format json
     \`\`\`
   - Inspect the entire application route map in a single call using:
     \`\`\`bash
     ranu describe --format json
     \`\`\`

5. **File Conventions in \`/app\`:**
   - \`app/routes/**/page.tsx\`: Page component for a route.
   - \`app/routes/**/route.ts\`: API handler (\`GET\`, \`POST\`, \`PUT\`, \`DELETE\`).
   - \`app/routes/**/layout.tsx\`: Persistent layout wrapper.
   - \`app/routes/**/loading.tsx\`: Suspense fallback skeleton.
   - \`app/routes/**/error.tsx\`: Route error boundary.
`;
}

/**
 * Executes the `ranu generate` CLI command.
 */
export async function runGenerateCommand(args: ParsedCliArgs, logger: CliLogger): Promise<number> {
  const isJson = Boolean(args.json || args.format === 'json');

  try {
    const ctx = await resolveProjectContext(args, logger, 'development');
    const projectRoot = ctx.projectRoot;
    const subCommand = args.args[0]?.toLowerCase();
    const targetName = args.args[1];

    if (!subCommand) {
      const err = 'Usage: ranu generate <route|api|component|guide> [target] [--client]';
      if (isJson) {
        logger.json({ success: false, error: err });
      } else {
        logger.error(err);
      }
      return 1;
    }

    const isClient = Boolean(args.client);
    const createdFiles: string[] = [];

    if (subCommand === 'guide' || subCommand === 'context') {
      const guideContent = createAgentGuideContent(projectRoot);
      const publicDir = path.join(projectRoot, 'public');
      const ranuDir = path.join(projectRoot, '.ranu');

      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }
      if (!fs.existsSync(ranuDir)) {
        fs.mkdirSync(ranuDir, { recursive: true });
      }

      const llmsPath = path.join(publicDir, 'llms.txt');
      const agentGuidePath = path.join(ranuDir, 'AGENT_GUIDE.md');

      fs.writeFileSync(llmsPath, guideContent, 'utf-8');
      fs.writeFileSync(agentGuidePath, guideContent, 'utf-8');

      createdFiles.push(path.relative(projectRoot, llmsPath), path.relative(projectRoot, agentGuidePath));

      const res: GenerateResult = {
        success: true,
        type: 'guide',
        target: 'llms.txt & AGENT_GUIDE.md',
        createdFiles,
      };

      if (isJson) {
        logger.json(res);
      } else {
        logger.success('Generated AI Agent context guides:');
        for (const file of createdFiles) {
          logger.info(`  • ${file}`);
        }
      }
      return 0;
    }

    if (!targetName) {
      const err = `Missing target name for "ranu generate ${subCommand}".`;
      if (isJson) {
        logger.json({ success: false, error: err });
      } else {
        logger.error(err);
      }
      return 1;
    }

    if (subCommand === 'route') {
      const routePath = normalizeRoutePath(targetName);
      const relDir = routePathToRelativeDir(routePath);
      const targetDir = path.join(projectRoot, 'app', 'routes', relDir);
      const targetFile = path.join(targetDir, 'page.tsx');

      if (fs.existsSync(targetFile)) {
        throw new Error(`Route file already exists at ${path.relative(projectRoot, targetFile)}`);
      }

      fs.mkdirSync(targetDir, { recursive: true });
      const content = createPageRouteTemplate(routePath, isClient);
      fs.writeFileSync(targetFile, content, 'utf-8');
      createdFiles.push(path.relative(projectRoot, targetFile));

      const res: GenerateResult = {
        success: true,
        type: 'route',
        target: routePath,
        createdFiles,
      };

      if (isJson) {
        logger.json(res);
      } else {
        logger.success(`Generated route "${routePath}":`);
        for (const file of createdFiles) {
          logger.info(`  • ${file}`);
        }
      }
      return 0;
    }

    if (subCommand === 'api') {
      const routePath = normalizeRoutePath(targetName);
      const relDir = routePathToRelativeDir(routePath);
      const targetDir = path.join(projectRoot, 'app', 'routes', relDir);
      const targetFile = path.join(targetDir, 'route.ts');

      if (fs.existsSync(targetFile)) {
        throw new Error(`API route file already exists at ${path.relative(projectRoot, targetFile)}`);
      }

      fs.mkdirSync(targetDir, { recursive: true });
      const content = createApiRouteTemplate(routePath);
      fs.writeFileSync(targetFile, content, 'utf-8');
      createdFiles.push(path.relative(projectRoot, targetFile));

      const res: GenerateResult = {
        success: true,
        type: 'api',
        target: routePath,
        createdFiles,
      };

      if (isJson) {
        logger.json(res);
      } else {
        logger.success(`Generated API endpoint "${routePath}":`);
        for (const file of createdFiles) {
          logger.info(`  • ${file}`);
        }
      }
      return 0;
    }

    if (subCommand === 'component') {
      const componentName = targetName.charAt(0).toUpperCase() + targetName.slice(1).replace(/[^a-zA-Z0-9]/g, '');
      const targetDir = path.join(projectRoot, 'app', 'components');
      const targetFile = path.join(targetDir, `${componentName}.tsx`);

      if (fs.existsSync(targetFile)) {
        throw new Error(`Component file already exists at ${path.relative(projectRoot, targetFile)}`);
      }

      fs.mkdirSync(targetDir, { recursive: true });
      const content = createComponentTemplate(componentName, isClient);
      fs.writeFileSync(targetFile, content, 'utf-8');
      createdFiles.push(path.relative(projectRoot, targetFile));

      const res: GenerateResult = {
        success: true,
        type: 'component',
        target: componentName,
        createdFiles,
      };

      if (isJson) {
        logger.json(res);
      } else {
        logger.success(`Generated component "${componentName}":`);
        for (const file of createdFiles) {
          logger.info(`  • ${file}`);
        }
      }
      return 0;
    }

    throw new Error(`Unknown generator type "${subCommand}". Supported types: route, api, component, guide`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (isJson) {
      logger.json({ success: false, error: message });
    } else {
      logger.error(message);
    }
    return 1;
  }
}
