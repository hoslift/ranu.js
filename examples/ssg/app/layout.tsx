import type { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Static Site Generation (SSG) — Ranu.js</title>
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
            <a href="/">Home</a>
            <a href="/about">About</a>
            <a href="/pricing">Pricing</a>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
