'use client';

import { useFormAction } from '@ranujs/core/react';
import { createWorkspaceAction, type WorkspaceRecord } from '../actions.js';

export function CreateWorkspaceForm({ onCreated }: { onCreated?: (record: WorkspaceRecord) => void }) {
  const { submit, errors, formErrors, isPending, reset } = useFormAction(createWorkspaceAction, {
    onSuccess: (data) => {
      onCreated?.(data);
    },
  });

  return (
    <form
      onSubmit={async (e) => {
        await submit(e);
        const target = e.target as HTMLFormElement;
        target.reset();
      }}
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h3 className="text-base font-semibold text-slate-900">Create New Workspace</h3>
      <p className="text-xs text-slate-500">
        Invokes Server Action over HTTP wire protocol (POST /_ranu/action/:id) and triggers ISR revalidation.
      </p>

      {formErrors.length > 0 && (
        <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
          {formErrors.map((err, i) => (
            <p key={i}>{err}</p>
          ))}
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-xs font-medium text-slate-700">Workspace Name</label>
        <input
          id="name"
          name="name"
          type="text"
          placeholder="e.g. Apex Dynamics"
          required
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        {errors['name'] && <p className="mt-1 text-xs text-red-600">{errors['name'].join(', ')}</p>}
      </div>

      <div>
        <label htmlFor="slug" className="block text-xs font-medium text-slate-700">Workspace Slug</label>
        <input
          id="slug"
          name="slug"
          type="text"
          placeholder="e.g. apex-dynamics"
          required
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        {errors['slug'] && <p className="mt-1 text-xs text-red-600">{errors['slug'].join(', ')}</p>}
      </div>

      <div>
        <label htmlFor="plan" className="block text-xs font-medium text-slate-700">Subscription Plan</label>
        <select
          id="plan"
          name="plan"
          defaultValue="pro"
          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="starter">Starter ($29/mo)</option>
          <option value="pro">Pro ($99/mo)</option>
          <option value="enterprise">Enterprise ($499/mo)</option>
        </select>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors disabled:opacity-50"
        >
          {isPending ? (
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Submitting Action...
            </span>
          ) : (
            'Create Workspace via Action'
          )}
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Reset
        </button>
      </div>
    </form>
  );
}
