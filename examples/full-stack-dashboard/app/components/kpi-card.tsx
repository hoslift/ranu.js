export function KpiCard({
  title,
  value,
  change,
}: {
  title: string;
  value: string;
  change: string;
}) {
  return (
    <div
      style={{
        background: '#fff',
        padding: '1.5rem',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
      }}
    >
      <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>{title}</p>
      <h3 style={{ margin: '0.5rem 0', fontSize: '1.75rem' }}>{value}</h3>
      <p style={{ margin: 0, fontSize: '0.75rem', color: '#10b981' }}>{change}</p>
    </div>
  );
}
