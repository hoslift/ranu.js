import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { mountDevToolsDock, shadowRootStore, RANU_BRAND_ICON_SVG } from '../src/dock.js';
import { RanuDevTools } from '../src/component.js';
import {
  resetDevToolsState,
  toggleDevToolsDock,
  setActiveDevToolsTab,
  getDevToolsState,
} from '../src/state.js';

class MockDOMElement {
  public id = '';
  public className = '';
  public type = '';
  private _innerHTML = '';
  public textContent = '';
  public value = '';
  public disabled = false;
  public placeholder = '';
  public title = '';
  public style: Record<string, string> = {};
  public children: MockDOMElement[] = [];
  public parentElement: MockDOMElement | null = null;
  public shadowRoot: MockDOMElement | null = null;
  public shadowRootMode: string | null = null;
  public onclick: ((e: any) => void) | null = null;
  public oninput: ((e: any) => void) | null = null;
  public onkeydown: ((e: any) => void) | null = null;
  public onkeyup: ((e: any) => void) | null = null;
  public onfocus: (() => void) | null = null;
  public onblur: (() => void) | null = null;
  public isFocused = false;
  public selectionStart: number | null = null;
  public selectionEnd: number | null = null;

  focus(): void {
    this.isFocused = true;
    this.onfocus?.();
  }

  blur(): void {
    this.isFocused = false;
    this.onblur?.();
  }

  setSelectionRange(start: number, end: number): void {
    this.selectionStart = start;
    this.selectionEnd = end;
  }

  closest(selector: string): MockDOMElement | null {
    if (this.matches(selector)) {
      return this;
    }
    return this.parentElement?.closest(selector) || null;
  }

  matches(selector: string): boolean {
    if (!selector) return false;
    if (selector.startsWith('#')) {
      return this.id === selector.slice(1);
    }
    if (selector.startsWith('.')) {
      const classes = selector.split('.').filter(Boolean);
      return classes.length > 0 && classes.every((c) => this.className.split(/\s+/).includes(c));
    }
    if (selector === 'button') {
      return this.tagName.toUpperCase() === 'BUTTON';
    }
    if (selector === 'input') {
      return this.tagName.toUpperCase() === 'INPUT';
    }
    if (selector.startsWith('input[')) {
      if (this.tagName.toUpperCase() !== 'INPUT') return false;
      if (selector.includes('type="password"')) return this.type === 'password';
      if (selector.includes('type="text"')) return this.type === 'text';
      return true;
    }
    return this.tagName.toUpperCase() === selector.toUpperCase();
  }

  get innerHTML(): string {
    if (this._innerHTML) {
      return this._innerHTML;
    }
    if (this.textContent && this.children.length === 0) {
      return this.textContent;
    }
    return this.children.map((c) => c.innerHTML).join('');
  }

  set innerHTML(val: string) {
    this._innerHTML = val;
    if (val === '') {
      this.children = [];
    }
  }

  constructor(public tagName: string) {}

  attachShadow(options: { mode: string }): MockDOMElement {
    this.shadowRootMode = options.mode;
    this.shadowRoot = new MockDOMElement('SHADOW-ROOT');
    return this.shadowRoot;
  }

