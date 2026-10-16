import { describe, it, expect } from 'vitest';
import { adapterName, ADAPTER_API_VERSION, NODE_CAPABILITIES } from '../src/index.js';

describe('@ranujs/adapter-node exports', () => {
  it('exports adapter metadata', () => {
    expect(adapterName).toBe('node');
    expect(ADAPTER_API_VERSION).toBe(1);
    expect(NODE_CAPABILITIES.runtime).toBe('node');
  });
});
