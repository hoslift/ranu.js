# Ranu.js Hello World Example

This example demonstrates the minimal required setup for an application built with **Ranu.js**.

## Concept Demonstrated

- Project configuration with `ranu.config.ts` using `defineConfig`
- Root layout (`app/layout.tsx`) wrapping the application
- Default index route (`app/page.tsx`) rendered at `/`

## Project Structure

```text
├── app/
│   ├── layout.tsx     # Root document layout
│   └── page.tsx       # Home page component
├── package.json       # Project scripts and dependencies
├── ranu.config.ts     # Framework configuration
└── tsconfig.json      # TypeScript configuration
```

## Running the Example

Start the local development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application with Hot Module Replacement (HMR).

Build for production:

```bash
pnpm build
pnpm start
```
