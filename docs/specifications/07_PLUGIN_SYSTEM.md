# 07_PLUGIN_SYSTEM.md

**Project:** Ranu.js — JavaScript/TypeScript Full-Stack Web Framework  
**Document Type:** Plugin & Extension System Specification  
**Status:** Development Baseline  
**Date:** 2026-08-10  
**Depends On:** `00_FRAMEWORK_VISION.md`, `01_PRODUCT_REQUIREMENTS.md`, `02_FRAMEWORK_ARCHITECTURE.md`, `03_ROUTING_SPECIFICATION.md`, `04_RENDERING_MODEL.md`, `05_SERVER_RUNTIME_SPEC.md`, `06_BUILD_SYSTEM.md`  
**Primary Language:** TypeScript / JavaScript  
**Primary V1 Runtime:** Node.js  
**Plugin API Scope:** Intentionally limited, versioned, capability-based

---

# 1. Purpose

This document defines the Ranu.js V1 plugin and extension system.

It specifies:

- the plugin contract;
- plugin identity and metadata;
- plugin registration;
- plugin configuration;
- lifecycle hooks;
- hook ordering;
- configuration hooks;
- route metadata hooks;
- build lifecycle hooks;
- development lifecycle hooks;
- controlled build-tool extension;
- plugin diagnostics;
- plugin compatibility/versioning;
- plugin isolation boundaries;
- server/client safety;
- plugin-generated files;
- plugin dependencies;
- plugin conflicts;
- plugin capabilities;
- plugin testing;
- first-party vs third-party plugins;
- future extension points;
- features intentionally excluded from V1.

The plugin system exists to extend Ranu.js through stable contracts without making private framework internals part of the public ecosystem API.

---

# 2. Plugin System Objective

Ranu.js must support a structured extension model while keeping the framework core small and replaceable.

The relationship is:

```text
Application
    ↓
Ranu.js Configuration
    ↓
Plugin Registration
    ↓
Plugin Manager
    ↓
Validated Plugin Hooks
    ↓
Framework Subsystems
    ├── Config
    ├── Router Metadata
    ├── Build
    └── Development
```

Plugins do not become an alternative framework kernel.

They extend defined surfaces only.

---

# 3. V1 Plugin Philosophy

Ranu.js V1 deliberately provides a small plugin API.

The initial stable hook families are:

```text
configuration
route metadata
build lifecycle
development lifecycle
```

V1 does not attempt to expose every internal framework subsystem.

The plugin API should grow only when real extension requirements demonstrate a stable abstraction.

---

# 4. Plugin Principles

## PLG-P01 — Stable Contracts

Plugins use documented Ranu.js contracts rather than undocumented internal imports.

## PLG-P02 — Explicit Registration

A plugin affects an application only when explicitly registered or installed through a future explicitly documented mechanism.

## PLG-P03 — Limited Surface

V1 exposes only extension points Ranu.js can support consistently.

## PLG-P04 — Deterministic Ordering

Plugin execution order must be deterministic.

## PLG-P05 — Identifiable Failures

Plugin failures must identify the responsible plugin whenever possible.

## PLG-P06 — Versioned Compatibility

Plugin compatibility with the Ranu.js Plugin API is explicit and machine-checkable where practical.

## PLG-P07 — Boundary Preservation

Plugins cannot silently bypass server/client, routing, runtime, or reserved-path rules.

## PLG-P08 — No Hidden Provider Lock-In

Core plugin contracts remain deployment-provider neutral.

## PLG-P09 — Toolchain Abstraction

Plugins primarily use Ranu.js extension APIs, not raw underlying bundler internals.

## PLG-P10 — Inspectability

Plugin effects should be observable through diagnostics, manifests, debug output, or generated metadata where appropriate.

---

# 5. Plugin vs Adapter

Ranu.js distinguishes:

```text
Plugin
Adapter
```

A plugin extends an existing Ranu.js subsystem through defined hooks.

An adapter implements a replaceable architectural boundary.

Examples:

```text
Plugin
  route metadata extension
  build hook
  dev tooling integration
  code generation

Adapter
  React renderer adapter
  Node runtime adapter
  deployment adapter
  future UI adapter
```

Plugins must not replace adapter contracts through undocumented mutation.

---

# 6. Plugin vs Application Library

A normal application package does not need to be an Ranu.js plugin.

Example:

```ts
import { createClient } from "some-database";
```

is an ordinary library.

A package needs an Ranu.js plugin only when it must integrate with Ranu.js lifecycle or framework metadata.

This distinction prevents unnecessary framework coupling.

---

# 7. Plugin Package Shape

A plugin is a JavaScript/TypeScript package exporting an Ranu.js plugin factory or plugin object.

Recommended public pattern:

```ts
import { definePlugin } from "Ranu.js/plugin";

export default definePlugin({
  name: "example-plugin",
  apiVersion: 1,

  setup(options) {
    return {
      // hooks
    };
  }
});
```

A plugin may also export a factory for typed user options.

---

# 8. Plugin Factory Pattern

Recommended for configurable plugins:

```ts
import { definePlugin } from "Ranu.js/plugin";

export interface ExamplePluginOptions {
  enabled?: boolean;
}

export default function examplePlugin(
  options: ExamplePluginOptions = {}
) {
  return definePlugin({
    name: "example-plugin",
    apiVersion: 1,

    setup() {
      return {
        // hooks using options
      };
    }
  });
}
```

The application registers the resulting plugin instance.

---

# 9. Plugin Registration

Plugins are registered in:

```text
ranu.config.ts
```

Conceptual:

```ts
import { defineConfig } from "Ranu.js/config";
import examplePlugin from "hfx-example-plugin";

export default defineConfig({
  plugins: [
    examplePlugin({
      enabled: true
    })
  ]
});
```

Registration order is meaningful as defined later in this specification.

---

# 10. No Automatic Package Scanning

Ranu.js V1 must not scan `node_modules` and automatically activate packages merely because they look like Ranu.js plugins.

This prevents:

- hidden behavior;
- supply-chain surprise;
- non-deterministic activation;
- accidental configuration.

Plugins require explicit application registration.

---

# 11. Plugin Identity

Every plugin must have a stable name.

Example:

```text
@company/hfx-plugin-auth
```

or:

```text
hfx-plugin-example
```

The plugin `name` is used in:

- diagnostics;
- debug output;
- hook ownership;
- conflict messages;
- generated metadata.

---

# 12. Plugin Name Rules

Plugin names must:

- be non-empty;
- be stable;
- use a safe normalized string format;
- not impersonate Ranu.js internal reserved identities;
- not contain path traversal/control characters.

Scoped npm-style names are allowed.

---

# 13. Duplicate Plugin Names

Two registered plugin instances with the same plugin name are rejected by default.

Reason:

```text
diagnostics and hook ownership become ambiguous
```

A future explicit `multiInstance` capability may allow repeated instances for specific plugins.

V1 default:

```text
one active instance per plugin name
```

---

# 14. Plugin Metadata

Conceptual:

```ts
interface RanuPluginDefinition {
  name: string;
  apiVersion: number;
  version?: string;
  Ranu.js?: string;
  enforce?: "pre" | "normal" | "post";
  setup(context: PluginSetupContext): PluginHooks | void;
}
```

`version` is informational plugin package/version metadata.

`apiVersion` identifies the Ranu.js plugin contract.

---

# 15. Plugin API Version

V1 plugin API version:

```text
1
```

Conceptual:

```ts
apiVersion: 1
```

Ranu.js must reject unsupported plugin API versions with a clear compatibility error.

---

# 16. Framework Version Compatibility

A plugin may optionally declare an Ranu.js framework compatibility range.

Conceptual:

```ts
Ranu.js: "^1.0.0"
```

If present, Ranu.js validates it before plugin setup.

The exact semver parsing mechanism is implementation-defined but must be deterministic.

---

# 17. Compatibility Failure

Example diagnostic:

```text
RANU_PLUGIN_INCOMPATIBLE

Plugin:
  hfx-plugin-example

Plugin API:
  2

Supported by this Ranu.js version:
  1

Install a compatible plugin version or update Ranu.js.
```

The framework must not attempt to execute an incompatible plugin and hope it works.

---

# 18. `definePlugin()`

