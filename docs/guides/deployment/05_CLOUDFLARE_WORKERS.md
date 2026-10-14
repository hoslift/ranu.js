# Deploying to Cloudflare Workers with Ranu.js

**Ranu.js** provides native, first-class support for Cloudflare Workers via the open-source `workerd` V8 isolate runtime. Because Ranu.js is architected from the ground up around standard W3C Web primitives (`Request`, `Response`, `ReadableStream`, `Headers`), applications execute directly on Cloudflare's global edge network with near-zero cold start overhead and sub-10ms Time to First Byte (TTFB).

This guide covers the V8 isolate execution model, resource limits, Node.js API compatibility, static asset hosting, background task scheduling with `waitUntil`, and production deployment workflows using Cloudflare Wrangler.

---

## 1. Overview & Platform Prerequisites

### Platform Overview & Execution Model

Cloudflare Workers does not execute code inside traditional virtual machines or Linux containers (such as Docker or AWS Lambda). Instead, execution is hosted by `workerd`, Cloudflare's runtime built on Google V8 isolates:

- **Sub-5ms Cold Starts:** Spinning up a V8 isolate requires only allocating a lightweight V8 context rather than booting an operating system kernel. Startup latency is virtually zero (<5ms globally).
- **Shared Process Multi-Tenancy:** Isolated tenant contexts execute concurrently within a shared host process. Isolation and memory boundaries are enforced cryptographically and through V8 virtual machine sandboxing.
- **Pure W3C Primitives:** Incoming HTTP requests are passed as standard W3C `Request` instances, and route handlers stream standard W3C `Response` bodies via `ReadableStream`.

### Edge Resource Ceilings

Unlike self-hosted Node.js servers with gigabytes of memory and unbounded execution timeouts, Cloudflare Workers operates under explicit resource ceilings:

| Limit Type               | Free Plan | Paid Plan (Standard / Workers Paid) | Architectural Consideration                                          |
| :----------------------- | :-------- | :---------------------------------- | :------------------------------------------------------------------- |
| **RAM Memory Ceiling**   | 128 MB    | 128 MB (up to 512 MB on request)    | React 19 streaming SSR prevents full-page HTML memory buffering      |
| **CPU Time per Request** | 10 ms     | 50 ms (up to 30s on Unbound)        | Wall-clock asynchronous I/O does not count against CPU quotas        |
| **Subrequest Cap**       | 50 calls  | 1,000 calls                         | Batch database calls and execute parallel fetches with `Promise.all` |
| **Request Payload Size** | 100 MB    | 500 MB                              | Consume request bodies via streams rather than buffering             |

### Node.js API Compatibility Boundaries

Cloudflare Workers supports Node.js compatibility through the `nodejs_compat` compatibility flag in `wrangler.toml`. Keep these edge boundaries in mind:

1. **No Persistent Filesystem (`node:fs`):** Cloudflare Workers has no persistent local disk. Static assets and pre-rendered pages are served via Cloudflare Static Assets (`[assets]`), while uploaded files should be stored in Cloudflare R2 object storage.
2. **Pure JavaScript and WebAssembly Only:** Native C/C++ addons (N-API packages like native `sharp` or `better-sqlite3`) cannot execute in V8 isolates. Use WebAssembly builds or edge-compatible drivers (such as `@wasm-codecs`, Cloudflare D1, or HTTP-based database drivers like Neon and PlanetScale).
3. **No Dynamic String Evaluation:** Calls to `eval()` or `new Function('...')` are prohibited in V8 isolates for security reasons. Ranu.js pre-compiles all JSX templates and route components into static ECMAScript modules at build time.

### Account & Developer Tools Prerequisites

- A **Cloudflare Account** with Workers enabled.
- **Node.js 22 LTS** installed locally.
- **Wrangler CLI** (the official Cloudflare developer CLI).

---

## 2. Package Installation

Install `@ranujs/core` alongside React 19 and the Wrangler CLI:

### Using pnpm

```bash
# Runtime dependencies
pnpm add @ranujs/core react react-dom

# Development dependencies
pnpm add -D wrangler typescript @types/node @types/react @types/react-dom
```

### Using npm

```bash
# Runtime dependencies
npm install @ranujs/core react react-dom

# Development dependencies
npm install -D wrangler typescript @types/node @types/react @types/react-dom
```

### Using yarn

```bash
# Runtime dependencies
yarn add @ranujs/core react react-dom

# Development dependencies
yarn add -D wrangler typescript @types/node @types/react @types/react-dom
```

Authenticate Wrangler with your Cloudflare account:

