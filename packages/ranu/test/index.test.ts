import { describe, it, expect } from 'vitest';
import { RANU_VERSION } from '../src/index.js';
import { definePlugin } from '../src/plugin.js';

describe('Ranu.js package', () => {
  it('exports RANU_VERSION', () => {
    expect(RANU_VERSION).toBe('0.0.0');
  });

  it('exports the plugin API facade', () => {
    expect(definePlugin).toBeTypeOf('function');
  });
});
