# Caching Headers & Optimization

Effective HTTP caching decreases server load and delivers immediate responses to end-users across browsers and edge CDNs.

---

## 1. HTTP `Cache-Control` Directives

Set standard HTTP cache headers directly on your `Response` objects in `app/api/**/route.ts`:

```typescript
// app/api/public-stats/route.ts

export async function GET(): Promise<Response> {
  const stats = {
    totalUsers: 14200,
    generatedAt: new Date().toISOString(),
  };

  return Response.json(stats, {
    headers: {
      // Cache in browsers for 60 seconds; cache in CDNs/Edge for 1 hour with revalidation
      'Cache-Control': 'public, max-age=60, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
```

---

## 2. Common Caching Recipes

| Scenario | Header Value | Description |
| :--- | :--- | :--- |
| **Private User Data** | `private, no-cache, no-store, must-revalidate` | Never store in intermediate proxies or shared caches. |
| **Static Content** | `public, max-age=31536000, immutable` | Permanent cache for versioned assets. |
| **Stale-While-Revalidate** | `public, max-age=30, stale-while-revalidate=300` | Return cached content immediately while re-fetching fresh data in the background. |

---

## 3. Preventing Cache for Dynamic Mutations

API routes handling state changes (`POST`, `PUT`, `DELETE`) should disable caching:

```typescript
export async function POST(request: Request) {
  // Process mutation...
  return Response.json({ success: true }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
```

---

## 4. Key Takeaways

1. **Web Standards:** Caching in Ranu.js adheres strictly to HTTP standards, functioning seamlessly across reverse proxies (Nginx), CDNs, and browser caches.
