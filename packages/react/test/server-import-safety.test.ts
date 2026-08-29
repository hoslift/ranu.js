import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Stage 13B & Phase 14: Server Import Safety', () => {
  let savedWindow: typeof window;
  let savedDoc: typeof document;

  beforeEach(() => {
    savedWindow = globalThis.window;
    savedDoc = globalThis.document;
    delete (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).document;
  });

  afterEach(() => {
    if (savedWindow !== undefined) {
      globalThis.window = savedWindow;
    }
    if (savedDoc !== undefined) {
      globalThis.document = savedDoc;
    }
  });

  it('imports @ranu/react in a pure Node environment without window or document', async () => {
    expect(typeof (globalThis as Record<string, unknown>).window).toBe('undefined');
    expect(typeof (globalThis as Record<string, unknown>).document).toBe('undefined');

    const reactModule = await import('../src/index.js');
    expect(reactModule).toBeDefined();
    expect(typeof reactModule.renderReactToStream).toBe('function');
    expect(typeof reactModule.serializeHydrationData).toBe('function');
    expect(typeof reactModule.deserializeHydrationData).toBe('function');
    expect(typeof reactModule.bootstrapClientHydration).toBe('function');
    expect(typeof reactModule.getHydrationPayloadFromDocument).toBe('function');
    expect(typeof reactModule.createRouteLoader).toBe('function');
    expect(typeof reactModule.createPrefetchService).toBe('function');
    expect(typeof reactModule.createTransitionCoordinator).toBe('function');
  }, 15_000);

  it('fails gracefully when getHydrationPayloadFromDocument is called without a document', async () => {
    const { getHydrationPayloadFromDocument } = await import('../src/index.js');
    expect(() => getHydrationPayloadFromDocument(undefined)).toThrow(
      /Hydration bootstrap requires a valid Document context/,
    );
  });
});
