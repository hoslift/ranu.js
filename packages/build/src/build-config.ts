import type { ResolvedRanuConfig } from '@ranu/config';
import type { RanuDiagnostic } from '@ranu/diagnostics';

export interface BuildPluginAlias {
  readonly find: string | RegExp;
  readonly replacement: string;
}

/** User-facing / programmatic options for build invocation */
export interface BuildConfig {
  /** Project root directory containing ranu.config and app/ */
  projectRoot: string;

  /** Target output directory. Defaults to '<projectRoot>/.ranu/build' */
  outDir?: string | undefined;

  /** Framework build mode. Defaults to 'production' */
  mode?: 'production' | 'development' | undefined;

  /** Source map generation strategy. Defaults to 'hidden' for server */
  sourceMaps?: 'hidden' | 'external' | 'inline' | false | undefined;

  /** Whether to minify code. Defaults to false for server, true for client in prod */
  minify?: boolean | undefined;

  /** TypeScript typechecking options */
  typescript?:
    | {
        check?: boolean | undefined;
      }
    | undefined;
}

/** Internal execution context shared across build stages */
export interface BuildContext {
  config: BuildConfig;
  resolvedConfig: ResolvedRanuConfig;
  buildId: string;
  projectRoot: string;
  outDir: string;
  tempOutDir: string;
  serverOutDir: string;
  staticOutDir: string;
  manifestOutDir: string;
  diagnostics: RanuDiagnostic[];
  pluginAliases?: readonly BuildPluginAlias[];
  pluginDefines?: Readonly<Record<string, string>>;
}
