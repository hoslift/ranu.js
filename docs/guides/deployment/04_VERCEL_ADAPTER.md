# Deploying to Vercel with `@ranujs/adapter-vercel`

**Ranu.js** provides an official first-party adapter—`@ranujs/adapter-vercel`—that transforms production build artifacts into the [Vercel Build Output API (v3)](https://vercel.com/docs/build-output-api/v3) format.

This enables seamless zero-configuration deployments on Vercel with automatic serverless functions, static asset routing, and streaming SSR support.

---

## 1. Installation

Install `@ranujs/adapter-vercel` as a development dependency:

```bash
pnpm add -D @ranujs/adapter-vercel
```

---

## 2. Configuration in `ranu.config.ts`

Import and register the adapter in your `ranu.config.ts` file:

```typescript
// ranu.config.ts
import { defineConfig } from '@ranujs/core/config';
import vercelAdapter from '@ranujs/adapter-vercel';

export default defineConfig({
  deployment: {
    adapter: vercelAdapter(),
  },
});
```

### Adapter Configuration Options

The `vercelAdapter` function accepts optional parameters to fine-tune serverless function runtime behavior:

```typescript
export default defineConfig({
  deployment: {
    adapter: vercelAdapter({
      memory: 1024, // Function memory in MB (default: 1024)
      maxDuration: 15, // Maximum execution duration in seconds
      regions: ['iad1', 'sfo1'], // Specific Vercel edge/serverless compute regions
    }),
  },
});
```

---

## 3. Build & Deploy Workflow

### Step A: Compile Production Build
Compile your application code:

```bash
pnpm ranu build
```

### Step B: Generate Vercel Output Artifacts
Run `ranu deploy` to execute the adapter:

```bash
pnpm ranu deploy
```

Alternatively, override or specify the adapter directly via the CLI flag:

```bash
pnpm ranu deploy --adapter vercel
```

The adapter creates the `.vercel/output/` directory with:
- `.vercel/output/static/`: Static assets, public files, and compiled client bundles.
- `.vercel/output/functions/`: Serverless function bundles for dynamic routes and SSR.
- `.vercel/output/config.json`: Routing rules and route overrides.

### Step C: Deploy Prebuilt Artifacts
Deploy the generated output using the Vercel CLI:

```bash
npx vercel deploy --prebuilt --prod
```

---

## 4. Configuring Project Settings on Vercel Dashboard

When importing your Ranu.js repository on the Vercel Web Dashboard:

1. **Framework Preset:** Select **Other**.
2. **Build Command:** `pnpm ranu build && pnpm ranu deploy`
3. **Output Directory:** `.vercel/output`
4. **Install Command:** `pnpm install`

Add any necessary production environment variables (e.g., `DATABASE_URL`, `AUTH_SECRET`) in the **Environment Variables** panel.

---

## 5. Automated CI/CD Pipeline (GitHub Actions)

Deploy automatically on every merge to `main` using GitHub Actions:

```yaml
# .github/workflows/deploy.yml
name: Deploy to Vercel

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          run_install: false

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build & Adapt for Vercel
        run: |
          pnpm ranu build
          pnpm ranu deploy --adapter vercel

      - name: Deploy to Vercel Production
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prebuilt --prod'
```

---

## 6. Verification Checklist

| Check | Expected Behavior |
| :--- | :--- |
| **Streaming SSR** | Streamed chunks arrive with HTTP `200` and `Transfer-Encoding: chunked` |
| **Static Assets** | Files under `public/` are served with global CDN caching |
| **API Endpoints** | Dynamic endpoints under `app/api/**` execute as Vercel Serverless Functions |
| **Environment Variables** | Secrets remain strictly hidden on serverless workers |
