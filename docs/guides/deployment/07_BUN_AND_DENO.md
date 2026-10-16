# Deploying with Bun and Deno Runtimes

Modern JavaScript infrastructure offers high-performance runtime alternatives to traditional Node.js. Both **Bun** and **Deno** provide first-class, native implementations of the W3C Web Fetch standards (`Request`, `Response`, `ReadableStream`, `Headers`).

Because **Ranu.js** is architected around standard W3C Web primitives, running a Ranu.js application on Bun or Deno requires zero transport transformation overhead. Incoming HTTP requests are passed directly into the Ranu runtime, delivering maximum throughput and sub-10ms process boot times.

This guide explores the W3C Web Standards architecture, Bun and Deno runtime execution, standalone binary compilation, containerized deployments, and production operational patterns.

---

## 1. Overview & Platform Prerequisites

### Platform Overview & Execution Model

Both Bun and Deno offer modern engines optimized for developer velocity, native TypeScript execution, and W3C standard compliance:

| Feature / Metric          | Bun                                  | Deno                             | Node.js (v22+)                   |
| :------------------------ | :----------------------------------- | :------------------------------- | :------------------------------- |
| **JavaScript Engine**     | JavaScriptCore (Apple / WebKit)      | V8 (Google Chrome)               | V8 (Google Chrome)               |
| **Core Systems Language** | Zig / C++                            | Rust / C++                       | C++ / C                          |
| **Async Event Loop**      | Custom Zig Event Loop (epoll/kqueue) | Tokio (Rust)                     | libuv (C)                        |
| **Process Boot Time**     | **< 10 ms**                          | **< 20 ms**                      | ~100–300 ms                      |
| **Native TypeScript/JSX** | Built-in (native fast transpiler)    | Built-in (SWC compiler)          | Requires compilation/loaders     |
| **Security Permissions**  | Permissive by default (like Node)    | Secure by default (opt-in flags) | Permissive by default            |
| **Standalone Executable** | `bun build --compile`                | `deno compile`                   | `node --experimental-sea-config` |

### Platform Prerequisites & Installations

Ensure you have the required runtime installed:

- **Bun (v1.1+):**
  ```bash
  curl -fsSL https://bun.sh/install | bash
  ```
- **Deno (v1.45+):**
  ```bash
  curl -fsSL https://deno.land/install.sh | sh
  ```

---

## 2. Package Installation

Install `@ranujs/core` and React 19 using your runtime's native package manager:

### Using Bun

```bash
# Runtime dependencies
bun add @ranujs/core react react-dom

# Development dependencies
bun add -d typescript @types/node @types/react @types/react-dom
```

### Using Deno

```bash
# Add npm packages to deno.json
deno add npm:@ranujs/core npm:react npm:react-dom
deno add -D npm:typescript npm:@types/node npm:@types/react npm:@types/react-dom
```

### Using pnpm

```bash
# Runtime dependencies
pnpm add @ranujs/core react react-dom

# Development dependencies
pnpm add -D typescript @types/node @types/react @types/react-dom
```

---

## 3. Configuration in `ranu.config.ts`

Configure your project with standard `defineConfig` from `@ranujs/core/config`:

```typescript
// ranu.config.ts
import { defineConfig } from '@ranujs/core/config';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
    trustProxy: true,
  },
  build: {
    sourceMaps: false,
    minify: true,
  },
});
```

### Configuration Options Reference

| Option              | Type      | Default     | Description                                              |
| :------------------ | :-------- | :---------- | :------------------------------------------------------- |
| `server.port`       | `number`  | `3000`      | Port for the HTTP server to listen on.                   |
| `server.host`       | `string`  | `'0.0.0.0'` | Host address to bind the listener to.                    |
| `server.trustProxy` | `boolean` | `false`     | Parses upstream reverse proxy headers (`X-Forwarded-*`). |
| `build.minify`      | `boolean` | `true`      | Minifies client and server bundles during compilation.   |

---

## 4. Build & Local Preview Commands

### Step 1: Compile Application Build

Compile your application source code into production artifacts:

```bash
# Using pnpm
pnpm ranu build

# Or using Bun
bun run ./node_modules/.bin/ranu build
```

This compiles client and server graphs into `.ranu/build/`:

- `.ranu/build/static/assets/`: Hashed immutable client JavaScript and CSS bundles.
- `.ranu/build/static/pages/`: Pre-rendered static HTML pages.
- `.ranu/build/server/`: Compiled server route bundles.

### Step 2: Running with Bun

Start the production server directly with Bun:

```bash
bun run ./node_modules/.bin/ranu start
```

Alternatively, you can create a custom `server-bun.ts` entry using `@ranujs/core/server`:

```typescript
// server-bun.ts
import { createProductionRuntime } from '@ranujs/core/server';

const runtime = await createProductionRuntime({
  buildDir: '.ranu/build',
});

const port = Number(process.env.PORT) || 3000;
const hostname = process.env.HOST || '0.0.0.0';

export default {
  port,
  hostname,
  fetch(req: Request): Promise<Response> | Response {
    // Pure standard dispatch: W3C Request in, W3C Response out
    return runtime.handle(req);
  },
  error(error: Error) {
    console.error('[Bun Server Error]:', error);
    return new Response('Internal Server Error', { status: 500 });
  },
};

console.log(`Bun production server listening on http://${hostname}:${port}`);
```

Run with Bun:

```bash
bun run server-bun.ts
```

### Step 3: Running with Deno

Deno provides native support for W3C Fetch handlers via `Deno.serve()`:

```typescript
// server-deno.ts
import { createProductionRuntime } from 'npm:@ranujs/core/server';

