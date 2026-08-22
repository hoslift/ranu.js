import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { useState } from 'react';
import {
  getHydrationPayloadFromDocument,
  bootstrapClientHydration,
} from '../src/client/bootstrap.js';
import {
  serializeHydrationData,
  HYDRATION_DATA_SCRIPT_ID,
  HYDRATION_DATA_SCRIPT_TYPE,
} from '../src/client/serialization.js';
import type { RanuHydrationPayload, PageProps } from '../src/types.js';

class MockElement {
  public tagName: string;
  public id: string;
  public textContent: string = '';
  public attributes: Record<string, string> = {};
  public listeners: Record<string, ((event: unknown) => void)[]> = {};

  constructor(tagName: string, id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  addEventListener(event: string, fn: (event: unknown) => void): void {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(fn);
  }

  click(): void {
    this.listeners['click']?.forEach(fn => fn({ type: 'click' }));
  }
}

class MockDocument {
  public elements = new Map<string, MockElement>();
  public ownerDocument = this;

  getElementById(id: string): MockElement | null {
    return this.elements.get(id) ?? null;
  }

  registerElement(el: MockElement): void {
    this.elements.set(el.id, el);
  }
}

// Mock react-dom/client hydrateRoot and createRoot for pure deterministic Node environment
vi.mock('react-dom/client', () => ({
  hydrateRoot: vi.fn((container: unknown, element: unknown, options?: { onRecoverableError?: (err: unknown) => void }) => ({
    render: vi.fn(),
    unmount: vi.fn(),
    _container: container,
    _element: element,
    _options: options,
  })),
  createRoot: vi.fn((container: unknown, options?: { onRecoverableError?: (err: unknown) => void }) => ({
    render: vi.fn(),
    unmount: vi.fn(),
    _container: container,
    _options: options,
  })),
}));

describe('Stage 13B: Browser Hydration Bootstrap Runtime', () => {
  const samplePayload: RanuHydrationPayload = {
    buildId: 'test_build_stage13b',
    routeId: 'app-counter-page',
    pathname: '/counter',
    params: {
      initial: '5',
    },
    searchParams: {
      step: '2',
    },
    publicEnv: {
      RANU_PUBLIC_SITE_NAME: 'Stage 13B Test',
    },
    assets: {
      js: ['/_ranu/assets/counter.js'],
      css: ['/_ranu/assets/counter.css'],
    },
  };

  function createMockDocWithPayload(payload: RanuHydrationPayload): MockDocument {
    const doc = new MockDocument();
    const scriptEl = new MockElement('SCRIPT', HYDRATION_DATA_SCRIPT_ID);
    scriptEl.setAttribute('type', HYDRATION_DATA_SCRIPT_TYPE);
    scriptEl.textContent = serializeHydrationData(payload);
    doc.registerElement(scriptEl);
    return doc;
  }

  describe('Document Payload Resolution', () => {
    it('locates and reads the inert JSON hydration payload from the document', () => {
      const doc = createMockDocWithPayload(samplePayload);
      const parsed = getHydrationPayloadFromDocument(doc as unknown as Document);

      expect(parsed.buildId).toBe('test_build_stage13b');
      expect(parsed.routeId).toBe('app-counter-page');
      expect(parsed.pathname).toBe('/counter');
      expect(parsed.params.initial).toBe('5');
      expect(parsed.searchParams.step).toBe('2');
    });

    it('throws when the hydration script tag is missing', () => {
      const doc = new MockDocument();
      expect(() => getHydrationPayloadFromDocument(doc as unknown as Document)).toThrow(
        /Hydration script element with ID "__ranu_data__" was not found/
      );
    });

    it('throws when the element with ID __ranu_data__ is not a <script> tag', () => {
      const doc = new MockDocument();
      const divEl = new MockElement('DIV', HYDRATION_DATA_SCRIPT_ID);
      doc.registerElement(divEl);

      expect(() => getHydrationPayloadFromDocument(doc as unknown as Document)).toThrow(
        /is not a <script> element/
      );
    });

    it('throws when the script tag has incorrect type (e.g. text/javascript)', () => {
      const doc = new MockDocument();
      const scriptEl = new MockElement('SCRIPT', HYDRATION_DATA_SCRIPT_ID);
      scriptEl.setAttribute('type', 'text/javascript');
      doc.registerElement(scriptEl);

      expect(() => getHydrationPayloadFromDocument(doc as unknown as Document)).toThrow(
        /must have type "application\/json"/
      );
    });
  });

  describe('Hydration Execution and Build ID Validation', () => {
    function CounterComponent({ params, searchParams }: PageProps) {
      const initial = Number(params.initial ?? 0);
      const step = Number(searchParams.step ?? 1);
      const [count, setCount] = useState(initial);

      return (
        <div>
          <span id="counter-value">{count}</span>
          <button id="increment-btn" onClick={() => setCount(c => c + step)}>
            Increment
          </button>
        </div>
      );
    }

    it('hydrates server markup and invokes hydrateRoot with reconstructed tree', async () => {
      const doc = createMockDocWithPayload(samplePayload);
      const onHydratedSpy = vi.fn();

      const result = await bootstrapClientHydration({
        container: doc as unknown as Document,
        buildId: 'test_build_stage13b',
        componentLoader: async (routeId: string) => {
          expect(routeId).toBe('app-counter-page');
          return CounterComponent;
        },
        onHydrated: onHydratedSpy,
      });

      expect(result.success).toBe(true);
      expect(result.payload.buildId).toBe('test_build_stage13b');
      expect(onHydratedSpy).toHaveBeenCalledTimes(1);
    });

    it('rejects hydration when client build ID mismatches server payload build ID', async () => {
      const doc = createMockDocWithPayload(samplePayload);
      const onHydrationErrorSpy = vi.fn();

      await expect(
        bootstrapClientHydration({
          container: doc as unknown as Document,
          buildId: 'different_client_build_456',
          componentLoader: async () => CounterComponent,
          onHydrationError: onHydrationErrorSpy,
        })
      ).rejects.toThrow(/Build ID mismatch during hydration/);

      expect(onHydrationErrorSpy).toHaveBeenCalled();
    });

    it('invokes error callback when component loader fails', async () => {
      const doc = createMockDocWithPayload(samplePayload);
      const onHydrationErrorSpy = vi.fn();

      await expect(
        bootstrapClientHydration({
          container: doc as unknown as Document,
          componentLoader: async () => {
            throw new Error('Component module not found');
          },
          onHydrationError: onHydrationErrorSpy,
        })
      ).rejects.toThrow(/Component module not found/);

      expect(onHydrationErrorSpy).toHaveBeenCalled();
    });

    it('mounts initial tree using createRoot when renderMode is "client"', async () => {
      const clientPayload: RanuHydrationPayload = {
        ...samplePayload,
        renderMode: 'client',
      };
      const doc = createMockDocWithPayload(clientPayload);
      const mountEl = new MockElement('DIV', 'ranu-client-root');
      doc.registerElement(mountEl);

      const onHydratedSpy = vi.fn();
      const result = await bootstrapClientHydration({
        container: doc as unknown as Document,
        componentLoader: async () => CounterComponent,
        onHydrated: onHydratedSpy,
      });

      expect(result.success).toBe(true);
      expect(result.payload.renderMode).toBe('client');
      expect(onHydratedSpy).toHaveBeenCalled();
    });
  });
});
