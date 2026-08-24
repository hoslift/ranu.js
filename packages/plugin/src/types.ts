import type { RanuMode, RanuCommand, RouteKind, RenderMode } from '@ranu/core';
import type { RanuDiagnostic } from '@ranu/diagnostics';

export type PluginEnforce = 'pre' | 'normal' | 'post';

export interface PluginLogger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

export interface PluginSetupContext {
  readonly mode: RanuMode;
  readonly command: RanuCommand;
  readonly projectRoot: string;
  readonly ranuVersion: string;
  readonly pluginApiVersion: 1;
  readonly logger: PluginLogger;
}

export interface PluginHookContext {
  readonly pluginName: string;
  readonly mode: RanuMode;
  readonly command: RanuCommand;
  readonly projectRoot: string;
  readonly logger: PluginLogger;
}

export interface PluginRouteInfo {
  readonly routeId: string;
  readonly kind: RouteKind;
  readonly pathnameTemplate: string;
  readonly params: readonly string[];
  readonly renderMode?: RenderMode;
  readonly methods?: readonly string[];
  readonly metadata?: Record<string, unknown>;
}

export interface PluginBuildExtensionApi {
  readonly platform: 'node' | 'browser';
  readonly projectRoot: string;
  addAlias(find: string | RegExp, replacement: string): void;
  addDefine(definitions: Record<string, string>): void;
}

export interface PluginBuildContext extends PluginHookContext {
  readonly buildId: string;
  readonly routes: readonly PluginRouteInfo[];
}

export interface PluginBuildResult {
  readonly success: boolean;
  readonly buildId: string;
  readonly durationMs: number;
  readonly diagnostics: readonly RanuDiagnostic[];
}

export interface PluginDevContext extends PluginHookContext {
  readonly port?: number;
  readonly host?: string;
}

export interface PluginHooks {
  config?: (config: any, context: PluginHookContext) => any | Promise<any> | void | Promise<void>;
  configResolved?: (config: any, context: PluginHookContext) => void | Promise<void>;
  routes?: (
    routes: readonly PluginRouteInfo[],
    context: PluginHookContext,
  ) =>
    | Record<string, Record<string, unknown>>
    | Promise<Record<string, Record<string, unknown>>>
    | void
    | Promise<void>;
  route?: (
    route: PluginRouteInfo,
    context: PluginHookContext,
  ) => Record<string, unknown> | Promise<Record<string, unknown>> | void | Promise<void>;
  buildStart?: (context: PluginBuildContext) => void | Promise<void>;
  extendBuild?: (api: PluginBuildExtensionApi, context: PluginBuildContext) => void | Promise<void>;
  buildEnd?: (result: PluginBuildResult, context: PluginBuildContext) => void | Promise<void>;
  devStart?: (context: PluginDevContext) => void | Promise<void>;
  devEnd?: (context: PluginDevContext) => void | Promise<void>;
}

export interface RanuPluginDefinition {
  readonly name: string;
  readonly apiVersion: 1;
  readonly version?: string;
  readonly ranuVersion?: string;
  readonly enforce?: PluginEnforce;
  setup(context: PluginSetupContext): PluginHooks | Promise<PluginHooks> | void | Promise<void>;
}

export type RanuPlugin = RanuPluginDefinition | (() => RanuPluginDefinition);