  appendChild(child: MockDOMElement): MockDOMElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  querySelector(selector: string): MockDOMElement | null {
    for (const child of this.children) {
      if (child.matches(selector)) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }

  querySelectorAll(selector: string): MockDOMElement[] {
    const results: MockDOMElement[] = [];
    for (const child of this.children) {
      if (child.matches(selector)) {
        results.push(child);
      }
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

describe('DevTools UI Branding, Iconography & Interactive Dock Invariants', () => {
  let mockDoc: MockDOMDocument;

  beforeEach(() => {
    resetDevToolsState();
    mockDoc = new MockDOMDocument();
  });

  it('R1: embeds official brand SVG with viewBox="0 0 1910 2081" and #33BBCA accent', () => {
    expect(RANU_BRAND_ICON_SVG).toContain('viewBox="0 0 1910 2081"');
    expect(RANU_BRAND_ICON_SVG).toContain('fill="#33BBCA"');

    // Mount floating dock and inspect launcher
    const unmount = mountDevToolsDock(mockDoc as any);
    const container = mockDoc.getElementById('ranu-devtools-dock');
    expect(container).not.toBeNull();
    const launcher = container?.shadowRoot?.querySelector('.launcher');
    expect(launcher).not.toBeNull();
    expect(launcher?.innerHTML).toContain('0 0 1910 2081');
    expect(launcher?.innerHTML).toContain('#33BBCA');

    unmount?.();
  });

  it('R1: isolates dock DOM via closed Shadow DOM (mode: closed)', () => {
    const unmount = mountDevToolsDock(mockDoc as any);
    const container = mockDoc.getElementById('ranu-devtools-dock');
    expect(container).not.toBeNull();
    expect((container as any).shadowRootMode).toBe('closed');
    expect(shadowRootStore.has(container as any)).toBe(true);

    unmount?.();
    expect(shadowRootStore.has(container as any)).toBe(false);
  });

  it('R2: renders hover-expand minimized pill launcher with live telemetry markup', () => {
    const unmount = mountDevToolsDock(mockDoc as any);
    const container = mockDoc.getElementById('ranu-devtools-dock');
    const launcher = container?.shadowRoot?.querySelector('.launcher');
    expect(launcher).not.toBeNull();

    // Verify telemetry capsules
    expect(launcher?.innerHTML).toContain('launcher-telemetry');
    expect(launcher?.innerHTML).toContain('TTFB:');
    expect(launcher?.innerHTML).toContain('18ms');
    expect(launcher?.innerHTML).toContain('Chunks:');
    expect(launcher?.innerHTML).toContain('Copilot Ready');

    unmount?.();
  });

  it('R3: renders AI Studio drawer with Refactor CTA button and provider controls', () => {
    const unmount = mountDevToolsDock(mockDoc as any);
    toggleDevToolsDock();
    setActiveDevToolsTab('ai-studio');

    const container = mockDoc.getElementById('ranu-devtools-dock');
    const generateBtn = container?.shadowRoot?.querySelector('.ai-btn-generate');
    expect(generateBtn).not.toBeNull();
    expect(generateBtn?.innerHTML).toContain('Refactor');
    expect(generateBtn?.innerHTML).not.toContain('(⌘↵)');

    // Verify provider dropdown trigger button
    const dropdownTrigger = container?.shadowRoot?.querySelector('.custom-dropdown-trigger');
    expect(dropdownTrigger).not.toBeNull();
    expect(dropdownTrigger?.innerHTML).toContain('Provider:');

    // Verify auth trigger button
    const authTrigger = container?.shadowRoot?.querySelector('.btn-auth-trigger');
    expect(authTrigger).not.toBeNull();

    unmount?.();
  });

  it('R3: toggles provider popover and renders authentic partner SVGs', () => {
    const unmount = mountDevToolsDock(mockDoc as any);
    toggleDevToolsDock();
    setActiveDevToolsTab('ai-studio');

    const container = mockDoc.getElementById('ranu-devtools-dock');
    const dropdownTrigger = container?.shadowRoot?.querySelector('.custom-dropdown-trigger');
    expect(dropdownTrigger).not.toBeNull();

    // Open dropdown
    dropdownTrigger?.onclick?.({ stopPropagation: () => {} });

    const dropdownMenu = container?.shadowRoot?.querySelector('.custom-dropdown-menu');
    expect(dropdownMenu).not.toBeNull();

    const options = container?.shadowRoot?.querySelectorAll('.dropdown-option');
    expect(options?.length).toBe(6); // Groq, Gemini, Claude, OpenAI, Ollama, Disabled

    // Select Ollama
    const ollamaOption = options?.[4];
    expect(ollamaOption?.innerHTML).toContain('Ollama');
    ollamaOption?.onclick?.({ stopPropagation: () => {} });
    expect(getDevToolsState().aiStudio.selectedPartner).toBe('ollama');

    unmount?.();
  });

  it('R3: opens and operates BYOK / Provider Auth modal', () => {
    const unmount = mountDevToolsDock(mockDoc as any);
    toggleDevToolsDock();
    setActiveDevToolsTab('ai-studio');

    const container = mockDoc.getElementById('ranu-devtools-dock');
    const authTrigger = container?.shadowRoot?.querySelector('.btn-auth-trigger');
    expect(authTrigger).not.toBeNull();

    // Open Auth Modal
    authTrigger?.onclick?.({ stopPropagation: () => {} });

    const modalBackdrop = container?.shadowRoot?.querySelector('.rd-modal-backdrop');
    expect(modalBackdrop).not.toBeNull();

    const modalCard = container?.shadowRoot?.querySelector('.rd-modal-card');
    expect(modalCard).not.toBeNull();
    expect(modalCard?.innerHTML).toContain('AI Provider Authentication');
    expect(modalCard?.innerHTML).toContain('Test Connection');
    expect(modalCard?.innerHTML).toContain('AST Safe:');

    unmount?.();
  });

  it('R4: RanuDevTools component renders Sleek Obsidian branding in dev and returns null in prod', () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      // Dev mode
      process.env.NODE_ENV = 'development';
      const html = renderToString(React.createElement(RanuDevTools));
      expect(html).toContain('0 0 1910 2081');
      expect(html).toContain('#33BBCA');
      expect(html).toContain('rgba(18, 18, 22, 0.88)');

      // Prod mode
      process.env.NODE_ENV = 'production';
      const prodHtml = renderToString(React.createElement(RanuDevTools));
      expect(prodHtml).toBe('');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('R3: preserves prompt input focus during interactive typing', () => {
    const unmount = mountDevToolsDock(mockDoc as any);
    toggleDevToolsDock();
    setActiveDevToolsTab('ai-studio');

    const container = mockDoc.getElementById('ranu-devtools-dock');
    const promptInput = container?.shadowRoot?.querySelector('.ai-prompt-input');
    expect(promptInput).not.toBeNull();

    // User focuses the prompt input
    promptInput?.focus();
    expect((promptInput as any)?.isFocused).toBe(true);

    // User types 'A'
    (promptInput as any).value = 'A';
    (promptInput as any).selectionStart = 1;
    (promptInput as any)?.oninput?.({ target: promptInput });

    // Ensure state updated and new element retained focus
    expect(getDevToolsState().aiStudio.currentPrompt).toBe('A');
    const reRenderedInput = container?.shadowRoot?.querySelector('.ai-prompt-input');
    expect((reRenderedInput as any)?.isFocused).toBe(true);

    unmount?.();
  });

  it('R3: dismisses provider popover on outside click', () => {
    const unmount = mountDevToolsDock(mockDoc as any);
    toggleDevToolsDock();
    setActiveDevToolsTab('ai-studio');

    const container = mockDoc.getElementById('ranu-devtools-dock');
    const dropdownTrigger = container?.shadowRoot?.querySelector('.custom-dropdown-trigger');
    expect(dropdownTrigger).not.toBeNull();

    // Open dropdown
    dropdownTrigger?.onclick?.({ stopPropagation: () => {} });
    expect(container?.shadowRoot?.querySelector('.custom-dropdown-menu')).not.toBeNull();

    // Click outside
    mockDoc.dispatchEvent({
      type: 'click',
      target: mockDoc.body,
    });
    expect(container?.shadowRoot?.querySelector('.custom-dropdown-menu')).toBeNull();

    unmount?.();
  });

  it('R3: dismisses modals, dropdowns, and drawer via Escape key', () => {
    const unmount = mountDevToolsDock(mockDoc as any);
    toggleDevToolsDock();
    setActiveDevToolsTab('ai-studio');

    const container = mockDoc.getElementById('ranu-devtools-dock');

    // 1. Open Auth modal and dismiss with Escape
    const authTrigger = container?.shadowRoot?.querySelector('.btn-auth-trigger');
    authTrigger?.onclick?.({ stopPropagation: () => {} });
    expect(container?.shadowRoot?.querySelector('.rd-modal-card')).not.toBeNull();

    mockDoc.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault: () => {} });
    expect(container?.shadowRoot?.querySelector('.rd-modal-card')).toBeNull();

    // 2. Open provider dropdown and dismiss with Escape
    const dropdownTrigger = container?.shadowRoot?.querySelector('.custom-dropdown-trigger');
    dropdownTrigger?.onclick?.({ stopPropagation: () => {} });
    expect(container?.shadowRoot?.querySelector('.custom-dropdown-menu')).not.toBeNull();

    mockDoc.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault: () => {} });
    expect(container?.shadowRoot?.querySelector('.custom-dropdown-menu')).toBeNull();

    // 3. Open studio drawer and dismiss with Escape
    expect(getDevToolsState().isOpen).toBe(true);
    mockDoc.dispatchEvent({ type: 'keydown', key: 'Escape', preventDefault: () => {} });
    expect(getDevToolsState().isOpen).toBe(false);

    unmount?.();
  });

  it('R3: stops keyboard event propagation on promptInput and keyInput', () => {
    const unmount = mountDevToolsDock(mockDoc as any);
    toggleDevToolsDock();
    setActiveDevToolsTab('ai-studio');

    const container = mockDoc.getElementById('ranu-devtools-dock');
    const promptInput = container?.shadowRoot?.querySelector('.ai-prompt-input');

    let stopped = false;
    promptInput?.onkeydown?.({
      key: 'x',
      stopPropagation: () => {
        stopped = true;
      },
    });
    expect(stopped).toBe(true);

    let keyUpStopped = false;
    promptInput?.onkeyup?.({
      key: 'x',
      stopPropagation: () => {
        keyUpStopped = true;
      },
    });
    expect(keyUpStopped).toBe(true);

    unmount?.();
  });

  it('R1: injects complete Obsidian token design system into :host stylesheet', () => {
    const unmount = mountDevToolsDock(mockDoc as any);
    const container = mockDoc.getElementById('ranu-devtools-dock');
    const shadow = container?.shadowRoot;
    const styleChild = shadow?.children.find((c) => c.tagName === 'STYLE');
    expect(styleChild).toBeDefined();
    const css = styleChild?.textContent || styleChild?.innerHTML || '';

    // Verify presence of all key token categories from spec Section 2.7
    expect(css).toContain('--rd-bg-root');
    expect(css).toContain('--rd-surface-1');
    expect(css).toContain('--rd-surface-4');
    expect(css).toContain('--rd-accent-cyan: #33BBCA');
    expect(css).toContain('--rd-accent-ai');
    expect(css).toContain('--rd-status-success');
    expect(css).toContain('--rd-status-warning');
    expect(css).toContain('--rd-status-error');
    expect(css).toContain('--rd-border-subtle');
    expect(css).toContain('--rd-border-default');
    expect(css).toContain('--rd-border-specular');
    expect(css).toContain('--rd-font-sans');
    expect(css).toContain('--rd-font-mono');

    unmount?.();
  });

  it('R3: preserves entered BYOK key across visibility toggles without wiping input', () => {
    const unmount = mountDevToolsDock(mockDoc as any);
    toggleDevToolsDock();
    setActiveDevToolsTab('ai-studio');

    const container = mockDoc.getElementById('ranu-devtools-dock');
    const authTrigger = container?.shadowRoot?.querySelector('.btn-auth-trigger');
    authTrigger?.onclick?.({ stopPropagation: () => {} });

    // Switch to BYOK tab
    const buttons = container?.shadowRoot?.querySelectorAll('button');
    const byokBtn = buttons?.find((b) => b.innerHTML.includes('API Key (BYOK)'));
    expect(byokBtn).toBeDefined();
    byokBtn?.onclick?.({ stopPropagation: () => {} });

    // Find key input
    const keyInput = container?.shadowRoot?.querySelector('input[type="password"]');
    expect(keyInput).not.toBeNull();

    // Type new API key
    (keyInput as any).value = 'sk-live-adversarial-12345';
    (keyInput as any).selectionStart = 25;
    keyInput?.oninput?.({ target: keyInput });

    // Toggle visibility via eye button
    const eyeBtn = container?.shadowRoot?.querySelector('input[type="password"]')?.parentElement?.querySelector('button');
    expect(eyeBtn).not.toBeNull();
    eyeBtn?.onclick?.({ stopPropagation: () => {} });

    // Verify key was preserved and not wiped out
    const revealedInput = container?.shadowRoot?.querySelector('input[type="text"]');
    expect(revealedInput).not.toBeNull();
    expect((revealedInput as any)?.value).toBe('sk-live-adversarial-12345');

    unmount?.();
  });

  it('R3: saves provider credentials and closes auth modal via Save Changes CTA', () => {
    const unmount = mountDevToolsDock(mockDoc as any);
    toggleDevToolsDock();
    setActiveDevToolsTab('ai-studio');

    const container = mockDoc.getElementById('ranu-devtools-dock');
    const authTrigger = container?.shadowRoot?.querySelector('.btn-auth-trigger');
    authTrigger?.onclick?.({ stopPropagation: () => {} });

    const saveBtn = container?.shadowRoot?.querySelector('.btn-save-auth');
    expect(saveBtn).not.toBeNull();
    expect(saveBtn?.innerHTML).toContain('Save Changes');

    saveBtn?.onclick?.({ stopPropagation: () => {} });

    // Modal is dismissed
    expect(container?.shadowRoot?.querySelector('.rd-modal-card')).toBeNull();

    unmount?.();
  });

  it('R3: cancels active ping test when switching providers to prevent race condition', () => {
    const unmount = mountDevToolsDock(mockDoc as any);
    toggleDevToolsDock();
    setActiveDevToolsTab('ai-studio');

    const container = mockDoc.getElementById('ranu-devtools-dock');
    const authTrigger = container?.shadowRoot?.querySelector('.btn-auth-trigger');
    authTrigger?.onclick?.({ stopPropagation: () => {} });

    // Click "Test Connection" for Groq
    const buttons = container?.shadowRoot?.querySelectorAll('button');
    const pingBtn = buttons?.find((b) => b.innerHTML.includes('Test Connection'));
    expect(pingBtn).toBeDefined();
    pingBtn?.onclick?.();

    // While ping is in-flight, immediately switch to Gemini in the sidebar
    const modalCard = container?.shadowRoot?.querySelector('.rd-modal-card');
    const provButtons = modalCard?.querySelectorAll('button');
    const geminiProvBtn = provButtons?.find((b) => b.innerHTML.includes('Gemini'));
    expect(geminiProvBtn).toBeDefined();
    geminiProvBtn?.onclick?.();

    // Verify that provider switched to Gemini and ping status was reset (not showing "Pinging...")
    expect(container?.shadowRoot?.innerHTML).toContain('Gemini');
    expect(container?.shadowRoot?.innerHTML).not.toContain('Pinging...');

    unmount?.();
  });

  it('R3: prevents click inside dropdown container from bubbling to outside dismissal handler', () => {
    const unmount = mountDevToolsDock(mockDoc as any);
    toggleDevToolsDock();
    setActiveDevToolsTab('ai-studio');

    const container = mockDoc.getElementById('ranu-devtools-dock');
    const dropdownTrigger = container?.shadowRoot?.querySelector('.custom-dropdown-trigger');
    dropdownTrigger?.onclick?.({ stopPropagation: () => {} });

    const dropdownContainer = container?.shadowRoot?.querySelector('.custom-dropdown-container');
    expect(dropdownContainer).not.toBeNull();

    let stopped = false;
    dropdownContainer?.onclick?.({
      stopPropagation: () => {
        stopped = true;
      },
    });
    expect(stopped).toBe(true);

    const dropdownMenu = container?.shadowRoot?.querySelector('.custom-dropdown-menu');
    expect(dropdownMenu).not.toBeNull();
    let menuStopped = false;
    dropdownMenu?.onclick?.({
      stopPropagation: () => {
        menuStopped = true;
      },
    });
    expect(menuStopped).toBe(true);

    unmount?.();
  });

  it('R3: preserves disconnected state when user disconnects provider and clicks Save Changes', () => {
    const unmount = mountDevToolsDock(mockDoc as any);
    toggleDevToolsDock();
    setActiveDevToolsTab('ai-studio');

    const container = mockDoc.getElementById('ranu-devtools-dock');
    const authTrigger = container?.shadowRoot?.querySelector('.btn-auth-trigger');
    authTrigger?.onclick?.({ stopPropagation: () => {} });

    // Find Disconnect button for Groq
    const buttons = container?.shadowRoot?.querySelectorAll('button');
    const disconnectBtn = buttons?.find((b) => b.innerHTML.includes('Disconnect'));
    expect(disconnectBtn).toBeDefined();
    disconnectBtn?.onclick?.();

    // Verify modal now shows Unconfigured
    expect(container?.shadowRoot?.innerHTML).toContain('Unconfigured');

    // Click Save Changes CTA
    const saveBtn = container?.shadowRoot?.querySelector('.btn-save-auth');
    saveBtn?.onclick?.({ stopPropagation: () => {} });

    // Verify modal closed
    expect(container?.shadowRoot?.querySelector('.rd-modal-card')).toBeNull();

    // Reopen modal to verify Groq remained disconnected and was not falsely reconnected
    const reAuthTrigger = container?.shadowRoot?.querySelector('.btn-auth-trigger');
    reAuthTrigger?.onclick?.({ stopPropagation: () => {} });
    expect(container?.shadowRoot?.innerHTML).toContain('Unconfigured');

    unmount?.();
  });

  it('R3: ping test on unconfigured provider reports 401 ERR instead of false 200 OK', async () => {
    const unmount = mountDevToolsDock(mockDoc as any);
    toggleDevToolsDock();
    setActiveDevToolsTab('ai-studio');

    const container = mockDoc.getElementById('ranu-devtools-dock');
    const authTrigger = container?.shadowRoot?.querySelector('.btn-auth-trigger');
    authTrigger?.onclick?.({ stopPropagation: () => {} });

    // Switch to Gemini (unconfigured)
    const modalCard = container?.shadowRoot?.querySelector('.rd-modal-card');
    const provButtons = modalCard?.querySelectorAll('button');
    const geminiProvBtn = provButtons?.find((b) => b.innerHTML.includes('Gemini'));
    geminiProvBtn?.onclick?.();

    // Click Test Connection
    const buttons = container?.shadowRoot?.querySelectorAll('button');
    const pingBtn = buttons?.find((b) => b.innerHTML.includes('Test Connection'));
    pingBtn?.onclick?.();

    // Await simulated 150ms latency ping test
    await new Promise((r) => setTimeout(r, 200));

    // Result banner reports 401 ERR rather than falsely certifying 200 OK
    expect(container?.shadowRoot?.innerHTML).toContain('401 ERR');
    expect(container?.shadowRoot?.innerHTML).toContain('401 Unauthorized');
    expect(container?.shadowRoot?.innerHTML).not.toContain('Verified: 19ms latency (200 OK)');

    unmount?.();
  });

  it('R3: ping test on Disabled mode reports OFF and does not connect AI', async () => {
    const unmount = mountDevToolsDock(mockDoc as any);
    toggleDevToolsDock();
    setActiveDevToolsTab('ai-studio');

    const container = mockDoc.getElementById('ranu-devtools-dock');
    const authTrigger = container?.shadowRoot?.querySelector('.btn-auth-trigger');
    authTrigger?.onclick?.({ stopPropagation: () => {} });

    // Switch to Disabled
    const modalCard = container?.shadowRoot?.querySelector('.rd-modal-card');
    const provButtons = modalCard?.querySelectorAll('button');
    const noneBtn = provButtons?.find((b) => b.innerHTML.includes('Disabled'));
    noneBtn?.onclick?.();

    // Click Test Connection
    const buttons = container?.shadowRoot?.querySelectorAll('button');
    const pingBtn = buttons?.find((b) => b.innerHTML.includes('Test Connection'));
    pingBtn?.onclick?.();

    // Await simulated 150ms latency ping test
    await new Promise((r) => setTimeout(r, 200));

    // Result banner reports OFF
    expect(container?.shadowRoot?.innerHTML).toContain('OFF');
    expect(container?.shadowRoot?.innerHTML).toContain('Zero AI Mode');

    unmount?.();
  });

  it('R3: retains per-provider connection mode between Account and BYOK when switching providers', () => {
    const unmount = mountDevToolsDock(mockDoc as any);
    toggleDevToolsDock();
    setActiveDevToolsTab('ai-studio');

    const container = mockDoc.getElementById('ranu-devtools-dock');
    const authTrigger = container?.shadowRoot?.querySelector('.btn-auth-trigger');
    authTrigger?.onclick?.({ stopPropagation: () => {} });

    // Groq starts in Connect Account
    expect(container?.shadowRoot?.innerHTML).toContain('Connect Account');

    // Switch to OpenAI: OpenAI defaults to API Key (BYOK) per spec
    const modalCard = container?.shadowRoot?.querySelector('.rd-modal-card');
    const provButtons = modalCard?.querySelectorAll('button');
    const openaiBtn = provButtons?.find((b) => b.innerHTML.includes('OpenAI'));
    openaiBtn?.onclick?.();

    expect(container?.shadowRoot?.innerHTML).toContain('OPENAI_API_KEY:');

    // Switch back to Groq: Groq retains Connect Account mode
    const updatedProvButtons = container?.shadowRoot?.querySelector('.rd-modal-card')?.querySelectorAll('button');
    const groqBtn = updatedProvButtons?.find((b) => b.innerHTML.includes('Groq'));
    groqBtn?.onclick?.();
    expect(container?.shadowRoot?.innerHTML).toContain('Workspace Identity: dev@ranu.local');

    unmount?.();
  });

  it('R3: retains edited Ollama daemon URL across re-renders and modal toggles', () => {
    const unmount = mountDevToolsDock(mockDoc as any);
    toggleDevToolsDock();
    setActiveDevToolsTab('ai-studio');

    const container = mockDoc.getElementById('ranu-devtools-dock');
    const authTrigger = container?.shadowRoot?.querySelector('.btn-auth-trigger');
    authTrigger?.onclick?.({ stopPropagation: () => {} });

    // Switch to Ollama
    const modalCard = container?.shadowRoot?.querySelector('.rd-modal-card');
    const provButtons = modalCard?.querySelectorAll('button');
    const ollamaBtn = provButtons?.find((b) => b.innerHTML.includes('Ollama'));
    ollamaBtn?.onclick?.();

    const ollamaInput = container?.shadowRoot?.querySelector('input[type="text"]');
    expect(ollamaInput).not.toBeNull();

    // Edit URL
    (ollamaInput as any).value = 'http://192.168.1.100:11434';
    ollamaInput?.oninput?.({ target: ollamaInput });

    // Switch to Groq and back to Ollama
    const updatedButtons = container?.shadowRoot?.querySelector('.rd-modal-card')?.querySelectorAll('button');
    const groqBtn = updatedButtons?.find((b) => b.innerHTML.includes('Groq'));
    groqBtn?.onclick?.();

    const buttonsAfterGroq = container?.shadowRoot?.querySelector('.rd-modal-card')?.querySelectorAll('button');
    const ollamaBtnAfterGroq = buttonsAfterGroq?.find((b) => b.innerHTML.includes('Ollama'));
    ollamaBtnAfterGroq?.onclick?.();

    const reRenderedOllama = container?.shadowRoot?.querySelector('input[type="text"]');
    expect((reRenderedOllama as any)?.value).toBe('http://192.168.1.100:11434');

    unmount?.();
  });

  it('R3: dismisses auth modal via Cancel button without saving', () => {
    const unmount = mountDevToolsDock(mockDoc as any);
    toggleDevToolsDock();
    setActiveDevToolsTab('ai-studio');

    const container = mockDoc.getElementById('ranu-devtools-dock');
    const authTrigger = container?.shadowRoot?.querySelector('.btn-auth-trigger');
    authTrigger?.onclick?.({ stopPropagation: () => {} });

    const cancelBtn = container?.shadowRoot?.querySelector('.btn-cancel-auth');
    expect(cancelBtn).not.toBeNull();
    cancelBtn?.onclick?.();

    expect(container?.shadowRoot?.querySelector('.rd-modal-card')).toBeNull();

    unmount?.();
  });
});

