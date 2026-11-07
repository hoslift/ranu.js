'use client';

import { useFormAction } from '@ranujs/core/react';
import { purgeDashboardCacheAction } from '../actions.js';

export function InvalidationButton() {
  const { submit, data, isPending } = useFormAction(purgeDashboardCacheAction);

  return (
    <div className="flex items-center gap-3">
      {data && (
        <span className="text-xs text-emerald-600 font-medium">
          Cache evicted at {new Date(data.purgedAt).toLocaleTimeString()}
        </span>
      )}
      <button
        onClick={() => submit({})}
        disabled={isPending}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
      >
        {isPending ? 'Evicting...' : 'Purge ISR Cache'}
      </button>
    </div>
  );
}
