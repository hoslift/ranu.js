# 10_CONFIGURATION_SYSTEM.md
**Project:** Ranu.js — JavaScript/TypeScript Full-Stack Web Framework  
**Document Type:** Configuration System Specification  
**Status:** Development Baseline  
**Date:** 2026-08-10  
**Depends On:** `00_FRAMEWORK_VISION.md` through `09_CLI_SPECIFICATION.md`  
**Canonical Configuration File:** `ranu.config.ts`  
**Configuration Helper:** `defineConfig()`  
**Primary V1 Runtime:** Node.js

# 1. Purpose
This document defines the authoritative Ranu.js V1 configuration system: config discovery and loading, `defineConfig()`, typing, runtime validation, defaults, environment-aware resolution, plugins, deployment adapters, build/server/routing/rendering settings, CLI precedence, security boundaries, diagnostics, compatibility, and tests.

# 2. Core Configuration Model
The normal application should require little or no configuration. When configuration is needed:

```ts
import { defineConfig } from "ranu";

export default defineConfig({
  server: { port: 3000 }
});
```

Ranu.js distinguishes five boundaries:

```text
Core framework configuration
Plugin configuration
Deployment adapter configuration
Runtime environment
Application/business configuration
```

These boundaries must not be collapsed.

# 3. Configuration Principles
1. Convention over configuration.
2. `ranu.config.ts` is canonical.
3. TypeScript authoring must be strongly typed.
4. Runtime schema validation remains mandatory.
5. Unknown core fields are errors.
6. Defaults are documented framework behavior.
7. Plugin/provider options remain namespaced to their owners.
8. Private values must never become browser configuration accidentally.
9. Resolution precedence is explicit.
10. Configuration merging is field-aware, not generic deep merge.
11. Resolved configuration is immutable.
12. Core configuration remains provider-neutral.

# 4. Configuration Discovery
Supported V1 forms may include `ranu.config.ts`, `ranu.config.js`, and `ranu.config.mjs`; documentation prefers TypeScript. Discovery occurs only at the resolved Ranu.js application root. Parent configs are not inherited automatically.

If multiple supported config files exist in the same project root, Ranu.js fails with `RANU_CONFIG_AMBIGUOUS`. They are never merged.

A config file is optional when defaults are sufficient.

# 5. defineConfig()
`defineConfig()` is the canonical authoring helper.

```ts
function defineConfig(config: RanuUserConfig): RanuUserConfig {
  return config;
}
```

It exists primarily for typing/inference. It must not start builds, discover routes, initialize plugins, contact providers, or mutate external infrastructure.

# 6. User and Resolved Config
Conceptual public input:

```ts
interface RanuUserConfig {
  plugins?: RanuPluginInput[];
  build?: RanuBuildConfig;
  server?: RanuServerConfig;
  routing?: RanuRoutingConfig;
  rendering?: RanuRenderingConfig;
  deployment?: RanuDeploymentConfig;
  env?: RanuEnvironmentConfig;
}
```

Framework subsystems consume a normalized `ResolvedRanuConfig` containing project root, command mode, defaults, normalized plugin/adapter registrations, and validated subsystem settings. Raw user config is not repeatedly reinterpreted by each subsystem.

# 7. Resolution Pipeline
Canonical sequence:

```text
CLI invocation
→ project root
→ command/mode
→ environment loading
→ config discovery
→ config module evaluation
→ raw schema validation
→ plugin normalization/config phase
→ framework defaults
→ field-specific normalization
→ documented CLI overrides
→ cross-field validation
→ immutable resolved config
```

Plugin ordering must remain consistent with `07_PLUGIN_SYSTEM.md`.

# 8. Config Execution
`ranu.config.ts` executes as trusted Node.js/build-side code. It may import packages, local helpers, plugin factories, adapter factories, and read `process.env`.

It is never automatically included in client bundles.

Ranu.js may support:

