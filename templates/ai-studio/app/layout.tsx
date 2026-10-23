import type { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Ranu.js AI Studio — Modular Partner Showcase</title>
        <style dangerouslySetInnerHTML={{ __html: `
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
            background-color: #0b0f19;
            color: #f3f4f6;
            min-height: 100vh;
          }
          a { color: inherit; text-decoration: none; }
          button { cursor: pointer; border: none; background: none; font: inherit; }
        ` }} />
      </head>
      <body>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <header style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 32px',
            borderBottom: '1px solid #1f2937',
            background: 'rgba(11, 15, 25, 0.8)',
            backdropFilter: 'blur(8px)',
            position: 'sticky',
            top: 0,
            zIndex: 40,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                color: '#fff',
                fontSize: '18px',
              }}>
                R
              </div>
              <span style={{ fontWeight: 700, fontSize: '18px', letterSpacing: '-0.02em' }}>
                Ranu.js <span style={{ color: '#60a5fa' }}>AI Studio</span>
              </span>
              <span style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '9999px',
                background: '#1e3a8a',
                color: '#93c5fd',
                marginLeft: '8px',
              }}>
                Showcase Mode
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '14px', color: '#9ca3af' }}>
              <span>W3C Streaming Kernel</span>
              <span>•</span>
              <span>Zero-Lock-in</span>
              <span>•</span>
              <a
                href="https://github.com/hoslift/ranu.js"
                target="_blank"
                rel="noreferrer"
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  background: '#1f2937',
                  color: '#e5e7eb',
                  fontWeight: 500,
                  fontSize: '13px',
                }}
              >
                GitHub
              </a>
            </div>
          </header>
          <main style={{ flex: 1 }}>
            {children}
          </main>
          <footer style={{
            padding: '24px 32px',
            borderTop: '1px solid #1f2937',
            textAlign: 'center',
            fontSize: '13px',
            color: '#6b7280',
          }}>
            Ranu.js Open Source Web Framework — Upfront Sponsorship & Partner Ecosystem Showcase
          </footer>
        </div>
      </body>
    </html>
  );
}
