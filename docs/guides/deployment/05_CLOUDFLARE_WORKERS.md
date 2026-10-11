# Deploying to Cloudflare Workers with Ranu.js

**Ranu.js** provides first-class support for Cloudflare Workers and Cloudflare Pages via the open-source `workerd` V8 isolate runtime. Because Ranu.js is architected around W3C Web Standards (`Request`, `Response`, `ReadableStream`), applications execute natively on Cloudflare's edge network with near-zero cold start overhead.

This guide details the V8 isolate execution model, hard resource limits, Node.js API compatibility boundaries, streaming backpressure controls, background task scheduling, and production deployment workflows.

---

## 1. Architectural Model: `workerd` V8 Isolates

Cloudflare Workers does not run code inside containerized Linux microVMs (such as Docker or AWS Lambda). Instead, execution is hosted by `workerd`, Cloudflare's open-source runtime built on Google V8 isolates:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Cloudflare Edge PoP (Server Node)                    │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    Shared workerd Host Process                   │  │
│  │                                                                  │  │
│  │   ┌────────────────────┐ ┌────────────────────┐ ┌─────────────┐  │  │
│  │   │  V8 Isolate #1     │ │  V8 Isolate #2     │ │ V8 Isolate  │  │  │
│  │   │  (Ranu.js App)     │ │  (Tenant B)        │ │ (Tenant C)  │  │  │
│  │   │  Heap: <= 128 MB   │ │  Heap: <= 128 MB   │ │ Heap <=128MB│  │  │
│  │   └────────────────────┘ └────────────────────┘ └─────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### Key Architectural Characteristics

1. **Sub-5ms Cold Starts:** Because spinning up a V8 isolate requires only allocating a lightweight V8 context rather than booting a virtualized Linux kernel or container runtime, worker startup latency is virtually zero (<5ms globally).
2. **Shared Process Multi-Tenancy:** Thousands of isolated execution contexts share a single host process. Memory boundaries are enforced cryptographically and through V8 virtual machine sandboxing.
3. **Pure W3C Primitives:** Incoming network requests are exposed directly as standard W3C `Request` instances, and route handlers return standard W3C `Response` instances containing `ReadableStream` bodies.

---

## 2. Hard Resource Limits & Failure Modes

Unlike self-hosted Node.js servers with gigabytes of RAM and unbounded execution timeouts, Cloudflare Workers enforces strict runtime ceilings. Violating these ceilings results in immediate termination by the runtime.

| Limit Type               | Free Plan | Paid (Standard / Bundled)     | Failure Symptom                         | Ranu.js Architectural Defense                               |
| :----------------------- | :-------- | :---------------------------- | :-------------------------------------- | :---------------------------------------------------------- |
| **RAM Memory Ceiling**   | 128 MB    | 128 MB (up to 512 MB on Paid) | `Error 1101: Worker Threw Exception`    | Chunked `ReadableStream` SSR (no full-page HTML buffering)  |
| **CPU Time per Request** | 10 ms     | 50 ms (up to 30s on Unbound)  | `Error 1102: Worker Exceeded CPU Limit` | Strict separation of wall-clock I/O vs CPU time             |
| **Subrequest Cap**       | 50 calls  | 1,000 calls                   | `Error 1042: Subrequest limit exceeded` | Collocated Suspense fetching and batched data queries       |
| **Request Payload Size** | 100 MB    | 500 MB                        | `413 Payload Too Large`                 | Streaming request body consumption without memory buffering |

### 2.1 The 128 MB Memory Ceiling (Error 1101)

Every worker isolate is constrained to a 128 MB memory allocation. If an application buffers entire database query sets or serializes multi-megabyte HTML documents in memory using legacy `renderToString` methods, the V8 heap is exhausted, causing an instantaneous worker crash:

```
Error 1101: Worker threw exception
Worker execution exceeded isolate memory limit of 128 MiB
```

**Ranu.js Mitigation:** Ranu.js enforces React 19 streaming server rendering via `renderToReadableStream`. Rather than assembling the full HTML document in memory, the layout shell is flushed immediately to the network stream within `<10ms`. As asynchronous `<Suspense>` components resolve, chunks are dispatched directly to the network buffer, maintaining a flat memory footprint below 25 MB even under high concurrency.

### 2.2 CPU Execution Quotas (Error 1102)

Cloudflare distinguishes sharply between **CPU execution time** and **wall-clock I/O time**:

