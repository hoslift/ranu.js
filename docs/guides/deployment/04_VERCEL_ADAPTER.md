# Deploying to Vercel with `@ranujs/adapter-vercel`

**Ranu.js** provides an official first-party deployment adapter—`@ranujs/adapter-vercel`—that transforms pre-compiled production build artifacts into the [Vercel Build Output API (v3)](https://vercel.com/docs/build-output-api/v3) specification.

This enables zero-configuration, production-grade deployments on Vercel with automatic serverless functions, streaming Server-Side Rendering (SSR) with React 19, immutable static asset edge routing, and full W3C Web Standards compatibility.

---

## 1. Architectural Overview

The `@ranujs/adapter-vercel` adapter implements the formal `RanuDeploymentAdapter` specification defined in `@ranujs/core`. In strict compliance with the **Zero Re-Compilation Invariant**, the adapter does not re-bundle or re-compile your application source code (`.tsx`/`.ts`). Instead, it acts as a downstream consumer of `.ranu/build/`:

```
.ranu/build/ (Compiled Artifacts & Manifests)
          │
          ├──► manifest/routes.json, server.json, static.json
          ├──► static/assets/ (Hashed client bundles)
          ├──► static/pages/ (Pre-rendered SSG HTML)
          └──► server/ (Compiled server bundles)
          │
          ▼  pnpm ranu deploy --adapter vercel
.vercel/output/ (Vercel Build Output API v3)
          ├──► config.json (Route rules & immutable caching)
          ├──► static/ (Edge CDN assets & static pages)
          └──► functions/index.func/ (Serverless entrypoint & bundles)
```

1. **Static Asset Segregation:** Copies hashed bundles to `.vercel/output/static/_ranu/assets/` and pre-rendered pages to `.vercel/output/static/`.
2. **Serverless Packaging:** Generates `.vercel/output/functions/index.func/` containing a lightweight Node.js request handler (`index.mjs`) powered by `@ranu/runtime-node`.
3. **Build Output API v3 Configuration:** Emits `.vercel/output/config.json` establishing routing rules, static filesystem fallbacks, and immutable CDN cache-control headers.

---

## 2. Installation

Install `@ranujs/adapter-vercel` as a development dependency in your project root:

```bash
pnpm add -D @ranujs/adapter-vercel
```

If you are using npm or yarn:

```bash
npm install -D @ranujs/adapter-vercel
# or
yarn add -D @ranujs/adapter-vercel
```

---

## 3. Configuration in `ranu.config.ts`

Import and register the adapter in your `ranu.config.ts` configuration file:

```typescript
// ranu.config.ts
import { defineConfig } from '@ranujs/core/config';
import vercelAdapter from '@ranujs/adapter-vercel';

export default defineConfig({
  deployment: {
    adapter: vercelAdapter({
      runtimeVersion: 'nodejs22.x',
      memory: 1024,
      maxDuration: 15,
      regions: ['iad1', 'sfo1'],
    }),
  },
});
```

### Configuration Options Reference

The `vercelAdapter` factory accepts a `VercelAdapterOptions` object to configure runtime characteristics:

| Option           | Type       | Default            | Description                                                                                                                                |
| :--------------- | :--------- | :----------------- | :----------------------------------------------------------------------------------------------------------------------------------------- |
| `outputDir`      | `string`   | `'.vercel/output'` | Destination directory for the Vercel Build Output API v3 artifacts. Must reside within the project root.                                   |
| `runtimeVersion` | `string`   | `'nodejs22.x'`     | Target Node.js runtime version for Vercel Serverless Functions.                                                                            |
| `regions`        | `string[]` | _Vercel Default_   | Specific Vercel edge/compute regions to deploy the serverless function (e.g. `['iad1', 'sfo1']`).                                          |
| `memory`         | `number`   | `1024`             | Memory allocation limit in MB for the serverless function (e.g. `512`, `1024`, `3008`). Higher memory allocates proportional vCPU compute. |
| `maxDuration`    | `number`   | _Plan Default_     | Maximum function execution timeout in seconds (subject to Vercel plan limits: 15s Hobby, 300s Pro, 900s Enterprise).                       |
| `clean`          | `boolean`  | `true`             | When `true`, removes any existing output directory before generating new artifacts.                                                        |

---

## 4. Build Output API v3 Directory Structure

Running `ranu deploy --adapter vercel` generates the standardized Vercel Build Output API v3 layout:

```text
.vercel/output/
├── config.json                               # Vercel Build Output API v3 configuration
├── static/                                   # Assets served directly by Vercel CDN Edge
│   ├── _ranu/
│   │   └── assets/                           # Hashed client JS, CSS, and media bundles
│   │       ├── entry-client.[hash].js
│   │       └── style.[hash].css
│   ├── index.html                            # Pre-rendered static SSG pages
│   └── favicon.ico                           # Assets copied from public/ directory
└── functions/
    └── index.func/                           # Universal Serverless Function
        ├── .vc-config.json                   # Function runtime descriptor
        ├── index.mjs                         # Bundled request listener entrypoint
        ├── package.json                      # Function module configuration
        ├── build.json                        # Framework build descriptor
        ├── BUILD_ID                          # Deployment build hash
        ├── server/                           # Compiled server route bundles
        └── manifest/                         # Route and server manifests
```

### 4.1 `.vercel/output/config.json`

The generated `config.json` controls Vercel Edge routing:

```json
{
  "version": 3,
  "routes": [
    {
      "src": "^/_ranu/assets/(.*)$",
      "headers": {
        "cache-control": "public, max-age=31536000, immutable"
      },
      "continue": true
    },
    {
      "handle": "filesystem"
    },
    {
      "src": "^/(.*)$",
      "dest": "/index"
    }
  ],
  "overrides": {
    "about.html": {
      "contentType": "text/html; charset=utf-8",
      "path": "about"
    }
  }
}
```

- **Immutable Caching:** Matches requests under `/_ranu/assets/` and applies aggressive 1-year immutable caching headers (`max-age=31536000, immutable`).
- **Filesystem Routing:** Routes static files directly from `.vercel/output/static/` via `handle: "filesystem"`, bypassing serverless function execution entirely.
- **Dynamic Catch-All:** Routes all remaining requests to `.vercel/output/functions/index.func` for dynamic SSR or API route handling.
- **SSG Overrides:** Maps clean URL paths to pre-rendered HTML files with explicit `text/html; charset=utf-8` content types.

### 4.2 `.vercel/output/functions/index.func/.vc-config.json`

Specifies the runtime metadata for Vercel's execution orchestrator:

```json
{
  "runtime": "nodejs22.x",
  "handler": "index.mjs",
  "launcherType": "Nodejs",
  "shouldAddHelpers": true,
  "memory": 1024,
  "maxDuration": 15,
  "regions": ["iad1", "sfo1"]
}
```

---

## 5. Serverless Hazards & Production Mitigation Strategies

Deploying full-stack applications to ephemeral serverless environments introduces specific failure modes that do not occur in persistent server daemons. Ranu.js includes architectural mitigations for each hazard.

### 5.1 Hazard 1: Database Connection Pool Exhaustion

#### The Problem

In persistent servers, a database connection pool is shared across thousands of incoming requests. In serverless environments, each concurrent request can spawn a new, isolated function instance.

If your application configures a traditional pool size (e.g. `max: 10` or `max: 20` connections per instance), a sudden traffic burst of 100 concurrent requests will spawn 100 lambda instances. This attempts to open **1,000 to 2,000 simultaneous connections** to PostgreSQL or MySQL, immediately crashing your database:

```text
FATAL: remaining connection slots are reserved for non-replication superuser connections
```

#### Production Mitigation

1. **Use an External Connection Pooler:** Always position a transaction-mode connection pooler between Vercel and your database:
   - **PostgreSQL:** PgBouncer (in `transaction` pooling mode), Supabase Connection Pooler (port `6543`), Neon Serverless Driver, or AWS RDS Proxy.
   - **Prisma Users:** Prisma Accelerate or Prisma Data Proxy.
2. **Cap Connections to 1 per Instance:** Configure your ORM or client driver with a maximum connection limit of `1` (or `max: 2` at most) per serverless function instance:
   ```typescript
   // lib/db.ts
   import { Pool } from 'pg';

   // Maintain connection outside the handler to reuse across warm invocations
   const pool = new Pool({
     connectionString: process.env.DATABASE_URL,
     max: 1, // Strict serverless limit: 1 connection per lambda isolate
     idleTimeoutMillis: 10000,
     connectionTimeoutMillis: 5000,
   });

   export default pool;
   ```
3. **Declare Adapter Max Connections:** Set `maxDatabaseConnections: 1` in custom configurations to declare serverless connection boundaries.

---

### 5.2 Hazard 2: Ephemeral State Traps

#### The Problem

Beginner serverless implementations often store state in global memory variables:

```typescript
// ANTI-PATTERN: Ephemeral in-memory state
let activeSessions = new Map<string, Session>();
let requestCounter = 0;
```

Because Vercel serverless microVMs are dynamically provisioned, scaled across regions, and terminated when idle:

- State stored in memory vanishes when the container is recycled.
- Concurrent requests handled by different instances see divergent state.
- WebSocket connections cannot be maintained on ephemeral serverless instances.

#### Production Mitigation

- **Externalize All Mutable State:** Persist sessions, user state, and caches in external distributed stores:
  - **Key-Value & Cache:** Upstash Redis, Vercel KV.
  - **Relational Data:** Neon, Supabase, AWS Aurora Serverless.
  - **File Storage:** AWS S3, Cloudflare R2, Vercel Blob.
- **Stateless Handlers:** Ensure all API Route Handlers and React Server Components are completely pure and idempotent with respect to memory state.

---

### 5.3 Hazard 3: Cold-Start Latency & Bundle Size Budgeting

#### The Problem

A serverless cold start occurs when Vercel provisions a new microVM to handle a request. The cold-start latency is directly proportional to the size of the JavaScript bundle that Node.js must parse and evaluate before handling the request. Monolithic 50MB+ server bundles can introduce `1,500ms` to `3,000ms` delays before the first byte is streamed.

#### Production Mitigation

1. **Lean Entrypoint Bundling:** `@ranujs/adapter-vercel` bundles the runtime entrypoint using `esbuild`, tree-shaking unused framework code and maintaining an index function footprint under 10 MB.
2. **Memory Allocation Allocation:** Configure `memory: 1024` in `ranu.config.ts`. On AWS Lambda infrastructure, allocating 1024 MB of RAM assigns a dedicated vCPU slice (compared to fractional vCPU at 128 MB or 256 MB), reducing cold-start module parsing time by up to 60%.
3. **Lazy Initialization:** Initialize heavyweight database or AI model clients lazily inside handler invocations rather than at top-level module load time.

---

### 5.4 Hazard 4: Execution Lifetime & Background Tasks

#### The Problem

In serverless runtimes, CPU execution is suspended the instant the HTTP response stream completes. If an API handler attempts to run an un-awaited background task:

```typescript
// ANTI-PATTERN: Silent task termination
export async function POST(request: Request) {
  // Fire-and-forget: This promise is killed when the response finishes!
  sendAnalyticsEvent({ user: '123' });
  return Response.json({ success: true });
}
```

The un-awaited promise will be frozen mid-execution and either dropped or resumed unexpectedly during a subsequent request.

#### Production Mitigation

- **Await Critical Tasks:** Always `await` promises before returning the response.
- **Use Dedicated Queue Workers:** For long-running background jobs (e.g. video processing, email dispatch), send a lightweight message to a managed queue (Upstash QStash, AWS SQS) and process it asynchronously.

---

## 6. Build & Deploy Workflow

Deploying a Ranu.js application to Vercel follows a simple three-step CLI workflow:

### Step 1: Compile Production Build

Compile your application source code into platform-agnostic production artifacts:

```bash
pnpm ranu build
```

This compiles client and server graphs, strips private environment variables, and emits `.ranu/build/`.

### Step 2: Generate Vercel Output Artifacts

Execute `@ranujs/adapter-vercel` to package the build for Vercel Build Output API v3:

```bash
pnpm ranu deploy --adapter vercel
```

_(If `adapter: vercelAdapter()` is already configured in `ranu.config.ts`, you can simply run `pnpm ranu deploy` without the `--adapter` flag)._

The adapter validates the build, generates `.vercel/output/`, and prints a deployment summary:

```text
[ranu:deploy] Adapter: vercel (v1.0.0)
[ranu:deploy] Output directory: .vercel/output
[ranu:deploy] Static assets copied: 24 files
[ranu:deploy] Serverless functions: index.func
[ranu:deploy] Status: SUCCESS
```

### Step 3: Deploy to Vercel

Deploy the generated output using the official Vercel CLI:

```bash
# Preview deployment
npx vercel deploy --prebuilt

# Production deployment
npx vercel deploy --prebuilt --prod
```

The `--prebuilt` flag instructs Vercel to upload `.vercel/output/` directly without running remote build commands on Vercel's build infrastructure, ensuring 100% deterministic builds that match your local or CI environment.

---

## 7. Configuring Project Settings on Vercel Dashboard

When connecting your GitHub or GitLab repository on the Vercel Dashboard:

1. **Framework Preset:** Select **Other**.
2. **Root Directory:** Leave as `./` (or your application subfolder in a monorepo).
3. **Build Command:** Set to:
   ```bash
   pnpm ranu build && pnpm ranu deploy --adapter vercel
   ```
4. **Output Directory:** Set to:
   ```bash
   .vercel/output
   ```
5. **Install Command:** Set to:
   ```bash
   pnpm install
   ```

### Environment Variables Setup

Under **Project Settings → Environment Variables**, add your production secrets:

- `DATABASE_URL`: Production database connection string (configured with connection pooler URL).
- `AUTH_SECRET`: Secret key for session encryption.
- Any client-accessible variables must be prefixed with `RANU_PUBLIC_` (e.g. `RANU_PUBLIC_STRIPE_KEY`). Private server secrets without this prefix are automatically stripped from client bundles during `ranu build`.

---

## 8. Automated CI/CD Pipeline (GitHub Actions)

For automated production deployments on every merge to `main`, configure a GitHub Actions workflow:

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

      - name: Adapt for Vercel Build Output API v3
        run: pnpm ranu deploy --adapter vercel

      - name: Deploy prebuilt artifacts to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prebuilt --prod'
```

### Required GitHub Secrets

Configure the following secrets in your GitHub repository settings under **Settings → Secrets and variables → Actions**:

- `VERCEL_TOKEN`: Vercel Personal Access Token generated under Account Settings → Tokens.
- `VERCEL_ORG_ID`: Found in your project's `.vercel/project.json` or team settings.
- `VERCEL_PROJECT_ID`: Found in your project's `.vercel/project.json` or project settings.

---

## 9. Verification & Troubleshooting Checklist

After deploying your application to Vercel, verify your production endpoints against this checklist:

| Verification Target            | Command / Test Method                                  | Expected Behavior                                                                                                                   |
| :----------------------------- | :----------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------- |
| **Streaming SSR**              | `curl -i -N https://your-domain.vercel.app/`           | Response headers include `Transfer-Encoding: chunked` and status `200`. Initial HTML shell arrives within `<50ms` TTFB.             |
| **Static Assets CDN Caching**  | Inspect network tab for `/_ranu/assets/*.js`           | Headers return `cache-control: public, max-age=31536000, immutable` and `x-vercel-cache: HIT`.                                      |
| **Pre-rendered Pages (SSG)**   | `curl -i https://your-domain.vercel.app/about`         | Response headers return `content-type: text/html; charset=utf-8` and `x-vercel-cache: HIT` without invoking serverless functions.   |
| **API Route Execution**        | `curl -X POST https://your-domain.vercel.app/api/data` | Executed as serverless function in `.vercel/output/functions/index.func`, returning valid JSON.                                     |
| **Client Disconnection**       | Abort client request mid-stream                        | Serverless handler cancels stream reader and destroys socket cleanly without uncaught exceptions.                                   |
| **Database Connection Health** | Load test endpoint with 50 concurrent requests         | Database connection count remains bounded to connection pooler limits; zero `500` connection exhaustion errors.                     |
| **Secret Protection**          | Inspect client JavaScript bundle source code           | Browser bundles contain 0 references to server secrets (`DATABASE_URL`, `AUTH_SECRET`); only `RANU_PUBLIC_*` variables are present. |