Ranu.js provides:

```ts
definePlugin(...)
```

primarily for:

- typing;
- metadata validation;
- future compatibility;
- improved diagnostics.

It should not perform hidden global registration.

---

# 19. Plugin Setup Context

Conceptual:

```ts
interface PluginSetupContext {
  mode: "development" | "production";
  command: "dev" | "build" | "start";
  projectRoot: string;
  hfxVersion: string;
  pluginApiVersion: number;
  logger: PluginLogger;
}
```

Only fields Ranu.js can support stably should be public.

Private compiler/bundler instances are not part of this context.

---

# 20. Setup Timing

Plugin `setup()` runs after:

```text
initial environment resolution
+
basic config loading
```

but before final plugin-dependent configuration/build initialization.

The plugin manager must establish a deterministic setup phase.

---

# 21. Setup Failure

If plugin setup throws:

```text
build/dev startup fails
```

with the plugin identity included.

Ranu.js must preserve the original cause internally while producing a useful framework diagnostic.

---

# 22. Plugin Hooks

Conceptual V1 hook object:

```ts
interface PluginHooks {
  config?: ConfigHook;
  configResolved?: ConfigResolvedHook;

  routes?: RoutesHook;
  route?: RouteHook;

  buildStart?: BuildStartHook;
  buildEnd?: BuildEndHook;

  devStart?: DevStartHook;
  devEnd?: DevEndHook;

  extendBuild?: ExtendBuildHook;
}
```

The exact TypeScript names may be refined during implementation, but V1 hook scope must remain consistent with this specification.

---

# 23. Hook Families

V1 stable hook families are:

```text
A. Configuration
B. Route Metadata
C. Build Lifecycle
D. Development Lifecycle
E. Controlled Build Extension
```

Anything outside these families is not automatically part of the V1 public plugin API.

---

# 24. Hook Ordering

Plugin ordering is deterministic.

Default ordering:

```text
pre plugins
→ normal plugins
→ post plugins
```

Within each group:

```text
registration order
```

This produces a simple, inspectable ordering model.

---

# 25. `enforce`

A plugin may declare:

```ts
enforce: "pre"
```

or:

```ts
enforce: "post"
```

If omitted:

```text
normal
```

This is intended for genuine ordering requirements, not arbitrary priority numbers.

---

# 26. No Arbitrary Numeric Priority

V1 does not expose unrestricted numeric hook priority.

Reason:

- difficult ecosystem coordination;
- hidden precedence wars;
- harder debugging.

The three-phase ordering model is sufficient for V1.

---

# 27. Hook Execution

For each hook:

```text
plugins execute sequentially in resolved order
```

unless the hook contract explicitly permits parallel execution.

V1 should prefer sequential execution for hooks that may transform shared state.

This maximizes deterministic behavior.

---

# 28. Async Hooks

All lifecycle hooks may return promises.

Conceptual:

```ts
async buildStart(context) {
  await prepareSomething();
}
```

The plugin manager awaits them.

---

# 29. Hook Timeout

Ranu.js V1 does not need a hard plugin hook timeout by default.

Long-running hooks should be visible in verbose/debug diagnostics.

Future timeout controls may be introduced if required.

---

# 30. Configuration Hook

A plugin may contribute supported Ranu.js configuration before final normalization.

Conceptual:

```ts
config(currentConfig, context) {
  return {
    // partial supported Ranu.js config
  };
}
```

The returned configuration is merged using Ranu.js-defined merge semantics.

---

# 31. Configuration Merge

Plugin config does not receive unrestricted object mutation rights.

Ranu.js should merge returned supported configuration through its normalized config system.

Unknown/forbidden keys must still fail validation.

---

# 32. User Config Precedence

User intent must remain predictable.

Recommended precedence:

```text
Ranu.js defaults
→ pre/normal plugin defaults/contributions
→ explicit user configuration
→ post plugin validation/allowed contribution
```

However, hooks that intentionally transform values must do so through documented fields.

Plugins must not silently override explicit security-sensitive user configuration without a documented contract.

---

# 33. `configResolved`

After final config normalization, plugins may inspect the resolved configuration.

Conceptual:

```ts
configResolved(config) {
  // read-only observation / setup
}
```

The resolved config passed to this hook should be treated as read-only.

---

# 34. Resolved Config Mutation

Plugins must not mutate resolved config objects in place.

Ranu.js may freeze development objects to detect accidental mutation.

Any post-resolution change must use an explicit extension API.

---

# 35. Route Metadata Extension

Plugins may inspect and extend route metadata.

They must not redefine core filesystem routing semantics.

Conceptual:

```ts
route(route, context) {
  return {
    metadata: {
      ...route.metadata,
      pluginValue: "..."
    }
  };
}
```

---

# 36. Core Route Identity Is Immutable

Plugins cannot change:

```text
route ID
route kind
filesystem ownership
compiled pathname pattern
dynamic segment meaning
route precedence
layout ancestry
reserved namespace behavior
```

through ordinary V1 route metadata hooks.

These are owned by the Ranu.js router.

---

# 37. Allowed Route Metadata

Plugin route metadata may include namespaced data for:

- deployment hints;
- code generation;
- documentation;
- plugin-specific behavior;
- build analysis;
- application services.

It must not alter locked router semantics.

---

# 38. Metadata Namespace

Plugin-added route metadata must be namespaced by plugin identity.

Conceptual:

```json
{
  "plugins": {
    "hfx-plugin-example": {
      "feature": true
    }
  }
}
```

This prevents collisions between unrelated plugins.

---

# 39. Metadata Serialization

Any plugin metadata that enters build manifests must be serializable.

Allowed conceptual values:

```text
null
boolean
number
string
arrays
plain objects
```

Functions, class instances, open file handles, database clients, and other process objects must not be serialized into manifests.

---

# 40. Private Plugin Runtime State

Plugins may retain private in-process state during dev/build setup.

That state is not automatically transferred into production runtime.

If production runtime data is required, the plugin must emit serializable metadata or generated modules through supported APIs.

---

# 41. Route Collection Hook

A `routes` hook may inspect the compiled route collection after core routing validation.

Conceptual:

```ts
routes(routes, context) {
  // inspect or return plugin metadata contributions
}
```

It cannot add arbitrary filesystem-style core routes in V1.

---

# 42. Virtual/Application Routes

General third-party creation of arbitrary Ranu.js page/API routes is deferred from the stable V1 plugin contract.

Reason:

It would expose deep router/render/runtime semantics before those extension contracts are mature.

First-party/internal systems may use private mechanisms, but they are not third-party compatibility promises.

---

# 43. Route Removal

Plugins cannot silently remove application routes in V1.

If a plugin needs to disable behavior, it should use application configuration or plugin-owned runtime logic rather than deleting router output.

---

# 44. Route Metadata Conflict

Two plugins may independently write only to their own namespaced metadata.

Therefore direct metadata key conflicts should be structurally avoided.

If a shared standardized metadata key is introduced later, Ranu.js must define its merge/ownership semantics explicitly.

---

# 45. Build Start Hook

Conceptual:

```ts
buildStart(context) {
  // preparation before graph compilation/bundling
}
```

Potential uses:

- validate plugin-specific configuration;
- prepare generated source;
- inspect route metadata;
- initialize plugin build state.

---

# 46. Build Start Context

Conceptual:

```ts
interface BuildStartContext {
  mode: "production";
  projectRoot: string;
  buildId: string;
  routes: readonly PluginRouteInfo[];
  emitFile(...): PluginEmittedFile;
  logger: PluginLogger;
}
```

The exact fields must remain narrower than Ranu.js private build internals.

---

# 47. Build End Hook

Conceptual:

```ts
buildEnd(result, context) {
  // observe completed build or finalize plugin-owned artifacts
}
```

It runs only after core build stages have reached the defined build-end point.

Build success is not declared until required plugin build-end hooks complete.

---

# 48. Build Failure Hook

A dedicated `buildError`/`buildFailed` hook may be added if implementation needs it.

It is not required for the minimal stable V1 contract.

Plugins must not depend on a failure hook for essential cleanup that the process itself can handle.

---

# 49. Plugin Build Failure

If a required plugin hook fails during production build:

```text
Ranu.js build fails
```