- **CPU Time:** Measures active thread computation on the V8 engine (JavaScript parsing, synchronous loops, cryptographic hashing, React component rendering).
- **Wall-Clock Time:** Measures duration spent waiting for external network responses, database queries, or Cloudflare KV lookups. Asynchronous waiting time does **not** count against CPU time limits.

Under the Free Plan (10ms CPU quota), any synchronous operation exceeding 10 milliseconds aborts the worker with `Error 1102`.

> [!WARNING]
> Never perform CPU-intensive tasks such as high-cost `bcrypt` hashing (rounds > 10), synchronous image resizing, or complex synchronous regular expressions inside Cloudflare Worker request handlers. Delegate heavy hashing to Argon2 via WebAssembly or offload computationally intensive tasks to an asynchronous queue.

### 2.3 The 50-Subrequest Cap & Waterfall Avoidance

Each incoming HTTP request on the Free tier is permitted a maximum of **50 subrequests** (`fetch()`, KV reads, D1 database calls).

Nested route layouts that execute serial loader waterfalls (a common anti-pattern in legacy SSR frameworks) quickly trigger subrequest exhaustion:

```
Root Layout (fetch /api/user)      ──► 1 subrequest
  └─ Dashboard Layout (fetch /api/nav) ──► 1 subrequest
       └─ Feed (fetch /api/posts)        ──► 1 subrequest
            └─ Post Items (50x author)   ──► 50 subrequests [LIMIT EXCEEDED]
```

**Ranu.js Mitigation:**

1. Use parallel data fetching via `Promise.all()` within layout boundaries.
2. Utilize Cloudflare Hyperdrive or connection-pooled D1 endpoints to batch multiple queries into single requests.
3. Cache static API responses using Cloudflare Cache API (`caches.default`).

---

## 3. Node.js API Compatibility Boundaries

While Cloudflare Workers supports Node.js compatibility through the `nodejs_compat` flag, developers must understand the physical differences between a real Node.js runtime and an edge isolate.

### 3.1 Complete Absence of `node:fs`

Cloudflare Workers has no persistent or temporary local filesystem. Attempting to import or execute `fs`, `fs/promises`, or `node:fs` methods will throw runtime exceptions:

```typescript
// ❌ FAILS AT RUNTIME: No filesystem exists in workerd
import fs from 'node:fs';
const template = fs.readFileSync('./template.html', 'utf8'); // Throws Error
```

Static assets, configuration files, and templates must be read via Cloudflare Static Assets (`env.ASSETS`), embedded directly at compile time via `@ranu/build`, or retrieved from Cloudflare R2 object storage.

### 3.2 Synthetic `process.env` vs Runtime `env` Bindings

In standard Node.js applications, environment variables are loaded into the global `process.env` object. In Cloudflare Workers, `process.env` is a synthetic polyfill.

Secrets and resource bindings (KV, D1, R2, AI) are passed dynamically to the worker's `fetch()` handler inside the `env` parameter:

```typescript
// worker.ts
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Platform bindings are accessed on `env`, not process.env
    const kvValue = await env.MY_KV.get('config_key');
    const dbResult = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind('123').all();

    // ...
  },
};
```

Ranu.js automatically forwards the Cloudflare `env` object into `RanuRequestContext.locals.get('env')`, ensuring route handlers and middleware can access bindings cleanly without relying on global mutable state.

### 3.3 Ban on Native C++ Addons (N-API)

Packages that depend on compiled C/C++ native binaries (`sharp`, `better-sqlite3`, `canvas`, `sqlite3`, native `bcrypt`) cannot run on `workerd`. Only pure JavaScript and WebAssembly (`.wasm`) modules are permitted.

| Unsupported Native Package        | Recommended Edge Alternative                                    |
| :-------------------------------- | :-------------------------------------------------------------- |
| `sharp` (C++ image processing)    | Cloudflare Images (`/cdn-cgi/image/...`) or `@wasm-codecs`      |
| `better-sqlite3` (C++ SQLite)     | Cloudflare D1 (`env.DB`) or Turso LibSQL over HTTP              |
| `bcrypt` (C++ native addon)       | `bcryptjs` (pure JS) or Web Crypto API (`crypto.subtle`)        |
| `pg` / `mysql2` (raw TCP sockets) | Cloudflare Hyperdrive or HTTP-based drivers (Neon, PlanetScale) |

### 3.4 Dynamic Code Evaluation Restrictions

V8 isolates strictly disallow dynamic string-to-code evaluation for security reasons. Calls to `eval()`, `new Function('...')`, or template engines that dynamically compile strings into functions at runtime will throw:

