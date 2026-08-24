import { describe, it, expect } from 'vitest';
import { definePlugin } from '../src/define.js';

describe('definePlugin helper', () => {
  it('returns valid plugin definition unchanged', () => {
    const def = definePlugin({
      name: 'test-plugin',
      apiVersion: 1,
      setup() {},
    });
    expect(def.name).toBe('test-plugin');
    expect(def.apiVersion).toBe(1);
  });

  it('rejects non-object definitions', () => {
    expect(() => definePlugin(null as any)).toThrow('RANU_PLUGIN_INVALID');
    expect(() => definePlugin(undefined as any)).toThrow('RANU_PLUGIN_INVALID');
  });

  it('rejects missing or empty plugin name', () => {
    expect(() => definePlugin({ name: '', apiVersion: 1, setup() {} })).toThrow('RANU_PLUGIN_INVALID');
    expect(() => definePlugin({ name: '   ', apiVersion: 1, setup() {} })).toThrow('RANU_PLUGIN_INVALID');
    expect(() => definePlugin({ apiVersion: 1, setup() {} } as any)).toThrow('RANU_PLUGIN_INVALID');
  });

  it('rejects unsupported apiVersion', () => {
    expect(() =>
      definePlugin({
        name: 'test-plugin',
        apiVersion: 2 as any,
        setup() {},
      })
    ).toThrow('RANU_PLUGIN_INCOMPATIBLE');
  });

  it('validates enforce tiers', () => {
    expect(
      definePlugin({
        name: 'p1',
        apiVersion: 1,
        enforce: 'pre',
        setup() {},
      }).enforce
    ).toBe('pre');

    expect(
      definePlugin({
        name: 'p2',
        apiVersion: 1,
        enforce: 'post',
        setup() {},
      }).enforce
    ).toBe('post');

    expect(() =>
      definePlugin({
        name: 'p3',
        apiVersion: 1,
        enforce: 'invalid' as any,
        setup() {},
      })
    ).toThrow('RANU_PLUGIN_INVALID');
  });

  it('rejects missing setup function', () => {
    expect(() =>
      definePlugin({
        name: 'test-plugin',
        apiVersion: 1,
      } as any)
    ).toThrow('RANU_PLUGIN_INVALID');
  });
});
