import { describe, it, expect } from 'vitest';
import staticAdapter, {
  adapterName,
  ADAPTER_API_VERSION,
  STATIC_CAPABILITIES,
  createStaticAdapter,
} from '../src/index.js';

describe('@ranujs/adapter-static package entry exports', () => {
  it('exports canonical adapter identification constants', () => {
    expect(adapterName).toBe('static');
    expect(ADAPTER_API_VERSION).toBe(1);
  });

  it('exports valid zero-runtime static capabilities', () => {
    expect(STATIC_CAPABILITIES.runtime).toBe('static');
    expect(STATIC_CAPABILITIES.ssr).toBe(false);
    expect(STATIC_CAPABILITIES.apiRoutes).toBe(false);
    expect(STATIC_CAPABILITIES.middleware).toBe(false);
    expect(STATIC_CAPABILITIES.streaming).toBe(false);
    expect(STATIC_CAPABILITIES.staticFiles).toBe(true);
    expect(STATIC_CAPABILITIES.runtimeEnvironment).toBe(false);
    expect(STATIC_CAPABILITIES.writableFilesystem).toBe('none');
    expect(STATIC_CAPABILITIES.longLivedProcess).toBe(false);
    expect(STATIC_CAPABILITIES.supportsWaitUntil).toBe(false);
  });

  it('factory functions instantiate deployment adapter instance', () => {
    const adapter1 = createStaticAdapter();
    expect(adapter1.name).toBe('static');
    expect(adapter1.apiVersion).toBe(1);
    expect(adapter1.capabilities).toEqual(STATIC_CAPABILITIES);
    expect(typeof adapter1.adapt).toBe('function');

    const adapter2 = staticAdapter({ outputDir: 'custom-dist' });
    expect(adapter2.name).toBe('static');
  });
});
