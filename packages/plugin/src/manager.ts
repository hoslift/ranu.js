import type { RanuMode, RanuCommand } from '@ranu/core';
import type {
  RanuPlugin,
  RanuPluginDefinition,
  PluginSetupContext,
  PluginHookContext,
  PluginHooks,
  PluginRouteInfo,
  PluginBuildContext,
  PluginBuildExtensionApi,
  PluginBuildResult,
  PluginDevContext,
  PluginLogger,
} from './types.js';
import { definePlugin } from './define.js';
import { createPluginLogger } from './logger.js';

export interface PluginManagerOptions {
  mode?: RanuMode;
  command?: RanuCommand;
  projectRoot?: string;
  ranuVersion?: string;
}

interface ResolvedPluginInstance {
  readonly definition: RanuPluginDefinition;
  readonly logger: PluginLogger;
  hooks?: PluginHooks;
}

export class PluginManager {
  private readonly plugins: ResolvedPluginInstance[] = [];
  private readonly setupContext: PluginSetupContext;
  private setupPromise: Promise<void> | undefined;

  constructor(rawPlugins: readonly RanuPlugin[] = [], options: PluginManagerOptions = {}) {
    const mode = options.mode ?? 'production';
    const command = options.command ?? 'build';
    const projectRoot = options.projectRoot ?? process.cwd();
    const ranuVersion = options.ranuVersion ?? '0.0.0';

    this.setupContext = {
      mode,
      command,
      projectRoot,
      ranuVersion,
      pluginApiVersion: 1,
      logger: createPluginLogger('manager'),
    };

    // 1. Resolve and validate plugins
    const seenNames = new Set<string>();
    const pre: ResolvedPluginInstance[] = [];
    const normal: ResolvedPluginInstance[] = [];
    const post: ResolvedPluginInstance[] = [];

    for (const raw of rawPlugins) {
      const def = typeof raw === 'function' ? (raw as () => RanuPluginDefinition)() : raw;
      const validated = definePlugin(def);

      if (seenNames.has(validated.name)) {
        throw new Error(
          `RANU_PLUGIN_DUPLICATE: Duplicate plugin name "${validated.name}" registered. Each plugin name must be unique.`,
        );
      }
      seenNames.add(validated.name);

      const instance: ResolvedPluginInstance = {
        definition: validated,
        logger: createPluginLogger(validated.name),
      };

      const enforce = validated.enforce ?? 'normal';
      if (enforce === 'pre') {
        pre.push(instance);
      } else if (enforce === 'post') {
        post.push(instance);
      } else {
        normal.push(instance);
      }
    }

    // 2. Deterministic ordering: pre -> normal -> post (preserving registration order within tiers)
    this.plugins = [...pre, ...normal, ...post];
  }

  /**
   * Returns list of sorted plugin names.
   */
  getPluginNames(): string[] {
    return this.plugins.map((p) => p.definition.name);
  }

  /**
   * Returns number of registered plugins.
   */
  get count(): number {
    return this.plugins.length;
  }

  /**
   * Execute setup() for all registered plugins sequentially.
   */
  setup(): Promise<void> {
    this.setupPromise ??= this.initializePlugins();
    return this.setupPromise;
  }

  private async initializePlugins(): Promise<void> {
    for (const plugin of this.plugins) {
      try {
        const setupContext: PluginSetupContext = {
          ...this.setupContext,
          logger: plugin.logger,
        };
        const hooks = await plugin.definition.setup(setupContext);
        if (hooks && typeof hooks === 'object') {
          plugin.hooks = hooks;
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `RANU_PLUGIN_SETUP_ERROR: Plugin "${plugin.definition.name}" failed during setup(): ${message}`,
        );
      }
    }
  }

  private createHookContext(plugin: ResolvedPluginInstance): PluginHookContext {
    return {
      pluginName: plugin.definition.name,
      mode: this.setupContext.mode,
      command: this.setupContext.command,
      projectRoot: this.setupContext.projectRoot,
      logger: plugin.logger,
    };
  }

