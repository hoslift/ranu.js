import { describe, it, expect } from 'vitest';
import { adapterName, ADAPTER_API_VERSION, DENO_CAPABILITIES } from '../src/index.js';

describe('@ranujs/adapter-deno exports', () => {
  it('exports adapter metadata', () => {
    expect(adapterName).toBe('deno');
    expect(ADAPTER_API_VERSION).toBe(1);
    expect(DENO_CAPABILITIES.runtime).toBe('deno');
  });
});
