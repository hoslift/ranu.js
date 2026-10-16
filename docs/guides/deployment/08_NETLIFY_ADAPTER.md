# Deploying to Netlify (Edge & Serverless Functions)

**Netlify** provides an advanced hybrid hosting platform that combines a globally distributed edge Content Delivery Network (CDN) with regional serverless compute. When deploying **Ranu.js** to Netlify, applications take advantage of this architecture to serve immutable static assets and pre-rendered pages directly from edge points of presence, while routing dynamic Server-Side Rendering (SSR) and API routes through serverless compute with full Node.js 22 runtime support.

This guide covers Netlify's hybrid execution architecture, multi-cookie handling, edge middleware best practices, `netlify.toml` configuration, and production deployment workflows.

---

## 1. Overview & Platform Prerequisites

### Platform Overview & Execution Model

Netlify executes web applications across two distinct computing layers:

- **Global CDN & Edge Layer:** Serves pre-rendered pages and client bundles with automatic SSL, HTTP/3, and Brotli compression. Edge Functions (running on Deno/V8 isolates) can run lightweight middleware such as geolocation routing and authentication gating at the edge.
- **Serverless Compute Layer:** Executes dynamic React 19 Streaming SSR and API Route Handlers in regional Node.js 22 microVMs (powered by AWS Lambda). Compute resources scale automatically with traffic.

### Computing Tiers Comparison

| Dimension                | Tier 1: Netlify Edge Functions                    | Tier 2: Netlify Serverless Functions         |
| :----------------------- | :------------------------------------------------ | :------------------------------------------- |
| **Underlying Runtime**   | Deno / V8 Isolates                                | AWS Lambda (Node.js 22.x)                    |
| **Geographic Location**  | Globally distributed edge PoPs                    | Regional compute origin                      |
| **Typical Startup TTFB** | **< 15 ms**                                       | ~150 ms (warm) / ~1,200 ms (cold)            |
| **Primary Role**         | Geolocation routing, auth guards, header rewrites | React 19 Streaming SSR, database mutations   |
| **Filesystem Access**    | None (in-memory isolate)                          | Read-only with `/tmp` (512 MB scratch space) |

### Preserving Multiple Cookies via Standard Headers

In edge-to-serverless architectures, legacy proxies often fold multiple `Set-Cookie` headers into a single comma-separated string, corrupting cookie `Expires` dates. Ranu.js avoids this trap by using the standard W3C `Headers.prototype.getSetCookie()` API, ensuring session cookies, CSRF tokens, and flash messages arrive at the browser as discrete, un-joined headers.

### Edge Middleware Body Consumption Guard

If you deploy a Netlify Edge Function as middleware to inspect incoming mutation payloads, remember that W3C `Request` streams can only be read once. Always defensively clone the request before consuming its body:

```typescript
// netlify/edge-functions/auth-guard.ts
import type { Config, Context } from '@netlify/edge-functions';

export default async function middleware(request: Request, context: Context) {
  if (request.method === 'POST' || request.method === 'PUT') {
    // Clone request before reading stream to keep original stream untouched
    const cloned = request.clone();
    try {
      const body = await cloned.json();
      if (!body.apiKey) {
        return Response.json({ error: 'Missing API key' }, { status: 401 });
      }
    } catch {
      return Response.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
  }

  // Forward original request to downstream serverless SSR
  return context.next();
}

export const config: Config = {
  path: '/api/*',
};
```

### Account & Developer Tools Prerequisites

- A **Netlify Account** (Free, Pro, or Enterprise).
- **Node.js 22 LTS** installed locally.
- **Netlify CLI** installed globally or locally.

---

## 2. Package Installation

Install `@ranujs/core` and React 19 in your application root:

### Using pnpm

```bash
# Runtime dependencies
pnpm add @ranujs/core react react-dom

# Development dependencies
pnpm add -D netlify-cli typescript @types/node @types/react @types/react-dom
```

### Using npm

```bash
# Runtime dependencies
npm install @ranujs/core react react-dom

# Development dependencies
npm install -D netlify-cli typescript @types/node @types/react @types/react-dom
```

### Using yarn

```bash
# Runtime dependencies
yarn add @ranujs/core react react-dom

# Development dependencies
yarn add -D netlify-cli typescript @types/node @types/react @types/react-dom
```

Authenticate Netlify CLI with your account:

```bash
npx netlify login
```

---

## 3. Configuration in `ranu.config.ts`

Configure your project with standard `defineConfig` from `@ranujs/core/config`:

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

### Configuration Options Reference

| Option                  | Type                              | Default   | Description                                                 |
| :---------------------- | :-------------------------------- | :-------- | :---------------------------------------------------------- |
| `routing.trailingSlash` | `'always' \| 'never' \| 'ignore'` | `'never'` | Controls URL trailing slash normalization.                  |
| `build.sourceMaps`      | `boolean`                         | `false`   | Emits source maps for production debugging.                 |
| `build.minify`          | `boolean`                         | `true`    | Minifies JavaScript and CSS bundles for optimal load times. |

---

## 4. Build & Local Preview Commands

### Step 1: Compile Application Build

Compile your application source code into production artifacts:

```bash
pnpm ranu build
```

This compiles client and server graphs into `.ranu/build/`:

- `.ranu/build/static/`: Static assets and pre-rendered SSG pages published directly to Netlify's CDN.
- `.ranu/build/server/`: Compiled server-side route components and SSR runtime.