```ts
export default defineConfig(({ mode, command }) => ({
  build: { sourceMaps: mode === "development" }
}));
```

The stable context is limited to framework concepts such as `mode` and `command`. Provider account/request data never becomes generic config context.

# 9. Environment Loading
One Ranu.js-wide environment policy is used by CLI, config, build, and runtime integration. Existing process environment values take precedence over dotenv files.

Recommended file precedence, highest first:

```text
process environment
.env.<mode>.local
.env.local
.env.<mode>
.env
```

Environment files resolve from the Ranu.js project root. Automatic shell-style variable expansion is deferred unless explicitly implemented.

# 10. Public and Private Environment Boundary
The fixed V1 browser-public prefix is:

```text
RANU_PUBLIC_
```

Examples:

```text
RANU_PUBLIC_API_ORIGIN
RANU_PUBLIC_ANALYTICS_ID
```

All other environment variables are private by default:

```text
DATABASE_URL
SESSION_SECRET
API_SECRET
```

The public prefix is not configurable in V1. Ranu.js must never expose private variables simply because they existed during build.

# 11. Core Namespaces
Stable core namespaces are:

```text
plugins
build
server
routing
rendering
deployment
env
```

Unknown top-level or nested core fields fail. Typo suggestions may be shown, but Ranu.js never silently reinterprets unknown fields.

Plugins cannot claim arbitrary top-level namespaces.

# 12. Plugin Configuration
Plugins are registered through:

```ts
plugins: [
  examplePlugin({ option: true })
]
```

Plugin factory options are owned and validated by the plugin. User order is preserved before dependency/order normalization defined by the plugin system.

Plugins may participate in the documented configuration lifecycle only through explicit hooks. They cannot mutate finalized resolved configuration or bypass core schema/security rules.

# 13. Build Configuration
`build` contains only provider-neutral settings defined by `06_BUILD_SYSTEM.md`.

Conceptual:

```ts
build: {
  sourceMaps: false,
  minify: true
}
```

Canonical output remains `.ranu/build/`; cache remains under `.ranu/cache/`. Arbitrary lifecycle callbacks do not belong under `build`; framework extension uses plugins.

Node.js remains the V1 server build target. Unsupported edge/Deno/Bun runtime strings fail rather than activating imaginary compatibility.

# 14. Server Configuration
`server` exposes only controls supported by `05_SERVER_RUNTIME_SPEC.md`.

Conceptual:

```ts
server: {
  host: "127.0.0.1",
  port: 3000,
  trustProxy: false
}
```

Port range is `1–65535`. Proxy trust defaults safely and must not trust arbitrary forwarded headers by default. Request body limits may be added here only with a defined runtime contract. TLS, compression, and arbitrary server hooks are not exposed until separately specified.

# 15. Routing Configuration
`routing` may configure only global behaviors explicitly supported by `03_ROUTING_SPECIFICATION.md`.

Filesystem routing remains authoritative. Ranu.js V1 does not add a competing manual route table.

Potential supported settings include trailing-slash policy and, only if fully implemented across router/link/assets/API/adapters, a base path.

`/_ranu/` remains reserved and cannot be disabled or repurposed. Route conflicts remain errors and cannot be configured to “last route wins.”

# 16. Rendering Configuration
`rendering` may expose framework-wide defaults permitted by `04_RENDERING_MODEL.md`.

Only implemented modes are valid:

```text
static
server
client
```

Precedence:

```text
explicit route declaration
→ configured rendering default
→ framework default
```

Deployment adapters cannot alter the resolved rendering mode to fit a target.

# 17. Deployment Configuration
Deployment adapters are selected under:

```ts
deployment: {
  adapter: vercel({ /* Vercel-owned options */ })
}
```

Generic Node build/start requires no adapter. Provider-specific options remain inside adapter factories; core Ranu.js must not accumulate fields such as `vercelRegion` or `awsMemory`.

