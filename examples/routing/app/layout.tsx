import type { ReactNode } from 'react';
import { Link } from 'ranu/react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Routing Example — Ranu.js</title>
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
            <Link href="/about">About</Link>
            <Link href="/contact">Contact</Link>
            <Link href="/dashboard">Dashboard</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