Ranu.js must not silently disable the plugin and produce an incomplete deployment artifact.

---

# 50. Development Start Hook

Conceptual:

```ts
devStart(context) {
  // initialize dev-only integration
}
```

Potential uses:

- plugin diagnostics;
- generated development metadata;
- dev helper services;
- file watching registration through controlled APIs.

---

# 51. Development End Hook

Conceptual:

```ts
devEnd(context) {
  // cleanup dev plugin resources
}
```

It may run on graceful dev shutdown/restart.

Plugins must still tolerate abrupt process termination.

---

# 52. Dev Watch Registration

Ranu.js may expose a controlled watcher API.

Conceptual:

```ts
context.watch.add("content/**/*.md");
```

When matching files change, the plugin may request:

```text
plugin regeneration
route metadata refresh
full reload
```

according to supported APIs.

---

# 53. Watch Root Safety

Plugin watch paths must resolve within allowed project/workspace roots unless Ranu.js explicitly permits external paths.

This avoids accidental watching of entire disks or sensitive system directories.

---

# 54. Plugin Dev Invalidations

A plugin may request a documented invalidation type.

Conceptual:

```text
invalidatePlugin
invalidateRoutes
invalidateBuildModule
fullReload
```

Exact V1 APIs should remain minimal.

Plugins must not mutate private HMR caches directly.

---

# 55. Development Plugin Failure

A plugin failure in a required dev hook should surface as an Ranu.js development error.

The dev server may remain alive if the failure can be safely isolated, but the affected application state must not be represented as healthy.

---

# 56. Controlled Build Extension

Ranu.js may use Vite or another bundler internally.

V1 may expose a controlled build extension hook rather than the entire bundler instance.

Conceptual:

```ts
extendBuild(api) {
  api.alias(...);
  api.define(...);
  api.transform(...);
}
```

Only supported operations become Ranu.js compatibility guarantees.

---

# 57. No Raw Bundler as Default API

Plugins must not receive:

```text
raw Vite server
raw Rollup build object
raw esbuild context
```

as the primary stable V1 contract.

Doing so would make Ranu.js plugin compatibility equivalent to the underlying toolchain.

---

# 58. Controlled Vite Compatibility

If Ranu.js V1 uses Vite internally, Ranu.js may provide an explicit escape hatch for compatible Vite plugins.

Conceptual:

```ts
build: {
  vitePlugins: [...]
}
```

or a plugin extension method.

This is a lower-level compatibility surface.

It must be clearly distinguished from the stable Ranu.js Plugin API.

---

# 59. Vite Escape Hatch Stability

Raw/controlled Vite compatibility is not guaranteed to survive an Ranu.js internal bundler replacement without migration.

Ranu.js-owned plugin hooks are the preferred long-term extension API.

---

# 60. Build Transform Hook

If Ranu.js exposes a generic transform hook, it must use an Ranu.js-owned contract.

Conceptual:

```ts
transform(code, id, context) {
  return {
    code,
    map
  };
}
```

This hook is optional for minimal V1 and should only ship if required by real plugin use cases.

---

# 61. Transform Scope

A transform plugin must be able to declare its scope:

```text
server
client
both
development
production
```

Ranu.js must not automatically apply server-specific transforms to browser modules.

---

# 62. Transform Boundary Safety

Transforms may not disable Ranu.js server/client classification or secretly convert server-only imports into browser code.

After transforms, Ranu.js must still perform required boundary validation.

---

# 63. Virtual Modules

Plugins may eventually need generated virtual modules.

If V1 exposes them, registration must occur through Ranu.js:

```ts
api.virtualModule(id, loader)
```

Plugin virtual IDs must be namespaced.

Example:

```text
virtual:hfx-plugin-example/config
```

---

# 64. Virtual Module Security

A virtual module marked client-capable must not expose private plugin/server data.

Ranu.js graph classification applies to virtual modules exactly as it does to source modules.

---

# 65. Generated Files

V1 should support plugin-generated files through a controlled generated-output API.

Plugins must not write arbitrary files into `.ranu/build/` behind the build system's back.

Conceptual:

```ts
context.emitFile({
  type: "asset",
  name: "plugin-data.json",
  contents: "..."
});
```

---

# 66. Generated File Ownership

Every emitted file is associated with the emitting plugin.

Ranu.js may record this ownership for:

- diagnostics;
- cleanup;
- conflict detection;
- debug output.

---

# 67. Generated File Paths

Plugins request logical output names/categories.

Ranu.js decides final physical output paths where possible.

This prevents plugins from depending on private `.ranu/build/` layout.

---

# 68. Generated Public Assets

A plugin may emit a public/browser asset only through an explicit public emission API.

Ranu.js must treat emitted public content as part of the browser security boundary.

Private plugin state must never be published automatically.

---

# 69. Generated Server Assets

Server-only generated modules/data may be emitted into server build output.

They must not receive `/_ranu/` public URLs unless explicitly declared public.

---

# 70. File Collision

If two plugins request the same exclusive logical output path/name, Ranu.js must detect the collision.

It must not let last-writer-wins silently overwrite artifacts.

---

# 71. Plugin Configuration

A plugin's application-specific options belong to the plugin factory.

Example:

```ts
analyticsPlugin({
  endpoint: "...",
  enabled: true
})
```

Ranu.js does not require all third-party plugin settings to be placed into a global untyped `plugins` object.

---

# 72. Typed Plugin Options

Plugin authors should expose TypeScript option interfaces.

Ranu.js's `definePlugin()` and config typing should preserve plugin option inference where practical.

---

# 73. Plugin Option Validation

A plugin is responsible for validating its own semantic options.

Ranu.js validates the plugin contract itself.

Plugin validation failures should use the plugin logger/diagnostic API so errors identify ownership.

---

# 74. Plugin Logger

Plugins receive an Ranu.js logger.

Conceptual:

```ts
context.logger.info(...)
context.logger.warn(...)
context.logger.error(...)
context.logger.debug(...)
```

Messages are automatically tagged with plugin identity.

---

# 75. No Direct Console Requirement

Plugins may technically use `console`, but official guidance should prefer the Ranu.js logger.

The Ranu.js logger enables:

- consistent formatting;
- plugin labels;
- debug filtering;
- future structured diagnostics.

---

# 76. Plugin Diagnostics

Plugins may emit structured diagnostics.

Conceptual:

```ts
context.diagnostics.error({
  code: "EXAMPLE_INVALID_CONFIG",
  message: "...",
  file: "...",
  hint: "..."
});
```

Ranu.js prefixes/namespaces plugin diagnostic identity where necessary.

---

# 77. Diagnostic Namespace

Third-party plugin codes should be namespaced.

Conceptual:

```text
PLUGIN[example-plugin]/INVALID_CONFIG
```

or equivalent.

Plugins must not claim reserved core codes such as:

```text
RANU_BUILD_*
RANU_SERVER_*
RANU_ROUTE_*
```

---

# 78. Secret-Safe Diagnostics

Plugins must not intentionally print secrets.

Ranu.js's logger may apply common redaction rules, but plugin authors remain responsible for not serializing arbitrary sensitive objects into messages.

---

# 79. Plugin Context Paths

Any filesystem path APIs exposed to plugins must distinguish:

```text
project root
plugin-owned generated temp/cache area
build emission API
```

Plugins should not need to know private Ranu.js output paths.

---

# 80. Plugin Cache

Ranu.js may provide a plugin-owned disposable cache directory.

Conceptual:

```text
.ranu/cache/plugins/<plugin-id>/
```

Plugins must treat it as disposable.

It cannot be used as the sole durable application datastore.

---

# 81. Cache Ownership

A plugin may read/write only its own Ranu.js-provided cache area through supported APIs.

Direct cross-plugin cache coupling is unsupported.

---

# 82. Cache Invalidation

Plugin cache keys must include plugin version/config/source inputs as appropriate.

Ranu.js may invalidate all plugin caches when Plugin API/build compatibility changes.

Correctness must not depend on stale cache reuse.

---

# 83. Persistent Application Data

The Ranu.js plugin system is not a database.

Plugins needing persistent application state should use an explicit storage/database service.

`.ranu/` must not contain irreplaceable user data.

---

# 84. Plugin Dependencies

A plugin may depend on ordinary npm packages.