  /**
   * Executes the `config` hook across plugins sequentially.
   */
  async runConfig(initialConfig: Record<string, unknown>): Promise<Record<string, unknown>> {
    await this.setup();
    let currentConfig = { ...initialConfig };

    for (const plugin of this.plugins) {
      if (plugin.hooks?.config) {
        try {
          const ctx = this.createHookContext(plugin);
          const result = await plugin.hooks.config(currentConfig, ctx);
          if (result && typeof result === 'object' && !Array.isArray(result)) {
            currentConfig = {
              ...currentConfig,
              ...result,
            };
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(
            `RANU_PLUGIN_HOOK_ERROR: Plugin "${plugin.definition.name}" failed in "config" hook: ${message}`,
          );
        }
      }
    }

    return currentConfig;
  }

  /**
   * Executes the `configResolved` hook across plugins sequentially.
   */
  async runConfigResolved(resolvedConfig: Readonly<Record<string, unknown>>): Promise<void> {
    await this.setup();

    for (const plugin of this.plugins) {
      if (plugin.hooks?.configResolved) {
        try {
          const ctx = this.createHookContext(plugin);
          await plugin.hooks.configResolved(resolvedConfig, ctx);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(
            `RANU_PLUGIN_HOOK_ERROR: Plugin "${plugin.definition.name}" failed in "configResolved" hook: ${message}`,
          );
        }
      }
    }
  }

  /**
   * Executes the `routes` hook across plugins, collecting namespaced route metadata.
   */
  async runRoutes(
    routes: readonly PluginRouteInfo[],
  ): Promise<Record<string, Record<string, Record<string, unknown>>>> {
    await this.setup();
    const result: Record<string, Record<string, Record<string, unknown>>> = {};

    for (const plugin of this.plugins) {
      if (plugin.hooks?.routes) {
        try {
          const ctx = this.createHookContext(plugin);
          const metaByRoute = await plugin.hooks.routes(routes, ctx);
          if (metaByRoute && typeof metaByRoute === 'object') {
            for (const [routeId, meta] of Object.entries(metaByRoute)) {
              if (meta && typeof meta === 'object') {
                if (!result[routeId]) result[routeId] = {};
                result[routeId][plugin.definition.name] = {
                  ...(result[routeId][plugin.definition.name] ?? {}),
                  ...meta,
                };
              }
            }
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(
            `RANU_PLUGIN_HOOK_ERROR: Plugin "${plugin.definition.name}" failed in "routes" hook: ${message}`,
          );
        }
      }
    }

    return result;
  }

  /**
   * Executes the `route` hook across plugins for a single route.
   */
  async runRoute(route: PluginRouteInfo): Promise<Record<string, Record<string, unknown>>> {
    await this.setup();
    const result: Record<string, Record<string, unknown>> = {};

    for (const plugin of this.plugins) {
      if (plugin.hooks?.route) {
        try {
          const ctx = this.createHookContext(plugin);
          const meta = await plugin.hooks.route(route, ctx);
          if (meta && typeof meta === 'object') {
            result[plugin.definition.name] = {
              ...(result[plugin.definition.name] ?? {}),
              ...meta,
            };
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(
            `RANU_PLUGIN_HOOK_ERROR: Plugin "${plugin.definition.name}" failed in "route" hook: ${message}`,
          );
        }
      }
    }

    return result;
  }

  /**
   * Executes the `buildStart` hook across plugins sequentially.
   */
  async runBuildStart(context: PluginBuildContext): Promise<void> {
    await this.setup();

    for (const plugin of this.plugins) {
      if (plugin.hooks?.buildStart) {
        try {
          const pluginContext: PluginBuildContext = {
            ...context,
            pluginName: plugin.definition.name,
            logger: plugin.logger,
          };
          await plugin.hooks.buildStart(pluginContext);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(
            `RANU_PLUGIN_HOOK_ERROR: Plugin "${plugin.definition.name}" failed in "buildStart" hook: ${message}`,
          );
        }
      }
    }
  }

  /**
   * Executes the `extendBuild` hook across plugins sequentially.
   */
  async runExtendBuild(api: PluginBuildExtensionApi, context: PluginBuildContext): Promise<void> {
    await this.setup();

    for (const plugin of this.plugins) {
      if (plugin.hooks?.extendBuild) {
        try {
          const pluginContext: PluginBuildContext = {
            ...context,
            pluginName: plugin.definition.name,
            logger: plugin.logger,
          };
          await plugin.hooks.extendBuild(api, pluginContext);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(
            `RANU_PLUGIN_HOOK_ERROR: Plugin "${plugin.definition.name}" failed in "extendBuild" hook: ${message}`,
          );
        }
      }
    }
  }

  /**
   * Executes the `buildEnd` hook across plugins sequentially.
   */
  async runBuildEnd(result: PluginBuildResult, context: PluginBuildContext): Promise<void> {
    await this.setup();

    for (const plugin of this.plugins) {
      if (plugin.hooks?.buildEnd) {
        try {
          const pluginContext: PluginBuildContext = {
            ...context,
            pluginName: plugin.definition.name,
            logger: plugin.logger,
          };
          await plugin.hooks.buildEnd(result, pluginContext);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(
            `RANU_PLUGIN_HOOK_ERROR: Plugin "${plugin.definition.name}" failed in "buildEnd" hook: ${message}`,
          );
        }
      }
    }
  }

  /**
   * Executes the `devStart` hook across plugins sequentially.
   */
  async runDevStart(context: PluginDevContext): Promise<void> {
    await this.setup();

    for (const plugin of this.plugins) {
      if (plugin.hooks?.devStart) {
        try {
          const pluginContext: PluginDevContext = {
            ...context,
            pluginName: plugin.definition.name,
            logger: plugin.logger,
          };
          await plugin.hooks.devStart(pluginContext);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(
            `RANU_PLUGIN_HOOK_ERROR: Plugin "${plugin.definition.name}" failed in "devStart" hook: ${message}`,
          );
        }
      }
    }
  }

  /**
   * Executes the `devEnd` hook across plugins sequentially.
   */
  async runDevEnd(context: PluginDevContext): Promise<void> {
    await this.setup();

    for (const plugin of this.plugins) {
      if (plugin.hooks?.devEnd) {
        try {
          const pluginContext: PluginDevContext = {
            ...context,
            pluginName: plugin.definition.name,
            logger: plugin.logger,
          };
          await plugin.hooks.devEnd(pluginContext);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(
            `RANU_PLUGIN_HOOK_ERROR: Plugin "${plugin.definition.name}" failed in "devEnd" hook: ${message}`,
          );
        }
      }
    }
  }
}
