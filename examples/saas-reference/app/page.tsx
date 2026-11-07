import { Link } from '@ranujs/core/react';

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-20 text-center">
      <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5 text-xs font-semibold text-indigo-700">
        Ranu.js Production Reference Application
      </div>
      <h1 className="mt-6 text-5xl font-extrabold tracking-tight text-slate-900 sm:text-6xl">
        Next-Generation SaaS with <span className="text-indigo-600">Ranu.js</span>
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600 leading-relaxed">
        Authentic full-stack production reference application demonstrating React 19 streaming SSR,
        HTTP Server Actions wire protocol, tagged ISR cache invalidation, and modern UI styling.
      </p>
      <div className="mt-10 flex items-center justify-center gap-4">
        <Link
          href="/dashboard"
          className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          Open Tenant Dashboard
        </Link>
        <a
          href="/api/health"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
        >
          Inspect API Health
        </a>
      </div>
      <div className="mt-20 grid grid-cols-1 gap-8 text-left sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold uppercase tracking-wider text-indigo-600">Server Actions</div>
          <p className="mt-2 font-bold text-slate-900">HTTP RPC Wire Protocol</p>
          <p className="mt-2 text-sm text-slate-500">
            Type-safe form mutations over POST /_ranu/action/:actionId with schema validation and pending states.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold uppercase tracking-wider text-emerald-600">ISR Caching</div>
          <p className="mt-2 font-bold text-slate-900">revalidatePath Invalidation</p>
          <p className="mt-2 text-sm text-slate-500">
            Granular route cache purges with single-flight mutex protection and cold-miss layout prefix eviction.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold uppercase tracking-wider text-blue-600">Tailwind CSS</div>
          <p className="mt-2 font-bold text-slate-900">Zero-Config Modern Styling</p>
          <p className="mt-2 text-sm text-slate-500">
            Streamlined PostCSS integration with native CSS-first configuration and lightning-fast esbuild compilation.
          </p>
        </div>
      </div>
    </main>
  );
}
