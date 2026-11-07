'use server';

import { createFormAction, revalidatePath } from '@ranujs/core/server';

export interface WorkspaceRecord {
  id: string;
  name: string;
  slug: string;
  plan: 'starter' | 'pro' | 'enterprise';
  createdAt: string;
}

// In-memory data store simulating a multi-tenant persistence layer
const workspaces: WorkspaceRecord[] = [
  { id: 'ws_alpha', name: 'Acme Systems', slug: 'acme', plan: 'enterprise', createdAt: '2026-11-01T10:00:00Z' },
  { id: 'ws_beta', name: 'Starlight Labs', slug: 'starlight', plan: 'pro', createdAt: '2026-11-03T14:30:00Z' },
];

export async function getWorkspaces(): Promise<WorkspaceRecord[]> {
  return [...workspaces];
}

/**
 * Server Action creating a new workspace and invalidating the ISR cached dashboard page.
 */
export const createWorkspaceAction = createFormAction<
  { name: string; slug: string; plan?: 'starter' | 'pro' | 'enterprise' },
  WorkspaceRecord
>({
  schema: (raw: any) => {
    const name = String(raw?.name || '').trim();
    const slug = String(raw?.slug || '').trim().toLowerCase();
    const rawPlan = String(raw?.plan || 'starter');
    const plan: 'starter' | 'pro' | 'enterprise' =
      rawPlan === 'enterprise' || rawPlan === 'pro' ? rawPlan : 'starter';

    if (!name || name.length < 3) {
      throw new Error('Workspace name must be at least 3 characters.');
    }
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      throw new Error('Slug must contain only lowercase letters, numbers, and hyphens.');
    }
    return { name, slug, plan };
  },
  handler: async (input) => {
    const record: WorkspaceRecord = {
      id: `ws_${Math.random().toString(36).slice(2, 9)}`,
      name: input.name,
      slug: input.slug,
      plan: input.plan ?? 'starter',
      createdAt: new Date().toISOString(),
    };

    workspaces.unshift(record);

    // Trigger ISR cache invalidation across the dashboard layout hierarchy
    await revalidatePath('/dashboard');

    return record;
  },
});

/**
 * Manual cache purge action.
 */
export const purgeDashboardCacheAction = createFormAction<Record<string, unknown>, { purgedAt: string }>({
  handler: async () => {
    await revalidatePath('/dashboard');
    return { purgedAt: new Date().toISOString() };
  },
});
