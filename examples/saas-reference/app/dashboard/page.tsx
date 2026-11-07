import { getWorkspaces } from './actions.js';
import { MetricsGrid } from './components/MetricsGrid.js';
import { CreateWorkspaceForm } from './components/CreateWorkspaceForm.js';
import { InvalidationButton } from './components/InvalidationToast.js';

export const render = 'server';

export default async function DashboardPage() {
  const workspaces = await getWorkspaces();
  const renderedAt = new Date().toISOString();

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tenant Workspaces Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Page rendered via SSR at <span className="font-mono text-xs text-slate-700">{renderedAt}</span>
          </p>
        </div>
        <InvalidationButton />
      </div>

      <MetricsGrid workspaceCount={workspaces.length} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Managed Workspaces</h2>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Slug</th>
                  <th className="px-6 py-3">Plan</th>
                  <th className="px-6 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {workspaces.map((ws) => (
                  <tr key={ws.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-semibold text-slate-900">{ws.name}</td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-500">/{ws.slug}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 border border-indigo-200">
                        {ws.plan}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {new Date(ws.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <CreateWorkspaceForm />
        </div>
      </div>
    </main>
  );
}
