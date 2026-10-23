import type { RanuDiagnostic } from '@ranu/diagnostics';
import type {
  AIStudioPartner,
  AIStudioState,
  DevToolsDockPosition,
  DevToolsDockState,
  DevToolsListener,
  DevToolsTab,
  HydrationMismatchItem,
  PendingDiff,
  RouteHierarchyInfo,
  StreamingChunkMetric,
} from './types.js';

let streamStartTime = Date.now();
let chunkSequence = 0;

function createInitialState(): DevToolsDockState {
  return {
    isOpen: false,
    activeTab: 'waterfall',
    dockPosition: 'bottom',
    streamingChunks: [],
    currentRoute: undefined,
    hydration: {
      status: 'pending',
      mismatchesCount: 0,
      mismatches: [],
    },
    diagnostics: [],
    aiStudio: {
      isGenerating: false,
      selectedPartner: 'gemini',
      currentPrompt: '',
      pendingDiff: undefined,
      streamingResponse: undefined,
      error: undefined,
      diffViewMode: 'unified',
    },
  };
}

let currentState: DevToolsDockState = createInitialState();
const listeners = new Set<DevToolsListener>();

function notify(): void {
  for (const listener of listeners) {
    try {
      listener(currentState);
    } catch {
      // Ignore listener error
    }
  }
}

export function getDevToolsState(): DevToolsDockState {
  return currentState;
}

export function setDevToolsState(partial: Partial<DevToolsDockState>): void {
  currentState = { ...currentState, ...partial };
  notify();
}

export function subscribeDevTools(listener: DevToolsListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function toggleDevToolsDock(): boolean {
  currentState = {
    ...currentState,
    isOpen: !currentState.isOpen,
  };
  notify();
  return currentState.isOpen;
}

export function setActiveDevToolsTab(tab: DevToolsTab): void {
  currentState = {
    ...currentState,
    activeTab: tab,
  };
  notify();
}

export function recordStreamingChunk(bytes: number, preview = ''): StreamingChunkMetric {
  const now = Date.now();
  const deltaMs = now - streamStartTime;
  const chunk: StreamingChunkMetric = {
    id: ++chunkSequence,
    timestamp: now,
    deltaMs,
    bytes,
    preview: preview.slice(0, 80),
  };

  currentState = {
    ...currentState,
    streamingChunks: [...currentState.streamingChunks, chunk],
  };
  notify();
  return chunk;
}

export function recordRouteHierarchy(info: RouteHierarchyInfo): void {
  currentState = {
    ...currentState,
    currentRoute: info,
  };
  notify();
}

export function recordHydrationStatus(
  status: 'pending' | 'success' | 'mismatch' | 'error',
  hydrationTimeMs?: number,
  mismatches: readonly HydrationMismatchItem[] = [],
): void {
  currentState = {
    ...currentState,
    hydration: {
      status,
      hydrationTimeMs,
      mismatchesCount: mismatches.length,
      mismatches,
    },
  };
  notify();
}

export function recordDevDiagnostics(diagnostics: RanuDiagnostic[]): void {
  currentState = {
    ...currentState,
    diagnostics: [...diagnostics],
  };
  notify();
}

export function resetDevToolsState(): void {
  streamStartTime = Date.now();
  chunkSequence = 0;
  currentState = createInitialState();
  notify();
}

export function setAIStudioState(partial: Partial<AIStudioState>): void {
  currentState = {
    ...currentState,
    aiStudio: {
      ...currentState.aiStudio,
      ...partial,
    },
  };
  notify();
}

export function setSelectedPartner(partner: AIStudioPartner): void {
  setAIStudioState({ selectedPartner: partner });
}

export function setCurrentPrompt(prompt: string): void {
  setAIStudioState({ currentPrompt: prompt });
}

export function setPendingDiff(diff: PendingDiff | undefined): void {
  setAIStudioState({ pendingDiff: diff });
}

export function setDevToolsDockPosition(pos: DevToolsDockPosition): void {
  currentState = {
    ...currentState,
    dockPosition: pos,
  };
  notify();
}

export async function acceptAIChanges(diff: PendingDiff): Promise<{ success: boolean }> {
  if (typeof fetch !== 'undefined') {
    try {
      await fetch('/api/ai/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(diff),
      });
    } catch {
      // Dev server endpoint may not exist in mock or preview mode
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ranu:ai-changes-accepted', { detail: diff }));
    // Trigger Fast Refresh / HMR
    const refreshRuntime = (window as unknown as { __ranu_refresh__?: { performReactRefresh?: () => void } }).__ranu_refresh__;
    if (refreshRuntime && typeof refreshRuntime.performReactRefresh === 'function') {
      refreshRuntime.performReactRefresh();
    }
    window.dispatchEvent(new CustomEvent('ranu:fast-refresh', { detail: { diff } }));
  }

  currentState = {
    ...currentState,
    aiStudio: {
      ...currentState.aiStudio,
      pendingDiff: undefined,
      isGenerating: false,
    },
  };
  notify();
  return { success: true };
}

export function revertAIChanges(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ranu:ai-changes-reverted'));
  }
  currentState = {
    ...currentState,
    aiStudio: {
      ...currentState.aiStudio,
      pendingDiff: undefined,
      isGenerating: false,
    },
  };
  notify();
}

