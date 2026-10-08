# OAuth 2.0 PKCE Integration

Implementing third-party authentication (such as social login or enterprise Single Sign-On) in **Ranu.js** is best done using the vendor-neutral **OAuth 2.0 Authorization Code Flow with PKCE (Proof Key for Code Exchange)**.

By leveraging standard Web APIs (`crypto.subtle`, `fetch`), you avoid heavyweight proprietary authentication libraries.

---

## 1. Initiating the Login Flow (`app/api/auth/oauth/route.ts`)

Generate a cryptographic challenge and redirect the user to the OAuth provider:

```typescript
// app/api/auth/oauth/route.ts
import { cookies } from '@ranujs/core/server';

function generateRandomString(length = 48): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function GET(): Promise<Response> {
  const state = generateRandomString(32);
  const codeVerifier = generateRandomString(64);
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Store state and verifier in temporary HTTP-only cookies
  const cookieStore = cookies();
  cookieStore.set('oauth_state', state, { httpOnly: true, secure: true, maxAge: 600 });
  cookieStore.set('oauth_verifier', codeVerifier, { httpOnly: true, secure: true, maxAge: 600 });

  const authUrl = new URL(process.env.OAUTH_AUTHORIZE_URL || 'https://auth.example.com/oauth/authorize');
  authUrl.searchParams.set('client_id', process.env.OAUTH_CLIENT_ID!);
  authUrl.searchParams.set('redirect_uri', `${process.env.APP_BASE_URL}/api/auth/callback`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  return Response.redirect(authUrl.toString(), 302);
}
```

---

## 2. Handling the Provider Callback (`app/api/auth/callback/route.ts`)

Verify the state to prevent CSRF, exchange the authorization code for tokens, and establish the session:

```typescript
// app/api/auth/callback/route.ts
import { cookies } from '@ranujs/core/server';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');

  const cookieStore = cookies();
  const savedState = cookieStore.get('oauth_state');
  const codeVerifier = cookieStore.get('oauth_verifier');

  // 1. Verify state parameter against CSRF attacks
  if (!code || !returnedState || returnedState !== savedState || !codeVerifier) {
    return Response.json({ error: 'Invalid OAuth state or expired request.' }, { status: 400 });
  }

  // 2. Exchange authorization code for user tokens
  const tokenRes = await fetch(process.env.OAUTH_TOKEN_URL || 'https://auth.example.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.OAUTH_CLIENT_ID!,
      client_secret: process.env.OAUTH_CLIENT_SECRET!,
      code,
      redirect_uri: `${process.env.APP_BASE_URL}/api/auth/callback`,
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenRes.ok) {
    return Response.json({ error: 'Token exchange failed.' }, { status: 502 });
  }

  const { access_token } = await tokenRes.json();

  // 3. Clean up temporary cookies and set persistent session
  cookieStore.delete('oauth_state');
  cookieStore.delete('oauth_verifier');

  cookieStore.set('session_id', access_token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  return Response.redirect(new URL('/dashboard', request.url).toString(), 302);
}
```

---

## 3. Key Takeaways

1. **Vendor Neutrality:** Standard OAuth 2.0 PKCE works identically across Google, GitHub, Auth0, Okta, Keycloak, or self-hosted identity providers.
2. **Next Step:** Safeguard form submissions with **[CSRF Protection](./04_CSRF_PROTECTION.md)**.