Those dependencies follow normal package manager resolution.

Ranu.js does not create a separate plugin package registry in V1.

---

# 85. Plugin-to-Plugin Dependencies

A plugin may optionally declare another Ranu.js plugin dependency.

Conceptual:

```ts
requires: [
  {
    name: "hfx-plugin-base",
    version: "^1.0.0"
  }
]
```

This is useful but may be deferred if not required for the minimal implementation.

---

# 86. Missing Plugin Dependency

If explicit plugin dependency metadata ships in V1 and a required plugin is missing:

```text
startup/build fails before hooks execute
```

The error identifies both plugins.

---

# 87. Plugin Ordering Dependencies

V1 should avoid complex `before`/`after` dependency graphs unless required.

Primary ordering remains:

```text
enforce phase
+
registration order
```

Plugin authors should not create fragile ordering networks.

---

# 88. Conflict Declaration

A plugin may optionally declare known incompatible plugins.

Conceptual:

```ts
conflicts: ["hfx-plugin-other"]
```

If implemented, Ranu.js reports the conflict before execution.

This feature is optional for initial V1.

---

# 89. Plugin Capabilities

Ranu.js may describe plugin capabilities for diagnostics.

Conceptual:

```text
config
routes
build
dev
build-extension
```

Capabilities are derived from registered hooks or explicitly declared.

They are not security permissions in V1.

---

# 90. No Security Sandbox

Ranu.js plugins execute as trusted Node.js code during config/dev/build.

They may have the same operating-system permissions as the Ranu.js process.

The plugin system is not a sandbox.

Installing/registering a plugin is equivalent to trusting executable package code.

---

# 91. No Permission Prompt System

V1 does not implement browser-style plugin permission prompts for:

```text
filesystem
network
environment
process
```

Such a system would require a real execution sandbox.

Plugin trust is handled through package selection and application ownership.

---

# 92. Plugin Supply-Chain Guidance

Official documentation should recommend:

- install plugins from trusted sources;
- review package ownership;
- pin/lock dependencies;
- review plugin updates;
- use lockfiles;
- avoid unnecessary plugins.

Ranu.js cannot make arbitrary npm package code safe merely by calling it a plugin.

---

# 93. Server/Client Boundary

Plugin-generated/transformed code is subject to the same build boundary rules as application code.

A plugin cannot mark private server code as browser-safe merely to bypass a build error.

---

# 94. Environment Variables

Plugins may read build/server environment variables during Node execution.

They must not expose private values to browser output.

Any plugin-generated client code may contain only explicitly public/safe data.

---

# 95. `RANU_PUBLIC_*`

Ranu.js public environment rules apply to plugin-generated browser modules.

Plugins may provide their own explicit safe public configuration, but such values become browser-visible and must be treated as public.

---

# 96. Plugin Runtime Code

The stable V1 Plugin API primarily operates during:

```text
config
development
build
```

It does not automatically create per-request runtime hooks.

This is intentional.

---

# 97. Server Middleware Plugins

The framework vision includes server middleware extension as a future plugin use case.

However, arbitrary third-party runtime middleware injection is not part of the minimal stable V1 hook set unless an explicit runtime hook contract is added.

Application `middleware.ts` remains the V1 public runtime middleware mechanism.

---

# 98. Why Runtime Plugin Hooks Are Deferred

Runtime hooks require stable decisions around:

- request ordering;
- security;
- response commitment;
- streaming;
- deployment adapters;
- serverless lifecycle;
- performance.

Exposing them prematurely would make the runtime architecture difficult to evolve.

---

# 99. Application Services Plugins

Future plugins may integrate:

```text
authentication
databases
caching
email
storage
queues
observability
```

In V1, these packages may use ordinary libraries plus config/build hooks.

They must not require undocumented access to Ranu.js internals.

---

# 100. Deployment Plugins vs Deployment Adapters

Deployment integration is primarily an adapter responsibility.

A deployment adapter consumes Ranu.js production artifacts/manifests and maps them to a target.

A plugin may assist configuration/build metadata, but it must not redefine the deployment adapter contract.

`08_DEPLOYMENT_ADAPTERS.md` owns that architecture.

---

# 101. Renderer Plugins vs Renderer Adapters

A plugin cannot replace React rendering through a build hook.

Alternative UI/rendering systems belong behind the renderer/UI adapter architecture.

This preserves Ranu.js's UI-agnostic core goal.

---

# 102. Router Plugins

Plugins may enrich route metadata but cannot redefine route parsing or URL precedence in V1.

Future router extension points require a dedicated specification and compatibility contract.

---

# 103. Compiler Plugins

General compiler AST mutation is not a guaranteed V1 public API.

If controlled source transforms are exposed, they belong to the build extension surface and remain subject to Ranu.js invariants.

---

# 104. CLI Plugins

Arbitrary third-party CLI command registration is deferred.

`09_CLI_SPECIFICATION.md` may define future command extension boundaries.

V1 plugins must not monkey-patch the ranu CLI command parser.

---

# 105. Config Schema Extensions

Plugins may validate their own factory options.

They do not inject arbitrary keys into Ranu.js core config schema unless a documented namespaced extension API is provided.

This prevents global config namespace pollution.

---

# 106. Plugin Namespaced Config

If Ranu.js later supports config-owned plugin namespaces, they should be namespaced by plugin identity.

Example conceptual:

```ts
pluginConfig: {
  "hfx-plugin-example": {}
}
```

The factory-option pattern remains preferred for V1.

---

# 107. Hook Context Immutability

Shared framework state passed to observation hooks should be:

```text
readonly
or
immutable snapshots
```

where practical.

Plugins return contributions instead of mutating framework-owned objects.

---

# 108. Transactional Contributions

For critical metadata/config transformations, Ranu.js should collect and validate plugin contributions before committing them.

A failing plugin must not leave half-mutated framework state.

---

# 109. Plugin Cleanup

Plugins that open resources during development should close them in `devEnd()` where possible.

Build hooks should avoid leaving background handles that prevent process exit.

---

# 110. Process Exit

A plugin that leaves timers/sockets open after build completion may prevent Node from exiting.

Ranu.js debug diagnostics should help identify open plugin resources where feasible, but plugin authors remain responsible for cleanup.

---

# 111. Build Artifact Ownership

Plugin artifacts become part of the Ranu.js build only after Ranu.js accepts them through supported emission APIs.

Directly writing into build directories is unsupported and may be overwritten/removed.

---

# 112. Artifact Manifesting

Public/server plugin artifacts required at runtime should be represented in Ranu.js-owned manifest metadata or generated module references.

The runtime/deployment system must not discover them by scanning arbitrary plugin folders.

---

# 113. Plugin Manifest Metadata

Ranu.js may include a production plugin summary:

```json
{
  "plugins": [
    {
      "name": "hfx-plugin-example",
      "version": "1.2.0",
      "apiVersion": 1
    }
  ]
}
```

This metadata must not include secrets or plugin options by default.

---

# 114. Production Plugin Execution

A plugin's build-time `setup()` does not imply the plugin package must execute at production request time.

If runtime code is needed, it must be explicitly bundled/referenced as server/client application code through supported mechanisms.

---

# 115. Production Dependency Tracing

If a plugin contributes server runtime modules, those modules/dependencies must participate in the normal server dependency tracing/bundling rules.

Plugins cannot assume their entire npm package directory will be copied to production.

---

# 116. Plugin Package Resolution

Plugin packages are resolved from the application/workspace dependency graph using Node/package-manager compatible resolution.

Ranu.js should report the resolved plugin package/version in debug mode.

---

# 117. ESM Plugins

ESM is the preferred plugin module format.

Ranu.js may support CommonJS plugin packages through normal Node/toolchain interop where practical.

The stable plugin object contract remains the same.

---

# 118. TypeScript Plugin Source

Published plugins should normally ship executable JavaScript plus type declarations.

Workspace-local plugin source may be TypeScript if Ranu.js config loading/toolchain supports it.

Production applications must not depend on runtime TypeScript execution after build.

---

# 119. First-Party Plugins

Official Ranu.js plugins must use the same public plugin contracts whenever practical.

This tests whether the public API is sufficient.

Internal-only hooks must be clearly marked internal and must not be presented as third-party APIs.

