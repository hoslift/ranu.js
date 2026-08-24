import { afterEach, describe, it, expect, vi } from 'vitest';
import { createPluginLogger } from '../src/logger.js';

describe('PluginLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('prefixes logs with [plugin:<name>]', () => {
    const logger = createPluginLogger('auth-plugin');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logger.info('Initialized');
    expect(spy).toHaveBeenCalledWith('[plugin:auth-plugin] Initialized');
  });

  it('prefixes warnings and errors while forwarding arguments', () => {
    const logger = createPluginLogger('build-plugin');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const detail = { routeId: 'home' };

    logger.warn('Fallback used', detail);
    logger.error('Build failed', 17);

    expect(warnSpy).toHaveBeenCalledWith('[plugin:build-plugin] Fallback used', detail);
    expect(errorSpy).toHaveBeenCalledWith('[plugin:build-plugin] Build failed', 17);
  });

  it('emits debug logs only when debug mode is enabled', () => {
    vi.stubEnv('DEBUG', '');
    vi.stubEnv('RANU_DEBUG', '');
    const logger = createPluginLogger('debug-plugin');
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    logger.debug('hidden');
    expect(debugSpy).not.toHaveBeenCalled();

    vi.stubEnv('RANU_DEBUG', '1');
    logger.debug('visible', { verbose: true });
    expect(debugSpy).toHaveBeenCalledWith('[plugin:debug-plugin] visible', { verbose: true });
  });
});
