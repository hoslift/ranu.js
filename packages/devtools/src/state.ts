import type { RanuDiagnostic } from '@ranu/diagnostics';
import type {
  DevToolsDockState,
  DevToolsListener,
  DevToolsTab,
  HydrationMismatchItem,
  RouteHierarchyInfo,
  StreamingChunkMetric,
} from './types.js';

let streamStartTime = Date.now();
let chunkSequence = 0;

function createInitialState(): DevToolsDockState {
  return {
    isOpen: false,
    activeTab: 'waterfall',
    streamingChunks: [],
    currentRoute: undefined,
    hydration: {
      status: 'pending',
      mismatchesCount: 0,
      mismatches: [],
    },
    diagnostics: [],
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
