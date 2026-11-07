import { describe, it, expect, beforeEach } from 'vitest';
import { mountDevToolsDock } from '../src/dock.js';
import {
  resetDevToolsState,
  toggleDevToolsDock,
  recordStreamingChunk,
  setActiveDevToolsTab,
  setSelectedPartner,
  setPendingDiff,
  getDevToolsState,
} from '../src/state.js';

class MockDOMElement {
  public id = '';
  public className = '';
  private _innerHTML = '';
  public textContent = '';
  public value = '';
  public disabled = false;
  public placeholder = '';
  public style: Record<string, string> = {};
  public children: MockDOMElement[] = [];
  public shadowRoot: MockDOMElement | null = null;
  public onclick: (() => void) | null = null;
  public oninput: ((e: any) => void) | null = null;
  public onkeydown: ((e: any) => void) | null = null;

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
    const classes = selector.split('.').filter(Boolean);
    if (classes.length > 0 && classes.every((c) => this.className.split(/\s+/).includes(c))) {
      return this;
    }
    for (const child of this.children) {
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }

  querySelectorAll(selector: string): MockDOMElement[] {
    const results: MockDOMElement[] = [];
    const classes = selector.split('.').filter(Boolean);
    if (classes.length > 0 && classes.every((c) => this.className.split(/\s+/).includes(c))) {
      results.push(this);
    }
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
  private listeners = new Map<string, Array<(e: any) => void>>();

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

  addEventListener(type: string, listener: (e: any) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(listener);
  }

  removeEventListener(type: string, listener: (e: any) => void): void {
    const arr = this.listeners.get(type);
    if (arr) {
      this.listeners.set(
        type,
        arr.filter((l) => l !== listener),
      );
    }
  }

  dispatchEvent(event: { type: string; [key: string]: any }): boolean {
    const arr = this.listeners.get(event.type);
    if (arr) {
      arr.forEach((l) => l(event));
    }
    return true;
  }
}

describe('@ranu/devtools mountDevToolsDock', () => {
  let mockDoc: MockDOMDocument;

  beforeEach(() => {
    resetDevToolsState();
    mockDoc = new MockDOMDocument();
  });

  it('mounts floating dock and responds to state changes (5 tabs including AI Studio)', () => {
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
    // Waterfall, Routes, Hydration, Diagnostics, AI Studio
    expect(tabs?.length).toBe(5);

    unmount?.();
  });

  it('avoids duplicate mounting', () => {
    const unmount1 = mountDevToolsDock(mockDoc as any);
    expect(unmount1).toBeDefined();

    const unmount2 = mountDevToolsDock(mockDoc as any);
    expect(unmount2).toBeUndefined();

    unmount1?.();
  });

  it('responds to keyboard shortcut Alt+D and Ctrl+Shift+D to toggle dock', () => {
    const unmount = mountDevToolsDock(mockDoc as any);
    expect(getDevToolsState().isOpen).toBe(false);

    // Simulate Alt+D
    let prevented = false;
    mockDoc.dispatchEvent({
      type: 'keydown',
      altKey: true,
      ctrlKey: false,
      shiftKey: false,
      key: 'd',
      preventDefault: () => {
        prevented = true;
      },
    });
    expect(prevented).toBe(true);
    expect(getDevToolsState().isOpen).toBe(true);

    // Simulate Ctrl+Shift+D
    mockDoc.dispatchEvent({
      type: 'keydown',
      altKey: false,
      ctrlKey: true,
      shiftKey: true,
      key: 'D',
      preventDefault: () => {},
    });
    expect(getDevToolsState().isOpen).toBe(false);

    unmount?.();
  });

  it('renders AI Studio tab with partner switcher and prompt bar', () => {
    const unmount = mountDevToolsDock(mockDoc as any);
    toggleDevToolsDock();
    setActiveDevToolsTab('ai-studio');

    const container = mockDoc.getElementById('ranu-devtools-dock');
    const pills = container?.shadowRoot?.querySelectorAll('.partner-pill');
    expect(pills?.length).toBe(5);

    // Switch partner via pill
    pills?.[1]?.onclick?.(); // Groq
    expect(getDevToolsState().aiStudio.selectedPartner).toBe('groq');

    const promptInput = container?.shadowRoot?.querySelector('.ai-prompt-input');
    expect(promptInput).not.toBeNull();

    const generateBtn = container?.shadowRoot?.querySelector('.ai-btn-generate');
    expect(generateBtn).not.toBeNull();

    unmount?.();
  });

  it('renders visual diff card with additions and removals when pendingDiff is set', () => {
    const unmount = mountDevToolsDock(mockDoc as any);
    toggleDevToolsDock();
    setActiveDevToolsTab('ai-studio');

    setPendingDiff({
      filePath: 'app/counter.tsx',
      originalContent: 'export function Counter() {\n  return <div>Old</div>;\n}',
      proposedContent: 'export function Counter() {\n  return <div>New Stream</div>;\n}',
      patchSummary: 'app/counter.tsx: +1 -1 lines',
    });

    const container = mockDoc.getElementById('ranu-devtools-dock');
    const diffContainer = container?.shadowRoot?.querySelector('.diff-container');
    expect(diffContainer).not.toBeNull();

    const addedLines = container?.shadowRoot?.querySelectorAll('.diff-line.added');
    const removedLines = container?.shadowRoot?.querySelectorAll('.diff-line.removed');
    expect(addedLines?.length).toBeGreaterThan(0);
    expect(removedLines?.length).toBeGreaterThan(0);

    const acceptBtn = container?.shadowRoot?.querySelector('.ai-btn-accept');
    expect(acceptBtn).not.toBeNull();

    const revertBtn = container?.shadowRoot?.querySelector('.ai-btn-revert');
    expect(revertBtn).not.toBeNull();

    unmount?.();
  });
});
