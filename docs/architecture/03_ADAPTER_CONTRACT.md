# Deployment Adapter Contract & Platform Transformation

**Ranu.js** separates application compilation from platform deployment using a formal **Two-Phase Deployment Adapter Architecture** (`RanuDeploymentAdapter`) exported from `@ranu/core`.

This abstraction ensures that the core framework compiler remains completely platform-agnostic while enabling specialized adapters to transform production build outputs for any hosting target—including serverless runtimes (Vercel, AWS Lambda), edge V8 isolates (Cloudflare Workers), containerized daemons (Docker, Kubernetes), and modern JavaScript engines (Bun, Deno).

---

## 1. Architectural Philosophy: The Zero Re-Compilation Invariant

Traditional full-stack frameworks frequently couple build pipelines to specific cloud hosting providers or re-bundle user source code inside proprietary deployment plugins. This introduces major failure modes:

- **Build Drift:** Differences in transpilation, minification, and path resolution between local development and cloud targets.
- **Vendor Runtime Coupling:** Proprietary vendor SDKs leaking into framework kernels and application business logic.
- **Inadvertent Secret Exposure:** Server-side secrets bundled into client code due to opaque compiler bundling steps.

Ranu.js solves these issues through the **Zero Re-Compilation Invariant**:

> **The Zero Re-Compilation Invariant:**  
> A deployment adapter **MUST NEVER** re-compile, re-bundle, or re-parse user application source code (`.tsx`, `.ts`, `.jsx`, `.js`). Adapters operate strictly as downstream manifest consumers and output packagers, transforming pre-compiled artifacts in `.ranu/build/` into target platform structures.

Application code is compiled exactly once by `@ranu/build` into platform-agnostic production artifacts:

1. Dual-pipeline compilation segregates client components from server graphs.
2. Abstract Syntax Tree (AST) validation strips private server secrets and enforces `server-only` module boundaries.
3. Machine-readable JSON manifests (`build.json`, `manifest/routes.json`, `manifest/server.json`, `manifest/static.json`) describe the entire route topology.

Deployment adapters ingest these manifests and emit platform-specific configurations, entrypoint wrappers, and static directories.

---

## 2. The Two-Phase Lifecycle Model

The deployment lifecycle comprises two strictly decoupled phases:

```
[Phase 1: Build & Adapt Phase]
  Application Source (.tsx, .ts)
          │
          ▼
   pnpm ranu build (@ranu/build)
          │
          ├──► Dual-Pipeline Compilation (Client vs Server)
          ├──► AST Secret Stripping (RANU_PUBLIC_* Whitelist)
          ├──► Route Manifest Generation (.ranu/build/manifest/*.json)
          ▼
    .ranu/build/ (Platform-Agnostic Production Artifacts)
          │
          ▼
   pnpm ranu deploy (@ranu/cli -> adapter.adapt())
          │
          ├──► Consumes .ranu/build/ and JSON Manifests (NO RE-COMPILATION)
          ├──► Segregates Client Assets (.ranu/build/static/)
          ├──► Generates Target Entrypoint & Configurations
          ▼
   Platform Output Directory (e.g., .vercel/output/, dist-cloudflare/, dist-node/)

[Phase 2: Runtime Execution Phase]
   Incoming HTTP Request (Cloud Ingress / Reverse Proxy)
          │
          ▼
   Adapter Runtime Bridge (e.g., _worker.js, index.mjs, server.mjs)
          │
          ├──► Converts Platform Ingress to W3C Request
          ├──► Injects Runtime Context (ctx.waitUntil, Env Bindings)
          ▼
   RanuServerRuntime.handle(webRequest) (@ranu/runtime)
          │
          ├──► Middleware Pipeline Execution (Depth Cap = 5)
          ├──► Deterministic Route Matcher (Static > Dynamic > Catch-all)
          ├──► React 19 Streaming SSR (renderToReadableStream)
          ▼
   W3C Response with Chunked ReadableStream<Uint8Array>
          │
          ▼
   Adapter Writes Response to Transport (with Socket Backpressure Drainage)
```

### Phase 1: Build & Adapt Phase (`adapter.adapt()`)

Executed at build time via `ranu deploy` or during CI/CD:

