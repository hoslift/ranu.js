# Session Cookies & State Management

Authentication in modern full-stack web applications requires secure, tamper-proof session storage. **Ranu.js** provides a native `cookies()` helper via `@ranujs/core/server` that adheres directly to W3C Web Standards without requiring third-party cookie middleware.

---

## 1. Setting Secure Session Cookies

When authenticating a user in a server API route (`app/api/auth/login/route.ts`), issue an HTTP-only, secure cookie:

```typescript
// app/api/auth/login/route.ts
import { cookies } from '@ranujs/core/server';

interface LoginPayload {
  email?: string;
  password?: string;
}

export async function POST(request: Request): Promise<Response> {
  const { email, password } = (await request.json()) as LoginPayload;

  // 1. Verify credentials against your database
  if (!email || password !== 'correct-password') {
    return Response.json({ error: 'Invalid email or password.' }, { status: 401 });
  }

  // 2. Generate cryptographically secure session token
  const sessionToken = crypto.randomUUID();

  // 3. Access Ranu's native cookie store
  const cookieStore = cookies();

  // 4. Set secure cookie with defense-in-depth flags
  cookieStore.set('session_id', sessionToken, {
    httpOnly: true, // Prevents JavaScript reading the cookie (mitigates XSS)
    secure: process.env.NODE_ENV === 'production', // Transmit only over HTTPS in production
    sameSite: 'lax', // Protects against Cross-Site Request Forgery (CSRF)
    path: '/', // Accessible across all application routes
    maxAge: 60 * 60 * 24 * 7, // 7 days in seconds
  });

  return Response.json({
    success: true,
    user: { email, role: 'member' },
  });
}
```

---

## 2. Reading Session Cookies

Inspect incoming cookies in protected API routes or server handlers:

```typescript
// app/api/user/profile/route.ts
import { cookies } from '@ranujs/core/server';

export async function GET(): Promise<Response> {
  const cookieStore = cookies();
  const sessionToken = cookieStore.get('session_id');

  if (!sessionToken) {
    return Response.json({ error: 'Unauthorized: No active session.' }, { status: 401 });
  }

  // Look up user from database using sessionToken
  return Response.json({
    user: { id: 'usr_123', email: 'user@example.com' },
  });
}
```

---

## 3. Clearing Session Cookies (Logout)

Terminate user sessions by removing the cookie:

```typescript
// app/api/auth/logout/route.ts
import { cookies } from '@ranujs/core/server';

export async function POST(): Promise<Response> {
  const cookieStore = cookies();

  // Deletes the cookie by setting maxAge to 0 immediately
  cookieStore.delete('session_id');

  return Response.json({ success: true, message: 'Logged out successfully.' });
}
```

---

## 4. Security Best Practices

1. **Always `httpOnly: true`:** Never store access tokens in `localStorage` or `sessionStorage` in the browser where client-side scripts could access them.
2. **Rotate Tokens:** Issue new session IDs after privilege changes (such as password resets or role promotions).
3. **Next Step:** Enforce authentication across entire route trees with **[Protected Routes & Middleware](./02_PROTECTED_ROUTES.md)**.
