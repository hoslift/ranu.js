import { describe, it, expect } from 'vitest';

describe('Stage 13B: Server Import Safety', () => {
  it('imports @ranu/react in a pure Node environment without window or document', async () => {
    expect(typeof (globalThis as any).window).toBe('undefined');
    expect(typeof (globalThis as any).document).toBe('undefined');

    const reactModule = await import('../src/index.js');
    expect(reactModule).toBeDefined();
    expect(typeof reactModule.renderReactToStream).toBe('function');
    expect(typeof reactModule.serializeHydrationData).toBe('function');
    expect(typeof reactModule.deserializeHydrationData).toBe('function');
    expect(typeof reactModule.bootstrapClientHydration).toBe('function');
    expect(typeof reactModule.getHydrationPayloadFromDocument).toBe('function');
  });

  it('fails gracefully when getHydrationPayloadFromDocument is called without a document', async () => {
    const { getHydrationPayloadFromDocument } = await import('../src/index.js');
    expect(() => getHydrationPayloadFromDocument(undefined)).toThrow(
      /Hydration bootstrap requires a valid Document context/
    );
  });
});
