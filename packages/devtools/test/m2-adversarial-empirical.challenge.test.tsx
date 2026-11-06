import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderToString, renderToStaticMarkup } from 'react-dom/server';
import { RanuDevTools } from '../src/component.js';
import {
  getDevToolsState,
  setDevToolsState,
  resetDevToolsState,
  toggleDevToolsDock,
  setActiveDevToolsTab,
  setSelectedPartner,
  setCurrentPrompt,
  setPendingDiff,
  setAIStudioState,
  setDevToolsDockPosition,
  recordStreamingChunk,
  subscribeDevTools,
} from '../src/state.js';
import { mountDevToolsDock } from '../src/dock.js';

class MockElement {
  public id = '';
  public className = '';
  public innerHTML = '';
  public textContent = '';
  public style: Record<string, string> = {};
  public children: MockElement[] = [];
  public shadowRoot: MockElement | null = null;
  public onclick: (() => void) | null = null;

  constructor(public tagName: string) {}

  attachShadow(_opts: { mode: string }): MockElement {
    this.shadowRoot = new MockElement('SHADOW-ROOT');
    return this.shadowRoot;
  }

  appendChild(child: MockElement): MockElement {
    this.children.push(child);
    return child;
  }

  querySelector(selector: string): MockElement | null {
    const cls = selector.replace(/^\./, '');
    if (this.className.includes(cls)) return this;
    for (const c of this.children) {
      const f = c.querySelector(selector);
      if (f) return f;
    }
    return null;
  }

  querySelectorAll(selector: string): MockElement[] {
    const res: MockElement[] = [];
    const cls = selector.replace(/^\./, '');
    if (this.className.includes(cls)) res.push(this);
    for (const c of this.children) {
      res.push(...c.querySelectorAll(selector));
    }
    return res;
  }

  remove(): void {
    // noop
  }
}

class MockDocument {
  public body = new MockElement('BODY');
  private elementsById = new Map<string, MockElement>();
  public listeners = new Map<string, Array<(e: any) => void>>();

  createElement(tagName: string): MockElement {
    return new MockElement(tagName.toUpperCase());
  }

  getElementById(id: string): MockElement | null {
    if (this.elementsById.has(id)) return this.elementsById.get(id)!;
    return this.body.children.find((c) => c.id === id) || null;
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
      this.listeners.set(type, arr.filter((l) => l !== listener));
    }
  }

  dispatchEvent(event: { type: string; [key: string]: any }): boolean {
    const arr = this.listeners.get(event.type);
    if (arr) {
      for (const l of arr) {
        l(event);
      }
    }
    return true;
  }
}

