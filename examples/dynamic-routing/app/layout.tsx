import type { ReactNode } from 'react';
import { Link } from '@ranujs/core/react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Dynamic Routing Example — Ranu.js</title>
      </head>
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: '2rem' }}>
        <header
          style={{
            borderBottom: '1px solid #e5e7eb',
            paddingBottom: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          <nav style={{ display: 'flex', gap: '1.5rem' }}>
            <Link href="/">Home</Link>
            <Link href="/posts/42">Post #42</Link>
            <Link href="/shop/electronics/camera-x1">Product Detail</Link>
            <Link href="/docs/getting-started/overview">Docs Catch-all</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
