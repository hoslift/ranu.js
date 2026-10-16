import { describe, it, expect } from 'vitest';
import { adapterName } from '../src/index.js';

describe('@ranujs/adapter-netlify', () => {
  it('exports adapter name', () => {
    expect(adapterName).toBe('netlify');
  });
});
