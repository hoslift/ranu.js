import React from 'react';
import { Counter } from './components/Counter.js';
import { formatTitle } from './utils/format.js';

export default function BoundaryPage() {
  return (
    <main>
      <h1>{formatTitle('Boundary Demo')}</h1>
      <Counter initialCount={5} />
    </main>
  );
}
