# API Routes & Server Handlers

Ranu.js allows you to build standard REST API endpoints inside your `app/` directory without requiring an external backend framework.

---

## 1. Anatomy of an API Route

API routes live inside `app/api/**/route.ts`. They run exclusively on the server and export uppercase HTTP method handlers:

```typescript
// app/api/users/route.ts

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const role = url.searchParams.get('role');

  const users = [
    { id: '1', name: 'Alice', role: 'admin' },
    { id: '2', name: 'Bob', role: 'member' },
  ];

  const filtered = role ? users.filter((u) => u.role === role) : users;

  return Response.json({ data: filtered });
}
```

---

## 2. Handling HTTP Methods

You can handle multiple HTTP verbs inside the same `route.ts` file:

```typescript
// app/api/items/route.ts

interface CreateItemPayload {
  name: string;
  price: number;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = (await request.json()) as CreateItemPayload;

    if (!payload.name || typeof payload.price !== 'number') {
      return Response.json(
        { error: 'Fields "name" (string) and "price" (number) are required.' },
        { status: 400 }
      );
    }

    const newItem = {
      id: crypto.randomUUID(),
      name: payload.name,
      price: payload.price,
      createdAt: new Date().toISOString(),
    };

    return Response.json({ success: true, item: newItem }, { status: 201 });
  } catch {
    return Response.json({ error: 'Malformed JSON payload' }, { status: 400 });
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return Response.json({ error: 'Query parameter "id" is required.' }, { status: 400 });
  }

  // Perform deletion
  return Response.json({ success: true, deletedId: id });
}
```

---

## 3. Server Context Helpers (`@ranujs/core/server`)

You can read incoming cookies and headers using Ranu's server helpers:

```typescript
// app/api/profile/route.ts
import { cookies, headers } from '@ranujs/core/server';

export async function GET(request: Request): Promise<Response> {
  const cookieStore = cookies(request);
  const sessionToken = cookieStore.get('session_id');

  if (!sessionToken) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return Response.json({ user: 'authenticated-user', session: sessionToken });
}
```

---

## 4. Key Rules

1. **Standard Signatures:** Always accept global W3C `Request` and return global W3C `Response`.
2. **Never Legacy Callbacks:** Never use Express-style `(req, res)` or Node.js event callback signatures.
3. **Next Step:** Discover React 19 mutations in **[Form Actions & State Transitions](./02_FORM_ACTIONS.md)**.
