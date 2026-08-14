import { describe, it, expect } from 'vitest';
import { definePlugin } from '../src/index.js';

describe('@ranu/plugin', () => {
  it('definePlugin returns a plugin with a name', () => {
    const plugin = definePlugin({ name: 'test-plugin' });
    expect(plugin.name).toBe('test-plugin');
  });

  it('throws when name is missing', () => {
    expect(() => definePlugin({ name: '' })).toThrow('Ranu.js plugin must have a name');
  });
});