1. **Manifest Validation:** Reads `.ranu/build/build.json` to verify build integrity, runtime compatibility (`buildDescriptor.runtime === 'node'`), and schema versions.
2. **Path Containment:** Verifies that target output directories do not escape project root boundaries and prevents symlink traversal attacks.
3. **Static Segregation:** Copies hashed client bundles (`.ranu/build/static/assets/`), pre-rendered static HTML (`.ranu/build/static/pages/`), and public files (`public/`) to the target CDN static directory.
4. **Platform Configuration:** Generates target metadata (e.g. Vercel Build Output API v3 `config.json`, Cloudflare `wrangler.toml`, or Netlify redirects).
5. **Runtime Packaging:** Generates a lightweight platform entrypoint script that imports `@ranu/runtime` or `@ranu/runtime-node` and packages required server chunks without touching user source files.

### Phase 2: Runtime Execution Phase (`RanuServerRuntime.handle()`)

Executed on every live HTTP request in production:

1. **Request Ingress Normalization:** The adapter translates the platform-specific request representation (Node `IncomingMessage`, AWS Lambda event, or Cloudflare Worker `Request`) into a standard W3C `Request` object.
2. **Context Enrichment:** Creates a `RanuRequestContext` containing request identifiers, URL parameters, request cookies, and platform extension hooks (such as `ctx.waitUntil`).
3. **Kernel Dispatch:** Invokes `await runtime.handle(webRequest)`. The runtime dispatches middleware, matches routes deterministically, and invokes either API Route Handlers or React 19 Streaming SSR (`renderToReadableStream`).
4. **Streaming Backpressure Transport:** The adapter streams the returned W3C `Response` body (`ReadableStream<Uint8Array>`) to the client socket, actively handling TCP backpressure and cancellation abort signals.

---

## 3. Core TypeScript Interface Contracts

The foundational adapter contracts are defined in `@ranu/core` and consumed across `@ranu/runtime`, `@ranu/cli`, and all deployment adapters.

### 3.1 `RanuDeploymentAdapter`

The top-level adapter interface implemented by all deployment targets:

```typescript
import type { DeploymentCapabilities } from './capabilities.js';
import type { DeploymentAdapterContext } from './context.js';
import type { DeploymentResult } from './result.js';

/**
 * Universal Deployment Adapter Contract implemented by all Ranu.js adapters.
 */
export interface RanuDeploymentAdapter {
  /** Unique identifier of the adapter (e.g. 'vercel', 'cloudflare-workers', 'node-standalone') */
  readonly name: string;

  /** API specification version (current specification: 1) */
  readonly apiVersion: number;

  /** Declared capabilities and operational guarantees of the hosting target */
  readonly capabilities: DeploymentCapabilities;

  /**
   * Phase 1 build hook.
   * Transforms .ranu/build/ artifacts into target platform structures.
   * Must NEVER re-compile application source files.
   */
  adapt(context: DeploymentAdapterContext): Promise<DeploymentResult>;
}
```

### 3.2 `DeploymentCapabilities`

Declares runtime features, execution models, and resource constraints supported by the hosting target:

```typescript
/**
 * Declares the runtime capabilities and execution guarantees of the hosting target.
 */
export interface DeploymentCapabilities {
  /** Target execution environment */
  readonly runtime: 'node' | 'edge' | 'workerd' | 'bun' | 'deno' | 'static';

  /** Indicates support for server-side rendering */
  readonly ssr: boolean;

  /** Indicates support for standalone API route handlers */
  readonly apiRoutes: boolean;

  /** Indicates support for middleware pipeline execution prior to route dispatch */
  readonly middleware: boolean;

  /** Indicates support for chunked HTTP streaming responses (Transfer-Encoding: chunked) */
  readonly streaming: boolean;

  /** Indicates support for static file serving directly from edge/CDN */
  readonly staticFiles: boolean;

  /** Indicates support for dynamic runtime environment variables */
  readonly runtimeEnvironment: boolean;

  /** Target filesystem access permissions */
  readonly writableFilesystem: 'none' | 'temporary' | 'persistent';

  /** True for persistent long-running daemons; false for ephemeral serverless invocations */
  readonly longLivedProcess: boolean;

  /** Extension flag: hosting target supports background execution extension via ctx.waitUntil() */
  readonly supportsWaitUntil?: boolean;

  /** Extension flag: recommended maximum database connection pool size per compute instance */
  readonly maxDatabaseConnections?: number;
}
```