const runtime = await createProductionRuntime({
  buildDir: '.ranu/build',
});

const port = Number(Deno.env.get('PORT') ?? '3000');
const hostname = Deno.env.get('HOST') ?? '0.0.0.0';

Deno.serve(
  {
    port,
    hostname,
    onListen({ hostname, port }) {
      console.log(`Deno server listening on http://${hostname}:${port}`);
    },
  },
  (req: Request): Promise<Response> => {
    return runtime.handle(req);
  },
);
```

Run with Deno's secure sandbox permissions:

```bash
deno run \
  --allow-net=0.0.0.0:3000 \
  --allow-read=.ranu/build,public \
  --allow-env=PORT,HOST,NODE_ENV,DATABASE_URL \
  server-deno.ts
```

---

## 5. Deployment Commands & CLI Workflows

### 5.1 Standalone Single-Binary Compilation

Both Bun and Deno allow compiling your full-stack application and runtime into a single, self-contained executable binary that can be deployed to servers without installing any runtime dependencies:

#### Bun Standalone Compilation

```bash
# Compile server and dependencies into a standalone binary
bun build ./server-bun.ts --compile --outfile ranu-bun-app

# Execute the self-contained binary
./ranu-bun-app
```

#### Deno Standalone Compilation

```bash
# Cross-compile to a standalone executable
deno compile \
  --allow-net \
  --allow-read \
  --allow-env \
  --output ranu-deno-app \
  server-deno.ts

# Execute the binary
./ranu-deno-app
```

---

### 5.2 Containerized Deployments (Docker)

#### Minimal Bun Dockerfile (Alpine Linux)

```dockerfile
# Dockerfile.bun
FROM oven/bun:1.1-alpine AS base
WORKDIR /app

# Dependencies Stage
FROM base AS dependencies
COPY package.json bun.lockb* pnpm-lock.yaml* ./
RUN bun install --frozen-lockfile

# Builder Stage
FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
RUN bun run ./node_modules/.bin/ranu build

# Production Runner
FROM base AS runner
WORKDIR /app
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

#### Minimal Deno Dockerfile (Alpine Linux)

```dockerfile
# Dockerfile.deno
FROM denoland/deno:alpine-1.45.0 AS base
WORKDIR /app

# Build stage using Node/pnpm
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm ranu build

# Production Runner
FROM base AS runner
WORKDIR /app
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

### 5.3 Platform-as-a-Service (PaaS) Recipes

#### Deploying Bun to Fly.io

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

#### Deploying Deno / Bun to Railway

1. Connect your GitHub repository to Railway.
2. In **Settings → Build**, select **Dockerfile** and specify `Dockerfile.bun` or `Dockerfile.deno`.
3. Set environment variables (`PORT=3000`, `NODE_ENV=production`).
4. Railway builds and exposes your Ranu.js application behind its global edge proxy.

---

### 5.4 Automated CI/CD Pipeline (GitHub Actions)

Deploy Docker containers for Bun or Deno using GitHub Actions:

```yaml
# .github/workflows/deploy-bun.yml
name: Build & Deploy Bun Container

on:
  push:
    branches:
      - main

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push Bun Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: Dockerfile.bun
          push: true
          tags: ghcr.io/${{ github.repository }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

---

## 6. Environment Variables & Secret Management

### Public vs. Runtime Secrets in Ranu.js

- **Public Variables (`RANU_PUBLIC_*`):** Injected into client browser bundles during `ranu build` (e.g. `RANU_PUBLIC_API_URL`).
- **Server-Only Secrets:** Any variable without this prefix (e.g. `DATABASE_URL`, `AUTH_SECRET`) is never bundled into client assets.

### Managing Secrets with Bun

Bun automatically loads `.env` and `.env.production` files when starting the server:

```bash
# Bun automatically loads .env.production when NODE_ENV=production
NODE_ENV=production bun run server-bun.ts
```

### Managing Secrets with Deno

Deno's sandboxing requires explicitly granting access to environment variables via `--allow-env`:

```bash
# Restrict Deno environment access to specific application variables
deno run --allow-env=PORT,HOST,NODE_ENV,DATABASE_URL,AUTH_SECRET server-deno.ts
```

---

## 7. Production Hosting Setup & Verification Checklist

### Production Health & Verification Checklist

Verify your Bun or Deno deployment against this checklist:

| Verification Target           | Test Method                                                  | Expected Result                                                                                                              |
| :---------------------------- | :----------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------- |
| **Sub-20ms Process Boot**     | Measure container startup time from cold                     | HTTP socket accepts connections in < 20 ms.                                                                                  |
| **Streaming SSR Execution**   | `curl -i -N http://localhost:3000/`                          | Response headers contain `Transfer-Encoding: chunked`. Layout shell flushes immediately; dynamic chunks stream sequentially. |
| **Zero Memory Leak Creep**    | Run load test (`ab -n 5000 -c 50 http://localhost:3000/`)    | Memory usage plateaus cleanly without unbounded JavaScriptCore or V8 heap growth.                                            |
| **Deno Sandbox Verification** | Remove `--allow-read` flag and attempt to read `.ranu/build` | Deno throws a `PermissionDenied` error, confirming sandbox isolation.                                                        |
| **Client Abort Forwarding**   | Terminate `curl` mid-stream                                  | Stream reader aborts cleanly without unhandled rejection errors in runtime logs.                                             |
| **Secret Isolation**          | Inspect client JavaScript bundles in browser devtools        | Zero server secrets or database passwords in client bundles.                                                                 |
