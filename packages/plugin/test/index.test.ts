import { describe, it, expect } from 'vitest';
import { definePlugin, PluginManager, createPluginLogger } from '../src/index.js';

describe('@ranu/plugin index exports', () => {
  it('exports definePlugin, PluginManager, and createPluginLogger', () => {
    expect(typeof definePlugin).toBe('function');
    expect(typeof PluginManager).toBe('function');
    expect(typeof createPluginLogger).toBe('function');
  });

  it('definePlugin returns a validated plugin definition', () => {
    const plugin = definePlugin({
      name: 'test-plugin',
      apiVersion: 1,
      setup() {},
    });
    expect(plugin.name).toBe('test-plugin');
    expect(plugin.apiVersion).toBe(1);
  });

  it('throws when name is missing', () => {
    expect(() =>
      definePlugin({
        name: '',
        apiVersion: 1,
        setup() {},
      })
    ).toThrow('RANU_PLUGIN_INVALID');
  });
});
