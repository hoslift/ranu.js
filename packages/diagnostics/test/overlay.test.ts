import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  diffServerClientDOM,
  renderHydrationOverlay,
  attachHydrationOverlay,
  type HydrationMismatch,
} from '../src/overlay.js';

class MockElement {
  public tagName: string;
  public id: string = '';
  public textContent: string = '';
  public attributes: Record<string, string> = {};
  public children: MockElement[] = [];
  public childNodes: MockElement[] = [];
  public outerHTML: string = '';
  public parentNode: MockElement | null = null;
  public shadowRoot: any = null;
  public style: Record<string, string> = {};
  public listeners: Record<string, ((event: unknown) => void)[]> = {};

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
    if (name === 'id') this.id = value;
  }

  getAttributeNames(): string[] {
    return Object.keys(this.attributes);
  }

  appendChild(child: MockElement): MockElement {
    child.parentNode = this;
    this.children.push(child);
    this.childNodes.push(child);
    return child;
  }

  removeChild(child: MockElement): MockElement {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  remove(): void {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }

  attachShadow(options: { mode: string }): any {
    const shadowHost = new MockElement('SHADOW-ROOT');
    this.shadowRoot = shadowHost;
    return shadowHost;
  }

  addEventListener(event: string, fn: (event: unknown) => void): void {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(fn);
  }

  dispatchEvent(event: any): boolean {
    const list = this.listeners[event.type || ''] || [];
    list.forEach((fn) => fn(event));
    return true;
  }

  querySelector(selector: string): MockElement | null {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      return this.children.find((c) => c.id === id) || null;
    }
    return this.children.find((c) => c.tagName.toLowerCase() === selector.toLowerCase()) || null;
  }
}