---

# 120. First-Party Privilege

If an official plugin requires privileged internal access, that is not automatically evidence that third-party plugins receive the same access.

The distinction must be explicit in source/docs.

---

# 121. Plugin Compatibility Policy

Within an Ranu.js major version, Plugin API version 1 should remain backwards-compatible whenever practical.

Breaking Plugin API changes require:

- a new Plugin API version; or
- an Ranu.js major-version migration with explicit compatibility handling.

---

# 122. Deprecation

Plugin hooks/options may be deprecated before removal.

Development/build should warn with:

```text
plugin name
deprecated API
replacement
planned removal version where known
```

Deprecation warnings must not reveal plugin private configuration values.

---

# 123. Unknown Hooks

A plugin returning unsupported hook names should fail validation or warn as a likely authoring error.

Ranu.js must not silently ignore misspelled critical hooks.

Example:

```text
buildStarts
```

instead of:

```text
buildStart
```

should be detectable.

---

# 124. Unknown Plugin Fields

Plugin metadata should be validated.

Ranu.js may allow explicitly documented extension metadata, but core fields must not accept arbitrary malformed types.

---

# 125. Plugin Debug Mode

Ranu.js debug output should be able to show:

```text
registered plugins
resolved order
plugin versions
Plugin API versions
hook families
hook execution timing
generated artifact ownership
route metadata contributions
```

without printing secret plugin options.

---

# 126. Plugin Timing Diagnostics

Verbose/debug build may report slow hooks.

Example:

```text
Plugin hfx-plugin-content
  buildStart: 2.8s
```

This helps identify build performance problems.

It should not change hook execution behavior.

---

# 127. Plugin Failure Diagnostic

Example:

```text
RANU_PLUGIN_HOOK_FAILED

Plugin:
  hfx-plugin-content

Hook:
  buildStart

Cause:
  Content directory could not be read.

File:
  content/docs

The production build was stopped.
```

---

# 128. Plugin Duplicate Diagnostic

Example:

```text
RANU_PLUGIN_DUPLICATE

Plugin "hfx-plugin-example" was registered more than once.

V1 allows one active instance per plugin name.
```

---

# 129. Plugin Invalid Definition Diagnostic

Example:

```text
RANU_PLUGIN_INVALID

Plugin definition is invalid.

Expected:
  name: string
  apiVersion: 1
  setup: function

Received from:
  hfx-plugin-example
```

---

# 130. Plugin Reserved Mutation Diagnostic

Example:

```text
RANU_PLUGIN_ROUTE_MUTATION_FORBIDDEN

Plugin:
  hfx-plugin-example

Attempted to modify:
  route.pattern

Route:
  page:/products/[id]

Core route identity cannot be changed by V1 plugins.
Use plugin namespaced route metadata instead.
```

---

# 131. Plugin Artifact Collision Diagnostic

Example:

```text
RANU_PLUGIN_ARTIFACT_COLLISION

Plugins requested the same output artifact:

  search-index.json

Plugins:
  hfx-plugin-search-a
  hfx-plugin-search-b

Plugin output paths must be unique.
```

---

# 132. Plugin API Package

Recommended package surface:

```ts
import {
  definePlugin,
  type RanuPlugin,
  type PluginSetupContext,
  type PluginHooks
} from "Ranu.js/plugin";
```

A dedicated package such as:

```text
@ranu/plugin
```

may be used internally/publicly depending on final package layout.

There must be one canonical documented import path.

---

# 133. Plugin API Internal Separation

Public plugin types/functions must not re-export large private compiler/runtime objects.

The implementation should maintain a clear boundary:

```text
public plugin API
───────────────
private plugin manager
private compiler
private bundler adapter
private route compiler
```

---

# 134. Plugin Manager

Ranu.js core includes a plugin manager responsible for:

```text
definition validation
compatibility validation
deduplication
ordering
setup
hook registration
hook execution
diagnostic attribution
artifact ownership
cleanup
debug metadata
```

Other subsystems call the plugin manager rather than iterating raw plugin objects independently.

---

# 135. Plugin Manager State

Conceptual:

```ts
interface ResolvedPlugin {
  name: string;
  version?: string;
  apiVersion: number;
  enforce: "pre" | "normal" | "post";
  order: number;
  hooks: PluginHooks;
}
```

The private implementation may contain additional state.

---

# 136. Hook Runner

A centralized hook runner should:

1. select plugins implementing the hook;
2. preserve resolved order;
3. create hook-specific context;
4. execute/await;
5. attribute diagnostics;
6. validate returned contribution;
7. stop/continue according to hook failure policy.

This avoids inconsistent behavior across subsystems.

---

# 137. Hook Return Validation

Every transforming hook return value must be validated before use.

A malformed plugin contribution must fail with plugin attribution.

Ranu.js must not let malformed plugin objects corrupt later manifests.

---

# 138. Error Cause Preservation

Plugin diagnostics shown to users may be concise, but internal error objects/logging should preserve:

```text
original cause
stack
plugin
hook
```

for debugging.

Production/public browser output must not receive build plugin stacks.

---

# 139. Plugin Security Boundary Tests

Required tests must prove that a plugin cannot accidentally use supported APIs to:

- publish private environment values automatically;
- override `/_ranu/`;
- mutate route identity;
- bypass server-only rules;
- overwrite another plugin artifact;
- place server modules in client manifest;
- alter completed build manifests without validation.

This is framework API safety, not malicious-code sandboxing.

---

# 140. Plugin Test Utilities

Ranu.js should eventually provide plugin test helpers.

Conceptual:

```ts
createPluginTestProject()
runPluginBuild()
runPluginDev()
inspectRoutes()
inspectDiagnostics()
inspectArtifacts()
```

A minimal internal test harness is required even if public helpers are deferred.

---

# 141. Plugin Unit Testing

Plugin authors can unit-test their own factory/options normally.

Integration testing should run the plugin inside a real Ranu.js fixture to validate lifecycle behavior.

---

# 142. Plugin Fixture Applications

Ranu.js core should maintain fixtures for:

```text
config plugin
route metadata plugin
build lifecycle plugin
dev lifecycle plugin
generated asset plugin
controlled build extension plugin
failing plugin
incompatible plugin
```

---

# 143. Plugin Ordering Test Matrix

At minimum:

- one plugin;
- multiple normal plugins;
- pre + normal + post;
- registration order;
- async hooks;
- duplicate plugin;
- setup failure;
- hook failure.

---

# 144. Configuration Hook Test Matrix

At minimum:

- plugin default contribution;
- explicit user config;
- multiple plugin contributions;
- invalid returned config;
- resolved config read;
- forbidden resolved mutation;
- plugin option validation.

---

# 145. Route Metadata Test Matrix

At minimum:

- inspect all routes;
- inspect one route;
- namespaced metadata;
- serializable metadata;
- invalid non-serializable metadata;
- attempted route ID mutation;
- attempted pattern mutation;
- multiple plugins with separate namespaces.

---

# 146. Build Hook Test Matrix

At minimum:

- buildStart;
- buildEnd;
- async hook;
- generated server asset;
- generated public asset;
- artifact collision;
- plugin build failure;
- manifest ownership;
- production artifact validation.

---

# 147. Development Hook Test Matrix

At minimum:

- devStart;
- devEnd;
- file watch registration;
- invalidation;
- full reload request;
- plugin error;
- cleanup on restart;
- plugin order.

---

# 148. Compatibility Test Matrix

At minimum:

- supported Plugin API;
- unsupported newer Plugin API;
- invalid API version;
- compatible Ranu.js semver;
- incompatible Ranu.js semver;
- missing plugin name;
- duplicate plugin name;
- malformed setup result;
- unknown hook typo.

---

# 149. Boundary Test Matrix

At minimum:

- plugin-generated client module with public env;
- plugin-generated client module with private env attempt;
- plugin-generated server module;
- client→plugin server-only module;
- Node built-in in plugin client output;
- `/_ranu/` collision;
- public artifact path traversal;
- plugin route identity mutation.

---

# 150. Cross-Platform Tests

Plugin path/watch/artifact APIs must be tested on:

```text
Linux
Windows
```

and preferably macOS.

Logical plugin paths must not depend on platform separators.

---

