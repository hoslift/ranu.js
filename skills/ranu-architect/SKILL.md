---
name: ranu-architect
description: Comprehensive architecture, coding standards, and pattern guidelines for Ranu.js React 19 full-stack applications.
triggers:
  - 'ranu'
  - 'ranujs'
  - 'ranu.config.ts'
---

# Ranu.js Architecture & Development Skill

You are an expert software architect specialized in **Ranu.js** (current release: `v0.1.5`), a high-performance React 19 full-stack framework built on Vite, Turborepo, and Web Standards.

Use this skill whenever scaffolding, building, modifying, or debugging Ranu.js applications.

---

## 1. Core Mental Model & Framework Identity

- **Monorepo & Package Identity:**
  - The framework core is `@ranujs/core`.
  - Client applications depend on `@ranujs/core`, `react` (>= 19.0.0), and `react-dom` (>= 19.0.0).
  - CLI commands are invoked via `ranu` (e.g., `ranu dev`, `ranu build`, `ranu start`).
- **Core Neutrality & Open Contracts:**
  - **Infrastructure Agnostic:** Deployment targets follow open, pluggable runtime adapter contracts. The core engine does not bundle, favor, or mandate any specific cloud infrastructure or hosting provider.
  - **Model Agnostic:** AI integrations interface strictly through W3C Web Standards (`ReadableStream`, `Request`, `Response`, Server-Sent Events). The framework does not bundle proprietary AI SDKs.
  - All deployments and data services follow open, pluggable contracts built upon standard Web APIs.

---

## 2. File-System Routing Conventions

Ranu.js utilizes an `app/` directory file-system routing system.

### Route Types & Hierarchy

| File Path                        | Purpose                   | Key Exports & Behavior                                                                                                            |
| -------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `app/layout.tsx`                 | Root / nested layout      | `export default function RootLayout({ children }: { children: React.ReactNode })`. Root layout must render `<html>` and `<body>`. |
| `app/**/page.tsx`                | Route page component      | `export default function Page({ params }: { params?: Record<string, string \| string[]> })`.                                      |
| `app/posts/[id]/page.tsx`        | Dynamic route parameter   | Single parameter accessed via `params?.id`.                                                                                       |
| `app/archive/[...slug]/page.tsx` | Catch-all dynamic route   | Multiple path segments accessed as array via `params?.slug`.                                                                      |
| `app/404.tsx`                    | Custom 404 Not Found page | `export default function NotFound()` rendered on route misses.                                                                    |
| `app/api/**/route.ts`            | Server API endpoints      | Named HTTP method exports: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`.                                                               |

### Client-Side Navigation

Always use Ranu's native `Link` component. Never import navigation primitives from foreign meta-framework namespaces.

```tsx
import { Link } from '@ranujs/core/react';

export function NavigationBar() {
  return (
    <nav>
      <Link href="/">Home</Link>
      <Link href="/about">About</Link>
      <Link href="/posts/42">Post 42</Link>
    </nav>
  );
}
```

---

## 3. Server API Routes & Web Standards

API routes live under `app/api/**/route.ts` and communicate exclusively using standard Web APIs.

### Rules:

1. Export uppercase HTTP method handlers: `export async function GET(request: Request)`, `POST`, etc.
2. The incoming request is a standard Web `Request`.
3. The response must be a standard Web `Response` (e.g., `Response.json()`, `Response.redirect()`, or new `Response()`).
4. Never use legacy callback-based `(req, res)` server signatures.

### Example: Standard API Route (`app/api/users/route.ts`)

```typescript
export async function GET(request: Request) {
  const url = new URL(request.url);
  const search = url.searchParams.get('q') || '';

  return Response.json({
    status: 'ok',
    query: search,
    timestamp: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { name?: string };
    if (!body.name) {
      return Response.json({ error: 'Name is required' }, { status: 400 });
    }
    return Response.json({ success: true, created: body }, { status: 201 });
  } catch {
    return Response.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }
}
```

---

## 4. Configuration & Middleware

### Configuration (`ranu.config.ts`)

Configuration files import `defineConfig` from `@ranujs/core/config`.

```typescript
import { defineConfig } from '@ranujs/core/config';

export default defineConfig({
  server: {
    port: 3000,
  },
  // Adapters are pluggable functions/contracts adhering to framework runtime interfaces
  // adapter: () => import('@ranujs/adapter-...').then((m) => m.adapterFactory()),
});
```

### Edge Middleware (`middleware.ts`)

Middleware sits at the root or `app/` root and intercepts requests using standard Web APIs.

```typescript
export const config = {
  matcher: ['/*'],
};

export default function middleware(request: Request) {
  const url = new URL(request.url);

  // Authentication or redirect check
  if (url.pathname.startsWith('/protected')) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return Response.redirect(new URL('/login', request.url).toString(), 307);
    }
  }

  // Internal rewrite
  if (url.pathname === '/account') {
    return { type: 'rewrite', url: '/protected/account' };
  }
}
```

---

## 5. React 19 SSR, Streaming, & Component Rules

- **React 19 Compatibility:**
  - Server rendering uses React 19 streaming architecture (`renderReactToStream`).
  - Take advantage of React 19 Actions, `useActionState`, `useOptimistic`, and server boundary ergonomics.
- **ESM Import Convention:**
  - TypeScript module resolution in Ranu.js uses ESM. Relative local imports in project code should maintain explicit `.js` extensions when targeting Node/bundler runtime conventions (e.g. `import { Header } from './components/header.js';`).
- **Hydration Safety:**
  - Ensure server-rendered HTML matches initial client state.
  - Avoid referencing browser-only globals (`window`, `document`, `localStorage`) during initial component render; access them inside `useEffect` or client event handlers.

---

## 6. AI & Streaming Integration Patterns

When integrating AI into Ranu.js applications:

1. **Model-Agnostic Web Streams:** AI response streaming is handled using standard `ReadableStream` or Server-Sent Events (SSE) returned directly from `app/api/**/route.ts`.
2. **Direct REST / Standard Fetch:** Use standard `fetch` with external inference endpoints or generic standard APIs rather than embedding heavy proprietary SDKs into core logic.
3. **Pluggable Architecture:** Treat AI providers identically to deployment adapters—interchangeable implementations that conform to a common streaming contract.

---

## 7. Strict Framework Boundaries (Anti-Hallucination Constraints)

When generating or refactoring code for Ranu.js:

- ❌ **Exclusive Package Imports:** All routing components, hooks, and navigation primitives must be imported exclusively from `@ranujs/*`. Never import routing or server utilities from foreign meta-framework namespaces.
- ❌ **Standard Web Signatures:** API route handlers strictly consume standard W3C `Request` and return standard W3C `Response` instances. Never use legacy callback-based `(req, res)` middleware signatures.
- ❌ **React 19 Native:** Build exclusively with modern React 19 primitives, server/client boundaries, and hydration contracts. Never use deprecated legacy patterns.
- ❌ **Modular Pluggability:** Deployment targets and external services must always follow open, modular plugin contracts rather than modifying or polluting the core framework package.
