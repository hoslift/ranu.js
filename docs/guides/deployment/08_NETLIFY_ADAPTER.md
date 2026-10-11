# Deploying to Netlify (Edge & Serverless Functions)

**Netlify** provides an advanced hybrid hosting infrastructure combining globally distributed edge compute with regional serverless microVMs. When deploying **Ranu.js** to Netlify, applications leverage this **Hybrid Two-Tier Model** to execute lightweight routing and authentication checks at the edge while delegating full-stack React 19 Streaming SSR to regional origin functions.

This guide details the hybrid two-tier execution model, the multi-cookie header folding bug, the request body consumption trap (`request.bodyUsed = true`), dual cold-start mitigations, and production configuration recipes.

---

## 1. The Hybrid Two-Tier Computing Infrastructure

Netlify separates compute into two physically distinct hosting tiers:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Netlify Global CDN PoPs                         │
│                                                                        │
│   Incoming Client HTTP Request                                         │
│                 │                                                      │
│                 ▼                                                      │
│   ┌───────────────────────────┐      Static Match?                     │
│   │ Netlify Global CDN Cache  │ ────────────────────────► Return Asset │
│   └─────────────┬─────────────┘                           (Cached)     │
│                 │ Dynamic Route                                        │
│                 ▼                                                      │
│   ┌───────────────────────────┐                                        │
│   │ Tier 1: Edge Functions    │ (Deno / V8 Edge Isolates)              │
│   │   - Geolocation rewrites  │ Latency: < 15ms                        │
│   │   - Auth gatekeeping      │ Worldwide CDN PoPs                     │
│   │   - Defensive body clone  │                                        │
│   └─────────────┬─────────────┘                                        │
└─────────────────┼──────────────────────────────────────────────────────┘
                  │ Forward Stream
                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     AWS Lambda Regional Origin                         │
│                                                                        │
│   ┌───────────────────────────┐                                        │
│   │ Tier 2: Serverless SSR    │ (Node.js 22 Runtime)                   │
│   │   - React 19 Streaming SSR│ Regional Origin Compute                │
│   │   - Relational DB queries │ Direct DB VPC Access                   │
│   │   - Multi-cookie arrays   │                                        │
│   └───────────────────────────┘                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Tier Comparison

| Dimension                    | Tier 1: Netlify Edge Functions             | Tier 2: Netlify Serverless Functions         |
| :--------------------------- | :----------------------------------------- | :------------------------------------------- |
| **Underlying Runtime**       | Deno / V8 Isolates                         | AWS Lambda (Node.js 22.x)                    |
| **Geographic Location**      | Globally distributed edge CDN PoPs         | Single regional origin (e.g. `us-east-1`)    |
| **Typical Startup TTFB**     | **< 15 ms**                                | ~150 ms (warm) / ~1,200 ms (cold)            |
| **Execution Responsibility** | Geolocation routing, auth tokens, rewrites | React 19 Streaming SSR, database mutations   |
| **Filesystem Access**        | None (in-memory isolate)                   | Read-only with `/tmp` (512 MB scratch space) |

---

## 2. Multi-Cookie Preservation & The Header Folding Bug

One of the most persistent bugs in edge-to-serverless proxy architectures is the **HTTP Header Folding Bug** for multiple `Set-Cookie` headers.

### 2.1 The Root Cause: RFC 2616 Folding Trap

Under the legacy RFC 2616 HTTP specification, intermediate proxies are permitted to fold multiple headers sharing the same key into a single comma-separated header:

```http
Set-Cookie: session=xyz123; Path=/; HttpOnly, csrf_token=abc456; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT
```

However, HTTP cookie `Expires` attributes **contain commas** in their standard RFC 1123 date format (`Wed, 21 Oct 2026`). When downstream browsers receive a comma-folded `Set-Cookie` header, their cookie parsers split on the date comma, corrupting the session token and invalidating the user's authentication state.

### 2.2 Ranu.js Solution: Discrete Cookie Arrays via `Headers.getSetCookie()`

Rather than relying on `response.headers.get('set-cookie')` (which returns a single comma-joined string), Ranu.js uses the modern W3C `Headers.prototype.getSetCookie()` API to extract cookie definitions as an array of discrete, un-joined strings:

