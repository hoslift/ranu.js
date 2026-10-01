import { useState } from 'react';

const frameworks = ['Ranu.js', 'React', 'Node.js', 'TypeScript', 'Vite', 'Next.js'];

export function TextFilter() {
  const [query, setQuery] = useState('');

  const filtered = frameworks.filter((item) => item.toLowerCase().includes(query.toLowerCase()));

  return (
    <div
      style={{
        marginTop: '2rem',
        padding: '1rem',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        maxWidth: '400px',
      }}
    >
      <h3>Search Filter</h3>
      <input
        type="text"
        placeholder="Filter frameworks..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: '100%', padding: '0.5rem', marginBottom: '1rem', boxSizing: 'border-box' }}
      />
      <ul>
        {filtered.map((item) => (
          <li key={item}>{item}</li>
        ))}
        {filtered.length === 0 && <li>No matches found.</li>}
      </ul>
    </div>
  );
}
