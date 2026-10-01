# Ranu.js Full-Stack Dashboard Reference Application

A complete full-stack reference application demonstrating the union of SSR, SSG, API routes, middleware, and client-side interactivity in **Ranu.js**.

## Features Included

- **SSR Metrics Dashboard (`/`)**: Rendered dynamically on the server on every request
- **SSG Information Page (`/about`)**: Static pre-rendered documentation page
- **Live React 19 Widgets**: Interactive range selection and responsive client state
- **Server API Route (`/api/metrics`)**: REST endpoint returning system runtime stats
- **Custom Middleware (`middleware.ts`)**: Global header injection and analytics tagging

## Project Structure

```text
├── app/
│   ├── about/page.tsx         # Pre-rendered static documentation
│   ├── api/metrics/route.ts   # REST API route
│   ├── components/
│   │   ├── kpi-card.tsx       # Reusable UI component
│   │   └── traffic-chart.tsx  # Interactive client telemetry widget
│   ├── layout.tsx             # Shared navigation layout
│   └── page.tsx               # Server-rendered live metrics
├── middleware.ts              # Edge/Server request middleware
├── package.json
├── ranu.config.ts
└── tsconfig.json
```

## Running the Example

```bash
pnpm dev
```

Build for production:

```bash
pnpm build
pnpm start
```
