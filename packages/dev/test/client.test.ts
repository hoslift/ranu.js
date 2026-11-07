import { describe, it, expect } from 'vitest';
import { DEV_CLIENT_SCRIPT } from '../src/client.js';

describe('DEV_CLIENT_SCRIPT browser injection payload', () => {
  it('is a non-empty string of JavaScript', () => {
    expect(typeof DEV_CLIENT_SCRIPT).toBe('string');
    expect(DEV_CLIENT_SCRIPT.length).toBeGreaterThan(0);
  });

  it('guards against non-browser environments before wiring anything up', () => {
    expect(DEV_CLIENT_SCRIPT).toContain("typeof window === 'undefined'");
    expect(DEV_CLIENT_SCRIPT).toContain("typeof EventSource === 'undefined'");
  });

  it('connects to the canonical dev-reload SSE endpoint', () => {
    expect(DEV_CLIENT_SCRIPT).toContain('/_ranu/dev-reload');
    expect(DEV_CLIENT_SCRIPT).toContain('new EventSource(reloadEndpoint)');
  });

  it('registers connected, reload, build-error, and connection error SSE listeners', () => {
    expect(DEV_CLIENT_SCRIPT).toContain("addEventListener('connected'");
    expect(DEV_CLIENT_SCRIPT).toContain("addEventListener('reload'");
    expect(DEV_CLIENT_SCRIPT).toContain("addEventListener('build-error'");
    expect(DEV_CLIENT_SCRIPT).toContain("addEventListener('error'");
  });

  it('triggers a full page reload when a reload event is received', () => {
    expect(DEV_CLIENT_SCRIPT).toContain('window.location.reload()');
  });

  it('recognizes memo and forwardRef component markers in browser boundaries', () => {
    expect(DEV_CLIENT_SCRIPT).toContain("description.indexOf('react.memo')");
    expect(DEV_CLIENT_SCRIPT).toContain("description.indexOf('react.forward_ref')");
  });

  it('schedules a reconnect attempt on connection error', () => {
    expect(DEV_CLIENT_SCRIPT).toContain('source.close()');
    expect(DEV_CLIENT_SCRIPT).toContain('setTimeout(function()');
    expect(DEV_CLIENT_SCRIPT).toContain('1500');
  });

  it('is syntactically valid standalone JavaScript', () => {
    // Executing the script body should not throw even without a browser
    // `window`/`EventSource` global, since it early-returns in that case.
    expect(() => new Function(DEV_CLIENT_SCRIPT)()).not.toThrow();
  });

  it('manages error overlay lifecycle: displays on build-error and dismisses on recovered', () => {
    const listeners: Record<string, ((event: any) => void)[]> = {};
    class MockEventSource {
      constructor(public url: string) {}
      addEventListener(type: string, handler: (event: any) => void) {
        listeners[type] = listeners[type] || [];
        listeners[type].push(handler);
      }
      close() {}
    }

    const elements: any[] = [];
    function createMockElement(tagName: string) {
      const el: any = {
        tagName: tagName.toUpperCase(),
        id: '',
        style: {},
        textContent: '',
        children: [] as any[],
        shadowRoot: null as any,
        parentNode: null as any,
        attachShadow: (opts: any) => {
          const shadow = createMockElement('SHADOW-ROOT');
          el.shadowRoot = shadow;
          return shadow;
        },
        appendChild: (child: any) => {
          child.parentNode = el;
          el.children.push(child);
          return child;
        },
        removeChild: (child: any) => {
          const idx = el.children.indexOf(child);
          if (idx !== -1) el.children.splice(idx, 1);
          const rootIdx = elements.indexOf(child);
          if (rootIdx !== -1) elements.splice(rootIdx, 1);
          child.parentNode = null;
          return child;
        },
        remove: () => {
          if (el.parentNode) {
            el.parentNode.removeChild(el);
          } else {
            const rootIdx = elements.indexOf(el);
            if (rootIdx !== -1) elements.splice(rootIdx, 1);
          }
        },
      };
      return el;
    }

    const mockDocument: any = {
      body: createMockElement('BODY'),
      head: createMockElement('HEAD'),
      getElementById: (id: string) => {
        return elements.find((e) => e.id === id) || null;
      },
      createElement: (tag: string) => createMockElement(tag),
      querySelectorAll: () => [],
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    mockDocument.body.appendChild = (child: any) => {
      child.parentNode = mockDocument.body;
      elements.push(child);
      mockDocument.body.children.push(child);
      return child;
    };

    const mockWindow: any = {
      addEventListener: () => {},
      dispatchEvent: () => true,
      location: { reload: () => {} },
    };

    // Execute DEV_CLIENT_SCRIPT with injected mock DOM globals
    const runScript = new Function('window', 'document', 'EventSource', DEV_CLIENT_SCRIPT);
    runScript(mockWindow, mockDocument, MockEventSource);

    // Initial state: no error overlay
    expect(mockDocument.getElementById('ranu-build-error-overlay-root')).toBeNull();

    // 1. Dispatch build-error event
    expect(listeners['build-error']).toBeDefined();
    expect(listeners['build-error']!.length).toBeGreaterThan(0);

    listeners['build-error']![0]({
      data: JSON.stringify({
        diagnostics: [
          {
            code: 'RANU_BUILD_SYNTAX_ERROR',
            severity: 'error',
            message: 'Unterminated JSX expression',
            location: { file: 'app/page.tsx', line: 15, column: 8 },
            hint: 'Close tag with </h1>',
          },
        ],
      }),
    });

    const overlay = mockDocument.getElementById('ranu-build-error-overlay-root');
    expect(overlay).not.toBeNull();
    expect(overlay.id).toBe('ranu-build-error-overlay-root');

    // 2. Dispatch recovered event
    expect(listeners['recovered']).toBeDefined();
    expect(listeners['recovered']!.length).toBeGreaterThan(0);

    listeners['recovered']![0]({
      data: JSON.stringify({ buildId: 'dev-build-2', generation: 2 }),
    });

    expect(mockDocument.getElementById('ranu-build-error-overlay-root')).toBeNull();
  });
});