```bash
npx wrangler login
```

---

## 3. Configuration in `ranu.config.ts`

Configure your application using `defineConfig` from `@ranujs/core/config`:

```typescript
// ranu.config.ts
import { defineConfig } from '@ranujs/core/config';

export default defineConfig({
  routing: {
    trailingSlash: 'never',
  },
  build: {
    sourceMaps: false,
    minify: true,
  },
});
```

### Accessing Edge Features in Route Handlers

Ranu.js provides edge-native utilities through `@ranujs/core/server`. In your API Route Handlers or page loaders, you can access Cloudflare environment bindings and execution context cleanly:

```typescript
// src/routes/api/checkout/route.ts
import { getRequestContext } from '@ranujs/core/server';

export async function POST(request: Request) {
  const context = getRequestContext();
  const order = await request.json();

  // Access Cloudflare environment bindings (D1, KV, R2)
  const env = context.locals.get('env');
  if (env?.DB) {
    await env.DB.prepare('INSERT INTO orders (id, amount) VALUES (?, ?)').bind(order.id, order.amount).run();
  }

  // Defer non-blocking background telemetry without delaying the HTTP response
  context.waitUntil(
    fetch('https://telemetry.example.com/events', {
      method: 'POST',
      body: JSON.stringify({ event: 'order_created', orderId: order.id }),
      headers: { 'Content-Type': 'application/json' },
    }),
  );

  return Response.json({ success: true, orderId: order.id });
}
```

### Abort Signal Handling

When a visitor closes their browser tab or navigates away mid-stream, Cloudflare notifies the worker via `request.signal`. Ranu.js route handlers can listen for this signal to immediately terminate active database queries or external API calls:

```typescript
// src/routes/api/search/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') ?? '';

  // Forward client abort signal to upstream fetch to prevent wasted execution
  const response = await fetch(`https://api.upstream.com/search?q=${encodeURIComponent(query)}`, {
    signal: request.signal,
  });

  const results = await response.json();
  return Response.json(results);
}
```

---

## 4. Build & Local Preview Commands

### Step 1: Compile Application Build

Compile your application source code into platform-neutral production artifacts:

```bash
pnpm ranu build
```

This compiles client and server graphs into `.ranu/build/`:

- `.ranu/build/static/`: Static assets and pre-rendered SSG pages served by Cloudflare Static Assets.
- `.ranu/build/server/entry.mjs`: Production server bundle executable within `workerd`.

### Step 2: Configure `wrangler.toml`

Create a `wrangler.toml` file in the root of your project to connect Cloudflare Workers with Static Assets:

```toml
# wrangler.toml
name = "my-ranu-app"
main = ".ranu/build/server/entry.mjs"
compatibility_date = "2026-10-01"
compatibility_flags = ["nodejs_compat"]

# Serve static assets directly from the global CDN
[assets]
directory = ".ranu/build/static"
binding = "ASSETS"
html_handling = "auto-trailing-slash"
not_found_handling = "single-page-application"

[vars]
ENVIRONMENT = "production"
```

### Step 3: Local Preview with Wrangler

Preview your production build locally in the exact same `workerd` V8 isolate engine used in production:

```bash
npx wrangler dev
```

Wrangler launches a local server (typically at `http://localhost:8787`), serving static assets from `.ranu/build/static` and executing server routes with sub-10ms streaming SSR.

---

## 5. Deployment Commands & CLI Workflows

### Manual CLI Deployments

Deploy your application directly to Cloudflare's worldwide network:

```bash
# Deploy to production
npx wrangler deploy

# Deploy to a preview or staging environment
npx wrangler deploy --env staging
```

Once deployment completes, Wrangler outputs your live URL (e.g. `https://my-ranu-app.<your-subdomain>.workers.dev`).

### Background Tasks with `context.waitUntil()`

In Cloudflare Workers, **all isolate execution freezes the instant the HTTP `Response` stream finishes**, unless work is scheduled via `waitUntil()`. Any un-awaited promise will be terminated mid-execution:

```typescript
// ✅ Correct: use context.waitUntil() to schedule background tasks safely
context.waitUntil(sendAuditLog({ event: 'user_login', userId: user.id }));
```

### Automated CI/CD Pipeline (GitHub Actions)

Create `.github/workflows/deploy-cloudflare.yml` to automatically build and deploy your application on pushes to `main`:

```yaml
# .github/workflows/deploy-cloudflare.yml
name: Deploy to Cloudflare Workers

on:
  push:
    branches:
      - main

jobs:
  deploy:
    name: Build & Deploy to Cloudflare
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          run_install: false

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Compile application
        run: pnpm ranu build
        env:
          NODE_ENV: production
          RANU_PUBLIC_SITE_URL: ${{ vars.RANU_PUBLIC_SITE_URL }}

      - name: Deploy to Cloudflare Workers
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: deploy
```

#### Required GitHub Secrets

Configure these in GitHub repository settings under **Settings → Secrets and variables → Actions**:

- `CLOUDFLARE_API_TOKEN`: API Token created in the Cloudflare Dashboard with **Edit Cloudflare Workers** permissions.
- `CLOUDFLARE_ACCOUNT_ID`: Your Cloudflare Account ID (found in the Workers & Pages dashboard overview).

---

## 6. Environment Variables & Secret Management

### Public vs. Edge Secrets in Ranu.js

- **Public Variables (`RANU_PUBLIC_*`):** Embedded into client bundles during `ranu build` (e.g. `RANU_PUBLIC_ANALYTICS_ID`).
- **Encrypted Edge Secrets:** Sensitive credentials (such as database passwords, Stripe secret keys, and JWT secrets) should never be committed to source control or exposed in public configuration.

### Managing Secrets with Wrangler

Use Wrangler CLI to encrypt and upload secrets to Cloudflare:

```bash
# Upload production secret
npx wrangler secret put DATABASE_URL

# Upload secret to a specific environment
npx wrangler secret put DATABASE_URL --env staging

# List configured secret names
npx wrangler secret list
```

### Non-Secret Variables in `wrangler.toml`

For non-sensitive runtime configuration, define variables under the `[vars]` table:

```toml
[vars]
ENVIRONMENT = "production"
APP_NAME = "My Ranu App"
```

### Cloudflare Database & Storage Bindings

Declare cloud resource bindings directly in `wrangler.toml`:

```toml
# Cloudflare D1 SQLite Database
[[d1_databases]]
binding = "DB"
database_name = "ranu_prod_db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# Cloudflare KV Namespace
[[kv_namespaces]]
binding = "CACHE_KV"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Cloudflare R2 Object Storage
[[r2_buckets]]
binding = "BUCKET"
bucket_name = "my-ranu-uploads"
```

---

## 7. Production Hosting Dashboard Setup & Verification Checklist

### Cloudflare Dashboard Configuration

1. Navigate to **Workers & Pages** in your Cloudflare dashboard.
2. Select your Worker project (`my-ranu-app`).
3. **Custom Domains:** Under **Settings → Triggers → Custom Domains**, bind your production domain (e.g. `app.example.com`). Cloudflare automatically provisions SSL and configures DNS routing.
4. **Compatibility Settings:** Verify under **Settings → Runtime** that the Compatibility Date is set to `2026-10-01` or later and `nodejs_compat` is enabled.
5. **Observability:** Enable **Workers Analytics Engine** or **Tail Logs** under **Observability** to view real-time CPU time, request latencies, and error rates.

### Production Health & Verification Checklist

Verify your live Cloudflare Worker deployment against this production checklist:

| Verification Target      | Test Method                                                                  | Expected Result                                                                                                      |
| :----------------------- | :--------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------- |
| **Sub-20ms TTFB**        | `curl -w "%{time_starttransfer}\n" -o /dev/null -s https://app.workers.dev/` | Global cold and warm invocations achieve TTFB < 20ms.                                                                |
| **Streaming SSR**        | `curl -i -N https://app.workers.dev/dashboard`                               | Layout shell arrives immediately; dynamic `<Suspense>` chunks stream sequentially with `Transfer-Encoding: chunked`. |
| **Static CDN Caching**   | Inspect response headers for `/_ranu/assets/*.js`                            | Headers return `cf-cache-status: HIT` and `cache-control: public, max-age=31536000, immutable`.                      |
| **Memory Ceiling Check** | Monitor Worker metrics in Cloudflare Dashboard                               | Memory usage remains flat below 30 MB; zero `Error 1101: Worker Threw Exception` crashes.                            |
| **CPU Limit Compliance** | Inspect P99 CPU metrics in Cloudflare Dashboard                              | Median CPU execution time < 5ms; zero `Error 1102: Worker Exceeded CPU Limit` aborts.                                |
| **Background Tasks**     | Verify telemetry or audit logging scheduled via `context.waitUntil()`        | Logs settle cleanly in external observability stores without delaying the user HTTP response.                        |
| **Secret Isolation**     | Inspect client browser bundles                                               | Zero private server secrets or database credentials present in client JavaScript assets.                             |
