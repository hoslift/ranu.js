import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div
      style={{
        padding: '1rem',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        maxWidth: '300px',
      }}
    >
      <h3>Interactive Counter</h3>
      <p style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Current: {count}</p>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          onClick={() => setCount((c) => c + 1)}
          style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}
        >
          Increment (+)
        </button>
        <button
          onClick={() => setCount((c) => c - 1)}
          style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}
        >
          Decrement (-)
        </button>
        <button onClick={() => setCount(0)} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
          Reset
        </button>
      </div>
    </div>
  );
}