# 151. Plugin Performance

Plugin hooks add framework overhead.

Ranu.js must avoid running build-only hooks on every production request.

V1 plugin lifecycle is primarily startup/dev/build oriented for this reason.

---

# 152. Plugin Memory

Development plugins may retain state for the dev session.

They must not leak state across dev restarts indefinitely.

Plugin-generated caches remain disposable.

---

# 153. Plugin Determinism

Given the same:

```text
plugin order
plugin versions
plugin options
source
environment inputs
```

Ranu.js hook execution order must be deterministic.

Plugins themselves may perform non-deterministic operations, but Ranu.js must not introduce random ordering.

---

# 154. Build Reproducibility and Plugins

Plugin versions/options become relevant build inputs.

Ranu.js build cache keys must account for plugin identity/version/config where those values affect output.

At minimum, plugin registration changes must invalidate relevant cached build state.

---

# 155. Plugin Option Serialization for Cache

Ranu.js should not blindly serialize arbitrary plugin option objects containing secrets/functions for cache keys or debug output.

Plugins may provide a safe cache key contribution if necessary.

Initial V1 may conservatively invalidate plugin-dependent caches when plugin config identity cannot be safely derived.

---

# 156. Plugin Network Access

Plugins may use network access because they execute trusted Node code.

Ranu.js itself does not guarantee network availability.

A network-dependent plugin must surface failures clearly and should support deterministic CI behavior where appropriate.

---

# 157. Plugin File Access

Plugins may use Node filesystem APIs directly because they are trusted code, but portable plugins should prefer Ranu.js path/emission/watch APIs where those contracts exist.

Direct writes into framework-owned output directories remain unsupported.

---

# 158. Plugin Child Processes

Ranu.js does not sandbox child process creation by plugins.

Plugins that spawn tools must manage lifecycle, errors, and cross-platform compatibility themselves.

Official Ranu.js plugins should avoid unnecessary process spawning.

---

# 159. Plugin Environment Modes

Hooks receive mode/command information.

Plugins must not infer production solely from arbitrary environment strings when Ranu.js provides explicit mode.

Conceptual:

```text
command = dev
mode = development
```

or:

```text
command = build
mode = production
```

---

# 160. `Ranu.js start` Plugins

Build-time plugin hooks do not rerun during `Ranu.js start`.

The production artifact is already compiled.

Only explicitly generated/bundled runtime code participates in production execution.

This is a locked V1 rule.

---

# 161. Start-Time Plugin Discovery

`Ranu.js start` must not rescan application config/node_modules to rediscover build plugins.

It uses the completed build artifact.

This preserves production reproducibility and avoids requiring build-time plugin packages at request startup unless their runtime code is actually bundled/externalized.

---

# 162. Plugin Manifest Compatibility

If plugin-produced metadata is required by generated runtime code, the plugin must version its own metadata format where necessary.

Ranu.js only guarantees transport/storage of valid namespaced metadata.

---

# 163. Plugin Runtime Metadata Size

Plugins should keep manifest metadata compact.

Large datasets belong in generated assets/modules rather than inflating route manifests.

Ranu.js may warn about excessive plugin metadata.

---

# 164. Plugin Data Privacy

Plugin options are private by default.

Ranu.js must not serialize full plugin options into:

```text
browser manifests
HTML
debug endpoints
production public assets
```

unless the plugin explicitly emits safe public data.

---

# 165. Plugin Documentation Requirements

A production-quality plugin should document:

```text
supported Ranu.js versions
Plugin API version
installation
registration
options
hooks/features used
generated files
runtime requirements
environment variables
client-visible data
deployment requirements
```

---

# 166. Official Plugin Naming

Ranu.js-owned official plugins may use a reserved package scope such as:

```text
@ranu/*
```

The final npm/package naming policy must be chosen before publishing.

Third-party packages must not be treated as official merely because their name contains `Ranu.js`.

---

# 167. Plugin Registry

An official hosted plugin marketplace/registry is not required for V1.

Plugins are ordinary package-manager dependencies.

A curated ecosystem index may be added later.

---

# 168. Plugin Signing

Cryptographic plugin signing/verification is deferred.

Package-manager registry integrity and lockfiles remain the initial distribution mechanism.

---

# 169. Plugin Installation CLI

A future command may provide:

```bash
Ranu.js add <plugin>
```

but V1 plugin semantics do not depend on it.

Installing a package does not automatically activate it.

Registration remains explicit in Ranu.js config.

---

# 170. Plugin Removal

Removing a plugin means:

1. remove it from Ranu.js config;
2. remove the package dependency if no longer needed;
3. rebuild.

Ranu.js-generated plugin build/cache artifacts are disposable and cleaned through normal build/cache behavior.

---

# 171. Plugin Migration

When a plugin requires migration between Plugin API/framework versions, the plugin should fail with actionable compatibility guidance.

Ranu.js should not silently rewrite third-party plugin configuration.

---

# 172. Hook Evolution

New hook fields may be added compatibly to context objects when optional/read-only.

Breaking changes to existing hook semantics require Plugin API versioning.

---

# 173. Experimental Hooks

Ranu.js may expose explicitly experimental hooks.

They must be marked as:

```text
experimental
unstable
not covered by Plugin API compatibility guarantees
```

Stable plugins should not require them unless authors accept migration risk.

---

# 174. Internal Hooks

Ranu.js may have richer internal hook/event systems.

Internal hooks are not public merely because their code is visible.

Public plugin documentation/types define the supported contract.

---

# 175. No Monkey Patching

Plugins must not be expected to:

- monkey-patch Ranu.js package exports;
- replace internal module cache entries;
- modify private manifests after generation;
- patch Node HTTP prototypes;
- mutate React internals;
- intercept private router classes.

Such behavior is unsupported.

---

# 176. No Manifest Post-Editing

Third-party plugins must not directly open and rewrite Ranu.js manifests after build.

Required metadata contributions must pass through Ranu.js APIs before manifest validation.

This preserves artifact integrity.

---

# 177. No Source Route Injection Through Filesystem Tricks

Plugins must not create temporary fake files inside `app/` solely to force the router to discover synthetic routes during production build as the official extension mechanism.

If synthetic routes become a supported feature, Ranu.js will define a dedicated API.

---

# 178. Code Generation

Plugins may generate application-support code into a plugin-owned generated area.

Examples:

```text
typed content indexes
schema-derived types
API client metadata
static lookup tables
```

Generated code must participate in normal server/client graph rules.

---

# 179. Generated Type Files

A plugin may emit TypeScript declaration files into an Ranu.js-generated types area through a supported API.

These declarations may be included in Ranu.js's generated type references.

Plugins must not overwrite core Ranu.js generated types.

---

# 180. Type Generation Timing

Plugin-generated types needed by application type checking must be generated before the relevant type-check stage.

Therefore the build/dev pipeline needs an explicit pre-typecheck generation point if this capability ships.

---

# 181. Minimal V1 Code Generation Contract

At minimum, Ranu.js should support:

```text
plugin-owned generated files
plugin-owned generated declarations
build artifact emission
```

without promising arbitrary compiler AST rewriting.

---

# 182. Plugin Services

A future plugin service registry may allow one plugin to expose typed services to another.

This is deferred.

V1 plugins should communicate through ordinary package APIs or explicit shared application configuration rather than hidden global registries.

---

# 183. Runtime Service Injection

Automatic dependency injection into page/API handlers is deferred.

The V1 plugin system does not change handler signatures.

This protects the server runtime contract.

---

# 184. Middleware Injection

Automatic plugin middleware chains are deferred from stable V1.

A plugin may provide a helper the application imports from its own `middleware.ts`.

Example conceptual:

```ts
import { createAuthMiddleware } from "hfx-plugin-auth";

export default createAuthMiddleware(...);
```

This uses the existing public runtime contract instead of hidden injection.

---

# 185. Route Helper Plugins

A plugin may export ordinary application functions/components used in routes.

Those exports are not plugin hooks and follow normal Ranu.js module rules.

The plugin lifecycle is only needed for framework integration.

---

# 186. Client Components from Plugins

A plugin package may export `"use client"` components.

They participate in ranu CLIent graph classification exactly like application client components.

Plugin status does not grant a special client execution path.

---

