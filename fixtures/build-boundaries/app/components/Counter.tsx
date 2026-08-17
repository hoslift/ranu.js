"use client";

import React, { useState } from 'react';
import { formatTitle } from '../utils/format.js';

export function Counter({ initialCount = 0 }: { initialCount?: number }) {
  const [count, setCount] = useState(initialCount);
  const siteName = process.env.RANU_PUBLIC_SITE_NAME;

  return (
    <div className="counter-container">
      <h3>{formatTitle('Interactive Counter')} ({siteName})</h3>
      <p>Current count: {count}</p>
      <button onClick={() => setCount(c => c + 1)}>Increment</button>
    </div>
  );
}