### 3.3 `DeploymentAdapterContext`

Passed by `@ranu/cli` to the adapter's `adapt()` method:

```typescript
/**
 * Contextual metadata passed to a deployment adapter during adaptation.
 */
export interface DeploymentAdapterContext {
  /** Absolute path to the user application project root directory */
  readonly projectRoot: string;

  /** Absolute path to .ranu/build containing compiled artifacts (default: '<projectRoot>/.ranu/build') */
  readonly buildDir?: string | undefined;

  /** Output directory for platform-specific build output */
  readonly outputDir?: string | undefined;

  /** Standardized logging facility */
  readonly logger?: {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
    debug(message: string): void;
  };
}
```

### 3.4 `DeploymentResult`

Returned upon completion of the Phase 1 adaptation process:

```typescript
/**
 * Result returned by a deployment adapter upon completion of the adapt() hook.
 */
export interface DeploymentResult {
  /** Indicates whether the adaptation completed successfully */
  readonly success: boolean;

  /** Platform target identifier (e.g. 'vercel', 'cloudflare', 'node') */
  readonly target: string;

  /** Absolute path to the directory containing deployable platform artifacts */
  readonly outputDirectory: string;

  /** List of generated and emitted file paths */
  readonly files?: readonly string[] | undefined;

  /** Non-fatal warnings encountered during adaptation */
  readonly warnings?: readonly string[] | undefined;

  /** Structured diagnostics */
  readonly diagnostics?: readonly any[] | undefined;
}
```

### 3.5 `RanuRequestContext`

Constructed during Phase 2 for each incoming HTTP request:

```typescript
/**
 * Request execution context passed through the runtime pipeline.
 */
export interface RanuRequestContext {
  /** Unique request correlation ID for tracing and logging */
  readonly requestId: string;

  /** Standard W3C Request instance representing the incoming HTTP request */
  readonly request: Request;

  /** Parsed URL object of the current request */
  readonly url: URL;

  /** Extracted dynamic and catch-all route parameters */
  readonly params: Record<string, string | string[]>;

  /** Request-scoped storage for middleware and route data propagation */
  readonly locals: Map<string, unknown>;

  /** Abort signal triggered on client disconnect or timeout */
  readonly signal: AbortSignal;

  /** Accumulated Set-Cookie header definitions */
  readonly responseCookies: string[];

  /** Internal middleware recursion depth tracker (capped at 5) */
  readonly depth?: number;

  /**
   * Extends the execution lifetime of the request handler beyond response delivery.
   * Required for serverless and edge environments to flush telemetry or background tasks.
   */
  waitUntil?(promise: Promise<unknown>): void;
}
```

---

## 4. Manifest Consumption Specification

During Phase 1, adapters ingest the manifest files emitted into `.ranu/build/`:

```
.ranu/build/
├── build.json               # Root build descriptor and metadata
├── BUILD_ID                 # Unique build hash identifier
├── manifest/
│   ├── routes.json          # Complete routing table and render modes
│   ├── server.json          # Compiled server entrypoints per route
│   ├── client.json          # Client chunk manifest for script injection
│   └── static.json          # Pre-rendered static pages and assets
├── server/                  # Compiled Node/Edge server route bundles
└── static/
    ├── assets/              # Hashed client JavaScript and CSS bundles
    └── pages/               # Pre-rendered HTML files
```

### Manifest Schema Reference

1. **`build.json` (`BuildDescriptor`):**

   ```json
   {
     "schemaVersion": 1,
     "buildId": "build_f92b7c1a84",
     "frameworkVersion": "0.1.5",
     "runtime": "node",
     "manifests": {
       "routes": "manifest/routes.json",
       "server": "manifest/server.json",
       "client": "manifest/client.json",
       "static": "manifest/static.json"
     }
   }
   ```

   Adapters inspect `buildDescriptor.runtime` to ensure target runtime compatibility before proceeding.