# 187. Server Components from Plugins

Plugin packages may export server-safe React components or utilities.

They follow normal server graph semantics.

Server-only plugin modules should use the same Ranu.js server-only markers where appropriate.

---

# 188. Plugin CSS

Plugin package components may import CSS according to Ranu.js build rules.

Any plugin build hook that emits CSS must use normal asset emission and route/client association mechanisms.

---

# 189. Plugin Static Assets

Plugins may ship/import static assets through normal package module imports.

If they need fixed public assets, they should use the controlled public asset emission API.

They must not copy files directly into the application's `public/` directory during every build.

---

# 190. Plugin Route Metadata Example

Conceptual plugin:

```ts
import { definePlugin } from "Ranu.js/plugin";

export default definePlugin({
  name: "hfx-plugin-docs",
  apiVersion: 1,

  setup() {
    return {
      route(route) {
        if (route.kind !== "page") {
          return;
        }

        return {
          metadata: {
            section: "docs"
          }
        };
      }
    };
  }
});
```

Ranu.js stores the contribution under the plugin's namespace rather than merging `section` into unowned core route fields.

---

# 191. Build Artifact Example

Conceptual:

```ts
export default definePlugin({
  name: "hfx-plugin-search-index",
  apiVersion: 1,

  setup() {
    return {
      async buildEnd(result, context) {
        const index = createIndex(result.routes);

        context.emitFile({
          type: "public-asset",
          name: "search-index.json",
          contents: JSON.stringify(index)
        });
      }
    };
  }
});
```

The final exact timing may use a dedicated artifact hook so manifest validation includes the emitted file before build completion.

---

# 192. Dev Watch Example

Conceptual:

```ts
export default definePlugin({
  name: "hfx-plugin-content",
  apiVersion: 1,

  setup() {
    return {
      devStart(context) {
        context.watch.add("content/**/*.md", {
          onChange: "full-reload"
        });
      }
    };
  }
});
```

The plugin does not directly manipulate the private HMR server.

---

# 193. Config Plugin Example

Conceptual:

```ts
export default function securityPlugin() {
  return definePlugin({
    name: "hfx-plugin-security",
    apiVersion: 1,
    enforce: "pre",

    setup() {
      return {
        config() {
          return {
            build: {
              sourcemap: "hidden"
            }
          };
        }
      };
    }
  });
}
```

Explicit application configuration must retain the precedence semantics defined by the config system.

---

# 194. Plugin Lifecycle

Conceptual production build lifecycle:

```text
Load basic config/environment
        ↓
Resolve plugin definitions
        ↓
Validate plugin compatibility
        ↓
Order plugins
        ↓
Run plugin setup
        ↓
Run config hooks
        ↓
Normalize/finalize Ranu.js config
        ↓
Run configResolved hooks
        ↓
Compile core routes
        ↓
Run route metadata hooks
        ↓
Run buildStart hooks
        ↓
Build server/client graphs
        ↓
Static generation
        ↓
Plugin artifact/codegen finalization
        ↓
Generate manifests
        ↓
Run buildEnd hooks at defined final stage
        ↓
Validate complete artifact
        ↓
Build success
```

Implementation may split artifact hooks more precisely, but no plugin may bypass final artifact validation.

---

# 195. Development Lifecycle

Conceptual:

```text
Load config/env
→ Resolve/validate/order plugins
→ setup
→ config
→ configResolved
→ compile routes
→ route metadata hooks
→ initialize dev build system
→ devStart
→ serve/watch
→ plugin invalidations as files change
→ devEnd on graceful shutdown/restart
```

---

# 196. Plugin Hook Context Rule

Each hook receives only the capabilities appropriate to that phase.

Example:

```text
config hook
  cannot emit final build asset

route hook
  cannot send HTTP response

build hook
  cannot mutate core route identity

dev hook
  cannot rewrite production manifest directly
```

This capability-oriented design reduces accidental coupling.

---

# 197. Capability Objects

Instead of exposing a giant mutable framework object, Ranu.js should expose narrow capability objects.

Conceptual:

```ts
context.routes.read()
context.artifacts.emit(...)
context.watch.add(...)
context.logger.info(...)
```

A capability exists only where valid.

---

# 198. Capability Versioning

New optional capability methods may be added compatibly.

Removal or semantic breakage requires Plugin API versioning.

Plugins should feature-detect optional experimental capabilities rather than assuming undocumented methods.

---

# 199. Plugin Acceptance Criteria

The Ranu.js V1 plugin system is complete when:

1. plugins can be explicitly registered in Ranu.js config;
2. plugins are never auto-activated by package scanning;
3. every plugin has a stable name;
4. duplicate plugin names fail by default;
5. Plugin API version is declared;
6. incompatible Plugin API versions fail before hook execution;
7. optional Ranu.js version compatibility can be validated;
8. `definePlugin()` provides the canonical typed definition contract;
9. plugin setup is deterministic;
10. plugin setup failures identify the plugin;
11. pre/normal/post ordering works;
12. registration order is preserved within each phase;
13. async hooks are supported;
14. config hooks can contribute supported configuration;
15. explicit user configuration has predictable precedence;
16. resolved config is inspectable without unsupported mutation;
17. plugins can inspect compiled routes;
18. plugins can add namespaced serializable route metadata;
19. plugins cannot mutate route IDs;
20. plugins cannot mutate route patterns/precedence;
21. plugins cannot remove application routes through V1 route hooks;
22. buildStart hooks execute;
23. buildEnd/finalization hooks execute at a defined stage;
24. plugin build failure fails the production build;
25. devStart hooks execute;
26. devEnd hooks execute on graceful shutdown/restart;
27. controlled file watching/invalidation is supported where implemented;
28. plugins do not need private HMR server access;
29. controlled build extension exists if required by V1 plugins;
30. raw underlying bundler access is not the primary stable API;
31. plugin-generated files use Ranu.js-owned emission APIs;
32. artifact ownership is tracked;
33. artifact collisions are detected;
34. plugin-generated client code obeys client/server boundary rules;
35. plugin-generated browser output cannot automatically expose private env;
36. plugins cannot override the `/_ranu/` namespace;
37. plugin metadata/options are not automatically serialized publicly;
38. plugin diagnostics identify plugin and hook;
39. plugin logs support debug attribution;
40. unknown/malformed plugin definitions fail clearly;
41. unknown hook typos are detectable;
42. build cache invalidates appropriately when plugin registration/version/config changes;
43. build-time plugins do not rerun during `Ranu.js start`;
44. `Ranu.js start` does not rediscover build plugins;
45. plugin runtime code participates only when explicitly bundled/referenced;
46. plugin API remains separate from deployment adapter contracts;
47. plugin API remains separate from renderer adapter contracts;
48. plugin API does not redefine router semantics;
49. no security sandbox claim is made for third-party plugin code;
50. required plugin compatibility, ordering, boundary, and artifact tests pass.

---

# 200. Locked V1 Plugin Decisions

The following are locked by this specification:

