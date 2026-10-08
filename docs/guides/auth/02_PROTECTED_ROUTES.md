# Protected Routes & Edge Middleware

Edge Middleware allows you to intercept incoming HTTP requests before they reach your pages or API route handlers. In **Ranu.js**, middleware sits at the project root (`middleware.ts`) and is the optimal location for guarding protected routes, enforcing authentication, and redirecting unauthorized visitors.

---

## 1. Creating Middleware (`middleware.ts`)

Create a `middleware.ts` file in your root directory:

```typescript
// middleware.ts
import { next, redirect } from '@ranujs/core/server';

export const config = {
  // Specify route patterns intercepted by this middleware
  matcher: ['/dashboard/:path*', '/settings/:path*', '/api/protected/:path*'],
};

export default async function middleware(request: Request) {
  const url = new URL(request.url);

  // 1. Read the session cookie from incoming request headers
  const cookieHeader = request.headers.get('cookie') || '';
  const hasSession = cookieHeader.includes('session_id=');

  // 2. Redirect unauthenticated users visiting protected pages
  if (!hasSession && !url.pathname.startsWith('/api/')) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', url.pathname);
    return redirect(loginUrl.toString(), 307);
  }

  // 3. Reject unauthenticated API requests with standard JSON
  if (!hasSession && url.pathname.startsWith('/api/')) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  // 4. Continue request processing, attaching custom telemetry/identity headers
  return next({
    headers: {
      'x-authenticated-request': 'true',
    },
  });
}
```

---

## 2. Matcher Syntax & Conventions

The `matcher` configuration supports glob paths and parameters:

| Matcher Pattern | Matches | Does Not Match |
| :--- | :--- | :--- |
| `['/dashboard']` | `/dashboard` | `/dashboard/analytics` |
| `['/dashboard/:path*']` | `/dashboard`, `/dashboard/team/12` | `/profile` |
| `['/api/admin/:id']` | `/api/admin/42` | `/api/admin/42/roles` |

---

## 3. Rewriting URLs

Middleware can also silently rewrite incoming URLs to internal paths without altering the browser's address bar:

```typescript
import { rewrite } from '@ranujs/core/server';

export default function middleware(request: Request) {
  const url = new URL(request.url);

  if (url.pathname === '/account') {
    return rewrite('/settings/account');
  }
}
```

---

## 4. Key Takeaways

1. **Centralized Access Control:** Guarding routes at the middleware boundary prevents unauthorized requests from ever touching backend databases or server rendering pipelines.
2. **Next Step:** Implement third-party logins securely in **[OAuth 2.0 PKCE Integration](./03_OAUTH_INTEGRATION.md)**.
