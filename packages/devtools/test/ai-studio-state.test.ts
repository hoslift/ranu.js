import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getDevToolsState,
  resetDevToolsState,
  setAIStudioState,
  setSelectedPartner,
  setCurrentPrompt,
  setPendingDiff,
  setDevToolsDockPosition,
  acceptAIChanges,
  revertAIChanges,
  subscribeDevTools,
} from '../src/state.js';
import { submitAIPrompt, abortAIGeneration } from '../src/client-stream.js';
import type { PendingDiff, AIStudioPartner } from '../src/types.js';

describe('AI Studio state machine & client stream', () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;

  beforeEach(() => {
    resetDevToolsState();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalWindow !== undefined) {
      globalThis.window = originalWindow;
    }
  });

  it('initializes with default AI Studio state', () => {
    const state = getDevToolsState();
    expect(state.dockPosition).toBe('bottom');
    expect(state.aiStudio.isGenerating).toBe(false);
    expect(state.aiStudio.selectedPartner).toBe('gemini');
    expect(state.aiStudio.currentPrompt).toBe('');
    expect(state.aiStudio.pendingDiff).toBeUndefined();
    expect(state.aiStudio.diffViewMode).toBe('unified');
  });

  it('supports partner switching across all supported providers', () => {
    const partners: AIStudioPartner[] = ['gemini', 'groq', 'claude', 'openai', 'custom'];

    for (const partner of partners) {
      setSelectedPartner(partner);
      expect(getDevToolsState().aiStudio.selectedPartner).toBe(partner);
    }
  });

  it('updates prompt and notifies subscribers', () => {
    let capturedPrompt = '';
    const unsub = subscribeDevTools((s) => {
      capturedPrompt = s.aiStudio.currentPrompt;
    });

    setCurrentPrompt('Create an animated banner');
    expect(getDevToolsState().aiStudio.currentPrompt).toBe('Create an animated banner');
    expect(capturedPrompt).toBe('Create an animated banner');

    unsub();
  });

  it('updates dock position', () => {
    setDevToolsDockPosition('top');
    expect(getDevToolsState().dockPosition).toBe('top');

    setDevToolsDockPosition('left');
    expect(getDevToolsState().dockPosition).toBe('left');
  });

  it('sets and clears pending diffs', () => {
    const diff: PendingDiff = {
      filePath: 'app/routes/index.tsx',
      originalContent: '<h1>Hello</h1>',
      proposedContent: '<h1>Hello World</h1>',
      patchSummary: 'app/routes/index.tsx: +1 -1 lines',
    };

    setPendingDiff(diff);
    expect(getDevToolsState().aiStudio.pendingDiff).toEqual(diff);

    setPendingDiff(undefined);
    expect(getDevToolsState().aiStudio.pendingDiff).toBeUndefined();
  });

  it('reverts AI changes and dispatches ranu:ai-changes-reverted', () => {
    const events: string[] = [];
    const mockWindow = {
      dispatchEvent: (evt: { type: string }) => {
        events.push(evt.type);
        return true;
      },
    };
    (globalThis as any).window = mockWindow;

    setPendingDiff({
      filePath: 'app/page.tsx',
      originalContent: 'old',
      proposedContent: 'new',
      patchSummary: 'summary',
    });
    setAIStudioState({ isGenerating: true });

    revertAIChanges();

    const state = getDevToolsState();
    expect(state.aiStudio.pendingDiff).toBeUndefined();
    expect(state.aiStudio.isGenerating).toBe(false);
    expect(events).toContain('ranu:ai-changes-reverted');
  });

  it('accepts AI changes, triggers Fast Refresh / HMR, and resets pending diff', async () => {
    const events: string[] = [];
    let refreshCalled = false;

    const mockWindow = {
      dispatchEvent: (evt: { type: string }) => {
        events.push(evt.type);
        return true;
      },
      __ranu_refresh__: {
        performReactRefresh: () => {
          refreshCalled = true;
        },
      },
    };
    (globalThis as any).window = mockWindow;

    const diff: PendingDiff = {
      filePath: 'app/page.tsx',
      originalContent: 'line 1',
      proposedContent: 'line 1\nline 2',
      patchSummary: 'app/page.tsx: +1 -0 lines',
    };

    setPendingDiff(diff);
    setAIStudioState({ isGenerating: true });

    const result = await acceptAIChanges(diff);
    expect(result.success).toBe(true);

    const state = getDevToolsState();
    expect(state.aiStudio.pendingDiff).toBeUndefined();
    expect(state.aiStudio.isGenerating).toBe(false);
    expect(events).toContain('ranu:ai-changes-accepted');
    expect(events).toContain('ranu:fast-refresh');
    expect(refreshCalled).toBe(true);
  });

  it('submits AI prompt and streams SSE chunks correctly', async () => {
    const ssePayload = [
      'event: chunk\ndata: {"text":"```tsx\\n"}\n\n',
      'event: chunk\ndata: {"text":"export default function Hero() {\\n"}\n\n',
      'event: chunk\ndata: {"text":"  return <h1>Hero</h1>;\\n}\\n```"}\n\n',
      'event: finish\ndata: {"finishReason":"stop"}\n\n',
    ].join('');

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(ssePayload));
        controller.close();
      },
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    });

    await submitAIPrompt('Generate hero component', {
      filePath: 'app/components/Hero.tsx',
      originalContent: '',
    });

    const state = getDevToolsState();
    expect(state.aiStudio.isGenerating).toBe(false);
    expect(state.aiStudio.pendingDiff).toBeDefined();
    expect(state.aiStudio.pendingDiff?.filePath).toBe('app/components/Hero.tsx');
    expect(state.aiStudio.pendingDiff?.proposedContent).toContain('export default function Hero()');
    expect(state.aiStudio.pendingDiff?.patchSummary).toContain('+3 -0 lines');
  });

  it('handles abort during AI generation', async () => {
    let abortSignalTriggered = false;

    globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
      init.signal.addEventListener('abort', () => {
        abortSignalTriggered = true;
      });
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    const promptPromise = submitAIPrompt('Long running query');
    expect(getDevToolsState().aiStudio.isGenerating).toBe(true);

    abortAIGeneration();
    await promptPromise;

    expect(abortSignalTriggered).toBe(true);
    expect(getDevToolsState().aiStudio.isGenerating).toBe(false);
  });

  it('handles HTTP error responses from AI endpoint', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await submitAIPrompt('Failing prompt');
    const state = getDevToolsState();
    expect(state.aiStudio.isGenerating).toBe(false);
    expect(state.aiStudio.error).toContain('AI endpoint error 500: Internal Server Error');
  });

  it('handles SSE error events from AI stream', async () => {
    const sseError = 'event: error\ndata: {"error":"RATE_LIMIT","message":"Quota exceeded"}\n\n';
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseError));
        controller.close();
      },
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    });

    await submitAIPrompt('Exceeded prompt');
    const state = getDevToolsState();
    expect(state.aiStudio.isGenerating).toBe(false);
    expect(state.aiStudio.error).toBe('Quota exceeded');
  });
});
