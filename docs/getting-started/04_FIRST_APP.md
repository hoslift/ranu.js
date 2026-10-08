# Building Your First Application

In this tutorial, you will build an interactive full-stack application with **Ranu.js** in under 5 minutes.

You will create:
1. A global Root Layout with navigation.
2. An interactive React 19 Client Component.
3. A server-side API route returning W3C Web Standard JSON.

---

## Step 1: Create the Root Layout (`app/layout.tsx`)

Every Ranu application starts with `app/layout.tsx`. This file wraps all child pages with persistent HTML structures:

```tsx
// app/layout.tsx
import React from 'react';
import { Link } from '@ranujs/core/react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>My Ranu App</title>
      </head>
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', padding: '24px' }}>
        <header style={{ borderBottom: '1px solid #eaeaea', paddingBottom: '16px', marginBottom: '24px' }}>
          <nav style={{ display: 'flex', gap: '16px' }}>
            <Link href="/" style={{ textDecoration: 'none', color: '#0070f3', fontWeight: 'bold' }}>
              Home
            </Link>
            <Link href="/about" style={{ textDecoration: 'none', color: '#666' }}>
              About
            </Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
```

---

## Step 2: Create a Server API Route (`app/api/greet/route.ts`)

Create a server endpoint that returns a greeting message. In Ranu.js, API routes live inside `app/api/**/route.ts` and communicate with standard W3C `Request` and `Response` objects:

```typescript
// app/api/greet/route.ts

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const name = url.searchParams.get('name') || 'Developer';

  return Response.json({
    message: `Hello, ${name}! Welcome to Ranu.js.`,
    timestamp: new Date().toISOString(),
  });
}
```

---

## Step 3: Create the Interactive Page (`app/page.tsx`)

Now, connect your client UI to the server API:

```tsx
// app/page.tsx
'use client';

import React, { useState } from 'react';

export default function HomePage() {
  const [greeting, setGreeting] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  async function fetchGreeting() {
    setLoading(true);
    try {
      const res = await fetch('/api/greet?name=Ranu+Pioneer');
      const data = await res.json();
      setGreeting(data.message);
    } catch {
      setGreeting('Failed to connect to server endpoint.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1>Welcome to Ranu.js</h1>
      <p>A fast, independent React 19 full-stack framework.</p>

      <div style={{ marginTop: '24px' }}>
        <button
          onClick={fetchGreeting}
          disabled={loading}
          style={{
            padding: '10px 18px',
            backgroundColor: '#0070f3',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          {loading ? 'Calling Server...' : 'Test Server API Route'}
        </button>

        {greeting && (
          <div style={{ marginTop: '16px', padding: '12px', background: '#f5f5f5', borderRadius: '6px' }}>
            <strong>Server Response:</strong> {greeting}
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## 4. Test in Your Browser

Run your development server:

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000). Click **"Test Server API Route"** to watch the client component communicate with the server route handler seamlessly.

---

## 🧭 Next Guides

Congratulations! You have built your first full-stack application on Ranu.js. Dive deeper with:
- **[Routing & Layouts Guide](../guides/routing/01_PAGES_AND_LAYOUTS.md)**
- **[Data Fetching & APIs Guide](../guides/data-fetching/01_API_ROUTES.md)**