A configured adapter does not make `Ranu.js build` contact or deploy to a provider. CLI adapter overrides affect only the deployment invocation.

# 18. env Namespace
The `env` namespace controls Ranu.js environment-loading behavior, not secret values themselves. If dotenv loading is configurable, a simple option such as `files: true|false` may be supported.

The public prefix remains fixed as `RANU_PUBLIC_`. Custom env directories and mutable browser runtime config are deferred.

# 19. Merge and Precedence Rules
Ranu.js does not perform unrestricted recursive merging.

For scalar fields:

```text
explicit CLI override, where supported
→ user config
→ documented environment override, where applicable
→ framework default
```

For known objects, fields resolve individually by schema. Arrays define their own semantics; they are not automatically concatenated.

`undefined` means “not provided.” `null` is invalid unless explicitly meaningful. Empty strings fail for non-empty fields. Invalid strings are not silently coerced to numbers/booleans.

# 20. CLI Overrides
CLI flags override only documented fields for that invocation.

Example:

```bash
Ranu.js start --port 4000
```

may override `server.port`, but never rewrites `ranu.config.ts`.

Ranu.js does not support a generic `RANU_CONFIG_JSON` environment variable capable of replacing arbitrary framework config.

# 21. Immutability
After final resolution, framework subsystems treat configuration as read-only. Plugins may contribute only during their defined config phase.

Conceptually, Ranu.js may freeze resolved structures internally. The important contract is that later lifecycle hooks cannot mutate global framework behavior through shared config references.

# 22. Production Serialization Boundary
Raw executable configuration is build-time input, not production data.

```text
ranu.config.ts
→ validated/resolved build configuration
→ subsystem-specific serializable metadata
→ production artifact
```

Ranu.js never serializes the entire raw config object, config functions, plugin factories, adapter factories, credentials, or secret environment values into public manifests.

`Ranu.js start` consumes the completed artifact plus permitted runtime environment/CLI values. It does not rerun build-time plugin/config factories.

# 23. Security Requirements
Security-sensitive defaults prefer the safer behavior:

- `trustProxy` is not permissive by default.
- `RANU_PUBLIC_` is the only core browser-public env prefix.
- `.env*` files are never copied to public output.
- debug output redacts secret-like values.
- provider credentials never enter generic public build metadata.
- configurable output/deletion paths, if later added, must be containment-validated.
- raw config modules remain server/build-only.

# 24. Configuration Diagnostics
Core diagnostic classes include:

```text
RANU_CONFIG_AMBIGUOUS
RANU_CONFIG_LOAD_FAILED
RANU_CONFIG_INVALID
RANU_CONFIG_UNKNOWN_FIELD
RANU_CONFIG_PLUGIN_INVALID
RANU_CONFIG_ADAPTER_INVALID
RANU_CONFIG_DEPRECATED
```

Errors identify the config file and field path where possible:

```text
RANU_CONFIG_INVALID

File:
  ranu.config.ts

Field:
  server.port

Received:
  "3000"

Expected:
  number between 1 and 65535
```

Likely secret values are displayed as `[REDACTED]`.

# 25. Deprecation and Compatibility
Public configuration names and semantics are developer-facing API.

A deprecated field continues working during its documented window, emits one actionable warning, names its replacement, and is removed only under compatibility/versioning policy.

Removed fields become explicit errors; they are not silently ignored. Changes to security, routing, rendering, build, or server defaults must be treated as potentially breaking.

# 26. Configuration Composition
Ranu.js uses ordinary TypeScript/JavaScript composition:

```ts
import { sharedBuild } from "@repo/hfx-config";

export default defineConfig({
  build: sharedBuild
});
```

V1 does not need an `extends` DSL, hidden `ranu.config.local.ts`, or automatic environment-specific config-file merging.

Shared config packages are trusted build dependencies and execute as Node.js code.

