# Edge Runtimes & Custom Deployment Adapters

Modern edge compute platforms—such as Cloudflare Workers, Fastly Compute, and Deno Deploy—execute server code on distributed V8 isolates located physically close to end users.

Because **Ranu.js** is built natively on W3C Web Standards (`Request`, `Response`, `Headers`, and `ReadableStream`), its request-handling pipeline maps cleanly onto any standard Edge runtime environment.

This guide explains the Edge runtime architecture in Ranu.js, how to configure custom deployment adapters using the `RanuDeploymentAdapter` contract, and how to adapt your application for platforms like Cloudflare Workers.

---

## 1. Web Standards Architecture at the Edge

Traditional Node.js frameworks require heavyweight emulation shims (`node:http`, `IncomingMessage`, `ServerResponse`) to run on edge isolates.

In contrast, Ranu.js handlers natively accept standard W3C `Request` objects and return standard W3C `Response` objects:

```
[Edge Ingress / CDN]
        │
   W3C Request
        ▼
[Edge Middleware (middleware.ts)]
        │
   W3C Request + Headers
        ▼
[Ranu Server Pipeline / SSR Stream]
        │
   W3C Response (with ReadableStream)
        ▼
[Client Browser]
```

This architecture provides:

- **Zero Cold-Start Lag:** Minimal memory footprints on V8 isolates.
- **Streaming by Default:** Chunked HTML streaming via `ReadableStream`.
- **Zero Vendor Lock-in:** Portable server logic across edge and container environments.

---

## 2. The `RanuDeploymentAdapter` Contract

Ranu.js features a pluggable adapter contract defined in `@ranujs/core`. Any deployment target can be integrated by implementing the `RanuDeploymentAdapter` interface:

```typescript
// @ranujs/core deployment contract
export interface DeploymentCapabilities {
  readonly runtime: 'node' | 'edge' | 'static';
  readonly ssr: boolean;
  readonly apiRoutes: boolean;
  readonly middleware: boolean;
  readonly streaming: boolean;
  readonly staticFiles: boolean;
  readonly runtimeEnvironment: boolean;
  readonly writableFilesystem: 'none' | 'temporary' | 'persistent';
  readonly longLivedProcess: boolean;
}

export interface DeploymentAdapterContext {
  readonly projectRoot: string;
  readonly buildDir?: string;
  readonly outputDir?: string;
  readonly logger?: any;
}

export interface DeploymentResult {
  readonly success: boolean;
  readonly target: string;
  readonly outputDirectory: string;
  readonly files?: readonly string[];
  readonly warnings?: readonly string[];
}

export interface RanuDeploymentAdapter {
  readonly name: string;
  readonly apiVersion: number;
  readonly capabilities: DeploymentCapabilities;
  adapt(context: DeploymentAdapterContext): Promise<DeploymentResult>;
}
```

---

## 3. Implementing a Custom Edge Adapter

You can create a custom adapter in your project or as a reusable npm package:

```typescript
// adapters/custom-edge/index.ts
import type { RanuDeploymentAdapter, DeploymentAdapterContext, DeploymentResult } from '@ranujs/core';
import path from 'node:path';
import fs from 'node:fs/promises';

export function customEdgeAdapter(): RanuDeploymentAdapter {
  return {
    name: 'custom-edge',
    apiVersion: 1,
    capabilities: {
      runtime: 'edge',
      ssr: true,
      apiRoutes: true,
      middleware: true,
      streaming: true,
      staticFiles: true,
      runtimeEnvironment: true,
      writableFilesystem: 'none',
      longLivedProcess: false,
    },
    async adapt(ctx: DeploymentAdapterContext): Promise<DeploymentResult> {
      const outputDir = ctx.outputDir ?? path.join(ctx.projectRoot, '.edge-output');
      const buildDir = ctx.buildDir ?? path.join(ctx.projectRoot, '.ranu/build');

      await fs.mkdir(outputDir, { recursive: true });

      // Stage compiled application artifacts into target output directory
      await fs.cp(buildDir, outputDir, { recursive: true });

      return {
        success: true,
        target: 'custom-edge',
        outputDirectory: outputDir,
      };
    },
  };
}
```

### Standard Edge Runtime Handler Pattern

To execute the application at the edge, initialize the production runtime via `@ranujs/core/server` and route incoming W3C requests through its `handle` method:

```typescript
// entry-edge.ts
import { createProductionRuntime } from '@ranujs/core/server';

// Initialize the production runtime using compiled build artifacts
const runtime = await createProductionRuntime({
  buildDir: './.edge-output',
});

export default {
  async fetch(request: Request): Promise<Response> {
    // Pure standard dispatch: W3C Request in, W3C Response out
    return runtime.handle(request);
  },
};
```

### Registering in `ranu.config.ts`

```typescript
// ranu.config.ts
import { defineConfig } from '@ranujs/core/config';
import { customEdgeAdapter } from './adapters/custom-edge';

export default defineConfig({
  deployment: {
    adapter: customEdgeAdapter(),
  },
});
```

Execute the adapter build step using the CLI:

```bash
pnpm ranu build
pnpm ranu deploy
```

---

## 4. Cloudflare Workers Worker Pattern

When packaging Ranu.js for Cloudflare Workers (via Wrangler), create a standard worker entrypoint that routes incoming `fetch` events through the production runtime:

```typescript
// worker.ts (Cloudflare Workers Entrypoint)
import { createProductionRuntime } from '@ranujs/core/server';

let runtimePromise: Promise<ReturnType<typeof createProductionRuntime>> | null = null;

function getRuntime() {
  if (!runtimePromise) {
    runtimePromise = createProductionRuntime({
      buildDir: '.ranu/build',
    });
  }
  return runtimePromise;
}

export interface Env {
  ASSETS: Fetcher; // Cloudflare static asset binding
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 1. Attempt static asset serving first
    try {
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status !== 404) {
        return assetResponse;
      }
    } catch {
      // Pass through to SSR handler if asset not found
    }

    // 2. Dispatch to Ranu.js production runtime
    const runtime = await getRuntime();
    return runtime.handle(request);
  },
};
```

Deploy using Wrangler:

```bash
pnpm wrangler deploy
```

---

## 5. Ecosystem & Roadmap Status

| Platform / Adapter     |    Status     | Package                                                               |
| :--------------------- | :-----------: | :-------------------------------------------------------------------- |
| **Vercel Adapter**     | **Available** | `@ranujs/adapter-vercel` (Official)                                   |
| **Custom Adapters**    | **Available** | `RanuDeploymentAdapter` contract via `ranu.config.ts`                 |
| **Cloudflare Adapter** |  **Roadmap**  | Planned for official release in Phase 8 (Ecosystem & Partner Plugins) |
| **AWS Lambda Adapter** |  **Roadmap**  | Planned for official release in Phase 8                               |
