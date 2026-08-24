import type { RanuDiagnostic } from '@ranu/diagnostics';

export type HmrUpdateType = 'js' | 'css';

export interface HmrJsUpdate {
  readonly type: 'js';
  readonly path: string;
  readonly url: string;
  readonly boundaryId: string;
  readonly isReactRefresh: boolean;
}

export interface HmrCssUpdate {
  readonly type: 'css';
  readonly path: string;
  readonly url: string;
  readonly isModule: boolean;
}

export type HmrUpdatePayload = HmrJsUpdate | HmrCssUpdate;

export interface HmrUpdateMessage {
  readonly buildId: string;
  readonly generation: number;
  readonly updates: readonly HmrUpdatePayload[];
  readonly affectedRoutes: readonly string[];
}

export interface HmrReloadMessage {
  readonly buildId: string;
  readonly generation: number;
  readonly reason: string;
}

export interface HmrErrorMessage {
  readonly diagnostics: readonly RanuDiagnostic[];
}

export interface HmrRecoveredMessage {
  readonly buildId: string;
  readonly generation: number;
}

export interface HmrAnalysisResult {
  readonly canHotUpdate: boolean;
  readonly requiresReload: boolean;
  readonly reason?: string | undefined;
  readonly updates: readonly HmrUpdatePayload[];
  readonly affectedRoutes: readonly string[];
}
