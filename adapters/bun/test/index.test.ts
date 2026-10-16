import { describe, it, expect } from 'vitest';
import { adapterName, ADAPTER_API_VERSION, BUN_CAPABILITIES } from '../src/index.js';

describe('@ranujs/adapter-bun exports', () => {
  it('exports adapter metadata', () => {
    expect(adapterName).toBe('bun');
    expect(ADAPTER_API_VERSION).toBe(1);
    expect(BUN_CAPABILITIES.runtime).toBe('bun');
  });
});
