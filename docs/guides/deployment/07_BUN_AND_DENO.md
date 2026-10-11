# Deploying to Bun and Deno Runtimes

Modern JavaScript infrastructure offers high-performance runtime alternatives to traditional Node.js. Both **Bun** and **Deno** provide first-class native implementations of the W3C Web Fetch standards (`Request`, `Response`, `ReadableStream`, `Headers`).

Because **Ranu.js** is architected with a universal, standard-first runtime kernel (`@ranu/runtime`), running a Ranu.js application on Bun or Deno requires **zero transport transformation shims**. Incoming HTTP requests are passed directly into the Ranu runtime kernel, delivering maximum throughput and sub-10ms process boot times.

This guide explores the unified architectural positioning, runtime-specific integration recipes, compatibility edge cases, standalone binary compilation, and container deployment patterns for both runtimes.

---

## 1. Unified Architectural Positioning: Zero Transport Transformation

Traditional full-stack frameworks (such as Next.js or Remix v1) were architected tightly around Node.js's proprietary `http.IncomingMessage` and `http.ServerResponse` APIs. To run on Bun, Deno, or edge workers, those frameworks require complex transformation adapters that copy buffers, convert headers, and emulate Node streams.

Ranu.js eliminates this transformation overhead entirely:

```
Traditional Framework Architecture (Double Shimming):
┌────────────────┐      ┌─────────────────────────┐      ┌───────────────────────────┐      ┌─────────────────┐
│ Runtime Ingress│ ───► │ Adapter Wrap (Web->Node)│ ───► │ Framework Kernel (Node.js)│ ───► │ Adapter Un-wrap │
└────────────────┘      └─────────────────────────┘      └───────────────────────────┘      └─────────────────┘

Ranu.js Architecture (Zero Shimming):
┌─────────────────────────────────┐                       ┌──────────────────────────────────────────┐
│ Native Ingress (Bun / Deno)     │ ────────────────────► │ Ranu Server Runtime (@ranu/runtime)      │
│ Standard W3C Request            │                       │ Direct W3C Request -> W3C Response       │
└─────────────────────────────────┘                       └──────────────────────────────────────────┘
```

### Runtime Architecture Comparison

| Feature / Metric              | Bun                                  | Deno                             | Node.js (v22+)                    |
| :---------------------------- | :----------------------------------- | :------------------------------- | :-------------------------------- |
| **JavaScript Engine**         | JavaScriptCore (WebKit / Apple)      | V8 (Google Chrome)               | V8 (Google Chrome)                |
| **Core Systems Language**     | Zig / C++                            | Rust / C++                       | C++ / C                           |
| **Async Event Loop**          | Custom Zig Event Loop (epoll/kqueue) | Tokio (Rust)                     | libuv (C)                         |
| **HTTP Server Primitive**     | `Bun.serve()`                        | `Deno.serve()`                   | `node:http` (`createServer`)      |
| **Process Cold Start**        | **< 10 ms**                          | **< 20 ms**                      | ~100–300 ms                       |
| **Native TypeScript/JSX**     | Built-in (native fast transpiler)    | Built-in (SWC compiler)          | Requires loader / pre-compilation |
| **Security Permissions**      | Permissive by default (like Node)    | Secure by default (opt-in flags) | Permissive by default             |
| **Self-Contained Executable** | `bun build --compile`                | `deno compile`                   | `node --experimental-sea-config`  |

---

## 2. Bun Runtime Deep Dive (`Bun.serve()`)

**Bun** is an all-in-one JavaScript runtime designed for speed, utilizing Apple's JavaScriptCore (JSC) engine and a custom Zig network stack.

### 2.1 Native Server Entrypoint

To run Ranu.js on Bun, compile your production application (`pnpm ranu build`) and launch via `Bun.serve()`:

