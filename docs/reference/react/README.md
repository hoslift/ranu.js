# React API Reference (`@ranujs/core/react`)

**Ranu.js** provides a native React 19 integration module exported via `@ranujs/core/react` (and re-exported from `ranu/react`).

This reference details the client components, routing hooks, metadata generators, and page/layout prop interfaces.

---

## 1. Components

### `<Link />`
The primary component for client-side navigation. It intercepts browser clicks, performs route prefetching on hover, and updates URL state without triggering full page reloads.

```tsx
import { Link } from '@ranujs/core/react';

export function NavigationBar() {
  return (
    <nav>
      <Link href="/dashboard" prefetch={true}>
        Dashboard
      </Link>
      <Link href="/settings" replace={true}>
        Settings
      </Link>
    </nav>
  );
}
```

#### Props (`LinkProps`)
| Prop | Type | Default | Description |
| :--- | :---: | :---: | :--- |
| `href` | `string` | **Required** | The destination route path or URL |
| `prefetch` | `boolean` | `true` | Prefetches route chunks when visible or on hover |
| `replace` | `boolean` | `false` | Replaces current browser history entry instead of pushing |
| `scroll` | `boolean` | `true` | Scrolls to the top of the target page after navigation |
| `className`| `string` | `undefined` | CSS class name applied to underlying `<a>` anchor |
| `children` | `ReactNode` | **Required** | Rendered anchor content |

---

## 2. Routing Hooks

All routing hooks are client-only and must be used inside components marked with `'use client'`.

### `useRouter()`
Provides programmatic access to client-side navigation actions.

```tsx
'use client';

import { useRouter } from '@ranujs/core/react';

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  return <button onClick={handleLogout}>Log Out</button>;
}
```

#### Router Methods (`RanuRouter`)
* **`push(href: string, options?: NavigateOptions)`**: Navigates to the specified URL.
* **`replace(href: string, options?: NavigateOptions)`**: Replaces the current URL without adding a new history entry.
* **`back()`**: Navigates backward in browser history.
* **`forward()`**: Navigates forward in browser history.
* **`refresh()`**: Re-fetches the active route from the server without resetting client state.

---

### `usePathname()`
Returns the current URL pathname string (e.g., `"/dashboard/analytics"`).

```tsx
'use client';

import { usePathname } from '@ranujs/core/react';

export function ActiveNavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <a href={href} className={isActive ? 'font-bold text-indigo-600' : 'text-zinc-600'}>
      {label}
    </a>
  );
}
```

---

### `useSearchParams()`
Returns a read-only instance of `URLSearchParams` representing current query parameters.

```tsx
'use client';

import { useSearchParams } from '@ranujs/core/react';

export function FilterBadge() {
  const searchParams = useSearchParams();
  const status = searchParams.get('status') ?? 'all';

  return <span>Filter: {status}</span>;
}
```

---

## 3. Page & Layout Props

### `PageProps`
Type definition for parameters passed to route page components (`app/**/page.tsx`):

```typescript
export interface PageProps<
  TParams = Record<string, string>,
  TSearch = Record<string, string | string[]>
> {
  params: Promise<TParams>;
  searchParams: Promise<TSearch>;
}
```

### `LayoutProps`
Type definition for layout components (`app/**/layout.tsx`):

```typescript
export interface LayoutProps<TParams = Record<string, string>> {
  children: React.ReactNode;
  params: Promise<TParams>;
}
```

### `ErrorProps`
Type definition for custom error boundaries (`app/**/error.tsx`):

```typescript
export interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}
```

---

## 4. Metadata API

Define static or dynamic head metadata in server pages or layouts.

### Static Metadata
```tsx
// app/about/page.tsx
import type { Metadata } from '@ranujs/core/react';

export const metadata: Metadata = {
  title: 'About Our Platform',
  description: 'Learn more about our mission and engineering values.',
  openGraph: {
    title: 'About Our Platform',
    images: [{ url: '/og-about.png', width: 1200, height: 630 }],
  },
};
```

### Dynamic Metadata (`generateMetadata`)
```tsx
// app/posts/[slug]/page.tsx
import type { GenerateMetadata, Metadata, PageProps } from '@ranujs/core/react';

export const generateMetadata: GenerateMetadata = async ({
  params,
}): Promise<Metadata> => {
  const { slug } = await params;
  return {
    title: `Post: ${slug}`,
    description: `Read articles about ${slug} on Ranu.js`,
  };
};
```
