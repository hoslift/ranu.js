import type { RanuDiagnostic } from '@ranu/diagnostics';

export interface StreamingChunkMetric {
  readonly id: number;
  readonly timestamp: number;
  readonly deltaMs: number;
  readonly bytes: number;
  readonly preview: string;
}

export interface RouteHierarchyInfo {
  readonly routeId: string;
  readonly pathname: string;
  readonly params: Record<string, string | string[]>;
  readonly layouts: readonly string[];
  readonly loading?: string;
  readonly errors: readonly string[];
}

export interface HydrationMismatchItem {
  readonly type: string;
  readonly path: string;
  readonly message: string;
  readonly serverValue?: string;
  readonly clientValue?: string;
}

export interface HydrationMetricInfo {
  readonly status: 'pending' | 'success' | 'mismatch' | 'error';
  readonly hydrationTimeMs?: number | undefined;
  readonly mismatchesCount: number;
  readonly mismatches: readonly HydrationMismatchItem[];
}

export type DevToolsTab = 'waterfall' | 'routes' | 'hydration' | 'diagnostics' | 'ai-studio';
export type DevToolsDockPosition = 'bottom' | 'top' | 'left' | 'right';
export type AIStudioPartner = 'gemini' | 'groq' | 'claude' | 'openai' | 'custom';

export interface PendingDiff {
  filePath: string;
  originalContent: string;
  proposedContent: string;
  patchSummary: string;
}

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  originalLineNumber?: number;
  modifiedLineNumber?: number;
}

export interface AIStudioState {
  isGenerating: boolean;
  selectedPartner: AIStudioPartner;
  currentPrompt: string;
  pendingDiff?: PendingDiff | undefined;
  streamingResponse?: string | undefined;
  error?: string | undefined;
  diffViewMode?: 'unified' | 'split' | undefined;
}

export interface DevToolsDockState {
  isOpen: boolean;
  activeTab: DevToolsTab;
  dockPosition?: DevToolsDockPosition;
  streamingChunks: StreamingChunkMetric[];
  currentRoute?: RouteHierarchyInfo | undefined;
  hydration: HydrationMetricInfo;
  diagnostics: RanuDiagnostic[];
  aiStudio: AIStudioState;
}

export type DevToolsListener = (state: DevToolsDockState) => void;