2. **`manifest/routes.json` (`RouteManifest`):**
   Defines the complete list of application routes, dynamic segment patterns, route kinds (`'page'` or `'api'`), and render modes (`'ssr'` or `'ssg'`). Adapters use this to configure platform routing tables, rewrites, and redirect rules.

3. **`manifest/server.json` (`ServerManifest`):**
   Maps each `routeId` to its compiled server bundle file in `.ranu/build/server/`. Adapters use this mapping to package standalone serverless functions or configure modular entrypoints.

4. **`manifest/static.json` (`StaticManifest`):**
   Lists all pre-rendered HTML files generated during static site generation (SSG). Adapters use this to configure exact path overrides and content-type headers on CDN edge proxies.

---

## 5. Streaming Response Protocols & Backpressure Control

Ranu.js utilizes **W3C Web Streams (`ReadableStream<Uint8Array>`)** as the universal streaming currency. Streaming SSR with React 19 (`renderToReadableStream`) allows initial layout shells to reach the browser in `<10ms` TTFB, while dynamic suspense boundaries stream progressively as data resolves.

### 5.1 Backpressure Management Architecture

```mermaid
sequenceDiagram
    participant Browser as Client Browser
    participant Node as Adapter (writeWebResponse)
    participant Stream as Web ReadableStream
    participant React as React 19 Renderer

    React->>Stream: Enqueue HTML Chunk
    Stream->>Node: reader.read() -> { value, done: false }
    Node->>Browser: res.write(value)

    alt Socket Buffer Full (res.write returns false)
        Note over Node,Browser: TCP backpressure triggered! Kernel buffer saturated.
        Node->>Node: Pause stream reading; await res.once('drain')
        Note over Stream,React: Backpressure propagates up: React rendering suspended
        Browser-->>Node: Client receives bytes; socket drains
        Node->>Node: 'drain' event fires; resume loop
    end

    Stream->>Node: reader.read() -> { done: true }
    Node->>Browser: res.end()
```

### 5.2 Node.js Socket Backpressure Implementation

In persistent Node.js servers and serverless functions, `@ranu/runtime-node` bridges W3C `Response` streams to Node's `http.ServerResponse` via `writeWebResponse()`:

```typescript
// packages/runtime-node/src/response.ts (Excerpt)
const reader = response.body.getReader();

try {
  while (true) {
    if (res.destroyed || res.writableEnded) break;

    const { done, value } = await reader.read();
    if (done) break;

    if (value) {
      const ok = res.write(value);
      if (!ok) {
        // Socket buffer full: suspend stream reading until socket drains
        await new Promise<void>((resolve, reject) => {
          const onDrain = () => {
            cleanup();
            resolve();
          };
          const onError = (err: Error) => {
            cleanup();
            reject(err);
          };
          const onClose = () => {
            cleanup();
            resolve();
          };

          function cleanup() {
            res.off('drain', onDrain);
            res.off('error', onError);
            res.off('close', onClose);
          }

          res.once('drain', onDrain);
          res.once('error', onError);
          res.once('close', onClose);
        });
      }
    }
  }

  if (!res.writableEnded && !res.destroyed) {
    res.end();
  }
} finally {
  reader.releaseLock();
}
```

### 5.3 Web Streams Backpressure (Edge & Cloudflare)

In environments with native Web Streams (Cloudflare Workers, Bun, Deno), backpressure is managed by monitoring the controller's desired size:

- When a client on a slow connection delays receiving chunks, `controller.desiredSize` drops to `0` or negative.
- The stream transform pauses chunk production until the client acknowledges received bytes, preventing unbounded V8 isolate heap growth (and avoiding Cloudflare 128MB OOM crashes).

### 5.4 Client Disconnection & Abort Signal Forwarding

When a user closes their browser tab or navigates away during an in-flight stream:

1. The incoming socket triggers a disconnect event (`res.on('close')` or `request.signal.aborted`).
2. The adapter immediately aborts the active `AbortController`:
   ```typescript
   options.signal.addEventListener('abort', () => {
     reader.cancel().catch(() => {});
     if (!res.writableEnded && !res.destroyed) {
       res.destroy();
     }
   });
   ```
3. React 19's streaming renderer receives the abort signal and halts component tree evaluation immediately, cancelling pending database queries and preventing wasted server compute.