```typescript
// server-bun.ts
import { createProductionRuntime } from '@ranu/runtime';

// 1. Initialize Ranu's provider-neutral production runtime
const runtime = await createProductionRuntime({
  buildDir: '.ranu/build',
});

const port = Number(process.env.PORT) || 3000;
const hostname = process.env.HOST || '0.0.0.0';

// 2. Start high-throughput Bun HTTP server
export default {
  port,
  hostname,
  fetch(req: Request): Promise<Response> | Response {
    // Zero-overhead dispatch: standard Request in, standard Response out
    return runtime.handle(req);
  },
  error(error: Error) {
    console.error('[Bun Server Error]:', error);
    return new Response('Internal Server Error', { status: 500 });
  },
};

console.log(`Bun production server listening on http://${hostname}:${port}`);
```

Run directly with the Bun binary:

```bash
bun run server-bun.ts
```

### 2.2 Compatibility Edge Cases & Runtime Quirks

While Bun offers exceptional raw throughput, several architectural edge cases require attention:

1. **`node:vm` Context Differences:**
   JavaScriptCore lacks the V8 isolate structure used by Node's `node:vm` module. If your application or custom plugins rely on `vm.createContext()` or `vm.runInContext()`, Bun's emulation may exhibit subtle scoping differences compared to Node.js.
2. **Web Streams Backpressure:**
   Early versions of Bun exhibited buffering regressions when bridging between Node streams and W3C `ReadableStream`. Ranu.js uses native W3C `ReadableStream` directly, which integrates cleanly with Bun's native C++ stream controller. Always ensure you are running Bun v1.1.20 or newer.
3. **Native C++ Addons (N-API):**
   Bun supports N-API addons, but binary packages expecting internal V8 symbols may fail or crash. Stick to pure TypeScript/JavaScript packages or WebAssembly modules for cross-engine reliability.
4. **Path Resolution Differences:**
   On Windows environments, Bun's path normalization may handle backslashes differently from Node. Always use `node:path` methods (`path.resolve()`, `path.normalize()`) rather than manual string concatenation.

### 2.3 Compiling to a Single Standalone Executable

Bun can package your entire compiled application, assets, and runtime into a single, self-contained binary:

```bash
# Compile into a standalone binary executable
bun build ./server-bun.ts --compile --outfile ranu-app
```

The resulting `ranu-app` binary can be executed on target servers without requiring Bun or Node.js to be installed.

---

## 3. Deno Runtime Deep Dive (`Deno.serve()`)

**Deno** is a secure runtime built by the creator of Node.js, utilizing Google V8, Rust, and the Tokio asynchronous runtime.

### 3.1 Native Server Entrypoint

Deno provides native support for W3C Fetch via `Deno.serve()`:

```typescript
// server-deno.ts
import { createProductionRuntime } from 'npm:@ranu/runtime';

// 1. Initialize Ranu production runtime
const runtime = await createProductionRuntime({
  buildDir: '.ranu/build',
});

const port = Number(Deno.env.get('PORT') ?? '3000');
const hostname = Deno.env.get('HOST') ?? '0.0.0.0';

// 2. Start Deno HTTP server with native W3C handler
Deno.serve(
  {
    port,
    hostname,
    onListen({ hostname, port }) {
      console.log(`Deno server listening on http://${hostname}:${port}`);
    },
  },
  (req: Request): Promise<Response> => {
    // Pure standard dispatch
    return runtime.handle(req);
  },
);
```

### 3.2 Sandboxed Permissions Security Model

Deno runs in a secure sandbox by default. Unlike Node.js or Bun, which permit unrestricted disk, network, and environment access, Deno requires explicit permission flags:

```bash
deno run \
  --allow-net=0.0.0.0:3000,api.stripe.com,database.internal \
  --allow-read=.ranu/build,public \
  --allow-env=PORT,HOST,NODE_ENV,DATABASE_URL \
  server-deno.ts
