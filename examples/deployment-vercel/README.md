# Ranu.js Vercel Serverless Deployment Example

This example demonstrates how to build and deploy a **Ranu.js** application to Vercel using the official `@ranujs/adapter-vercel` adapter.

## Concepts Demonstrated

- **Build Output API v3**: Automatically generates `.vercel/output/` structure with `config.json`, static assets, and `index.func` serverless functions
- **Zero Configuration Serverless**: Runs SSR and API routes as scalable Node.js functions on Vercel infrastructure

## Project Structure

```text
├── app/
│   ├── api/status/route.ts    # Serverless API endpoint
│   ├── layout.tsx
│   └── page.tsx
├── package.json
├── ranu.config.ts             # Vercel adapter registration
└── tsconfig.json
```

## Running & Deploying

Build and generate Vercel deployment bundle:

```bash
pnpm build
pnpm deploy
```
