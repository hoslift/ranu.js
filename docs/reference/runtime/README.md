# Server & Runtime Reference (`@ranujs/core/server`)

**Ranu.js** provides a standard set of server-side helpers, cookie handlers, response signals, and request context utilities exported via `@ranujs/core/server` (and re-exported from `ranu/server`).

All helpers operate natively on server execution threads (API routes, Server Components, and Edge Middleware) and strictly respect compiler isolation boundaries.

---

## 1. Cookie Management: `cookies()`

The `cookies()` function returns a `CookieStore` interface adhering to modern Web Standards.

```typescript
import { cookies } from '@ranujs/core/server';

export async function GET(): Promise<Response> {
  const cookieStore = cookies();

  // Read cookie
  const sessionCookie = cookieStore.get('session_id');

  // Check existence
  const hasAuth = cookieStore.has('session_id');

  // Read all cookies
  const allCookies = cookieStore.getAll();

  // Set cookie
  cookieStore.set('session_id', 'new-token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  // Delete cookie
  cookieStore.delete('session_id');

  return Response.json({ authenticated: hasAuth });
}
```

### `CookieSetOptions`
| Option | Type | Default | Description |
| :--- | :---: | :---: | :--- |
| `httpOnly` | `boolean` | `false` | When true, cookie cannot be accessed via `document.cookie` |
| `secure` | `boolean` | `false` | When true, cookie is only transmitted over HTTPS |
| `sameSite` | `'lax' \| 'strict' \| 'none'` | `'lax'` | CSRF cookie policy |
| `path` | `string` | `'/'` | URL path scope for cookie visibility |
| `maxAge` | `number` | `undefined` | Lifetime in seconds relative to current time |
| `domain` | `string` | `undefined` | Domain host scope |

---

## 2. Request Headers: `headers()`

Returns the read-only HTTP headers associated with the incoming request.

```typescript
import { headers } from '@ranujs/core/server';

export async function GET(): Promise<Response> {
  const headerList = headers();
  const userAgent = headerList.get('user-agent');
  const authorization = headerList.get('authorization');

  return Response.json({ userAgent, hasAuth: Boolean(authorization) });
}
```

---

## 3. Navigation Signals: `redirect()` & `notFound()`

### `redirect(url, status = 307)`
Terminates the current execution flow and redirects the client to a different URL:

```typescript
import { redirect } from '@ranujs/core/server';

export async function GET(): Promise<Response> {
  const isAuthenticated = false;

  if (!isAuthenticated) {
    redirect('/login?from=/dashboard', 303);
  }

  return Response.json({ success: true });
}
```

* **Default Status Code:** `307 Temporary Redirect` (preserves HTTP method).
* **Common Alternative:** `303 See Other` (for form submissions) or `308 Permanent Redirect`.

---

### `notFound()`
Terminates execution and invokes the nearest `app/404.tsx` (or custom 404 boundary):

```typescript
import { notFound } from '@ranujs/core/server';

export async function GET(request: Request): Promise<Response> {
  const post = await findPostById('invalid-id');

  if (!post) {
    notFound();
  }

  return Response.json(post);
}
```

---

## 4. Middleware Pipeline Helpers: `next()` & `rewrite()`

Used exclusively inside `middleware.ts` to control request continuation and URL routing.

### `next(options?: MiddlewareNextOptions)`
Instructs the engine to pass the request downstream to matching routes. You can inject synthetic headers:

```typescript
// middleware.ts
import { next } from '@ranujs/core/server';
import type { NextRequest } from '@ranujs/core';

export function middleware(request: NextRequest): Response {
  return next({
    headers: {
      'x-request-id': crypto.randomUUID(),
      'x-user-tenant': 'tenant_acme',
    },
  });
}
```

---

### `rewrite(destination: string | URL)`
Proxies or rewrites the request internally to a different route without altering the browser's address bar:

```typescript
// middleware.ts
import { rewrite } from '@ranujs/core/server';
import type { NextRequest } from '@ranujs/core';

export function middleware(request: NextRequest): Response {
  const host = request.headers.get('host') ?? '';

  if (host.startsWith('api.')) {
    return rewrite(new URL(`/api${request.nextUrl.pathname}`, request.url));
  }

  return next();
}
```

---

## 5. Request Execution Context: `getRequestContext()`

Access low-level execution context (trace IDs, timing metrics, abort signals):

```typescript
import { getRequestContext } from '@ranujs/core/server';

export async function GET(): Promise<Response> {
  const ctx = getRequestContext();
  console.log(`[Trace ID]: ${ctx.traceId}`);

  return Response.json({ traceId: ctx.traceId });
}
```
