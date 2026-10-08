# Ranu.js Plugin Specification (Plugin API v1)

**Ranu.js** includes an extensible, type-safe Plugin Architecture exported via `@ranujs/core/plugin`.

Plugins allow developers, enterprise teams, and third-party partners to hook into the configuration lifecycle, inspect discovered routes, extend the build pipeline, and integrate development server features without modifying framework internals.

---

## 1. Defining a Plugin

Use the `definePlugin` helper to declare an authoritative Plugin API v1 plugin:

```typescript
// plugins/my-plugin.ts
import { definePlugin } from '@ranujs/core/plugin';

export function myPlugin(options = {}) {
  return definePlugin({
    name: 'ranu-plugin-example',
    apiVersion: 1,
    enforce: 'normal', // 'pre' | 'normal' | 'post'

    setup(context) {
      context.logger.info(`Initializing plugin for mode: ${context.mode}`);

      return {
        config(rawConfig, hookCtx) {
          // Transform user configuration before resolution
          return {
            ...rawConfig,
            server: {
              ...rawConfig.server,
              port: 3000,
            },
          };
        },

        buildStart(buildCtx) {
          buildCtx.logger.info(`Build initiated with ${buildCtx.routes.length} routes.`);
        },

        extendBuild(api, buildCtx) {
          // Inject build-time global definitions or path aliases
          api.addDefine({
            __BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
          });
          api.addAlias('~virtual-analytics', './lib/analytics.ts');
        },

        buildEnd(result, buildCtx) {
          buildCtx.logger.info(`Build completed in ${result.durationMs}ms`);
        },
      };
    },
  });
}
```

---

## 2. Plugin Contract Reference (`RanuPluginDefinition`)

```typescript
export interface RanuPluginDefinition {
  readonly name: string;
  readonly apiVersion: 1;
  readonly version?: string;
  readonly enforce?: 'pre' | 'normal' | 'post';
  setup(context: PluginSetupContext): PluginHooks | Promise<PluginHooks> | void | Promise<void>;
}
```

### Required Fields:
* **`name`**: Unique string identifying the plugin (e.g. `'ranu-plugin-pwa'`). Non-empty string required.
* **`apiVersion`**: Must be integer `1`. Ranu.js verifies compatibility at runtime and rejects mismatched API versions (`RANU_PLUGIN_INCOMPATIBLE`).
* **`setup(context)`**: Initialization function executed when the plugin is loaded. Receives `PluginSetupContext` and returns an object containing lifecycle hooks.

### Optional Fields:
* **`enforce`**: Controls execution order priority:
  * `'pre'`: Executes before standard plugins and core defaults.
  * `'normal'` (Default): Standard execution order.
  * `'post'`: Executes after all normal plugins have completed.

---

## 3. Setup Context (`PluginSetupContext`)

Passed to `setup()` during initialization:

```typescript
export interface PluginSetupContext {
  readonly mode: 'development' | 'production';
  readonly command: 'dev' | 'build' | 'start' | 'create' | 'deploy' | 'help' | 'version';
  readonly projectRoot: string;
  readonly ranuVersion: string;
  readonly pluginApiVersion: 1;
  readonly logger: PluginLogger;
}
```

---

## 4. Lifecycle Hooks (`PluginHooks`)

| Hook | Signature | Description |
| :--- | :--- | :--- |
| **`config`** | `(rawConfig, context) => RanuUserConfig` | Modifies or augments configuration before validation and freezing |
| **`configResolved`** | `(resolvedConfig, context) => void` | Inspects finalized, immutable configuration |
| **`routes`** | `(routes, context) => void` | Inspects full route tree discovered by the filesystem router |
| **`route`** | `(route, context) => void` | Intercepts or annotates an individual route |
| **`buildStart`** | `(context: PluginBuildContext) => void` | Triggered immediately before compilation in `ranu build` |
| **`extendBuild`** | `(api: PluginBuildExtensionApi, context) => void` | Injects compiler aliases (`addAlias`) or macro constants (`addDefine`) |
| **`buildEnd`** | `(result: PluginBuildResult, context) => void` | Triggered upon build completion with duration and diagnostic results |
| **`devStart`** | `(context: PluginDevContext) => void` | Triggered when the dev server starts listening |
| **`devEnd`** | `(context: PluginDevContext) => void` | Triggered when the dev server shuts down |

---

## 5. Registering Plugins in `ranu.config.ts`

To use plugins, add them to the `plugins` array in your `ranu.config.ts`:

```typescript
// ranu.config.ts
import { defineConfig } from '@ranujs/core/config';
import { myPlugin } from './plugins/my-plugin';

export default defineConfig({
  plugins: [
    myPlugin({ optionA: true }),
  ],
});
```

---

## 6. Publishing Community & Partner Plugins

When publishing reusable plugins to npm:
1. **Naming Convention:** Use `ranu-plugin-<name>` or `@org/ranu-plugin-<name>`.
2. **Peer Dependencies:** Declare `@ranujs/core: "*"` in your `peerDependencies`.
3. **TypeScript:** Export both the plugin factory function and its configuration options interface.
