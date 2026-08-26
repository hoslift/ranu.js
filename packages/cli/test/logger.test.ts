import { describe, it, expect, vi } from 'vitest';
import { createCliLogger } from '../src/logger.js';

describe('@ranu/cli logger', () => {
  it('logs messages in normal mode', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = createCliLogger({});

    logger.log('Normal message');
    logger.info('Info message');
    logger.success('Success message');
    logger.warn('Warning message');

    expect(consoleSpy).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('suppresses non-error logs in quiet mode', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = createCliLogger({ quiet: true });

    logger.log('Silent message');
    logger.info('Silent info');
    logger.success('Silent success');
    logger.warn('Silent warning');

    expect(consoleSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('prints error in text mode and JSON mode', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = createCliLogger({ quiet: true });
    logger.error('Critical failure');
    expect(errorSpy).toHaveBeenCalled();

    const jsonLogger = createCliLogger({ json: true });
    jsonLogger.error('JSON failure');
    expect(errorSpy).toHaveBeenCalledWith(JSON.stringify({ error: 'JSON failure' }));
    errorSpy.mockRestore();
  });

  it('suppresses regular logging in JSON mode', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const logger = createCliLogger({ json: true, debug: true });

    logger.log('Suppressed');
    logger.info('Suppressed');
    logger.success('Suppressed');
    logger.warn('Suppressed');
    logger.debug('Suppressed');

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(debugSpy).not.toHaveBeenCalled();

    logger.json({ status: 'ok', count: 42 });
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify({ status: 'ok', count: 42 }, null, 2));

    logSpy.mockRestore();
    warnSpy.mockRestore();
    debugSpy.mockRestore();
  });

  it('outputs debug messages when debug or verbose is true', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const logger1 = createCliLogger({ verbose: true });
    logger1.debug('Verbose debug information');
    expect(debugSpy).toHaveBeenCalledTimes(1);

    const logger2 = createCliLogger({ debug: true });
    logger2.debug('Debug information');
    expect(debugSpy).toHaveBeenCalledTimes(2);

    const logger3 = createCliLogger({});
    logger3.debug('Ignored debug');
    expect(debugSpy).toHaveBeenCalledTimes(2);

    debugSpy.mockRestore();
  });
});
