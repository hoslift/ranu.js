# Ranu.js Server-Side Rendering (SSR) Example

This example demonstrates how to configure and execute on-demand Server-Side Rendering in **Ranu.js**.

## Concept Demonstrated

- **Server rendering mode**: Exporting `export const render = 'server'` directs Ranu.js to render the component dynamically inside the Node.js production server for every HTTP request
- **Zero build-time stale state**: HTML is generated dynamically at runtime with server-side context

## Project Structure

```text
├── app/
│   ├── layout.tsx     # Root document layout
│   └── page.tsx       # Server-rendered page with export const render = 'server'
├── package.json
├── ranu.config.ts
└── tsconfig.json
```

## Running the Example

```bash
pnpm dev
```

Or build and run in production mode:

```bash
pnpm build
pnpm start
```