```typescript
// netlify/functions/ranu-ssr.ts
import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions';
import { createProductionRuntime } from '@ranu/runtime-node';
import { toWebRequest } from '@ranu/runtime-node';

const runtime = await createProductionRuntime();

export const handler: Handler = async (event: HandlerEvent): Promise<HandlerResponse> => {
  const webRequest = toWebRequest(event);
  const webResponse = await runtime.handle(webRequest);

  // Extract cookies using standard getSetCookie() to avoid comma-folding
  const setCookies = webResponse.headers.getSetCookie?.() ?? [];

  // Assemble Netlify-compliant multiValueHeaders
  const headers: Record<string, string> = {};
  for (const [key, value] of webResponse.headers.entries()) {
    if (key.toLowerCase() !== 'set-cookie') {
      headers[key] = value;
    }
  }

  const responseBody = await webResponse.text();

  return {
    statusCode: webResponse.status,
    headers,
    // Preserve discrete Set-Cookie entries without comma folding
    multiValueHeaders: {
      'Set-Cookie': setCookies,
    },
    body: responseBody,
  };
};
```

This guarantees that session cookies, CSRF tokens, and flash messages arrive at the client browser intact and correctly delimited.

---

## 3. The Request Body Consumption Trap (`request.bodyUsed = true`)

In Netlify's hybrid model, developers frequently deploy **Edge Functions** (Tier 1) as middleware to authenticate API requests or inspect payloads before forwarding them to **Serverless Functions** (Tier 2).

### 3.1 The Failure Mode

W3C `Request` bodies are backed by standard `ReadableStream` instances that can only be read once. If an edge function inspects the request body directly:

```typescript
// ❌ FATAL ERROR IN EDGE MIDDLEWARE
export default async function middleware(request: Request, context: any) {
  // Reading the body locks and drains the underlying stream
  const payload = await request.json();

  if (payload.role !== 'admin') {
    return new Response('Unauthorized', { status: 403 });
  }

  // 💥 THROWS: TypeError: Request body is already used
  return context.next(request);
}
```

Because `request.bodyUsed` is now `true`, the runtime refuses to forward the stream to the origin serverless function, throwing an uncaught `TypeError`.

### 3.2 The Mandatory `request.clone()` Guard

Before reading or inspecting incoming request bodies in Netlify Edge Functions, developers must defensively clone the request:

```typescript
// netlify/edge-functions/auth-guard.ts
import type { Config, Context } from '@netlify/edge-functions';

export default async function middleware(request: Request, context: Context) {
  // Only inspect mutations with bodies
  if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
    // ✅ SAFE: Clone request before consuming stream
    const clonedRequest = request.clone();

    try {
      const body = await clonedRequest.json();
      if (!body.apiKey) {
        return Response.json({ error: 'Missing API key' }, { status: 401 });
      }
    } catch {
      return Response.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
  }

  // The original `request` stream remains untouched and streamable to origin
  return context.next();
}

export const config: Config = {
  path: '/api/*',
};
```

Cloning creates a separate internal tee stream, preserving the original `ReadableStream` for downstream SSR execution.

---

## 4. Dual Cold-Start Latency & Mitigation Strategies

When an incoming request transitions through both compute tiers, cold starts can compound:

```
Client Request ──► Edge Function Boot (15ms) ──► Origin Lambda Boot (1,200ms) ──► TTFB > 1.3s
```

### 4.1 Mitigation 1: CDN Static Asset Bypass

Never route static client assets (`/_ranu/assets/*`), images, or pre-rendered pages through edge or serverless compute. Netlify's global CDN should serve these assets directly:

```toml
# netlify.toml
# Ensure static assets bypass all compute layers
[[headers]]
  for = "/_ranu/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[redirects]]
  from = "/_ranu/assets/*"
  to = "/_ranu/assets/:splat"
  status = 200
```

### 4.2 Mitigation 2: Lean Serverless Bundling (< 10 MB)

AWS Lambda decompression and initialization latency scale directly with bundle size. Heavy server bundles (>50 MB) introduce 2,000ms+ cold starts.

Ranu.js utilizes an AST dead-code elimination pipeline in `@ranu/build` to ensure that serverless bundles remain under **10 MB**:

- Client-only components and third-party browser libraries are stripped from the server graph.
- Heavy development tools (`esbuild`, TypeScript compiler) are excluded from production artifacts.
- Keep Lambda cold start initialization under **150 milliseconds**.

### 4.3 Mitigation 3: Edge Shell Streaming

