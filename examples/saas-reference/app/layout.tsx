import type { ReactNode } from 'react';
import { Link } from '@ranujs/core/react';
import './globals.css';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Workspaces - SaaS Reference</title>
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased font-sans">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-6">
              <Link href="/" className="text-xl font-bold tracking-tight text-indigo-600 hover:text-indigo-700">
                Workspaces
              </Link>
              <nav className="flex items-center gap-4 text-sm font-medium text-slate-600">
                <Link href="/" className="hover:text-slate-900 transition-colors">Home</Link>
                <Link href="/dashboard" className="hover:text-slate-900 transition-colors">Dashboard</Link>
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live SSR
              </span>
              <span className="text-sm text-slate-500">demo@example.com</span>
            </div>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
