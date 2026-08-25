import { describe, it, expect, vi } from 'vitest';
import { createCliLogger } from '../src/logger.js';

describe('@ranu/cli logger', () => {
  it('logs messages in normal mode', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = createCliLogger({});

    logger.log('Normal message');
    logger.info('Info message');
    logger.success('Success message');

    expect(consoleSpy).toHaveBeenCalledTimes(3);
    consoleSpy.mockRestore();
  });

  it('suppresses logs in quiet mode', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = createCliLogger({ quiet: true });

    logger.log('Silent message');
    logger.info('Silent info');
    logger.success('Silent success');

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('prints error in quiet mode', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = createCliLogger({ quiet: true });

    logger.error('Critical failure');
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('outputs structured JSON in json mode', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = createCliLogger({ json: true });

    logger.json({ status: 'ok', count: 42 });
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify({ status: 'ok', count: 42 }, null, 2));
    logSpy.mockRestore();
  });
});
