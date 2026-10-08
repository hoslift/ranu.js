# Project Structure

Understanding the project structure is key to mastering **Ranu.js**. Ranu.js uses an intuitive, convention-based file-system hierarchy.

---

## 📂 Standard File Tree

A standard Ranu.js application features the following directory layout:

```
my-ranu-app/
├── app/                      # Application routes, layouts, and pages
│   ├── layout.tsx            # Root layout (required: renders <html> and <body>)
│   ├── page.tsx              # Home page ("/")
│   ├── 404.tsx               # Custom Not Found error component
│   └── api/                  # Server-side API route handlers
│       └── hello/
│           └── route.ts      # Server API endpoint ("/api/hello")
│
├── public/                   # Static assets (images, fonts, favicon)
│   └── favicon.ico
│
├── .env                      # Server-private environment variables
├── .env.example              # Environment variables template
├── package.json              # Project dependencies and npm scripts
├── ranu.config.ts            # Ranu framework configuration
└── tsconfig.json             # TypeScript compiler options
```

---

## 📌 Key Directories & Files Explained

### 1. The `app/` Directory
The `app/` directory powers Ranu's file-system router:
- **`app/layout.tsx` (Root Layout):** Every Ranu application requires a root layout. It defines the global HTML shell (`<html>` and `<body>`), persistent navigation bars, and headers.
- **`app/**/page.tsx` (Pages):** Files named `page.tsx` represent publicly reachable UI routes. For example, `app/dashboard/page.tsx` maps directly to `/dashboard`.
- **`app/api/**/route.ts` (API Routes):** Files named `route.ts` handle server-side HTTP requests (`GET`, `POST`, `PUT`, `DELETE`). They execute strictly on the server and never bundle to client browsers.

### 2. The `public/` Directory
Contains static assets that are served directly at the root path. For example, `public/logo.svg` is accessible at `http://localhost:3000/logo.svg`.

### 3. `ranu.config.ts`
The configuration file for customizing development port, server adapters, and compiler behavior:

```typescript
import { defineConfig } from '@ranujs/core/config';

export default defineConfig({
  server: {
    port: 3000,
  },
});
```

### 4. `.env` and Secret Isolation
- Environment variables without a public prefix are **server-private**. The Ranu compiler strictly isolates these variables, ensuring database URLs and API keys cannot leak into client bundles.

---

## 🧭 Next Steps

- Follow **[Your First Application](./04_FIRST_APP.md)** to build your first working full-stack page and API endpoint.
