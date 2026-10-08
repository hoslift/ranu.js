# Custom 404 & Error Handling

When users request a route that does not exist in your application, Ranu.js displays an error boundary. You can customize this experience by defining an `app/404.tsx` file.

---

## 1. Creating the Custom 404 Page (`app/404.tsx`)

Place a `404.tsx` file directly inside your `app/` directory:

```tsx
// app/404.tsx
import { Link } from '@ranujs/core/react';

export default function NotFound() {
  return (
    <div style={{ textAlign: 'center', padding: '64px 16px' }}>
      <h1 style={{ fontSize: '48px', marginBottom: '8px' }}>404</h1>
      <h2 style={{ fontSize: '20px', color: '#666', marginBottom: '24px' }}>
        Page Not Found
      </h2>
      <p style={{ maxWidth: '400px', margin: '0 auto 24px auto', color: '#888' }}>
        The page you are looking for doesn't exist or has been moved.
      </p>
      <Link
        href="/"
        style={{
          display: 'inline-block',
          backgroundColor: '#0070f3',
          color: '#fff',
          padding: '10px 20px',
          borderRadius: '6px',
          textDecoration: 'none',
        }}
      >
        Return to Home
      </Link>
    </div>
  );
}
```

---

## 2. Server-Triggered 404s (`notFound()`)

When loading dynamic resources from a database or API, you can programmatically trigger the 404 boundary if the resource does not exist:

```typescript
// app/posts/[id]/page.tsx
import { notFound } from '@ranujs/core/server';

interface PostProps {
  params?: { id: string };
}

export default async function PostPage({ params }: PostProps) {
  const post = await fetchPostById(params?.id);

  if (!post) {
    notFound(); // Triggers the 404 page handler
  }

  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.body}</p>
    </article>
  );
}
```

---

## 3. Key Takeaways

1. **User Experience:** Custom 404 pages help users recover from broken links and navigate back into active application sections.
2. **Next Step:** Learn how to handle backend communication in **[API Routes & Server Handlers](../data-fetching/01_API_ROUTES.md)**.
