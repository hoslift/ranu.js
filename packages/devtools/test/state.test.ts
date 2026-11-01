import { describe, it, expect, beforeEach } from 'vitest';
import {
  getDevToolsState,
  resetDevToolsState,
  recordStreamingChunk,
  recordRouteHierarchy,
  recordHydrationStatus,
  recordDevDiagnostics,
  toggleDevToolsDock,
  setActiveDevToolsTab,
  subscribeDevTools,
} from '../src/state.js';

describe('@ranu/devtools state management', () => {
  beforeEach(() => {
    resetDevToolsState();
  });

  it('tracks initial state correctly', () => {
    const state = getDevToolsState();
    expect(state.isOpen).toBe(false);
    expect(state.activeTab).toBe('waterfall');
    expect(state.streamingChunks).toHaveLength(0);
    expect(state.hydration.status).toBe('pending');
  });

  it('records streaming chunks sequentially with delta timing', () => {
    const chunk1 = recordStreamingChunk(1024, '<div>Part 1</div>');
    expect(chunk1.id).toBe(1);
    expect(chunk1.bytes).toBe(1024);
    expect(chunk1.preview).toBe('<div>Part 1</div>');

    const chunk2 = recordStreamingChunk(2048, '<div>Part 2</div>');
    expect(chunk2.id).toBe(2);
    expect(chunk2.bytes).toBe(2048);

    const state = getDevToolsState();
    expect(state.streamingChunks).toHaveLength(2);
  });

  it('toggles dock visibility and emits updates to subscribers', () => {
    let notifiedOpen = false;
    const unsub = subscribeDevTools((s) => {
      notifiedOpen = s.isOpen;
    });

    expect(toggleDevToolsDock()).toBe(true);
    expect(notifiedOpen).toBe(true);

    expect(toggleDevToolsDock()).toBe(false);
    expect(notifiedOpen).toBe(false);

    unsub();
  });

  it('switches active tabs', () => {
    setActiveDevToolsTab('hydration');
    expect(getDevToolsState().activeTab).toBe('hydration');

    setActiveDevToolsTab('routes');
    expect(getDevToolsState().activeTab).toBe('routes');
  });

  it('records route hierarchy and hydration status', () => {
    recordRouteHierarchy({
      routeId: 'page:/dashboard',
      pathname: '/dashboard',
      params: {},
      layouts: ['app/layout.tsx'],
      loading: 'app/loading.tsx',
      errors: ['app/error.tsx'],
    });

    recordHydrationStatus('mismatch', 45, [
      {
        type: 'attr-mismatch',
        path: 'div > button',
        message: 'Client rendered disabled="true"',
        serverValue: '',
        clientValue: 'disabled',
      },
    ]);

    const state = getDevToolsState();
    expect(state.currentRoute?.routeId).toBe('page:/dashboard');
    expect(state.hydration.status).toBe('mismatch');
    expect(state.hydration.mismatchesCount).toBe(1);
  });

  it('records compiler diagnostics', () => {
    recordDevDiagnostics([
      {
        code: 'RANU_SECRET_ACCESS_DENIED',
        severity: 'error',
        message: 'Illegal secret access',
        hint: 'Use RANU_PUBLIC_ prefix',
      },
    ]);

    expect(getDevToolsState().diagnostics).toHaveLength(1);
    expect(getDevToolsState().diagnostics[0]?.code).toBe('RANU_SECRET_ACCESS_DENIED');
  });
});
