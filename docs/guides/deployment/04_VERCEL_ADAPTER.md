# Deploying to Vercel with `@ranujs/adapter-vercel`

**Ranu.js** provides an official first-party deployment adapter—`@ranujs/adapter-vercel`—that transforms pre-compiled production build artifacts into the [Vercel Build Output API (v3)](https://vercel.com/docs/build-output-api/v3) specification.

This enables zero-configuration, production-grade deployments on Vercel with automatic serverless functions, React 19 streaming Server-Side Rendering (SSR), immutable static asset edge routing, and full W3C Web Standards compatibility.

---

## 1. Overview & Platform Prerequisites

### Platform Overview & Execution Model

Vercel executes full-stack web applications using a hybrid serverless and edge architecture:

- **Edge Network (CDN):** Serves pre-rendered static pages (SSG) and hashed client assets directly from globally distributed points of presence with automatic SSL and HTTP/3 support.
- **Serverless Compute (MicroVMs):** Dynamic Server-Side Rendering (SSR) and API Route Handlers execute within ephemeral, containerized Node.js 22 microVMs. Compute resources automatically scale from zero to tens of thousands of concurrent requests.

### Account & Infrastructure Prerequisites

- A **Vercel Account** (Hobby, Pro, or Enterprise).
- **Node.js 22 LTS** installed in your development environment.
- A connected Git repository (GitHub, GitLab, or Bitbucket) for continuous deployments.

### Developer Tools & CLI Installation

Install the official Vercel CLI globally or as a project dev dependency:

```bash
# Global installation via pnpm
pnpm add -g vercel

# Or via npm
npm install -g vercel
```

Verify your authentication status:

```bash
vercel login
```

---

## 2. Package Installation

Install the public Ranu.js runtime dependencies along with the official `@ranujs/adapter-vercel` package:

### Using pnpm

```bash
# Runtime dependencies
pnpm add @ranujs/core react react-dom

# Development & adapter dependencies
pnpm add -D @ranujs/adapter-vercel typescript @types/node @types/react @types/react-dom
```

### Using npm

```bash
# Runtime dependencies
npm install @ranujs/core react react-dom

# Development & adapter dependencies
npm install -D @ranujs/adapter-vercel typescript @types/node @types/react @types/react-dom
```

### Using yarn

```bash
# Runtime dependencies
yarn add @ranujs/core react react-dom

# Development & adapter dependencies
yarn add -D @ranujs/adapter-vercel typescript @types/node @types/react @types/react-dom
```

---

## 3. Configuration in `ranu.config.ts`

Import and register the Vercel adapter inside your `ranu.config.ts` configuration file using `defineConfig`:

```typescript
// ranu.config.ts
import { defineConfig } from '@ranujs/core/config';
import { vercelAdapter } from '@ranujs/adapter-vercel';

export default defineConfig({
  deployment: {
    adapter: vercelAdapter({
      runtimeVersion: 'nodejs22.x',
      memory: 1024,
      maxDuration: 15,
      regions: ['iad1', 'sfo1'],
      clean: true,
    }),
  },
});
```

### Configuration Options Reference

The `vercelAdapter` factory accepts a `VercelAdapterOptions` object:

| Option           | Type       | Default            | Description                                                                                                                  |
| :--------------- | :--------- | :----------------- | :--------------------------------------------------------------------------------------------------------------------------- |
| `outputDir`      | `string`   | `'.vercel/output'` | Destination directory for Vercel Build Output API v3 artifacts. Must reside within the project root.                         |
| `runtimeVersion` | `string`   | `'nodejs22.x'`     | Target Node.js runtime version for Vercel Serverless Functions.                                                              |
| `regions`        | `string[]` | _Vercel Default_   | Specific compute regions where serverless functions are deployed (e.g. `['iad1', 'sfo1']`).                                  |
| `memory`         | `number`   | `1024`             | Memory limit in MB for serverless functions (e.g. `512`, `1024`, `3008`). Higher memory allocates proportional vCPU compute. |
| `maxDuration`    | `number`   | _Plan Default_     | Maximum function execution timeout in seconds (subject to plan ceilings: 15s Hobby, 300s Pro, 900s Enterprise).              |
| `clean`          | `boolean`  | `true`             | When `true`, removes existing output directories before generating fresh deployment artifacts.                               |

---

## 4. Build & Local Preview Commands

Deploying to Vercel is a two-phase process: first compiling your Ranu.js application, then adapting the output for Vercel.

### Step 1: Compile Application Build

Compile your application source code into platform-neutral production artifacts:

```bash
pnpm ranu build
```

This compiles client and server bundles, generates route manifests, and outputs to `.ranu/build/`:

- `.ranu/build/static/assets/`: Hashed client JavaScript and CSS bundles.
- `.ranu/build/static/pages/`: Pre-rendered static HTML files (SSG).
- `.ranu/build/server/`: Compiled server-side route components and handlers.

### Step 2: Generate Vercel Output Artifacts

Transform the build artifacts into the standardized Vercel Build Output API v3 layout:

```bash
pnpm ranu deploy
```

_(Note: If you have not registered `vercelAdapter` in `ranu.config.ts`, you can pass `--adapter vercel` to this command)._

The adapter produces the `.vercel/output/` directory:

- `.vercel/output/config.json`: Edge routing rules and cache headers.
- `.vercel/output/static/`: Assets served directly by the Vercel Edge CDN.
- `.vercel/output/functions/index.func/`: Serverless function bundle handling dynamic SSR and API routes.

### Step 3: Local Preview with Vercel CLI

Simulate the full Vercel production hosting environment locally:

```bash
npx vercel dev
```

The Vercel CLI starts a local server (typically at `http://localhost:3000`), accurately emulating Vercel Edge routing rules, static asset serving, and serverless execution.

---

## 5. Deployment Commands & CLI Workflows

### Manual CLI Deployments

Deploy your prebuilt application directly to Vercel without relying on remote build environments:

```bash
# Deploy a preview environment
npx vercel deploy --prebuilt

# Deploy directly to production
npx vercel deploy --prebuilt --prod
```

> **Why `--prebuilt`?** The `--prebuilt` flag tells Vercel to upload the locally generated `.vercel/output/` directory directly, ensuring 100% deterministic builds that match your local testing and CI/CD runs.

### Serverless Operational Best Practices

When deploying to serverless environments, apply these architectural best practices:

1. **Database Connection Pooling:** In serverless runtimes, each concurrent request can spawn an isolated function instance. Direct connections can rapidly exhaust database limits. Always use a connection pooler (e.g. Supabase Connection Pooler on port `6543`, Neon Serverless Driver, PgBouncer, or AWS RDS Proxy) and cap your client driver pool size (`max: 1` per instance):
   ```typescript
   // lib/db.ts
   import { Pool } from 'pg';

   // Reuse pool across warm invocations
   const pool = new Pool({
     connectionString: process.env.DATABASE_URL,
     max: 1, // Restrict to 1 connection per serverless isolate
     idleTimeoutMillis: 10000,
     connectionTimeoutMillis: 5000,
   });

   export default pool;
   ```
2. **Stateless Handlers:** Serverless microVMs are ephemeral and can be recycled at any moment. Never store application state in global memory variables. Persist session data and mutable state in external distributed services (Upstash Redis, Vercel KV, DynamoDB, or PostgreSQL).
3. **Cold-Start Latency Optimization:** Allocating `1024` MB of memory in `ranu.config.ts` assigns a dedicated vCPU slice on underlying infrastructure, reducing cold-start module parsing times by up to 60%.
4. **Asynchronous Task Lifetimes:** Serverless compute stops immediately after the HTTP response stream terminates. Ensure all critical asynchronous operations are awaited before sending the response, or offload background processing to a managed message queue (Upstash QStash, AWS SQS).

### Automated CI/CD Pipeline (GitHub Actions)

Create `.github/workflows/deploy-vercel.yml` to automatically build and deploy your application on pushes to the `main` branch:

```yaml
# .github/workflows/deploy-vercel.yml
name: Deploy to Vercel Production

on:
  push:
    branches:
      - main

jobs:
  deploy:
    name: Build & Deploy to Vercel
    runs-on: ubuntu-latest
    timeout-minutes: 15

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

      - name: Get pnpm store directory
        shell: bash
        run: |
          echo "STORE_PATH=$(pnpm store path --silent)" >> $GITHUB_ENV

      - name: Cache pnpm dependencies
        uses: actions/cache@v4
        with:
          path: ${{ env.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-store-

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Compile production build
        run: pnpm ranu build
        env:
          NODE_ENV: production
          RANU_PUBLIC_API_URL: ${{ vars.RANU_PUBLIC_API_URL }}

      - name: Adapt for Vercel
        run: pnpm ranu deploy

      - name: Deploy prebuilt output to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prebuilt --prod'
```

#### Required GitHub Secrets

Configure these repository secrets under **Settings → Secrets and variables → Actions**:

- `VERCEL_TOKEN`: Vercel Personal Access Token generated under Account Settings → Tokens.
- `VERCEL_ORG_ID`: Found in your project's `.vercel/project.json` or team settings.
- `VERCEL_PROJECT_ID`: Found in your project's `.vercel/project.json` or project settings.

---

## 6. Environment Variables & Secret Management

### Public vs. Server Secrets in Ranu.js

Ranu.js enforces a strict boundary between public and private environment variables:

- **Public Variables (`RANU_PUBLIC_*`):** Any variable prefixed with `RANU_PUBLIC_` (e.g. `RANU_PUBLIC_SUPABASE_URL`, `RANU_PUBLIC_STRIPE_KEY`) is embedded into client browser bundles during `ranu build`.
- **Private Server Secrets:** Variables without the prefix (e.g. `DATABASE_URL`, `AUTH_SECRET`, `STRIPE_SECRET_KEY`) are accessible **only** within server-side components, route loaders, and API Route Handlers. They are completely stripped from client JavaScript artifacts.

### Setting Secrets via Vercel CLI

You can add environment variables directly from your terminal:

```bash
# Add a production secret
vercel env add DATABASE_URL production

# Add a preview environment secret
vercel env add DATABASE_URL preview

# Pull remote variables to a local .env file for testing
vercel env pull .env.local
```

### Setting Secrets in the Vercel Dashboard

1. Navigate to your project on the Vercel Dashboard.
2. Go to **Settings → Environment Variables**.
3. Enter the variable name (e.g. `DATABASE_URL`) and value.
4. Select the target environments: **Production**, **Preview**, and **Development**.
5. Click **Save**.

---

## 7. Production Hosting Dashboard Setup & Verification Checklist

### Vercel Dashboard Project Settings

When importing your Git repository on the Vercel Dashboard, configure the following project settings:

| Setting              | Recommended Value                          |
| :------------------- | :----------------------------------------- |
| **Framework Preset** | **Other**                                  |
| **Root Directory**   | `./` (or your app directory in a monorepo) |
| **Build Command**    | `pnpm ranu build && pnpm ranu deploy`      |
| **Output Directory** | `.vercel/output`                           |
| **Install Command**  | `pnpm install`                             |

### Production Health & Verification Checklist

After deployment, verify that your live Vercel application satisfies all production requirements:

| Verification Target            | Test Method                                            | Expected Result                                                                                                                    |
| :----------------------------- | :----------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------- |
| **Streaming SSR**              | `curl -i -N https://your-domain.vercel.app/`           | Response headers contain `Transfer-Encoding: chunked` and status `200`. Initial HTML layout shell returns in `<50ms` TTFB.         |
| **Static CDN Caching**         | Inspect Network tab for `/_ranu/assets/*.js`           | Response headers return `cache-control: public, max-age=31536000, immutable` and `x-vercel-cache: HIT`.                            |
| **Pre-rendered Pages (SSG)**   | `curl -i https://your-domain.vercel.app/about`         | Response headers return `content-type: text/html; charset=utf-8` and `x-vercel-cache: HIT` without executing serverless functions. |
| **API Route Execution**        | `curl -X POST https://your-domain.vercel.app/api/data` | Executed dynamically by the serverless function, returning valid JSON and status `200`.                                            |
| **Database Connection Health** | Run load test with 50 concurrent requests              | Database connection count remains within connection pool limits; zero `500` connection exhaustion errors.                          |
| **Secret Isolation**           | Inspect client JavaScript bundles in browser devtools  | Zero occurrences of server secrets (`DATABASE_URL`, `AUTH_SECRET`); only `RANU_PUBLIC_*` variables are present.                    |
