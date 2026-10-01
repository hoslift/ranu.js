import type { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Full-Stack Dashboard — Ranu.js</title>
      </head>
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, backgroundColor: '#f9fafb' }}>
        <header style={{ backgroundColor: '#111827', color: '#fff', padding: '1rem 2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Ranu.js Cloud Dashboard</h2>
            <nav style={{ display: 'flex', gap: '1.5rem' }}>
              <a href="/" style={{ color: '#9ca3af', textDecoration: 'none' }}>
                Live Metrics (SSR)
              </a>
              <a href="/about" style={{ color: '#9ca3af', textDecoration: 'none' }}>
                Architecture (SSG)
              </a>
            </nav>
          </div>
        </header>
        <main style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>{children}</main>
      </body>
    </html>
  );
}