For highly dynamic pages, Tier 1 Edge Functions can stream the static HTML `<head>` and skeleton layout to the client browser immediately, while initiating the Tier 2 origin call asynchronously in the background.

---

## 5. Production Configuration Recipes

### 5.1 `netlify.toml` Production Configuration

```toml
# netlify.toml
[build]
  command = "pnpm ranu build"
  publish = ".ranu/build/client"
  functions = ".netlify/functions-internal"

[build.environment]
  NODE_VERSION = "22"
  NODE_ENV = "production"

# Declare Edge Functions (Tier 1)
[[edge_functions]]
  path = "/api/*"
  function = "ranu-edge"

# Declare Serverless Functions (Tier 2)
[functions]
  node_bundler = "esbuild"
  included_files = [".ranu/build/server/**", ".ranu/build/build.json"]

# Route dynamic traffic to origin SSR function
[[redirects]]
  from = "/_ranu/assets/*"
  to = "/_ranu/assets/:splat"
  status = 200

[[redirects]]
  from = "/*"
  to = "/.netlify/functions/ranu-ssr"
  status = 200
```

### 5.2 Serverless Function Entrypoint (`ranu-ssr.ts`)

```typescript
// netlify/functions/ranu-ssr.ts
import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { createProductionRuntime } from '@ranu/runtime-node';
import { toWebRequest } from '@ranu/runtime-node';

let runtimePromise: Promise<any> | null = null;

function getRuntime() {
  if (!runtimePromise) {
    runtimePromise = createProductionRuntime({
      buildDir: '.ranu/build',
    });
  }
  return runtimePromise;
}

export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  const runtime = await getRuntime();
  const request = toWebRequest(event);

  const response = await runtime.handle(request, {
    locals: {
      netlifyContext: context,
    },
  });

  const setCookies = response.headers.getSetCookie?.() ?? [];
  const headers: Record<string, string> = {};

  for (const [key, value] of response.headers.entries()) {
    if (key.toLowerCase() !== 'set-cookie') {
      headers[key] = value;
    }
  }

  const body = await response.text();

  return {
    statusCode: response.status,
    headers,
    multiValueHeaders: {
      'Set-Cookie': setCookies,
    },
    body,
  };
};
```

---

## 6. Build & Deployment Workflow

### Step 1: Compile Application

```bash
pnpm ranu build --clean
```

### Step 2: Test Locally with Netlify CLI

Run the local Netlify emulation environment:

```bash
# Install Netlify CLI globally if needed
pnpm add -g netlify-cli

# Start local edge and serverless emulation
netlify dev
```

### Step 3: Deploy to Production

Deploy directly from your terminal or link to Git for continuous deployment:

```bash
# Deploy preview build
netlify deploy

# Deploy directly to production CDN
netlify deploy --prod
```

---

## 7. Automated CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/deploy-netlify.yml
name: Deploy to Netlify

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
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

      - name: Deploy to Netlify
        uses: nwtgck/actions-netlify@v3.0
        with:
          publish-dir: '.ranu/build/client'
          production-deploy: true
          github-token: ${{ secrets.GITHUB_TOKEN }}
          deploy-message: 'Deploy commit ${{ github.sha }}'
          enable-pull-request-comment: false
          enable-commit-comment: true
          overwrites-pull-request-comment: true
        env:
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
          NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
```

---

## 8. Verification & Operational Observability

| Verification Target           | Test Method                                             | Expected Result                                                          |
| :---------------------------- | :------------------------------------------------------ | :----------------------------------------------------------------------- |
| **Multi-Cookie Preservation** | Execute login route setting session and CSRF cookies    | Response contains discrete `Set-Cookie` headers; zero comma corruption   |
| **Request Body Forwarding**   | POST JSON payload to edge-guarded API route             | Body arrives fully readable at origin function; no `bodyUsed` crash      |
| **Static Asset Bypass**       | Inspect `/_ranu/assets/main.[hash].js` response headers | Served directly from CDN with `x-nf-request-id` and 1-year cache headers |
| **Serverless Bundle Size**    | Check `.netlify/functions-internal/ranu-ssr.zip`        | Archive size < 10 MB; cold start initialization < 150ms                  |
| **Edge Function Execution**   | Inspect response headers for `/api/*`                   | Header `x-nf-edge-functions` confirms Tier 1 edge execution              |
