# Client-Side Navigation

In full-stack web applications, seamless client-side page transitions are crucial for user experience. Ranu.js provides a native `<Link />` component that enables instantaneous, zero-reload transitions between pages.

---

## 1. The Native `<Link />` Component

Always import the `Link` component directly from `@ranujs/core/react`:

```tsx
// app/components/Navbar.tsx
import { Link } from '@ranujs/core/react';

export function Navbar() {
  return (
    <nav style={{ display: 'flex', gap: '16px' }}>
      <Link href="/">Home</Link>
      <Link href="/about">About</Link>
      <Link href="/posts/42">Featured Post</Link>
    </nav>
  );
}
```

> [!WARNING]
> Never use standard HTML `<a href="...">` tags for internal application links unless you specifically intend to trigger a full browser window refresh.

---

## 2. Dynamic Links

You can construct dynamic URLs using template literals:

```tsx
import { Link } from '@ranujs/core/react';

interface ArticleItem {
  id: string;
  title: string;
}

export function ArticleList({ articles }: { articles: ArticleItem[] }) {
  return (
    <ul>
      {articles.map((article) => (
        <li key={article.id}>
          <Link href={`/posts/${article.id}`}>
            {article.title}
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

---

## 3. Styling Links & Active States

You can pass standard styling properties, class names, or accessibility attributes directly to `<Link />`:

```tsx
<Link
  href="/dashboard"
  className="nav-link"
  style={{ textDecoration: 'none', color: '#0070f3' }}
  aria-label="Navigate to dashboard"
>
  Dashboard
</Link>
```

---

## 4. Key Takeaways

1. **Framework Native:** Always import `Link` from `@ranujs/core/react`. Never import from foreign meta-framework namespaces.
2. **Next Step:** Handle missing pages and routing errors with **[Custom 404 & Error Handling](./04_CUSTOM_404_ERRORS.md)**.
