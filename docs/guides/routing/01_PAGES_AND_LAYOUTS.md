# Pages and Layouts

Ranu.js utilizes an intuitive file-system routing model powered by the `app/` directory.

---

## 1. Pages (`page.tsx`)

A file named `page.tsx` exports a default React component representing a publicly accessible URL endpoint:

```tsx
// app/about/page.tsx

export default function AboutPage() {
  return (
    <div>
      <h1>About Us</h1>
      <p>This page is accessible at /about.</p>
    </div>
  );
}
```

### Route-to-Path Mapping:

| File Path | URL Path |
| :--- | :--- |
| `app/page.tsx` | `/` (Home) |
| `app/about/page.tsx` | `/about` |
| `app/dashboard/settings/page.tsx` | `/dashboard/settings` |

---

## 2. Root Layout (`app/layout.tsx`)

The root layout is **mandatory** for every Ranu.js application. It wraps all routes and must render the top-level `<html>` and `<body>` tags:

```tsx
// app/layout.tsx
import React from 'react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Ranu.js Application</title>
      </head>
      <body>
        <div id="root-container">{children}</div>
      </body>
    </html>
  );
}
```

> [!IMPORTANT]
> Root layouts preserve state across page transitions. When a user navigates between pages, child routes re-render, but the root layout maintains its DOM and internal React state without re-mounting.

---

## 3. Nested Layouts

You can create isolated layouts for specific sub-trees of your application. For example, a dashboard layout can provide a persistent sidebar:

```tsx
// app/dashboard/layout.tsx
import React from 'react';
import { Link } from '@ranujs/core/react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{ width: '220px', borderRight: '1px solid #ddd', padding: '16px' }}>
        <h3>Dashboard</h3>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Link href="/dashboard">Overview</Link>
          <Link href="/dashboard/analytics">Analytics</Link>
          <Link href="/dashboard/settings">Settings</Link>
        </nav>
      </aside>
      <main style={{ flex: 1, padding: '24px' }}>
        {children}
      </main>
    </div>
  );
}
```

When navigating from `/dashboard` to `/dashboard/analytics`, the sidebar remains mounted and interactive while only the `<main>` content swaps.

---

## 4. Key Rules & Best Practices

1. **One Root Layout:** Only `app/layout.tsx` should render `<html>` and `<body>`. Nested layouts wrap sub-content inside `<div>` or semantic tags.
2. **Prop Composition:** Layout components must always accept and render `{ children }: { children: React.ReactNode }`.
3. **Next Step:** Proceed to **[Dynamic Routes](./02_DYNAMIC_ROUTES.md)** to handle parameterized URLs.
