# CSRF Protection & Defense-in-Depth

Cross-Site Request Forgery (CSRF) is an attack where an untrusted site trick a victim's browser into executing unwanted actions on an application where the user is currently authenticated.

**Ranu.js** combines strict cookie policies with defense-in-depth patterns—such as the **Double-Submit Cookie Pattern** and **Origin / Referer Verification**—to safeguard server endpoints and state-modifying actions.

---

## 1. Browser-Level Defense: SameSite Cookies

The first line of defense is setting proper `sameSite` cookie attributes when issuing session identifiers:

```typescript
// app/api/auth/login/route.ts
import { cookies } from '@ranujs/core/server';

export async function POST(): Promise<Response> {
  const cookieStore = cookies();

  cookieStore.set('session_id', crypto.randomUUID(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // Browser restricts cookie transmission on cross-site requests
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  return Response.json({ success: true });
}
```

* **`sameSite: 'lax'`**: Cookies are withheld on cross-site subrequests (images, iframes, cross-origin AJAX `fetch`), but sent when a user navigates from an external link (top-level `GET`). Ideal for web apps balancing security and user navigation.
* **`sameSite: 'strict'`**: Cookies are never sent on cross-site requests, even top-level navigation. Recommended for sensitive environments (e.g., banking or administrative consoles).

---

## 2. Double-Submit Cookie Pattern

For high-security operations (e.g., password changes, payment transfers, destructive mutations), relying solely on `SameSite` is not sufficient defense-in-depth. Ranu.js supports the standard Double-Submit Cookie pattern.

### Step A: Issuing a CSRF Token

Generate a cryptographically random CSRF token and store it in a readable cookie while passing it to the client:

```typescript
// app/api/auth/csrf/route.ts
import { cookies } from '@ranujs/core/server';

export async function GET(): Promise<Response> {
  const csrfToken = crypto.randomUUID();
  const cookieStore = cookies();

  // Non-httpOnly cookie so frontend scripts can read and include it in request headers
  cookieStore.set('csrf_token', csrfToken, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });

  return Response.json({ csrfToken });
}
```

### Step B: Validating the CSRF Token in Route Handlers

On state-modifying requests (`POST`, `PUT`, `PATCH`, `DELETE`), verify that the header matches the cookie token:

```typescript
// app/api/account/email/route.ts
import { cookies } from '@ranujs/core/server';

export async function POST(request: Request): Promise<Response> {
  const cookieStore = cookies();
  const cookieCsrfToken = cookieStore.get('csrf_token');
  const headerCsrfToken = request.headers.get('x-csrf-token');

  // Verify token presence and equality
  if (!cookieCsrfToken || !headerCsrfToken || cookieCsrfToken !== headerCsrfToken) {
    return Response.json(
      { error: 'Invalid or missing CSRF token.' },
      { status: 403 }
    );
  }

  const payload = await request.json();
  // Proceed with email update...
  return Response.json({ success: true });
}
```

---

## 3. Origin and Referer Header Verification

Modern web browsers send `Origin` or `Referer` headers on all state-modifying cross-origin requests. Verify these headers in `middleware.ts` or route handlers:

```typescript
// middleware.ts
import { NextRequest } from '@ranujs/core';
import { next } from '@ranujs/core/server';

export const config = {
  matcher: ['/api/:path*'],
};

export function middleware(request: NextRequest): Response {
  const method = request.method.toUpperCase();

  // Only check state-modifying HTTP methods
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');

    if (origin) {
      const originHost = new URL(origin).host;
      if (originHost !== host) {
        return Response.json(
          { error: 'Cross-origin state-modifying requests are forbidden.' },
          { status: 403 }
        );
      }
    }
  }

  return next();
}
```

---

## 4. Frontend Client Usage

When making mutation requests from React components, read the cookie or request token from the CSRF endpoint:

```tsx
// app/components/UpdateProfile.tsx
'use client';

import { useState } from 'react';

function getCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )csrf_token=([^;]+)'));
  return match ? match[2] : null;
}

export function UpdateProfile() {
  const [status, setStatus] = useState<string>('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const token = getCsrfCookie();

    const res = await fetch('/api/account/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': token ?? '',
      },
      body: JSON.stringify({ email: 'new-email@example.com' }),
    });

    if (res.ok) {
      setStatus('Updated successfully');
    } else {
      setStatus('Update failed');
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <button type="submit">Update Email</button>
      <p>{status}</p>
    </form>
  );
}
```

---

## 5. Security Checklist

| Check | Recommendation | Why |
| :--- | :--- | :--- |
| **SameSite Cookie** | Set `sameSite: 'lax'` or `'strict'` | Shields standard requests automatically in modern browsers |
| **HTTP-Only Session** | Keep authentication session tokens `httpOnly: true` | Prevents token exfiltration via Cross-Site Scripting (XSS) |
| **Origin Checking** | Enforce `Origin` === `Host` for mutation methods | Denies unauthorized cross-domain submissions |
| **Safe Methods** | Never perform destructive state mutations in `GET` requests | `GET` requests are pre-fetched and allow cross-site triggers |
