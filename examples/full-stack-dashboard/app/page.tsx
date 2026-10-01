import { KpiCard } from './components/kpi-card.js';
import { TrafficWidget } from './components/traffic-chart.js';

export const render = 'server';

export default function DashboardPage() {
  const serverTimestamp = new Date().toISOString();

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem',
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>System Metrics & Analytics</h1>
          <p style={{ margin: '0.25rem 0', color: '#6b7280' }}>
            Live telemetry rendered on-demand on the server runtime.
          </p>
        </div>
        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          Server Time: <code>{serverTimestamp}</code>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem' }}>
        <KpiCard title="Active Connections" value="14,289" change="+12.4% vs last hour" />
        <KpiCard title="SSR Throughput" value="1,840 req/s" change="+5.1% efficiency" />
        <KpiCard title="Global Cache Hit" value="98.7%" change="+0.3% edge cache" />
        <KpiCard title="CPU Utilization" value="24.2%" change="-3.8% cold start" />
      </div>

      <TrafficWidget />
    </div>
  );
}