# 27. Runtime Access Boundary
Application code should not use direct imports of `ranu.config.ts` as the official runtime configuration API. Doing so can pull build dependencies into runtime graphs, duplicate evaluation, or expose secrets.

Browser code receives only documented browser-safe values such as `RANU_PUBLIC_*`. Server application code reads private runtime environment through the documented server/runtime boundary. Framework runtime metadata is generated by Ranu.js.

# 28. Development Reload
During `Ranu.js dev`, changes to `ranu.config.ts` trigger a controlled framework restart, not ordinary HMR. Imported local config helpers should also trigger restart where dependency tracing permits.

Restart must clean watchers/resources, reload environment/config, rebuild normalized configuration, and avoid duplicate watchers.

Invalid config edits should report errors and recover when corrected without requiring the developer to manually restart the CLI where practical.

# 29. Testing Requirements
Required test layers:

```text
discovery
module loading
TypeScript typing
runtime schema
defaults
environment precedence
CLI precedence
plugin integration
adapter integration
serialization
security/redaction
dev reload
production artifact
Windows/Linux paths
```

Minimum cases include no config, one valid config, multiple configs, unknown fields, invalid types/enums/ports, process-env precedence, public/private env separation, duplicate/invalid plugins, valid/invalid adapters, route/render precedence, raw-config exclusion from public output, secret redaction, and config restart recovery.

# 30. Acceptance Criteria
Ranu.js V1 configuration is complete when all of the following are true:

1. `ranu.config.ts` is canonical.
2. Minimal apps work without config.
3. `defineConfig()` provides authoring types.
4. Runtime validation remains authoritative.
5. Multiple config files fail.
6. Unknown core fields fail.
7. Invalid values are not silently coerced.
8. Project-root discovery is deterministic.
9. Parent configs are not inherited.
10. Config remains build/server-side.
11. Development/production context is available where specified.
12. One dotenv precedence model is used.
13. Process env overrides dotenv values.
14. `RANU_PUBLIC_*` is fixed and browser-public.
15. Other env variables are private by default.
16. Plugins register under `plugins`.
17. Plugin options remain plugin-owned.
18. Provider adapters register under `deployment`.
19. Provider options remain adapter-owned.
20. Generic Node build/start needs no provider adapter.
21. Configured adapters do not make `Ranu.js build` deploy.
22. Build settings remain provider-neutral.
23. Server settings match the Node runtime contract.
24. Filesystem routing remains authoritative.
25. `/_ranu/` remains reserved.
26. Route conflicts cannot be configured away.
27. Only implemented rendering modes are valid.
28. Explicit route rendering wins over global defaults.
29. Adapters cannot rewrite rendering semantics.
30. Merge behavior is field-specific.
31. CLI overrides are invocation-only.
32. Final resolved config is read-only.
33. Raw executable config is not serialized wholesale.
34. Secrets are excluded from public artifacts.
35. Debug diagnostics redact secrets.
36. Config edits trigger controlled dev restart.
37. Invalid edits can recover after correction.
38. `Ranu.js start` does not rerun build-time config/plugin resolution.
39. Config composition works through normal imports.
40. Windows and Linux tests pass.

# 31. Locked V1 Decisions
The following are locked:

