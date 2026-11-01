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

export type DevToolsTab = 'waterfall' | 'routes' | 'hydration' | 'diagnostics';

export interface DevToolsDockState {
  isOpen: boolean;
  activeTab: DevToolsTab;
  streamingChunks: StreamingChunkMetric[];
  currentRoute?: RouteHierarchyInfo | undefined;
  hydration: HydrationMetricInfo;
  diagnostics: RanuDiagnostic[];
}

export type DevToolsListener = (state: DevToolsDockState) => void;
