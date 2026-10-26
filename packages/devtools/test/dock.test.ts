import { describe, it, expect, beforeEach } from 'vitest';
import { mountDevToolsDock } from '../src/dock.js';
import { resetDevToolsState, toggleDevToolsDock, recordStreamingChunk } from '../src/state.js';

class MockDOMElement {
  public id = '';
  public className = '';
  private _innerHTML = '';
  public textContent = '';
  public style: Record<string, string> = {};
  public children: MockDOMElement[] = [];
  public shadowRoot: MockDOMElement | null = null;
  public onclick: (() => void) | null = null;

  get innerHTML(): string {
    return this._innerHTML;
  }

  set innerHTML(val: string) {
    this._innerHTML = val;
    if (val === '') {
      this.children = [];
    }
  }

  constructor(public tagName: string) {}

  attachShadow(_options: { mode: string }): MockDOMElement {
    this.shadowRoot = new MockDOMElement('SHADOW-ROOT');
    return this.shadowRoot;
  }

  appendChild(child: MockDOMElement): MockDOMElement {
    this.children.push(child);
    return child;
  }

  querySelector(selector: string): MockDOMElement | null {
    const className = selector.startsWith('.') ? selector.slice(1) : '';
    if (className && this.className.split(/\s+/).includes(className)) return this;
    for (const child of this.children) {
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }

  querySelectorAll(selector: string): MockDOMElement[] {
    const results: MockDOMElement[] = [];
    const className = selector.startsWith('.') ? selector.slice(1) : '';
    if (className && this.className.split(/\s+/).includes(className)) results.push(this);
    for (const child of this.children) {
      results.push(...child.querySelectorAll(selector));
    }
    return results;
  }

  remove(): void {
    // noop
  }
}

class MockDOMDocument {
  public body = new MockDOMElement('BODY');
  private elementsById = new Map<string, MockDOMElement>();

  createElement(tagName: string): MockDOMElement {
    return new MockDOMElement(tagName.toUpperCase());
  }

  getElementById(id: string): MockDOMElement | null {
    if (this.elementsById.has(id)) {
      return this.elementsById.get(id)!;
    }
    const found = this.body.children.find((c) => c.id === id);
    return found || null;
  }
}

describe('@ranu/devtools mountDevToolsDock', () => {
  let mockDoc: MockDOMDocument;

  beforeEach(() => {
    resetDevToolsState();
    mockDoc = new MockDOMDocument();
  });

  it('mounts floating dock and responds to state changes', () => {
    const unmount = mountDevToolsDock(mockDoc as any);
    expect(unmount).toBeDefined();

    const container = mockDoc.getElementById('ranu-devtools-dock');
    expect(container).not.toBeNull();
    expect(container?.shadowRoot).not.toBeNull();

    // Launcher button should be present initially
    const launcher = container?.shadowRoot?.querySelector('.launcher');
    expect(launcher).not.toBeNull();

    // Open dock
    toggleDevToolsDock();
    const panel = container?.shadowRoot?.querySelector('.panel');
    expect(panel).not.toBeNull();

    // Record a streaming chunk
    recordStreamingChunk(1024, '<div>Stream test</div>');
    const tabs = container?.shadowRoot?.querySelectorAll('.tab');
    expect(tabs?.length).toBe(4);

    unmount?.();
  });

  it('avoids duplicate mounting', () => {
    const unmount1 = mountDevToolsDock(mockDoc as any);
    expect(unmount1).toBeDefined();

    const unmount2 = mountDevToolsDock(mockDoc as any);
    expect(unmount2).toBeUndefined();

    unmount1?.();
  });
});
