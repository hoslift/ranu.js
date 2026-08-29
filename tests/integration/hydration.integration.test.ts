import { describe, it, expect, vi } from 'vitest';
import React, { useState } from 'react';
import {
  composeComponentTree,
  renderReactToStream,
  bootstrapClientHydration,
  type PageProps,
  type RanuHydrationPayload,
} from '@ranu/react';
import {
  HYDRATION_DATA_SCRIPT_ID,
  HYDRATION_DATA_SCRIPT_TYPE,
} from '../../packages/react/src/client/serialization.js';

// Mock react-dom/client hydrateRoot for pure deterministic environment
vi.mock('react-dom/client', () => ({
  hydrateRoot: vi.fn((container: unknown, element: unknown, options?: { onRecoverableError?: (err: unknown) => void }) => ({
    render: vi.fn(),
    unmount: vi.fn(),
    _container: container,
    _element: element,
    _options: options,
  })),
}));

class MockElement {
  public tagName: string;
  public id: string;
  public textContent: string = '';
  public attributes: Record<string, string> = {};

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

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  return result;
}

function CounterInteractive({ params }: PageProps) {
  const initial = Number(params.start ?? 0);
  const [count, setCount] = useState(initial);
  return React.createElement('div', { id: 'interactive-counter' }, [
    React.createElement('span', { id: 'counter-display', key: 'span' }, count),
    React.createElement(
      'button',
      { id: 'counter-btn', key: 'btn', onClick: () => setCount(c => c + 1) },
      '+1'
    ),
  ]);
}

describe('Phase 13 Stage 13B: Browser Hydration Integration Test', () => {
  it('executes SSR stream -> inert JSON injection -> client bootstrap -> interactive component hydration', async () => {
    const payload: RanuHydrationPayload = {
      buildId: 'ranu_int_build_13b',
      routeId: 'app-counter-page',
      pathname: '/counter',
      params: {
        start: '10',
      },
      searchParams: {},
      publicEnv: {
        RANU_PUBLIC_TEST_MODE: 'true',
      },
      assets: {
        js: ['/_ranu/assets/c_bootstrap-12345.js', '/_ranu/assets/c_Counter-12345.js'],
        css: ['/_ranu/assets/c_Counter-12345.css'],
      },
    };

    // 1. Server-side rendering (SSR) of full document
    const rootLayout = {
      default: ({ children }: { children: React.ReactNode }) =>
        React.createElement(
          'html',
          { lang: 'en' },
          React.createElement('head', null, React.createElement('title', null, 'Hydration Integration Test')),
          React.createElement('body', null, children)
        ),
    };

    const pageModule = {
      default: CounterInteractive,
    };

    const tree = composeComponentTree({
      page: pageModule,
      layouts: [rootLayout],
      pageProps: {
        params: { start: '10' },
        searchParams: {},
      },
      hydrationPayload: payload,
    });

    const stream = await renderReactToStream(tree);
    const ssrHtml = await streamToString(stream);

    // Verify SSR HTML contents
    expect(ssrHtml).toContain('<script id="__ranu_data__" type="application/json">');
    expect(ssrHtml).toContain('ranu_int_build_13b');
    expect(ssrHtml).toContain('<script type="module" src="/_ranu/assets/c_bootstrap-12345.js"></script>');
    expect(ssrHtml).toContain('<span id="counter-display">10</span>');
    expect(ssrHtml).not.toContain('<div id="root">');

    // Extract embedded payload from SSR output and populate mock document
    const match = ssrHtml.match(/<script id="__ranu_data__" type="application\/json">(.*?)<\/script>/s);
    expect(match).toBeDefined();
    const rawPayloadJson = match![1];

    const mockDoc = new MockDocument();
    const scriptEl = new MockElement('SCRIPT', HYDRATION_DATA_SCRIPT_ID);
    scriptEl.setAttribute('type', HYDRATION_DATA_SCRIPT_TYPE);
    scriptEl.textContent = rawPayloadJson!;
    mockDoc.registerElement(scriptEl);

    // 2. Execute client hydration bootstrap
    const bootstrapResult = await bootstrapClientHydration({
      container: mockDoc as unknown as Document,
      buildId: 'ranu_int_build_13b',
      componentLoader: async (routeId: string) => {
        expect(routeId).toBe('app-counter-page');
        return pageModule;
      },
    });

    expect(bootstrapResult.success).toBe(true);
    expect(bootstrapResult.payload.buildId).toBe('ranu_int_build_13b');
    expect(bootstrapResult.payload.pathname).toBe('/counter');
  });
});
