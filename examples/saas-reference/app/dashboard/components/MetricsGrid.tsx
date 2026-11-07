export function MetricsGrid({ workspaceCount }: { workspaceCount: number }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Active Workspaces</p>
        <p className="mt-2 text-3xl font-extrabold text-slate-900">{workspaceCount}</p>
        <p className="mt-1 text-xs text-emerald-600 font-medium">+2 this week</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Monthly Run Rate</p>
        <p className="mt-2 text-3xl font-extrabold text-slate-900">${(workspaceCount * 99).toLocaleString()}</p>
        <p className="mt-1 text-xs text-emerald-600 font-medium">99.8% collection</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Cache Strategy</p>
        <p className="mt-2 text-xl font-bold text-indigo-600">ISR (Tagged)</p>
        <p className="mt-1 text-xs text-slate-500">revalidatePath('/dashboard')</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">SSR Latency (p99)</p>
        <p className="mt-2 text-3xl font-extrabold text-slate-900">8ms</p>
        <p className="mt-1 text-xs text-emerald-600 font-medium">React 19 streaming</p>
      </div>
    </div>
  );
}
