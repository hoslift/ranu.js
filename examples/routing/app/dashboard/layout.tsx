import type { ReactNode } from 'react';
import { Link } from '@hoslift/ranu/react';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '2rem' }}>
      <aside style={{ borderRight: '1px solid #e5e7eb', paddingRight: '1rem' }}>
        <h3>Dashboard Menu</h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <li style={{ marginBottom: '0.5rem' }}>
            <Link href="/dashboard">Overview</Link>
          </li>
          <li style={{ marginBottom: '0.5rem' }}>
            <Link href="/dashboard/settings">Settings</Link>
          </li>
        </ul>
      </aside>
      <div>{children}</div>
    </div>
  );
}