```

| Flag           | Purpose                               | Recommended Production Scope                             |
| :------------- | :------------------------------------ | :------------------------------------------------------- |
| `--allow-net`  | Permits network ingress & egress      | Restrict to binding port and explicit upstream hostnames |
| `--allow-read` | Permits filesystem reads              | Scope to `.ranu/build/` and `public/` directories        |
| `--allow-env`  | Permits reading environment variables | Restrict to application configuration keys               |

### 3.3 Compatibility Edge Cases & Runtime Quirks

1. **`npm:` Specifier Subpath Resolution:**
   When importing packages published with modern `package.json` subpath exports (such as `@ranujs/core/config` or `@ranujs/core/server`), Deno resolves modules via the `npm:` prefix. Ensure your `deno.json` specifies node compatibility:
   ```json
   {
     "nodeModulesDir": "auto",
     "compilerOptions": {
       "lib": ["deno.window", "dom"]
     }
   }
   ```
2. **Tokio Async Loop vs. Libuv Scheduling:**
   Deno schedules microtasks and I/O using Rust's Tokio runtime. While performance is comparable to Node.js, low-level socket timeout behavior and keep-alive socket teardowns operate under Tokio semantics rather than Node's libuv event loop.

### 3.4 Standalone Executable Packaging with `deno compile`

Deno can cross-compile full-stack Ranu.js applications into cross-platform standalone binaries:

```bash
deno compile \
  --allow-net \
  --allow-read \
  --allow-env \
  --output ranu-deno-app \
  server-deno.ts
```

---

## 4. Production Container Deployment Patterns

### 4.1 Minimal Bun Dockerfile (Alpine Linux)

```dockerfile
# Dockerfile.bun
FROM oven/bun:1.1-alpine AS base
WORKDIR /app

# Step 1: Install dependencies
FROM base AS dependencies
COPY package.json bun.lockb* pnpm-lock.yaml* ./
RUN bun install --frozen-lockfile

# Step 2: Build production artifacts
FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
RUN bun run ./node_modules/.bin/ranu build --clean

# Step 3: Production runner
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Run as unprivileged user
USER bun

COPY --from=builder /app/.ranu/build ./.ranu/build
COPY --from=builder /app/public ./public
COPY --from=builder /app/server-bun.ts ./server-bun.ts

EXPOSE 3000

CMD ["bun", "run", "server-bun.ts"]
```

### 4.2 Minimal Deno Dockerfile (Alpine Linux)

```dockerfile
# Dockerfile.deno
FROM denoland/deno:alpine-1.45.0 AS base
WORKDIR /app

# Step 1: Build production artifacts using Node/pnpm
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm ranu build --clean

# Step 2: Deno production runner
FROM base AS runner
ENV PORT=3000
ENV HOST=0.0.0.0

COPY --from=builder /app/.ranu/build ./.ranu/build
COPY --from=builder /app/public ./public
COPY server-deno.ts ./server-deno.ts

EXPOSE 3000

USER deno

CMD ["run", "--allow-net", "--allow-read", "--allow-env", "server-deno.ts"]
```

---

## 5. Platform-as-a-Service (PaaS) Recipes

### 5.1 Fly.io (Bun Deployment)

Create `fly.toml` in your project root:

```toml
# fly.toml
app = "my-ranu-bun-app"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile.bun"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 1
  processes = ["app"]

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
```

Deploy with the Fly CLI:

```bash
fly deploy
```

### 5.2 Railway (Deno / Bun Deployment)

1. Connect your GitHub repository to Railway.
2. In **Settings > Build**, select **Dockerfile** and specify `Dockerfile.bun` or `Dockerfile.deno`.
3. Set Environment Variables:
   - `PORT=3000`
   - `NODE_ENV=production`
4. Railway will automatically build and expose your Ranu.js application behind its global reverse proxy.

---

## 6. Verification & Operational Observability

Ensure your Bun or Deno deployment meets production standards:

| Verification Target           | Test Method                                                  | Expected Result                                                    |
| :---------------------------- | :----------------------------------------------------------- | :----------------------------------------------------------------- |
| **Sub-20ms Process Boot**     | Measure container startup time from cold                     | HTTP socket accepts connections in < 20 ms                         |
| **Streaming SSR Execution**   | `curl -N http://localhost:3000/dashboard`                    | Layout shell flushes immediately; Suspense chunks stream cleanly   |
| **Zero Memory Growth**        | Execute 20,000 requests via `autocannon`                     | Memory plateau remains stable; no JSC/V8 leak accumulation         |
| **Deno Sandbox Verification** | Remove `--allow-read` flag and attempt to read `.ranu/build` | Deno throws PermissionDenied exception; sandbox integrity verified |
| **Client Abort Forwarding**   | Terminate `curl` mid-stream                                  | Stream reader aborts cleanly without unhandled rejection errors    |