### Step 2: Configure `netlify.toml`

Create a `netlify.toml` file in your project root to configure the build pipeline, cache headers, and routing:

```toml
# netlify.toml
[build]
  command = "pnpm ranu build"
  publish = ".ranu/build/static"

[build.environment]
  NODE_VERSION = "22"
  NODE_ENV = "production"

# Aggressive immutable caching for hashed client assets
[[headers]]
  for = "/_ranu/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

# Static asset bypass
[[redirects]]
  from = "/_ranu/assets/*"
  to = "/_ranu/assets/:splat"
  status = 200

# Route dynamic traffic to origin serverless SSR
[[redirects]]
  from = "/*"
  to = "/.netlify/functions/ranu-ssr"
  status = 200
```

### Step 3: Local Preview with Netlify CLI

Run the local Netlify emulation environment:

```bash
npx netlify dev
```

Netlify CLI starts a local server (typically at `http://localhost:8888`), accurately simulating CDN redirects, header rules, edge functions, and serverless compute.

---

## 5. Deployment Commands & CLI Workflows

### Manual CLI Deployments

Deploy your application directly from your terminal using the Netlify CLI:

```bash
# Deploy a preview build with a unique preview URL
npx netlify deploy

# Deploy directly to the production live URL
npx netlify deploy --prod
```

### Automated CI/CD Pipeline (GitHub Actions)

Create `.github/workflows/deploy-netlify.yml` to automatically build and deploy your application on pushes to `main`:

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
        uses: pnpm/action-setup@v4
        with:
          run_install: false

      - name: Setup Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install Dependencies
        run: pnpm install --frozen-lockfile

      - name: Build Application
        run: pnpm ranu build
        env:
          NODE_ENV: production
          RANU_PUBLIC_SITE_URL: ${{ vars.RANU_PUBLIC_SITE_URL }}

      - name: Deploy to Netlify
        uses: nwtgck/actions-netlify@v3.0
        with:
          publish-dir: '.ranu/build/static'
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

#### Required GitHub Secrets

Configure these in your GitHub repository settings under **Settings → Secrets and variables → Actions**:

- `NETLIFY_AUTH_TOKEN`: Personal Access Token created in Netlify under User Settings → Applications → OAuth.
- `NETLIFY_SITE_ID`: Found in your Netlify site settings under **Site configuration → General → Site details → Site ID**.

---

## 6. Environment Variables & Secret Management

### Public vs. Server Secrets in Ranu.js

- **Public Variables (`RANU_PUBLIC_*`):** Embedded into client JavaScript bundles during `ranu build` (e.g. `RANU_PUBLIC_STRIPE_KEY`).
- **Server Secrets:** Variables without the prefix (e.g. `DATABASE_URL`, `AUTH_SECRET`) are never included in client assets and remain securely accessible only within server-side execution.

### Managing Secrets via Netlify CLI

Add or update environment variables directly from the command line:

```bash
# Set a production secret
netlify env:set DATABASE_URL "postgresql://user:password@db.example.com/prod"

# Set a variable for a specific deploy context
netlify env:set DATABASE_URL "postgresql://user:password@db.example.com/preview" --context deploy-preview

# List all configured environment variables
netlify env:list
```

### Managing Secrets in the Netlify Dashboard

1. Go to your site in the Netlify Dashboard.
2. Navigate to **Site configuration → Environment variables**.
3. Click **Add a variable** and enter the Key and Value.
4. Select the target deploy contexts: **Production**, **Deploy Previews**, and **Branch deploys**.
5. Click **Create variable**.

---

## 7. Production Hosting Dashboard Setup & Verification Checklist

### Netlify Dashboard Site Settings

When connecting your Git repository to Netlify, configure these build settings:

| Setting                 | Recommended Value                                     |
| :---------------------- | :---------------------------------------------------- |
| **Base directory**      | Empty / `./` (or application subfolder in a monorepo) |
| **Build command**       | `pnpm ranu build`                                     |
| **Publish directory**   | `.ranu/build/static`                                  |
| **Functions directory** | Default (`netlify/functions`)                         |

### Production Health & Verification Checklist

Verify your live Netlify deployment against this production checklist:

| Verification Target             | Test Method                                           | Expected Result                                                                             |
| :------------------------------ | :---------------------------------------------------- | :------------------------------------------------------------------------------------------ |
| **Multi-Cookie Preservation**   | Test login route setting multiple cookies             | Response contains discrete `Set-Cookie` headers; zero comma corruption or invalidation.     |
| **Request Body Forwarding**     | POST JSON payload through edge middleware             | Request body arrives fully readable at origin serverless handler; no `bodyUsed` exceptions. |
| **Static Asset CDN Bypass**     | Inspect response headers for `/_ranu/assets/*.js`     | Headers return `cache-control: public, max-age=31536000, immutable` and `x-nf-request-id`.  |
| **Pre-rendered Pages (SSG)**    | `curl -i https://your-domain.netlify.app/about`       | Returned directly from Netlify's CDN cache without invoking serverless functions.           |
| **Serverless Bundle Execution** | `curl -i -N https://your-domain.netlify.app/`         | Streaming SSR responds with `Transfer-Encoding: chunked` and status `200`.                  |
| **Secret Isolation**            | Inspect client JavaScript bundles in browser devtools | Zero private server secrets or database passwords in client bundles.                        |