```
EvalError: Code generation from strings disallowed for this context
```

All JSX templates and route modules in Ranu.js are pre-compiled into static ECMAScript modules during Phase 1 (`pnpm ranu build`), guaranteeing zero runtime `eval()` invocations.

---

## 4. Streaming Backpressure & Lifecycle Management

Streaming SSR on high-throughput networks requires coordinated backpressure control between the React renderer and Cloudflare's edge socket buffers.

### 4.1 Isolate Backpressure via `desiredSize`

When a client browser is connected over a slow mobile link, the server may produce HTML chunks faster than the client can download them. If an adapter enqueues chunks unconditionally, unacknowledged buffers accumulate inside isolate memory, rapidly breaching the 128 MB RAM ceiling.

The adapter manages backpressure by monitoring the stream controller's `desiredSize`:

```
┌─────────────────┐       chunks       ┌──────────────────┐    socket writes   ┌─────────────────┐
│ React 19 Stream │ ─────────────────► │ TransformStream  │ ─────────────────► │ Client Browser  │
│ (Renderer)      │                    │ (desiredSize)    │                    │ (Slow Network)  │
└─────────────────┘                    └──────────────────┘                    └─────────────────┘
        ▲                                       │
        │             desiredSize <= 0          │
        └───────────────────────────────────────┘
             Pause chunk pulling until drain
```

When `desiredSize <= 0`, the internal stream buffer is saturated, and chunk generation is paused until downstream network packets are acknowledged by the client.

### 4.2 Forwarding Client Abort Signals

When a user closes their browser tab or navigates away mid-stream, Cloudflare emits an abort notification on `request.signal`. The adapter must propagate this signal to terminate active renders immediately:

```typescript
// _worker.ts
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const controller = new AbortController();

    // Listen for client disconnect
    request.signal.addEventListener('abort', () => {
      controller.abort();
    });

    try {
      return await runtime.handle(request, {
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        // Client disconnected; drop silently to save CPU quota
        return new Response(null, { status: 499 });
      }
      throw error;
    }
  },
};
```

Aborting the signal cancels pending React Suspense component rendering and cancels any in-flight subrequests (`fetch()` calls), preventing wasted CPU time.

### 4.3 Background Execution with `ctx.waitUntil()`

In standard Node.js servers, background tasks (such as telemetry, audit logs, or email dispatches) can continue running after an HTTP response is sent.

In Cloudflare Workers, **all isolate execution freezes the instant the HTTP `Response` object is returned** unless explicitly scheduled via `ctx.waitUntil()`. Any un-awaited promise will be terminated mid-execution:

```typescript
// ❌ WRONG: Promise will be silently killed when response returns
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    logAnalyticsToDatabase(request); // Silently aborted!
    return new Response('OK');
  },
};
```

Ranu.js exposes platform lifetime extension via `RanuRequestContext.waitUntil()`:

```typescript
// src/routes/api/checkout/route.ts
import { getRequestContext } from '@ranu/server';

export async function POST(request: Request) {
  const context = getRequestContext();
  const order = await request.json();

  // Execute critical business logic
  const result = await processPayment(order);

  // Defer non-blocking audit logging without delaying HTTP response
  context.waitUntil(
    sendTelemetryEvent({
      event: 'order_completed',
      orderId: result.id,
      timestamp: Date.now(),
    }),
  );

  return Response.json({ success: true, orderId: result.id });
}
```

The adapter maps this directly to Cloudflare's `ctx.waitUntil(promise)`, keeping the isolate alive in the background until all registered promises settle.

---

## 5. Production Entrypoint & Configuration

### 5.1 The `_worker.js` Production Entrypoint

When targeting Cloudflare Pages or Cloudflare Workers with Static Assets, the adapter emits a production entrypoint named `_worker.js` (or `entry.mjs` for standalone Workers):

```javascript
// dist-cloudflare/_worker.js
import { createProductionRuntime } from './server/runtime.mjs';
import serverManifest from './manifest/server.json' with { type: 'json' };
import routeManifest from './manifest/routes.json' with { type: 'json' };

// Initialize runtime singleton outside fetch handler for isolate reuse
let runtimePromise = null;

function getRuntime(env) {
  if (!runtimePromise) {
    runtimePromise = createProductionRuntime({
      serverManifest,
      routeManifest,
      env,
    });
  }
  return runtimePromise;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. Let Cloudflare handle static assets directly if ASSETS binding exists
    if (env.ASSETS && (url.pathname.startsWith('/_ranu/assets/') || url.pathname.includes('.'))) {
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status !== 404) {
        return assetResponse;
      }
    }

    // 2. Resolve Ranu production runtime
    const runtime = await getRuntime(env);

    // 3. Dispatch through Ranu request pipeline with ctx.waitUntil mapping
    return runtime.handle(request, {
      waitUntil: (promise) => ctx.waitUntil(promise),
      locals: {
        env,
        ctx,
      },
    });
  },
};
```

