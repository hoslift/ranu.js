# Ranu.js Static Site Generation (SSG) Example

This example demonstrates how to build pre-rendered, CDN-ready static websites with **Ranu.js**.

## Concept Demonstrated

- **Static render mode**: Setting `export const render = 'static'` instructs the compiler to pre-render the route into standalone HTML files (`.ranu/build/static/pages/*.html`)
- **Zero-compute serving**: Output static pages require no Node.js execution at runtime, enabling instant time-to-first-byte (TTFB)

## Project Structure

```text
├── app/
│   ├── about/
│   │   └── page.tsx       # export const render = 'static'
│   ├── layout.tsx         # Shared root layout
│   ├── page.tsx           # Static home page
│   └── pricing/
│       └── page.tsx       # export const render = 'static'
├── package.json
├── ranu.config.ts
└── tsconfig.json
```

## Running the Example

```bash
pnpm dev
```

Build and inspect the pre-rendered HTML in `.ranu/build/static/`:

```bash
pnpm build
```