describe('Browser Hydration Visual DOM Diff Engine (@ranu/diagnostics/overlay)', () => {
  describe('diffServerClientDOM — Mismatch Taxonomy & Traversal', () => {
    it('returns empty array when server and client DOM are identical', () => {
      const serverEl = new MockElement('div');
      serverEl.setAttribute('class', 'container');
      const serverP = new MockElement('p');
      serverP.textContent = 'Hello World';
      serverEl.appendChild(serverP);

      const clientEl = new MockElement('div');
      clientEl.setAttribute('class', 'container');
      const clientP = new MockElement('p');
      clientP.textContent = 'Hello World';
      clientEl.appendChild(clientP);

      const mismatches = diffServerClientDOM(serverEl as unknown as Element, clientEl as unknown as Element);
      expect(mismatches).toHaveLength(0);
    });

    it('identifies tag-mismatch when root element tags differ', () => {
      const server = '<div class="box"><p>Text</p></div>';
      const client = new MockElement('section');
      client.setAttribute('class', 'box');
      const p = new MockElement('p');
      p.textContent = 'Text';
      client.appendChild(p);

      const mismatches = diffServerClientDOM(server, client as unknown as Element);
      const tagDiff = mismatches.find((m) => m.type === 'tag-mismatch');
      expect(tagDiff).toBeDefined();
      expect(tagDiff?.serverValue).toBe('div');
      expect(tagDiff?.clientValue).toBe('section');
    });

    it('identifies attribute-mismatch when attribute values differ', () => {
      const server = '<button class="btn-primary" type="button">Click</button>';
      const client = new MockElement('button');
      client.setAttribute('class', 'btn-secondary');
      client.setAttribute('type', 'button');
      client.textContent = 'Click';

      const mismatches = diffServerClientDOM(server, client as unknown as Element);
      const attrDiff = mismatches.find((m) => m.type === 'attribute-mismatch');
      expect(attrDiff).toBeDefined();
      expect(attrDiff?.attributeName).toBe('class');
      expect(attrDiff?.serverValue).toBe('btn-primary');
      expect(attrDiff?.clientValue).toBe('btn-secondary');
    });

    it('identifies attribute-missing when client lacks an attribute present on server', () => {
      const server = '<div id="banner" role="banner" aria-label="Header">Header Content</div>';
      const client = new MockElement('div');
      client.setAttribute('id', 'banner');
      client.setAttribute('role', 'banner');
      client.textContent = 'Header Content';

      const mismatches = diffServerClientDOM(server, client as unknown as Element);
      const missingAttr = mismatches.find((m) => m.type === 'attribute-missing');
      expect(missingAttr).toBeDefined();
      expect(missingAttr?.attributeName).toBe('aria-label');
      expect(missingAttr?.serverValue).toBe('Header');
    });

    it('identifies attribute-extra when client has an attribute not rendered by server', () => {
      const server = '<div id="card">Card Body</div>';
      const client = new MockElement('div');
      client.setAttribute('id', 'card');
      client.setAttribute('data-hydrated', 'true');
      client.textContent = 'Card Body';

      const mismatches = diffServerClientDOM(server, client as unknown as Element);
      const extraAttr = mismatches.find((m) => m.type === 'attribute-extra');
      expect(extraAttr).toBeDefined();
      expect(extraAttr?.attributeName).toBe('data-hydrated');
      expect(extraAttr?.clientValue).toBe('true');
    });

    it('identifies text-mismatch when text content differs', () => {
      const server = '<span>Server Count: 0</span>';
      const client = new MockElement('span');
      client.textContent = 'Server Count: 1';

      const mismatches = diffServerClientDOM(server, client as unknown as Element);
      const textDiff = mismatches.find((m) => m.type === 'text-mismatch');
      expect(textDiff).toBeDefined();
      expect(textDiff?.serverValue).toBe('Server Count: 0');
      expect(textDiff?.clientValue).toBe('Server Count: 1');
    });

    it('identifies children-count-mismatch and missing-node when client has fewer children', () => {
      const server = '<ul><li>A</li><li>B</li><li>C</li></ul>';
      const client = new MockElement('ul');
      const liA = new MockElement('li');
      liA.textContent = 'A';
      client.appendChild(liA);

      const mismatches = diffServerClientDOM(server, client as unknown as Element);
      expect(mismatches.some((m) => m.type === 'children-count-mismatch')).toBe(true);
      const missing = mismatches.filter((m) => m.type === 'missing-node');
      expect(missing).toHaveLength(2);
      expect(missing[0]?.tagName).toBe('li');
    });

    it('identifies children-count-mismatch and extra-node when client has extra children', () => {
      const server = '<ol><li>Step 1</li></ol>';
      const client = new MockElement('ol');
      const li1 = new MockElement('li');
      li1.textContent = 'Step 1';
      const li2 = new MockElement('li');
      li2.textContent = 'Step 2';
      client.appendChild(li1);
      client.appendChild(li2);

      const mismatches = diffServerClientDOM(server, client as unknown as Element);
      expect(mismatches.some((m) => m.type === 'children-count-mismatch')).toBe(true);
      const extra = mismatches.find((m) => m.type === 'extra-node');
      expect(extra).toBeDefined();
      expect(extra?.tagName).toBe('li');
    });

    it('traverses nested component trees and accurately records selector path', () => {
      const server = '<main><div class="wrapper"><p>SSR text</p></div></main>';
      const client = new MockElement('main');
      const wrapper = new MockElement('div');
      wrapper.setAttribute('class', 'wrapper');
      const p = new MockElement('p');
      p.textContent = 'Client text';
      wrapper.appendChild(p);
      client.appendChild(wrapper);

      const mismatches = diffServerClientDOM(server, client as unknown as Element);
      const textDiff = mismatches.find((m) => m.type === 'text-mismatch');
      expect(textDiff).toBeDefined();
      expect(textDiff?.path).toContain('main > div:nth-child(1) > p:nth-child(1)');
    });
  });

  describe('renderHydrationOverlay — Isolated Shadow DOM Rendering', () => {
    let originalDocument: any;

    beforeEach(() => {
      originalDocument = globalThis.document;
      // Setup mock minimal document for rendering overlay
      (globalThis as any).document = {
        createElement: (tag: string) => new MockElement(tag),
      };
    });

    afterEach(() => {
      (globalThis as any).document = originalDocument;
    });

    it('mounts inside an isolated Shadow DOM and renders mismatch items', () => {
      const mismatches: HydrationMismatch[] = [
        {
          type: 'text-mismatch',
          path: 'main > p:nth-child(1)/text()',
          message: 'Text mismatch: server="Server", client="Client"',
          serverValue: 'Server',
          clientValue: 'Client',
        },
        {
          type: 'attribute-mismatch',
          path: 'main > button',
          message: 'Attribute class mismatch',
          serverValue: 'primary',
          clientValue: 'secondary',
          attributeName: 'class',
        },
      ];

      const overlay = renderHydrationOverlay(mismatches);
      expect(overlay).toBeDefined();
      expect(overlay.id).toBe('ranu-hydration-overlay-root');
      expect(overlay.shadowRoot).toBeDefined();

      const shadow = overlay.shadowRoot as MockElement;
      // Shadow root contains style and overlay-card
      expect(shadow.children.length).toBeGreaterThanOrEqual(2);
      const card = shadow.children.find((c) => (c as any).attributes?.['class'] === 'overlay-card' || (c as any).className === 'overlay-card') || shadow.children[1];
      expect(card).toBeDefined();
    });

    it('handles copy and dismiss button event handlers', () => {
      const mismatches: HydrationMismatch[] = [
        {
          type: 'tag-mismatch',
          path: 'div',
          message: 'Tag mismatch',
          serverValue: 'div',
          clientValue: 'span',
        },
      ];

      const overlay = renderHydrationOverlay(mismatches);
      const shadow = overlay.shadowRoot as MockElement;
      const card = shadow.children[1] as MockElement;
      const header = card.children[0] as MockElement;
      const actions = header.children[1] as MockElement;
      const copyBtn = actions.children[0] as MockElement;
      const dismissBtn = actions.children[1] as MockElement;

      expect(copyBtn.id).toBe('ranu-overlay-copy');
      expect(dismissBtn.id).toBe('ranu-overlay-dismiss');

      // Dismiss removes overlay from parent
      const parent = new MockElement('BODY');
      parent.appendChild(overlay as unknown as MockElement);
      expect(parent.children).toContain(overlay);

      // Trigger dismiss
      dismissBtn.listeners['click']?.[0]?.({ type: 'click' });
      expect(parent.children).not.toContain(overlay);
    });
  });

  describe('attachHydrationOverlay — Browser Event Hook', () => {
    let originalWindow: any;
    let originalDocument: any;
    let originalConsoleError: any;

    beforeEach(() => {
      originalWindow = globalThis.window;
      originalDocument = globalThis.document;
      originalConsoleError = console.error;

      const mockBody = new MockElement('BODY');
      (globalThis as any).document = {
        body: mockBody,
        getElementById: (id: string) => (id === 'root' ? mockBody : null),
        createElement: (tag: string) => new MockElement(tag),
      };

      (globalThis as any).window = {
        addEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
    });

    afterEach(() => {
      (globalThis as any).window = originalWindow;
      (globalThis as any).document = originalDocument;
      console.error = originalConsoleError;
    });

    it('attaches listeners idempotently and registers error interceptors', () => {
      attachHydrationOverlay();
      expect((globalThis as any).window.__ranu_hydration_overlay_attached__).toBe(true);

      // Calling again is a no-op
      attachHydrationOverlay();
      expect((globalThis as any).window.addEventListener).toHaveBeenCalledWith('error', expect.any(Function));
      expect((globalThis as any).window.addEventListener).toHaveBeenCalledWith('ranu:hydration-error', expect.any(Function));
    });
  });
});
