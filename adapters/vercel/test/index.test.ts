import { describe, it, expect } from 'vitest';
import { adapterName } from '../src/index.js';

describe('@ranu/adapter-vercel', () => {
  it('exports adapter name', () => {
    expect(adapterName).toBe('vercel');
  });
});