1. Ranu.js V1 has a documented basic plugin contract.
2. The V1 plugin surface is intentionally limited.
3. Initial stable hook families are configuration, route metadata, build lifecycle, and development lifecycle.
4. Controlled build-tool extension may be exposed where required.
5. Plugins must use documented Ranu.js APIs rather than undocumented internal imports.
6. Plugins are explicitly registered.
7. Ranu.js does not auto-activate plugin-looking packages from `node_modules`.
8. Every plugin has a stable name.
9. Duplicate plugin names are rejected by default.
10. V1 Plugin API version is `1`.
11. Unsupported Plugin API versions fail before execution.
12. Plugins may optionally declare Ranu.js version compatibility.
13. `definePlugin()` is the canonical typed plugin-definition helper.
14. Plugins may be factories with typed options.
15. Plugin setup runs in trusted Node.js build/dev context.
16. Plugins are not sandboxed.
17. Plugin installation is a code-trust decision.
18. Plugin order is `pre → normal → post`.
19. Registration order applies within each phase.
20. Arbitrary numeric plugin priorities are not part of V1.
21. Hook execution is deterministic.
22. Hooks may be asynchronous.
23. Plugin failures identify plugin and hook whenever possible.
24. Configuration contributions pass through Ranu.js config validation.
25. Plugins do not freely mutate resolved framework config.
26. Plugins may inspect compiled routes.
27. Route identity and URL semantics remain owned by the router.
28. Plugins cannot mutate core route IDs, patterns, precedence, or layout ancestry in V1.
29. Plugin route metadata is namespaced.
30. Manifest-bound plugin metadata must be serializable.
31. Arbitrary synthetic page/API route injection is deferred.
32. Arbitrary route removal is deferred.
33. Build hooks may prepare/generate plugin-owned build data.
34. Required plugin build hook failure fails `Ranu.js build`.
35. Development hooks may integrate with controlled watch/invalidation APIs.
36. Plugins do not receive private HMR state as the stable API.
37. Raw Vite/Rollup/esbuild internals are not the primary Ranu.js Plugin API.
38. Ranu.js may provide a clearly lower-level Vite compatibility escape hatch if Vite is used.
39. Ranu.js-owned plugin APIs remain the preferred compatibility surface.
40. Plugin-generated artifacts must use controlled Ranu.js emission where they become part of the build.
41. Plugins must not directly rewrite completed Ranu.js manifests.
42. Artifact ownership/collisions are tracked/validated.
43. Plugin-generated code obeys normal server/client graph rules.
44. Plugins cannot bypass `Ranu.js/server-only` or `server/` boundaries.
45. Plugins cannot automatically expose private environment values to clients.
46. Plugin options are private by default.
47. `/_ranu/` remains framework-reserved against plugin overrides.
48. Build-time plugins do not rerun on `Ranu.js start`.
49. Production startup does not rediscover build plugins.
50. Runtime plugin middleware injection is deferred from the stable minimal V1 contract.
51. Application `middleware.ts` remains the V1 public middleware mechanism.
52. Alternative renderers belong to renderer adapters, not ordinary plugins.
53. Deployment targets belong to deployment adapters, not ordinary plugin hooks.
54. Router syntax extension is deferred.
55. General AST/compiler mutation is not guaranteed in V1.
56. Arbitrary CLI command plugins are deferred.
57. Plugin caches are disposable and not application databases.
58. Plugin manifests/debug data must not expose secrets.
59. First-party plugins should use public contracts whenever practical.
60. Plugin compatibility is explicitly versioned and evolvable.

---

# 201. Deferred Plugin Features

The following are deferred unless a later specification explicitly introduces them:

- arbitrary per-request runtime hooks;
- automatic server middleware injection;
- plugin-defined route syntax;
- arbitrary synthetic page/API route registration;
- plugin route deletion;
- custom router replacement;
- custom renderer replacement through plugin hooks;
- deployment target replacement through plugin hooks;
- arbitrary compiler AST mutation API;
- unrestricted raw bundler object access;
- numeric hook priority graphs;
- complex before/after dependency graphs;
- plugin service dependency injection;
- plugin-to-plugin service registry;
- runtime handler parameter injection;
- automatic plugin discovery;
- plugin marketplace;
- plugin signing;
- permission prompts;
- plugin sandboxing;
- isolated worker-process plugin execution;
- arbitrary CLI command registration;
- remote plugin loading;
- runtime hot installation/uninstallation;
- production plugin discovery from `node_modules`;
- plugin-owned persistent database;
- automatic plugin migrations;
- plugin UI administration dashboard.

These features must not block a reliable V1 extension model.

---

# 202. Relationship to Framework Architecture

`02_FRAMEWORK_ARCHITECTURE.md` defines Ranu.js as modular and adapter-driven.

The plugin system must preserve that architecture.

It extends subsystems through contracts but does not collapse them into one mutable plugin host.

Conceptually:

```text
Core
├── Router
├── Build
├── Runtime
├── Renderer Adapter
├── Deployment Adapter
└── Plugin Manager
```

Each retains clear ownership.

---

# 203. Relationship to Routing

`03_ROUTING_SPECIFICATION.md` owns:

```text
filesystem routing
URL patterns
dynamic params
route groups
precedence
collisions
route kinds
layout ancestry
```

Plugins may attach namespaced metadata after core route compilation.

They do not redefine those semantics in V1.

---

# 204. Relationship to Rendering

`04_RENDERING_MODEL.md` owns:

```text
SSR
SSG
client rendering
hydration
React composition
metadata rendering
render boundaries
```

Plugins cannot silently change a route's declared rendering model through generic build hooks.

Alternative renderer implementations belong behind renderer adapters.

---

# 205. Relationship to Server Runtime

`05_SERVER_RUNTIME_SPEC.md` owns:

```text
HTTP request pipeline
middleware
API method dispatch
cookies
headers
redirects
streaming
errors
shutdown
```

The minimal stable V1 plugin API does not insert arbitrary hidden per-request runtime hooks.

Runtime extension must use existing public application APIs or a future explicitly versioned runtime plugin contract.

---

# 206. Relationship to Build System

`06_BUILD_SYSTEM.md` owns:

```text
compiler/bundler
server/client graphs
environment boundaries
CSS/assets
static generation
manifests
development HMR
production artifacts
```

The plugin system provides controlled extension points into this build lifecycle.

Plugins do not own the build pipeline.

---

# 207. Relationship to Deployment Adapters

The next architectural document:

```text
08_DEPLOYMENT_ADAPTERS.md
```

owns deployment target integration.

Deployment adapters consume generic Ranu.js artifacts and map them to:

```text
Node standalone
Docker/container
Vercel
Cloudflare
future providers
```

The plugin system may assist with metadata/configuration but cannot replace the deployment adapter boundary.

---

# 208. Relationship to CLI

`09_CLI_SPECIFICATION.md` will define:

```text
Ranu.js dev
Ranu.js build
Ranu.js start
project creation
diagnostics
command behavior
```

V1 plugin registration/configuration must work without requiring a plugin-specific CLI extension system.

---

# 209. Required Next Specification

The next document in the locked Ranu.js development sequence is:

```text
08_DEPLOYMENT_ADAPTERS.md
```

It must define:

- generic deployment artifact contract;
- deployment adapter interface;
- Node standalone adapter;
- container/Docker deployment;
- provider adapter boundaries;
- serverless mapping;
- static asset mapping;
- environment handling;
- build/runtime capability declarations;
- streaming support declarations;
- middleware mapping;
- routing mapping;
- deployment manifests;
- adapter diagnostics;
- compatibility/versioning;
- Vercel adapter strategy;
- Cloudflare/future runtime limitations;
- no-provider-lock-in requirements.

---

# 210. Final Plugin System Baseline

Ranu.js V1 provides a small, explicit, versioned plugin system for extending framework behavior without exposing unstable framework internals as ecosystem APIs.

Plugins are ordinary trusted JavaScript/TypeScript packages registered explicitly in `ranu.config.ts`.

They are never auto-activated merely because they exist in `node_modules`.

Every plugin has a stable identity and declares:

```text
Plugin API version
+
optional framework compatibility
+
setup function
+
supported hooks
```

The initial stable extension families are:

```text
configuration
route metadata
build lifecycle
development lifecycle
```

with controlled build-tool extension available only where needed.

Plugin order is deterministic:

```text
pre
→ normal
→ post
```

with registration order inside each phase.

Plugins may inspect compiled routes and add namespaced serializable metadata, but they cannot redefine core route identity, URL patterns, precedence, layout ancestry, or filesystem routing semantics.

Plugins may participate in build/dev lifecycle and emit plugin-owned generated artifacts through Ranu.js-controlled APIs.

They cannot bypass the server/client security boundary, publish private environment values automatically, override `/_ranu/`, or directly rewrite completed Ranu.js manifests through the supported plugin API.

The Ranu.js Plugin API is not a security sandbox. Registered plugins execute as trusted Node.js code with the process's privileges.

Build-time plugins execute during config/dev/build. They do not automatically rerun during `Ranu.js start`, and production startup does not rediscover build plugins.

Alternative UI renderers remain renderer adapters.

Deployment targets remain deployment adapters.

Application HTTP middleware remains governed by the server runtime contract.

The plugin system therefore extends Ranu.js without becoming a second router, renderer, runtime, build system, or deployment architecture.

This specification is the authoritative Ranu.js V1 plugin and extension contract.

---

**End of 07_PLUGIN_SYSTEM.md**
