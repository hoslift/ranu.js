# Dynamic Routes

Dynamic routes allow you to create pages that match variable parameters from the URL, such as product IDs, user handles, or blog slugs.

---

## 1. Single Dynamic Parameters (`[id]`)

Wrap a folder name in square brackets to declare a dynamic route segment:

```
app/
└── posts/
    └── [id]/
        └── page.tsx      # Matches /posts/1, /posts/alpha, /posts/42
```

### Accessing Route Parameters

The page component receives the resolved parameters in its `params` prop:

```tsx
// app/posts/[id]/page.tsx

interface PostPageProps {
  params?: {
    id: string;
  };
}

export default function PostPage({ params }: PostPageProps) {
  const postId = params?.id;

  return (
    <div>
      <h1>Post Details</h1>
      <p>Viewing post with ID: <strong>{postId}</strong></p>
    </div>
  );
}
```

---

## 2. Catch-All Dynamic Routes (`[...slug]`)

To capture multiple URL path segments as an array, use ellipsis syntax inside square brackets:

```
app/
└── docs/
    └── [...slug]/
        └── page.tsx      # Matches /docs/intro, /docs/guides/routing/nested
```

### Accessing Catch-All Segments

Catch-all parameters are resolved as an array of strings:

```tsx
// app/docs/[...slug]/page.tsx

interface DocsPageProps {
  params?: {
    slug: string[];
  };
}

export default function DocsPage({ params }: DocsPageProps) {
  const segments = params?.slug || [];

  return (
    <div>
      <h1>Documentation</h1>
      <p>Current Path: {segments.join(' / ')}</p>
    </div>
  );
}
```

---

## 3. Dynamic Route Matching Summary

| Pattern | Example File Path | Example Matching URL | `params` Value |
| :--- | :--- | :--- | :--- |
| **Exact** | `app/blog/page.tsx` | `/blog` | `{}` |
| **Dynamic** | `app/blog/[id]/page.tsx` | `/blog/react-19` | `{ id: 'react-19' }` |
| **Catch-All** | `app/files/[...path]/page.tsx` | `/files/media/images/photo.png` | `{ path: ['media', 'images', 'photo.png'] }` |

---

## 4. Key Takeaways

1. **Type Safety:** Always type your `params` with TypeScript interfaces to prevent runtime `undefined` errors.
2. **Next Step:** Learn how to navigate between dynamic pages without browser refresh in **[Client Navigation](./03_CLIENT_NAVIGATION.md)**.
