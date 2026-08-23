import type { RanuDiagnostic } from '@ranu/diagnostics';
import type { RouteEntryInfo } from '@ranu/build';

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

export interface DevBuildState {
  readonly generation: number;
  readonly buildId: string;
  readonly success: boolean;
  readonly diagnostics: readonly RanuDiagnostic[];
  readonly outDir: string;
  readonly routes: readonly RouteEntryInfo[];
  readonly timestamp: number;
}
