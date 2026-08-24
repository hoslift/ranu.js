import type { RanuDiagnostic } from '@ranu/diagnostics';
import type { RouteEntryInfo } from '@ranu/build';
import type { CompiledRouteRecord } from '@ranu/router';

export interface DevServerOptions {
  readonly projectRoot: string;
  readonly port?: number | undefined;
  readonly host?: string | undefined;
  readonly outDir?: string | undefined;
  readonly watch?: boolean | undefined;
  readonly debounceMs?: number | undefined;
  readonly publicEnv?: Record<string, string> | undefined;
}

export interface DevServerAddress {
  readonly port: number;
  readonly host: string;
  readonly url: string;
}

export type DevFileChangeCategory =
  | 'route'
  | 'css'
  | 'asset'
  | 'public'
  | 'config'
  | 'env'
  | 'other';

export interface DevFileEvent {
  readonly type: 'add' | 'change' | 'unlink';
  readonly relativePath: string;
  readonly fullPath: string;
  readonly category: DevFileChangeCategory;
}

import type { HmrAnalysisResult } from './hmr/types.js';

export interface DevBuildState {
  readonly generation: number;
  readonly buildId: string;
  readonly success: boolean;
  readonly diagnostics: readonly RanuDiagnostic[];
  readonly outDir: string;
  readonly routes: readonly RouteEntryInfo[];
  readonly routeRecords?: readonly CompiledRouteRecord[];
  readonly hmrAnalysis?: HmrAnalysisResult | undefined;
  readonly timestamp: number;
}
