import { describe, it, expect, vi } from 'vitest';
import { createPluginLogger } from '../src/logger.js';

describe('PluginLogger', () => {
  it('prefixes logs with [plugin:<name>]', () => {
    const logger = createPluginLogger('auth-plugin');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logger.info('Initialized');
    expect(spy).toHaveBeenCalledWith('[plugin:auth-plugin] Initialized');

    spy.mockRestore();
  });
});
