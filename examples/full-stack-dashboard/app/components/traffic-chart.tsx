import { useState } from 'react';

export function TrafficWidget() {
  const [activeRange, setActiveRange] = useState<'24h' | '7d' | '30d'>('24h');

  const stats = {
    '24h': { requests: '1.2M', p99: '14ms', errors: '0.001%' },
    '7d': { requests: '8.4M', p99: '16ms', errors: '0.003%' },
    '30d': { requests: '36.1M', p99: '18ms', errors: '0.002%' },
  };

  const current = stats[activeRange];

  return (
    <div
      style={{
        background: '#fff',
        padding: '1.5rem',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        marginTop: '1.5rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}
      >
        <h4 style={{ margin: 0 }}>Traffic & Performance Telemetry</h4>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(['24h', '7d', '30d'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setActiveRange(range)}
              style={{
                padding: '0.25rem 0.75rem',
                borderRadius: '4px',
                border: '1px solid #d1d5db',
                background: activeRange === range ? '#111827' : '#fff',
                color: activeRange === range ? '#fff' : '#374151',
                cursor: 'pointer',
              }}
            >
              {range}
            </button>
          ))}
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1rem',
          textAlign: 'center',
        }}
      >
        <div style={{ padding: '1rem', background: '#f9fafb', borderRadius: '6px' }}>
          <small style={{ color: '#6b7280' }}>Total Invocations</small>
          <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{current.requests}</div>
        </div>
        <div style={{ padding: '1rem', background: '#f9fafb', borderRadius: '6px' }}>
          <small style={{ color: '#6b7280' }}>P99 Response Latency</small>
          <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#059669' }}>
            {current.p99}
          </div>
        </div>
        <div style={{ padding: '1rem', background: '#f9fafb', borderRadius: '6px' }}>
          <small style={{ color: '#6b7280' }}>Error Rate</small>
          <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{current.errors}</div>
        </div>
      </div>
    </div>
  );
}