### 5.5 RFC 6265 Multi-Cookie Preservation

Intermediate proxies frequently concatenate multiple `Set-Cookie` headers into a single comma-separated header, corrupting cookie definitions containing comma-delimited `Expires` timestamps.

Ranu.js adapters enforce strict RFC 6265 preservation:

```typescript
const setCookies = response.headers.getSetCookie?.() ?? [];
if (setCookies.length > 0) {
  const sanitizedCookies = setCookies.map((c) => c.replace(/[\r\n]+/g, ' ').trim()).filter(Boolean);
  if (sanitizedCookies.length > 0) {
    res.setHeader('Set-Cookie', sanitizedCookies);
  }
}
```

All headers are additionally sanitized against CRLF injection attacks (`[\r\n]` replacement) before serialization.

### 5.6 Bodyless Status Code Handling

According to RFC 9110, HTTP status codes `1xx` (Informational), `204` (No Content), and `304` (Not Modified)—as well as responses to `HEAD` requests—must never transmit a message body. Adapters explicitly suppress the body stream and invoke `res.end()` immediately for bodyless responses.

---

## 6. Security Invariants & Path Containment

Adapters handle file operations and runtime bindings that affect application security. All adapters must enforce the following security invariants:

### 6.1 Path Containment Defense (`isPathContained`)

Adapters must verify that output paths and copied assets never escape authorized parent directories:

```typescript
/**
 * Verifies that childPath resides strictly within parentDir to prevent path traversal attacks.
 */
export function isPathContained(childPath: string, parentDir: string): boolean {
  const rel = path.relative(path.resolve(parentDir), path.resolve(childPath));
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}
```

If an adapter attempts to write outside the authorized output directory, it must abort with a fatal security error.

### 6.2 Destination Symlink Traversal Defense

Malicious repositories or dependency scripts can create symbolic links targeting sensitive system directories (`/etc/passwd`, root directories).

Adapters must inspect all destination paths and refuse to write through symbolic links:

```typescript
function assertNoDestinationSymlink(destination: string, authorizedRoot: string): void {
  let current = path.resolve(destination);
  const root = path.resolve(authorizedRoot);

  while (isPathContained(current, root)) {
    if (fs.lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink()) {
      throw new Error(`Refusing to copy through symbolic link "${current}".`);
    }
    if (current === root) break;
    current = path.dirname(current);
  }
}
```

### 6.3 Sensitive File Filtering

During static asset copying to CDN public directories, adapters must enforce a strict exclusion filter. Files matching any of the following patterns are unconditionally excluded:

- `.env*` (Environment files and secrets)
- `.git*` (Version control metadata)
- `.DS_Store` (Operating system metadata)
- `*.map` (Source maps containing unminified source code)
- `server*` (Server-side bundles and private manifests)

### 6.4 Build-Time AST Secret Stripping

To prevent accidental leakage of database credentials or API secrets into browser bundles, `@ranu/build` inspects the AST of every client-reachable module during Phase 1:

- Only environment variables explicitly prefixed with `RANU_PUBLIC_` (along with `NODE_ENV`) are allowed in client modules.
- Any access to non-public variables (`process.env.DATABASE_URL`, `process.env.SECRET_KEY`, or spreading `...process.env`) produces a fatal compile error (`RANU_BUILD_PRIVATE_ENV_CLIENT`).
- Inlined public variables are replaced with static string literals using bundler `define` mappings.

---

## 7. Reference Implementation: Custom Enterprise Adapter

Below is an end-to-end implementation of a custom enterprise deployment adapter demonstrating the full `RanuDeploymentAdapter` contract:

```typescript
// adapters/enterprise/src/index.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  RanuDeploymentAdapter,
  DeploymentCapabilities,
  DeploymentAdapterContext,
  DeploymentResult,
} from '@ranu/core';
import type { BuildDescriptor, RouteManifest } from '@ranu/manifests';

export interface EnterpriseAdapterOptions {
  outputDir?: string;
  maxDatabaseConnections?: number;
}

export function enterpriseAdapter(options: EnterpriseAdapterOptions = {}): RanuDeploymentAdapter {
  return {
    name: 'enterprise-adapter',
    apiVersion: 1,
    capabilities: {
      runtime: 'node',
      ssr: true,
      apiRoutes: true,
      middleware: true,
      streaming: true,
      staticFiles: true,
      runtimeEnvironment: true,
      writableFilesystem: 'temporary',
      longLivedProcess: true,
      supportsWaitUntil: true,
      maxDatabaseConnections: options.maxDatabaseConnections ?? 10,
    },

    async adapt(ctx: DeploymentAdapterContext): Promise<DeploymentResult> {
      const projectRoot = path.resolve(ctx.projectRoot);
      const buildDir = path.resolve(ctx.buildDir ?? path.join(projectRoot, '.ranu', 'build'));
      const outputDir = path.resolve(ctx.outputDir ?? options.outputDir ?? path.join(projectRoot, 'dist-enterprise'));

      // 1. Validate production build exists
      const buildDescriptorPath = path.join(buildDir, 'build.json');
      let buildDescriptor: BuildDescriptor;
      try {
        const raw = await fs.readFile(buildDescriptorPath, 'utf8');
        buildDescriptor = JSON.parse(raw);
      } catch {
        throw new Error(`Production build artifacts not found at "${buildDir}". Run "ranu build" first.`);
      }

      // 2. Prepare clean output directory
      await fs.rm(outputDir, { recursive: true, force: true });
      await fs.mkdir(outputDir, { recursive: true });

      const publicDir = path.join(outputDir, 'public');
      const serverDir = path.join(outputDir, 'server');
      await fs.mkdir(publicDir, { recursive: true });
      await fs.mkdir(serverDir, { recursive: true });

      // 3. Copy static client assets
      const buildStaticDir = path.join(buildDir, 'static');
      try {
        await fs.cp(buildStaticDir, publicDir, { recursive: true });
      } catch {
        // static directory optional if pure API
      }

      // 4. Copy compiled server artifacts without re-compilation
      await fs.cp(buildDir, serverDir, { recursive: true });

      // 5. Generate production server entrypoint
      const serverScript = `// Enterprise Server Entrypoint for Ranu.js
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProductionRuntime, createNodeRequestHandler } from '@ranu/runtime-node';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(__dirname, 'server');

const runtime = await createProductionRuntime({ buildDir: serverDir });
const handler = createNodeRequestHandler(runtime, { buildDir: serverDir });

const server = http.createServer((req, res) => handler(req, res));
const port = Number(process.env.PORT) || 8080;

server.listen(port, '0.0.0.0', () => {
  console.log(\`Enterprise server listening on port \${port}\`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
`;
      await fs.writeFile(path.join(outputDir, 'server.mjs'), serverScript, 'utf8');

      return {
        success: true,
        target: 'enterprise-adapter',
        outputDirectory: outputDir,
        files: ['server.mjs', 'public/', 'server/'],
      };
    },
  };
}

export default enterpriseAdapter;
```

---

## 8. Verification & Diagnostic Checklist

Before marking an adapter implementation complete, verify that it adheres to all contract rules:

| Invariant / Check            | Expected Behavior                                                                              |
| :--------------------------- | :--------------------------------------------------------------------------------------------- |
| **Zero Re-Compilation**      | Adapter does not invoke `esbuild`, `tsc`, or compilers on user `.tsx`/`.ts` application files. |
| **Manifest Ingestion**       | Ingests `.ranu/build/build.json`, `manifest/routes.json`, and `manifest/static.json` cleanly.  |
| **Path Containment**         | Rejects output directories escaping the project root; halts on directory symlinks.             |
| **Sensitive File Isolation** | Excludes `.env`, `.git`, `.DS_Store`, source maps, and server chunks from public folders.      |
| **Backpressure Drainage**    | Awaits the socket `'drain'` event when `res.write()` returns `false` during streaming.         |
| **Abort Forwarding**         | Cancels stream reader and destroys socket immediately when `signal.aborted` triggers.          |
| **Multi-Cookie Headers**     | Uses `response.headers.getSetCookie()` to preserve discrete `Set-Cookie` header strings.       |
| **Bodyless Responses**       | Calls `res.end()` without body for `1xx`, `204`, `304`, and `HEAD` requests.                   |