describe('M2 Adversarial Empirical Challenge Suite: DevTools React 19 SSR & In-Browser Dock', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    resetDevToolsState();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    resetDevToolsState();
  });

  // =========================================================================
  // Scope 1: React 19 SSR Rendering Under Adversarial Contexts
  // =========================================================================
  describe('Scope 1: React 19 SSR Rendering in Diverse Contexts', () => {
    it('returns null and does not throw when ReactSharedInternals.ReactCurrentDispatcher.current is null', () => {
      const internals =
        (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE ||
        (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

      if (internals) {
        const prevH = internals.H;
        const prevDispatcher = internals.ReactCurrentDispatcher?.current;
        try {
          if ('H' in internals) internals.H = null;
          if (internals.ReactCurrentDispatcher) {
            internals.ReactCurrentDispatcher.current = null;
          }

          // Direct component call in Server Component execution
          expect(() => {
            const res = RanuDevTools();
            expect(res).toBeNull();
          }).not.toThrow();
        } finally {
          if ('H' in internals) internals.H = prevH;
          if (internals.ReactCurrentDispatcher) {
            internals.ReactCurrentDispatcher.current = prevDispatcher;
          }
        }
      }
    });

    it('returns null when internals.H is null while ReactCurrentDispatcher is undefined', () => {
      const internals =
        (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE ||
        (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

      if (internals) {
        const prevH = internals.H;
        try {
          internals.H = null;
          expect(() => {
            const res = RanuDevTools();
            expect(res).toBeNull();
          }).not.toThrow();
        } finally {
          internals.H = prevH;
        }
      }
    });

    it('renders clean HTML with renderToString in development mode', () => {
      recordStreamingChunk(1024, 'test-preview');
      const html = renderToString(<RanuDevTools />);
      expect(typeof html).toBe('string');
      expect(html).toContain('Ranu DevTools');
      expect(html).toContain('⚡');
      expect(html).toContain('launcher');
      expect(html).toContain('z-index:2147483646');
      expect(html).toContain('bottom:16px');
      expect(html).toContain('left:16px');
    });

    it('renders static markup with renderToStaticMarkup in development mode', () => {
      const markup = renderToStaticMarkup(<RanuDevTools />);
      expect(typeof markup).toBe('string');
      expect(markup).toContain('Ranu DevTools');
      expect(markup).toContain('⚡');
      expect(markup).not.toContain('data-reactroot');
    });

    it('renders dock panel with all 5 tabs and AI Studio in renderToString when isOpen is true', () => {
      toggleDevToolsDock();
      setActiveDevToolsTab('ai-studio');
      setCurrentPrompt('Add responsive navigation');

      const html = renderToString(<RanuDevTools />);
      expect(html).toContain('panel');
      expect(html).toContain('Waterfall');
      expect(html).toContain('Route Hierarchy');
      expect(html).toContain('Hydration');
      expect(html).toContain('Diagnostics');
      expect(html).toContain('AI Studio ✨');
      expect(html).toContain('✦ Gemini');
      expect(html).toContain('⚡ Groq');
      expect(html).toContain('▲ Claude');
      expect(html).toContain('● OpenAI');
      expect(html).toContain('⚙ Custom');
      expect(html).toContain('value="Add responsive navigation"');
    });

    it('strictly outputs empty string ("") under production NODE_ENV for renderToString', () => {
      process.env.NODE_ENV = 'production';
      toggleDevToolsDock(); // Even if dock was opened
      recordStreamingChunk(2048, 'chunk');

      const html = renderToString(<RanuDevTools />);
      expect(html).toBe('');
    });

    it('strictly outputs empty string ("") under production NODE_ENV for renderToStaticMarkup', () => {
      process.env.NODE_ENV = 'production';
      toggleDevToolsDock();

      const markup = renderToStaticMarkup(<RanuDevTools />);
      expect(markup).toBe('');
    });

    it('survives rapid oscillating NODE_ENV switches without state or markup leakage', () => {
      for (let i = 0; i < 50; i++) {
        process.env.NODE_ENV = 'production';
        expect(renderToString(<RanuDevTools />)).toBe('');
        expect(renderToStaticMarkup(<RanuDevTools />)).toBe('');

        process.env.NODE_ENV = 'development';
        const devHtml = renderToString(<RanuDevTools />);
        expect(devHtml).toContain('Ranu DevTools');
      }
    });

    it('useSyncExternalStore server snapshot returns stable referential identity across renders', () => {
      const s1 = getDevToolsState();
      const s2 = getDevToolsState();
      expect(s1).toBe(s2); // Strict reference equality ensures no infinite SSR re-render loop
    });
  });

  // =========================================================================
  // Scope 2: In-Browser Keyboard Shortcut Dock Toggling
  // =========================================================================
  describe('Scope 2: Keyboard Shortcut Toggling (Alt+D, Alt+d, Ctrl+Shift+D, Cmd+Shift+D)', () => {
    let mockDoc: MockDocument;
    let unmountDock: (() => void) | undefined;

    beforeEach(() => {
      mockDoc = new MockDocument();
      unmountDock = mountDevToolsDock(mockDoc as any);
    });

    afterEach(() => {
      if (unmountDock) unmountDock();
    });

    it('toggles dock with Alt+D (uppercase D)', () => {
      expect(getDevToolsState().isOpen).toBe(false);

      let prevented = false;
      mockDoc.dispatchEvent({
        type: 'keydown',
        altKey: true,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
        key: 'D',
        preventDefault: () => {
          prevented = true;
        },
      });

      expect(prevented).toBe(true);
      expect(getDevToolsState().isOpen).toBe(true);

      // Second press closes dock
      mockDoc.dispatchEvent({
        type: 'keydown',
        altKey: true,
        key: 'D',
      });
      expect(getDevToolsState().isOpen).toBe(false);
    });

    it('toggles dock with Alt+d (lowercase d)', () => {
      expect(getDevToolsState().isOpen).toBe(false);

      mockDoc.dispatchEvent({
        type: 'keydown',
        altKey: true,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
        key: 'd',
      });

      expect(getDevToolsState().isOpen).toBe(true);
    });

    it('toggles dock with Ctrl+Shift+D (uppercase D)', () => {
      expect(getDevToolsState().isOpen).toBe(false);

      let prevented = false;
      mockDoc.dispatchEvent({
        type: 'keydown',
        altKey: false,
        ctrlKey: true,
        shiftKey: true,
        metaKey: false,
        key: 'D',
        preventDefault: () => {
          prevented = true;
        },
      });

      expect(prevented).toBe(true);
      expect(getDevToolsState().isOpen).toBe(true);
    });

    it('toggles dock with Ctrl+Shift+d (lowercase d)', () => {
      expect(getDevToolsState().isOpen).toBe(false);

      mockDoc.dispatchEvent({
        type: 'keydown',
        altKey: false,
        ctrlKey: true,
        shiftKey: true,
        metaKey: false,
        key: 'd',
      });

      expect(getDevToolsState().isOpen).toBe(true);
    });

    it('toggles dock with Cmd+Shift+D (metaKey: true on macOS)', () => {
      expect(getDevToolsState().isOpen).toBe(false);

      let prevented = false;
      mockDoc.dispatchEvent({
        type: 'keydown',
        altKey: false,
        ctrlKey: false,
        metaKey: true,
        shiftKey: true,
        key: 'D',
        preventDefault: () => {
          prevented = true;
        },
      });

      expect(prevented).toBe(true);
      expect(getDevToolsState().isOpen).toBe(true);
    });

    it('toggles dock with Cmd+Shift+d (metaKey: true, lowercase d on macOS)', () => {
      expect(getDevToolsState().isOpen).toBe(false);

      mockDoc.dispatchEvent({
        type: 'keydown',
        altKey: false,
        ctrlKey: false,
        metaKey: true,
        shiftKey: true,
        key: 'd',
      });

      expect(getDevToolsState().isOpen).toBe(true);
    });

    it('adversarial rejection: does NOT toggle for Ctrl+D (browser bookmark key)', () => {
      mockDoc.dispatchEvent({
        type: 'keydown',
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        key: 'd',
      });
      expect(getDevToolsState().isOpen).toBe(false);
    });

    it('adversarial rejection: does NOT toggle for Cmd+D without shift', () => {
      mockDoc.dispatchEvent({
        type: 'keydown',
        metaKey: true,
        shiftKey: false,
        altKey: false,
        key: 'D',
      });
      expect(getDevToolsState().isOpen).toBe(false);
    });

    it('adversarial rejection: does NOT toggle for Shift+D without alt/ctrl/meta', () => {
      mockDoc.dispatchEvent({
        type: 'keydown',
        shiftKey: true,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        key: 'D',
      });
      expect(getDevToolsState().isOpen).toBe(false);
    });

    it('adversarial rejection: does NOT toggle for Alt+X or Ctrl+Shift+X', () => {
      mockDoc.dispatchEvent({
        type: 'keydown',
        altKey: true,
        key: 'x',
      });
      expect(getDevToolsState().isOpen).toBe(false);

      mockDoc.dispatchEvent({
        type: 'keydown',
        ctrlKey: true,
        shiftKey: true,
        key: 'x',
      });
      expect(getDevToolsState().isOpen).toBe(false);
    });

    it('adversarial rejection: does NOT toggle when user is typing plain "d" or "D"', () => {
      mockDoc.dispatchEvent({
        type: 'keydown',
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
        key: 'd',
      });
      expect(getDevToolsState().isOpen).toBe(false);

      mockDoc.dispatchEvent({
        type: 'keydown',
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
        metaKey: false,
        key: 'D',
      });
      expect(getDevToolsState().isOpen).toBe(false);
    });

    it('unmounting removes keydown listener and stops responding to shortcuts', () => {
      expect(unmountDock).toBeDefined();
      unmountDock!();
      unmountDock = undefined;

      mockDoc.dispatchEvent({
        type: 'keydown',
        altKey: true,
        key: 'D',
      });

      // After unmount, dock should not toggle
      expect(getDevToolsState().isOpen).toBe(false);
    });
  });

  // =========================================================================
  // Scope 3: State Store Subscriptions, Concurrency & Clean Unsubscribe
  // =========================================================================
  describe('Scope 3: State Store Concurrency, Subscriptions & Memory Leak Audit', () => {
    it('handles 500 concurrent async state updates without corruption or lost sequence', async () => {
      const updates = 500;
      const promises: Array<Promise<void>> = [];

      for (let i = 0; i < updates; i++) {
        promises.push(
          new Promise<void>((resolve) => {
            const chunk = recordStreamingChunk(100 + i, `chunk-${i}`);
            expect(chunk.id).toBeGreaterThan(0);
            expect(chunk.bytes).toBe(100 + i);

            if (i % 50 === 0) {
              setDevToolsState({ activeTab: 'diagnostics' });
            } else if (i % 25 === 0) {
              toggleDevToolsDock();
            }
            resolve();
          })
        );
      }

      await Promise.all(promises);

      const finalState = getDevToolsState();
      expect(finalState.streamingChunks.length).toBe(updates);
      // Validate chronological monotonic ordering of chunk IDs
      for (let i = 0; i < updates; i++) {
        expect(finalState.streamingChunks[i]?.id).toBe(i + 1);
        expect(finalState.streamingChunks[i]?.bytes).toBe(100 + i);
      }
    });

    it('stress tests 200 concurrent subscriptions and verifies clean zero-leak unsubscribe', () => {
      const SUBSCRIBERS = 200;
      const receivedCounts = new Array(SUBSCRIBERS).fill(0);
      const unsubscribers: Array<() => void> = [];

      for (let i = 0; i < SUBSCRIBERS; i++) {
        const idx = i;
        const unsub = subscribeDevTools((state) => {
          if (state) {
            receivedCounts[idx]++;
          }
        });
        unsubscribers.push(unsub);
      }

      // Trigger 10 state updates
      for (let step = 0; step < 10; step++) {
        setDevToolsState({ dockPosition: step % 2 === 0 ? 'top' : 'bottom' });
      }

      // All 200 subscribers received all 10 notifications
      for (let i = 0; i < SUBSCRIBERS; i++) {
        expect(receivedCounts[i]).toBe(10);
      }

      // Unsubscribe all 200 subscribers
      for (const unsub of unsubscribers) {
        unsub();
      }

      // Trigger 5 more updates
      for (let step = 0; step < 5; step++) {
        setDevToolsState({ dockPosition: 'bottom' });
      }

      // No subscriber received any additional updates after unsubscribe
      for (let i = 0; i < SUBSCRIBERS; i++) {
        expect(receivedCounts[i]).toBe(10);
      }
    });

    it('handles re-entrant unsubscription during notification callback safely', () => {
      let callCount = 0;
      let unsubscribeSelf: (() => void) | null = null;

      unsubscribeSelf = subscribeDevTools(() => {
        callCount++;
        if (unsubscribeSelf) {
          unsubscribeSelf();
        }
      });

      // First update fires and unsubs itself
      setDevToolsState({ activeTab: 'hydration' });
      expect(callCount).toBe(1);

      // Second update should NOT call the unsubscribed listener
      setDevToolsState({ activeTab: 'routes' });
      expect(callCount).toBe(1);
    });

    it('swallows errors thrown by faulty listeners so sibling listeners are never blocked', () => {
      let siblingCalled = false;

      // Malicious / throwing subscriber
      const unsubBad = subscribeDevTools(() => {
        throw new Error('Fatal error in malicious subscriber');
      });

      // Healthy subscriber
      const unsubGood = subscribeDevTools(() => {
        siblingCalled = true;
      });

      expect(() => {
        setDevToolsState({ activeTab: 'diagnostics' });
      }).not.toThrow();

      expect(siblingCalled).toBe(true);

      unsubBad();
      unsubGood();
    });

    it('calling unsubscribe repeatedly is strictly idempotent and safe', () => {
      const unsub = subscribeDevTools(() => {});
      expect(() => {
        unsub();
        unsub();
        unsub();
      }).not.toThrow();
    });
  });
});