1. Canonical config: `ranu.config.ts`.
2. Config is optional when defaults suffice.
3. Canonical helper: `defineConfig()`.
4. User config and resolved config are distinct.
5. Runtime schema validation is mandatory.
6. Multiple config files are an error.
7. Config discovery is application-root scoped.
8. Parent config inheritance is disabled.
9. Config executes as trusted Node.js/build code.
10. Config is never automatically client-bundled.
11. Unknown core fields fail.
12. No generic magical deep merge.
13. `undefined` means absent; unsupported `null` fails.
14. Fixed browser prefix: `RANU_PUBLIC_`.
15. Other env variables are private by default.
16. Process env overrides dotenv files.
17. One environment policy is shared across Ranu.js.
18. Plugins register through `plugins`.
19. Plugin options remain plugin-owned.
20. Plugins cannot invent arbitrary top-level namespaces.
21. Final config is immutable.
22. Deployment adapters configure under `deployment`.
23. Provider options remain adapter-owned.
24. Generic Node requires no deployment adapter.
25. `Ranu.js build` remains provider-neutral.
26. Filesystem routing remains authoritative.
27. No manual route-table replacement in V1.
28. `/_ranu/` cannot be repurposed.
29. Route conflicts remain errors.
30. Only `static`, `server`, and `client` rendering modes are valid where implemented.
31. Route-level rendering overrides global defaults.
32. Deployment targets cannot rewrite rendering semantics.
33. Raw config/factory functions are not persisted wholesale.
34. Secrets never become public build metadata by default.
35. `Ranu.js start` does not rerun build-time config/plugin factories.
36. Config changes in dev cause controlled restart.
37. Composition uses ordinary imports, not a special inheritance language.
38. No hidden local config merge exists.
39. Framework config is not business-data storage.
40. Configuration correctness outranks cache optimization.

# 32. Deferred Features
Deferred unless separately specified:

- `extends` config inheritance;
- `ranu.config.local.*`;
- automatic environment-specific config files;
- configurable public env prefix;
- generic JSON config environment override;
- remote/cloud config service;
- built-in secret vault;
- manual route table;
- arbitrary build-output relocation;
- mixed Node/Edge runtime config;
- provider-neutral regions/memory/timeouts;
- first-class database/auth/payment config;
- universal CSS-tool config;
- global permissive CORS toggle;
- built-in CSP DSL;
- mutable browser runtime config;
- automatic config migrations;
- GUI configuration editor.

# 33. Relationship to Existing Specifications
`03_ROUTING_SPECIFICATION.md` owns routing semantics.  
`04_RENDERING_MODEL.md` owns rendering semantics.  
`05_SERVER_RUNTIME_SPEC.md` owns server behavior.  
`06_BUILD_SYSTEM.md` owns build artifacts and compilation.  
`07_PLUGIN_SYSTEM.md` owns plugin lifecycle.  
`08_DEPLOYMENT_ADAPTERS.md` owns target mapping.  
`09_CLI_SPECIFICATION.md` owns command invocation and CLI overrides.

This document is the control-plane contract connecting those subsystems without redefining them.

# 34. Required Next Specification

The next required document is:

```text
11_PUBLIC_API_SPECIFICATION.md
```

A separate `11_ENVIRONMENT_VARIABLES.md` is **not required for the V1 baseline**. Environment-variable behavior is already owned jointly by `06_BUILD_SYSTEM.md`, `05_SERVER_RUNTIME_SPEC.md`, and this configuration specification.

`11_PUBLIC_API_SPECIFICATION.md` must lock the public open-source contract: npm package names, package subpath exports, stable vs experimental APIs, application-facing imports, peer/runtime dependencies, public TypeScript types, compatibility guarantees, and deprecation rules.

# 35. Final Configuration Baseline
Ranu.js V1 uses `ranu.config.ts` as a small, typed, runtime-validated, provider-neutral framework control plane.

A minimal application can rely entirely on conventions. When configuration is required, `defineConfig()` provides TypeScript guidance while Ranu.js validates the actual runtime shape.

Configuration resolution produces one immutable effective configuration. Plugins and deployment adapters remain modular and own their own option schemas. Build, server, routing, and rendering configuration cannot contradict their authoritative specifications.

Browser-visible environment variables use only the fixed `RANU_PUBLIC_` prefix. Everything else is private by default.

The raw executable config, plugin factories, adapter factories, credentials, and secret values are never serialized wholesale into production or browser artifacts. `Ranu.js start` uses the completed build and runtime environment rather than reconstructing build-time configuration.

This specification is the authoritative Ranu.js V1 configuration-system contract.

---

**End of 10_CONFIGURATION_SYSTEM.md**