### 5.2 `wrangler.toml` Production Configuration

Create a `wrangler.toml` (or `wrangler.jsonc`) in your project root:

```toml
# wrangler.toml
name = "my-ranu-app"
main = "dist-cloudflare/_worker.js"
compatibility_date = "2026-10-01"

# Mandatory: Enables Node.js API polyfills in workerd
compatibility_flags = ["nodejs_compat"]

# Configure static assets serving
[assets]
directory = "dist-cloudflare/static"
binding = "ASSETS"
html_handling = "auto-trailing-slash"
not_found_handling = "single-page-application"

# Environment Variable Secrets (set via `wrangler secret put`)
[vars]
ENVIRONMENT = "production"
APP_NAME = "Ranu Cloudflare App"

# Cloudflare D1 Database Binding (Optional)
[[d1_databases]]
binding = "DB"
database_name = "ranu_production_db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# Cloudflare KV Storage Binding (Optional)
[[kv_namespaces]]
binding = "CACHE_KV"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Cloudflare R2 Object Storage Binding (Optional)
[[r2_buckets]]
binding = "UPLOADS_BUCKET"
bucket_name = "my-ranu-uploads"
```

---

## 6. Build & Deployment Workflow

### Step 1: Compile Application Artifacts

Execute the Ranu production build:

```bash
pnpm ranu build --clean
```

This compiles client bundles, React 19 server components, and route manifests into `.ranu/build/`.

### Step 2: Adapt for Cloudflare

Transform build artifacts for the Cloudflare Workers target:

```bash
pnpm ranu deploy --adapter cloudflare
```

This emits:

- `dist-cloudflare/_worker.js`: Production V8 isolate entrypoint.
- `dist-cloudflare/static/_ranu/assets/`: Hashed immutable client chunks.
- `dist-cloudflare/static/`: Static HTML and public assets.

### Step 3: Deploy via Wrangler CLI

Deploy the compiled distribution directory using Cloudflare's Wrangler CLI:

```bash
# Preview locally in the workerd isolate environment
npx wrangler dev

# Deploy to production edge PoPs globally
npx wrangler deploy
```

---

## 7. Automated CI/CD Pipeline (GitHub Actions)

Deploy automatically on commits to `main` using GitHub Actions:

```yaml
# .github/workflows/deploy-cloudflare.yml
name: Deploy to Cloudflare Workers

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Setup Node.js & pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 9

      - name: Use Node.js 22.x
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'

      - name: Install Dependencies
        run: pnpm install --frozen-lockfile

      - name: Build Application
        run: pnpm ranu build

      - name: Adapt for Cloudflare
        run: pnpm ranu deploy --adapter cloudflare

      - name: Deploy to Cloudflare Workers
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: deploy
```

---

## 8. Verification & Operational Health Checklist

Verify application behavior across edge PoPs:

| Verification Target         | Test Method                                                                  | Expected Result                                                              |
| :-------------------------- | :--------------------------------------------------------------------------- | :--------------------------------------------------------------------------- |
| **Zero Cold Start**         | `curl -w "%{time_starttransfer}\n" -o /dev/null -s https://app.workers.dev/` | TTFB < 20ms on warm/cold invocations                                         |
| **Streaming SSR**           | `curl -N https://app.workers.dev/dashboard`                                  | Layout shell arrives immediately; dynamic chunks stream sequentially         |
| **Static Asset CDN Bypass** | Inspect response headers for `/_ranu/assets/bundle.[hash].js`                | `cf-cache-status: HIT`, `cache-control: public, max-age=31536000, immutable` |
| **Memory Ceiling Check**    | Monitor Cloudflare Worker Analytics Dashboard                                | Isolate memory remains stable below 30 MB; zero `Error 1101` spikes          |
| **CPU Limit Compliance**    | Inspect P99 CPU metrics in Cloudflare Dashboard                              | Average CPU time < 5ms (Free limit: 10ms); zero `Error 1102` aborts          |
| **Background Tasks**        | Verify telemetry dispatch triggered via `context.waitUntil()`                | Logs settle cleanly in external observability stores                         |
