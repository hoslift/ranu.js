# 09_CLI_SPECIFICATION.md

**Project:** Ranu.js — JavaScript/TypeScript Full-Stack Web Framework  
**Document Type:** Command-Line Interface Specification  
**Status:** Development Baseline  
**Date:** 2026-08-10  
**Depends On:** `00_FRAMEWORK_VISION.md`, `01_PRODUCT_REQUIREMENTS.md`, `02_FRAMEWORK_ARCHITECTURE.md`, `03_ROUTING_SPECIFICATION.md`, `04_RENDERING_MODEL.md`, `05_SERVER_RUNTIME_SPEC.md`, `06_BUILD_SYSTEM.md`, `07_PLUGIN_SYSTEM.md`, `08_DEPLOYMENT_ADAPTERS.md`  
**Primary CLI Binary:** `Ranu.js`  
**Primary Language:** TypeScript / JavaScript  
**Primary V1 Runtime:** Node.js  
**Configuration File:** `ranu.config.ts`

---

# 1. Purpose

This document defines the Ranu.js V1 command-line interface.

It specifies:

- the `Ranu.js` executable;
- command discovery and parsing;
- project/config discovery;
- `Ranu.js dev`;
- `Ranu.js build`;
- `Ranu.js start`;
- `Ranu.js create`;
- deployment preparation;
- help/version commands;
- command flags;
- environment modes;
- host and port handling;
- cache and clean behavior;
- debug and verbose output;
- diagnostics;
- machine-readable output;
- exit codes;
- package manager behavior;
- CI behavior;
- signal handling;
- process lifecycle;
- command safety;
- error handling;
- CLI compatibility;
- CLI test requirements;
- features intentionally deferred from V1.

The CLI is the primary operational interface between developers and the Ranu.js framework.

---

# 2. CLI Objective

The CLI should make the normal Ranu.js workflow predictable:

```text
Create
  ↓
Develop
  ↓
Build
  ↓
Validate
  ↓
Start / Adapt / Deploy
```

Canonical commands:

```bash
Ranu.js create
Ranu.js dev
Ranu.js build
Ranu.js start
```

Deployment adapters may add a deployment-preparation flow without making provider deployment part of the core build command.

---

# 3. CLI Principles

## CLI-P01 — Predictable

The same command and inputs must have deterministic semantics.

## CLI-P02 — Safe

Destructive behavior must be explicit and constrained.

## CLI-P03 — Local-First

Core development and build commands must work without a cloud account.

## CLI-P04 — Provider-Neutral

Core CLI commands must not require a hosting provider.

## CLI-P05 — Actionable Diagnostics

Errors must explain what failed, where, and what the user can do next.

## CLI-P06 — Scriptable

Commands must behave correctly in CI and non-interactive shells.

## CLI-P07 — Stable Exit Codes

Automation must be able to distinguish success and failure.

## CLI-P08 — No Hidden Global State

Project behavior comes from the project, CLI arguments, and documented environment—not opaque machine-wide state.

## CLI-P09 — Framework-Owned Lifecycle

The CLI coordinates Ranu.js subsystems through public/internal framework contracts rather than shelling out to unrelated framework commands.

## CLI-P10 — Minimal V1 Surface

Only commands with stable semantics should ship as core V1 commands.

---

# 4. CLI Binary

The canonical executable is:

```bash
Ranu.js
```

It is installed by the Ranu.js package or an official CLI package.

Possible package layouts:

```text
Ranu.js
```

or:

```text
@ranu/cli
```

The final npm packaging decision may change, but the public binary remains:

```text
Ranu.js
```

---

# 5. Local CLI Preference

When invoked through:

```bash
npx Ranu.js
pnpm exec Ranu.js
yarn Ranu.js
bunx Ranu.js
```

the project-local compatible ranu CLI should be preferred.

The CLI must not silently use an incompatible globally installed framework version when a local version exists.

---

# 6. Global CLI Behavior

A globally installed launcher may locate and delegate to the project's local Ranu.js installation.

If the project-local version is incompatible with the launcher, the CLI must fail with a clear upgrade/install message.

---

# 7. CLI Version Source

`Ranu.js --version` reports the effective CLI/framework version actually executing the command.

Example:

```text
Ranu.js 1.0.0
```

Debug mode may additionally show:

```text
CLI package version
framework core version
Node.js version
platform
architecture
```

---

# 8. Node Version Validation

Before executing framework commands, Ranu.js validates the current Node.js version against the supported V1 baseline.

Unsupported versions fail early.

Example:

```text
RANU_NODE_VERSION_UNSUPPORTED

Current:
  Node.js 18.19.0

Required:
  Node.js >= <RANU_V1_BASELINE>

Upgrade Node.js and run the command again.
```

The exact baseline is locked by framework release policy.

---

# 9. Command Grammar

General form:

```bash
Ranu.js <command> [arguments] [options]
```

Examples:

```bash
Ranu.js dev
Ranu.js dev --port 4000
Ranu.js build
Ranu.js start --host 0.0.0.0
Ranu.js create my-app
```

---

# 10. Root Help

Running:

```bash
Ranu.js
```

with no command should display concise help rather than performing a hidden action.

Example command list:

```text
create
dev
build
start
deploy
help
version
```

`deploy` may initially mean deployment preparation/adapter invocation rather than mandatory remote publishing.

---

# 11. Help

Supported:

```bash
Ranu.js --help
Ranu.js help
Ranu.js help dev
Ranu.js dev --help
```

Help output must be usable without network access.

---

# 12. Version

Supported:

```bash
Ranu.js --version
Ranu.js version
```

It exits successfully after printing the effective Ranu.js version.

---

# 13. Unknown Command

Example:

```bash
Ranu.js buidl
```

must fail with a clear diagnostic.

The CLI may suggest a close known command:

```text
Unknown command "buidl".
Did you mean "build"?
```

It must not automatically execute the guessed command.

---

# 14. Unknown Flag

Unknown flags fail by default.

Example:

```bash
Ranu.js build --prodution
```

must not be silently ignored.

This prevents false assumptions in CI and deployment scripts.

---

# 15. Project Root

Every project command resolves an Ranu.js project root.

Default starting point:

```text
current working directory
```

The CLI walks upward only according to documented project discovery rules.

---

# 16. Project Root Markers

A project may be recognized through a combination of:

```text
package.json
ranu.config.*
app/
Ranu.js package dependency
```

The exact discovery algorithm must avoid accidentally selecting an unrelated parent project.

---

# 17. Explicit Root

Commands should support an explicit project root option.

Conceptual:

```bash
Ranu.js build --root ./apps/web
```

The resolved root must be normalized to an absolute path internally.

---

# 18. Root Safety

The CLI must reject invalid/nonexistent project roots.

Commands that clean generated files must constrain deletion to known Ranu.js-owned paths under the resolved project root.

---

# 19. Monorepo Behavior

Ranu.js should work inside monorepos.

Example:

```text
repo/
├── apps/
│   └── website/
│       ├── ranu.config.ts
│       └── app/
└── packages/
```

Running inside `apps/website` resolves that Ranu.js application.

Running at monorepo root without an unambiguous Ranu.js app should not guess.

---

# 20. Ambiguous Project Discovery

If multiple candidate Ranu.js applications are equally plausible, the CLI fails and requests an explicit `--root`.

It must not randomly choose one.

---

# 21. Configuration Discovery

Canonical config:

```text
ranu.config.ts
```

Possible supported variants may include:

```text
ranu.config.js
ranu.config.mjs
```

TypeScript is the preferred documented format.

---

# 22. Config Precedence

If multiple supported config files exist simultaneously, Ranu.js must not merge them.

It should either:

1. use a documented strict precedence; or
2. fail due to ambiguous configuration.

V1 preferred rule:

```text
multiple Ranu.js config files = error
```

This prevents hidden configuration.

---

# 23. No Config

A minimal Ranu.js application may run with framework defaults if a config file is not required by the project.

The absence of `ranu.config.ts` is not automatically an error if all required settings have defaults.

---

# 24. Config Loading Failure

Syntax/import/runtime errors in config fail before dev/build startup.

Diagnostics must identify:

```text
config file
cause
stack in debug mode
```

Secrets must not be dumped.

---

# 25. Config Execution Environment

Config executes in a trusted Node.js environment.

It may import Node packages and Ranu.js plugins/adapters.

It is not browser code.

---

# 26. Environment Modes

Core modes:

```text
development
production
```

Command defaults:

```text
Ranu.js dev   → development
Ranu.js build → production
Ranu.js start → production artifact
```

---

# 27. Mode Override

V1 should not expose arbitrary mode strings unless required.

If `--mode` exists, Ranu.js must still preserve the distinction between framework lifecycle mode and application-specific environment naming.

Recommended V1:

```text
development / production are framework-owned
```

Custom deployment environments such as staging should use environment configuration, not redefine rendering/build semantics.

---

# 28. Environment File Loading

If Ranu.js supports dotenv-style files, loading order must be explicit and documented.

Conceptual:

```text
.env
.env.local
.env.development
.env.development.local
```

or production equivalents.

The exact precedence must be implemented once and shared by CLI/build/runtime tooling.

---

# 29. Environment File Safety

Environment files must never be copied automatically into public output.

The CLI must not print full environment contents in debug mode.

---

# 30. Public Environment

Browser-exposed variables follow the build specification:

```text
RANU_PUBLIC_*
```

The CLI must not add alternative hidden exposure rules.

---

# 31. Command Context

Every command resolves a common context.

Conceptual:

```ts
interface CliCommandContext {
  cwd: string;
  projectRoot: string;
  command: string;
  mode: "development" | "production";
  configFile?: string;
  config: ResolvedRanuConfig;
  logger: CliLogger;
  isCI: boolean;
}
```

Command-specific contexts extend this.

---

# 32. `Ranu.js dev`

Canonical development command:

```bash
Ranu.js dev
```

It starts the Ranu.js development environment.

---

# 33. `Ranu.js dev` Responsibilities

`Ranu.js dev` coordinates:

1. Node/version validation;
2. project root discovery;
3. environment loading;
4. Ranu.js config loading;
5. plugin resolution;
6. route compilation;
7. server/client development build initialization;
8. development server startup;
9. HMR/watch infrastructure;
10. plugin development hooks;
11. diagnostics;
12. graceful shutdown.

---

# 34. Dev Default Host

The development server should default to a safe local binding.

Recommended:

```text
127.0.0.1
```

or equivalent localhost behavior.

It must not expose the dev server to the local network by default without explicit intent.

---

# 35. Dev Default Port

Ranu.js should define a documented default port.

Example conceptual:

```text
3000
```

The exact default is a release decision.

---

# 36. Dev Port Collision

If the default port is occupied, Ranu.js may:

- offer/use the next available port in an interactive terminal; or
- fail in CI/non-interactive mode.

Behavior must be explicit in output.

If the user explicitly passes `--port`, Ranu.js should fail rather than silently choose another port unless an explicit fallback option is enabled.

---

# 37. Dev Host Flag

Supported:

```bash
Ranu.js dev --host 0.0.0.0
Ranu.js dev --host 127.0.0.1
```

A convenience form such as:

```bash
Ranu.js dev --host
```

must not have ambiguous semantics unless clearly documented.

---

# 38. Dev Port Flag

Supported:

```bash
Ranu.js dev --port 4000
```

Valid range:

```text
1–65535
```

Invalid values fail before startup.

---

# 39. Dev Open Browser

A convenience flag may be supported:

```bash
Ranu.js dev --open
```

It opens the local development URL after successful startup.

Default:

```text
off
```

This avoids unwanted GUI behavior in scripts.

---

# 40. Dev HTTPS

Automatic local HTTPS is deferred unless a stable certificate strategy is implemented.

V1 development may use HTTP by default.

Custom reverse proxies can provide local HTTPS.

---

# 41. Dev Startup Output

Example:

```text
Ranu.js 1.0.0

Local:    http://127.0.0.1:3000
Mode:     development
Routes:   18
Plugins:  3

✓ Ready in 742ms
```

Network URL may be shown only when bound to a network-accessible host.

---

# 42. Dev Route Errors

Route compilation errors must prevent a misleading "Ready" state.

The dev process may remain alive to allow file fixes, but health/status output must indicate the application currently has compilation errors.

---

# 43. Dev Recoverability

Recoverable source/build errors should not terminate the development process.

Examples:

```text
syntax error
route conflict
client/server boundary error
CSS error
```

After files are fixed, Ranu.js should rebuild and recover.

---

# 44. Dev Fatal Errors

Fatal startup errors terminate the command.

Examples:

```text
invalid config
unsupported Node version
invalid plugin definition
port cannot bind
project root missing
```

---

# 45. Dev HMR

`Ranu.js dev` owns HMR coordination as defined by `06_BUILD_SYSTEM.md`.

The CLI itself does not implement module transformation logic; it initializes and reports the build system's HMR lifecycle.

---

# 46. Dev Restart

Changes to files that require framework restart may trigger an internal controlled restart.

Examples:

```text
ranu.config.ts
certain plugin registrations
environment configuration
```

The CLI should report:

```text
Config changed. Restarting Ranu.js development server...
```

---

# 47. Dev Restart Safety

A restart must:

1. stop watchers/services;
2. run plugin cleanup where possible;
3. release the listening socket;
4. reload config/environment;
5. initialize a new dev context.

It must avoid stacking duplicate watchers.

---

# 48. Dev Cache

Development may use:

```text
.ranu/cache/
```

and other generated dev state.

This cache is disposable.

---

# 49. Dev Clean Flag

Supported conceptually:

```bash
Ranu.js dev --clean
```

It removes Ranu.js-owned development/build caches before startup.

It must not delete:

```text
application source
public/
node_modules/
.git/
user data
```

---

# 50. `Ranu.js build`

Canonical production build command:

```bash
Ranu.js build
```

It creates the provider-neutral Ranu.js production artifact defined in `06_BUILD_SYSTEM.md`.

---

# 51. Build Responsibilities

`Ranu.js build` coordinates:

1. Node/version validation;
2. project discovery;
3. production environment loading;
4. config/plugin resolution;
5. route validation;
6. server/client graph construction;
7. type/build validation as configured;
8. production bundling;
9. static generation;
10. manifest generation;
11. plugin build lifecycle;
12. artifact validation;
13. build summary.

---

# 52. Build Output

Default:

```text
.ranu/build/
```

The framework owns this directory.

Applications must not store source-of-truth data there.

---

# 53. Build Clean Behavior

A production build should not mix incompatible stale output with new output.

Recommended default:

```text
build into temporary/staging directory
→ validate
→ promote to .ranu/build
```

or clean the previous build safely before generation.

---

# 54. Build `--clean`

Supported:

```bash
Ranu.js build --clean
```

This additionally removes relevant Ranu.js build/cache state before compiling.

Deletion remains constrained to Ranu.js-owned paths.

---

# 55. Build Failure Atomicity

If `Ranu.js build` fails, `.ranu/build/` must not appear to contain a newly valid complete build unless the previous valid build is intentionally preserved and clearly identifiable.

A completion marker/build descriptor should distinguish valid artifacts.

---

# 56. Build Success Output

Example:

```text
Ranu.js Production Build

Routes
  Static: 12
  Server: 6
  Client: 2
  API:    4

Assets
  JS:  312 kB
  CSS: 48 kB

Build ID:
  01J...

✓ Build completed in 8.4s

Output:
  .ranu/build/
```

Exact metrics may evolve.

---

# 57. Build Warnings

Warnings do not fail the build unless configured as errors.

Examples:

```text
large client bundle
deprecated plugin API
unused deployment hint
large plugin metadata
```

Security/correctness violations are errors, not warnings.

---

# 58. Build CI Behavior

In CI:

- no interactive prompts;
- deterministic output;
- non-zero exit on build failure;
- no automatic port fallback questions;
- no browser opening;
- optional machine-readable diagnostics.

CI detection may use common environment conventions plus explicit `--ci`.

---

# 59. `--ci`

Supported conceptually:

```bash
Ranu.js build --ci
```

This forces non-interactive CI behavior even when automatic detection is unavailable.

---

# 60. Type Checking

If Ranu.js V1 includes integrated TypeScript validation, `Ranu.js build` should run the framework-defined production type-check stage by default.

A temporary escape hatch such as `--no-typecheck` should only exist if explicitly approved because it weakens production validation.

Preferred V1:

```text
production build validates required types
```

---

# 61. Linting

Linting is not automatically part of `Ranu.js build` unless Ranu.js defines its own lint system.

Applications may run lint separately in CI.

This avoids coupling build correctness to a particular lint tool.

---

# 62. Build Sourcemap Flag

If supported:

```bash
Ranu.js build --sourcemap
```

must map to documented build-system source-map modes.

Provider adapters preserve this policy.

---

# 63. Build Debug

Supported:

```bash
Ranu.js build --debug
```

It may show:

```text
route compilation details
plugin ordering
graph classification
cache decisions
manifest paths
deployment capability requirements
```

It must not reveal secrets.

---

# 64. Build Profile

A profiling flag may be supported:

```bash
Ranu.js build --profile
```

It records build-stage timings and potentially bundle analysis metadata.

This is diagnostic output, not application behavior.

---

# 65. `Ranu.js start`

Canonical production runtime command:

```bash
Ranu.js start
```

It runs an already completed Ranu.js production build.

---

# 66. Start Does Not Build

`Ranu.js start` must not silently execute a production build.

If no valid build exists, it fails.

Example:

```text
RANU_BUILD_NOT_FOUND

No valid production build was found at:
  .ranu/build/

Run:
  Ranu.js build
```

---

# 67. Start Does Not Reload Build Plugins

As locked in `07_PLUGIN_SYSTEM.md`:

```text
Ranu.js start
```

does not rediscover or rerun build-time plugins.

It uses the completed production artifact.

---

# 68. Start Config Behavior

Production runtime configuration that was compiled into the artifact must come from the build.

Runtime environment variables remain available as defined by the server runtime.

`Ranu.js start` must not rerun arbitrary build configuration transformations that could change the artifact.

---

# 69. Start Build Validation

Before listening, `Ranu.js start` validates:

```text
build completion marker
manifest schema
build ID consistency
server entry existence
runtime compatibility
```

Corrupt/incomplete builds fail.

---

# 70. Start Host

Supported:

```bash
Ranu.js start --host 0.0.0.0
```

Production default may be:

```text
0.0.0.0
```

for container/server usability, subject to final runtime policy.

This may differ intentionally from the safer local-only `Ranu.js dev` default.

---

# 71. Start Port

Supported:

```bash
Ranu.js start --port 3000
```

An explicit CLI value takes precedence over documented runtime defaults/environment values according to a fixed precedence rule.

---

# 72. Host/Port Precedence

Recommended:

```text
explicit CLI flag
→ documented Ranu.js runtime environment variable
→ framework default
```

Example:

```text
--port
→ PORT
→ 3000
```

This must be consistent.

---

# 73. Start Port Collision

Production start must fail if the requested port cannot be bound.

It must not automatically choose a different port.

Infrastructure needs deterministic listening behavior.

---

# 74. Start Output

Example:

```text
Ranu.js Production Server

Build ID: 01J...
URL:      http://0.0.0.0:3000
Runtime:  Node.js

✓ Ready
```

---

# 75. Production Logging

`Ranu.js start` should keep startup logs concise.

Request logging is governed by runtime/observability configuration, not forced verbose CLI output.

---

# 76. Graceful Shutdown

On:

```text
SIGINT
SIGTERM
```

`Ranu.js start` invokes the graceful shutdown behavior defined by `05_SERVER_RUNTIME_SPEC.md`.

---

# 77. Repeated Shutdown Signal

If graceful shutdown is already in progress, a second interrupt may force faster termination according to a documented policy.

The CLI must not hang indefinitely due to framework-owned resources.

---

# 78. Exit After Shutdown

Successful intentional shutdown exits with:

```text
0
```

Fatal runtime startup failure exits non-zero.

A process killed externally may naturally receive OS/signal-specific status.

---

# 79. `Ranu.js create`

Ranu.js V1 should provide project scaffolding.

Canonical:

```bash
Ranu.js create my-app
```

A separate package such as `create-ranu` may delegate to the same scaffolding implementation.

---

# 80. Create Responsibilities

Project creation should:

1. validate target path;
2. select/default a starter;
3. generate project files;
4. generate package metadata;
5. optionally install dependencies;
6. print next commands.

---

# 81. Create Default Starter

V1 should have one canonical starter that demonstrates the framework without unnecessary demo complexity.

Conceptual:

```text
my-app/
├── app/
│   ├── layout.tsx
│   └── page.tsx
├── public/
├── ranu.config.ts
├── package.json
├── tsconfig.json
└── .gitignore
```

---

# 82. TypeScript Default

New Ranu.js applications should use TypeScript by default.

JavaScript may be supported through an explicit option if the framework product requirements allow it.

---

# 83. Create Package Manager

The scaffolder may detect the invoking package manager:

```text
npm
pnpm
yarn
bun
```

and generate/install accordingly.

It must not silently switch package managers if the user explicitly chooses one.

---

# 84. Package Manager Flag

Conceptual:

```bash
Ranu.js create my-app --package-manager pnpm
```

Allowed values must be validated.

---

# 85. Dependency Installation

Interactive/local default may install dependencies.

A flag should permit skipping installation:

```bash
Ranu.js create my-app --no-install
```

This is useful for CI/template generation.

---

# 86. Git Initialization

Automatic Git initialization may be offered but should not be required.

Conceptual:

```bash
Ranu.js create my-app --git
Ranu.js create my-app --no-git
```

The final default should be documented and non-destructive.

---

# 87. Existing Directory Safety

If the target directory exists and is non-empty, `Ranu.js create` must not overwrite files silently.

It should fail or require explicit safe confirmation in an interactive terminal.

In CI/non-interactive mode, ambiguous overwrite must fail.

---

# 88. Create Force

A `--force` option, if provided, must still protect obviously dangerous targets such as:

```text
/
home directory
project repository root with unrelated files
```

`--force` is not permission for arbitrary recursive deletion.

---

# 89. Template Source

The canonical V1 starter should ship with the CLI/package or come from an official versioned package.

Core project creation should not require downloading an arbitrary remote Git repository.

---

# 90. Offline Create

If dependencies are already available and template assets ship locally, scaffolding should be able to generate files without network access.

Dependency installation may still require the package registry.

---

# 91. Create Output

Example:

```text
Created Ranu.js application:
  ./my-app

Next:

  cd my-app
  npm run dev
```

Generated package scripts should map to Ranu.js commands.

---

# 92. Package Scripts

Recommended generated scripts:

```json
{
  "scripts": {
    "dev": "Ranu.js dev",
    "build": "Ranu.js build",
    "start": "Ranu.js start"
  }
}
```

Provider deployment scripts should not be included by default unless a provider adapter was explicitly selected.

---

# 93. `Ranu.js deploy`

Ranu.js may expose:

```bash
Ranu.js deploy
```

as the deployment-adapter entry point.

Its V1 semantics must preserve the build/deploy separation defined by `08_DEPLOYMENT_ADAPTERS.md`.

---

# 94. Deploy Default Meaning

Preferred V1 behavior:

```text
validate/build if explicitly requested
+
prepare target-specific deployment output
+
optionally publish only if adapter explicitly supports and user requests it
```

The CLI must not assume every adapter performs remote upload.

---

# 95. Deploy Requires Build

Default recommended behavior:

```bash
Ranu.js deploy
```

requires a valid existing generic build, unless a documented flag requests building first.

Example:

```bash
Ranu.js deploy --build
```

This keeps deployment reproducible.

---

# 96. Deploy Adapter Selection

Conceptual:

```bash
Ranu.js deploy --adapter node
Ranu.js deploy --adapter vercel
```

Config may provide the default adapter.

CLI override takes precedence for that invocation.

---

# 97. Deploy Prepare-Only

Supported conceptually:

```bash
Ranu.js deploy --prepare-only
```

This generates target output without remote publication.

For adapters without publishing support, preparation is the normal behavior.

---

# 98. Deploy Publish

If an adapter implements explicit remote publishing:

```bash
Ranu.js deploy --publish
```

may invoke it.

Core Ranu.js must not require provider credentials for preparation.

---

# 99. Deploy Output

Example:

```text
Ranu.js Deployment

Adapter:  vercel
Build ID: 01J...
Runtime:  Node.js

✓ Capabilities validated
✓ Target package generated

Output:
  .ranu/deploy/vercel/
```

If published:

```text
✓ Deployment published
```

with provider-specific destination information.

---

# 100. Deploy Failure

Deployment preparation failure must not modify the generic `.ranu/build/` artifact.

Adapter output should use its own staging/final directory.

---

# 101. `Ranu.js clean`

A dedicated clean command may be included if needed:

```bash
Ranu.js clean
```

If shipped, it deletes only Ranu.js-owned generated state.

Conceptual targets:

```text
.ranu/build/
.ranu/cache/
.ranu/deploy/
```

---

# 102. Clean Default

`Ranu.js clean` should not delete:

```text
node_modules
package manager cache
public
application source
.env files
.git
```

---

# 103. Clean Granularity

Possible flags:

```bash
Ranu.js clean --build
Ranu.js clean --cache
Ranu.js clean --deploy
Ranu.js clean --all
```

A minimal V1 may rely on `--clean` flags on dev/build instead of shipping a standalone command.

---

# 104. Destructive Confirmation

Cleaning known `.ranu/` generated directories does not require interactive confirmation if paths are validated as framework-owned.

Any operation outside those paths must not be part of normal clean behavior.

---

# 105. Diagnostics Command

A future/core utility may be:

```bash
Ranu.js doctor
```

It can inspect:

```text
Node version
Ranu.js version
config
package manager
project root
plugins
adapter compatibility
build artifact health
```

This is useful but not required for minimal V1 if equivalent diagnostics exist in commands.

---

# 106. Route Inspection

A useful future command may be:

```bash
Ranu.js routes
```

It displays the compiled route manifest.

This is optional for V1 but the underlying route inspection API should exist for tests/debugging.

---

# 107. Build Inspection

A future command may be:

```bash
Ranu.js inspect
```

for manifests, graphs, plugins, and deployment capabilities.

V1 can initially expose this through:

```bash
Ranu.js build --debug
```

---

# 108. Core V1 Commands

Required stable V1 commands:

```text
Ranu.js create
Ranu.js dev
Ranu.js build
Ranu.js start
Ranu.js help
Ranu.js version
```

Deployment adapter invocation should also be available before provider adapter release, either as:

```text
Ranu.js deploy
```

or a clearly equivalent stable command.

---

# 109. Global Flags

Potential global flags:

```text
--help
--version
--root
--debug
--verbose
--quiet
--json
--ci
```

Not every flag must apply to every command.

Invalid combinations should fail or be explicitly ignored with a warning—never silently mislead.

---

# 110. `--verbose`

`--verbose` increases operational detail.

Examples:

```text
config path
plugin list
route counts
cache status
adapter stages
```

It is intended for humans.

---

# 111. `--debug`

`--debug` exposes deeper framework diagnostics.

Examples:

```text
hook timing
module classification
stack traces
manifest paths
dependency traces
internal phase timings
```

It must still redact secrets.

---

# 112. `--quiet`

`--quiet` suppresses non-essential informational output.

Errors still print.

Warnings may print unless a separate policy suppresses them.

---

# 113. `--json`

Machine-readable output should be available for commands where automation benefits.

Conceptual:

```bash
Ranu.js build --json
```

Output should be valid JSON or newline-delimited JSON according to one documented format.

It must not mix human banners into stdout.

---

# 114. Machine-Readable Output Channels

Recommended:

```text
stdout → machine result/diagnostics
stderr → unexpected fatal process-level messages
```

when `--json` is active.

The exact contract must be tested.

---

# 115. JSON Diagnostic Shape

Conceptual:

```json
{
  "type": "diagnostic",
  "level": "error",
  "code": "RANU_ROUTE_CONFLICT",
  "message": "Two routes compile to the same pathname.",
  "file": "app/...",
  "details": {}
}
```

Secret-bearing arbitrary objects must not be included.

---

# 116. JSON Completion Shape

Conceptual:

```json
{
  "type": "result",
  "command": "build",
  "success": true,
  "buildId": "01J...",
  "outputDirectory": ".ranu/build"
}
```

Schema versioning may be added before stable automation guarantees.

---

# 117. Color Output

Human output may use terminal color when supported.

Respect:

```text
NO_COLOR
```

and non-TTY environments.

Color must never be required to understand diagnostics.

---

# 118. Unicode Output

CLI symbols such as:

```text
✓
✗
→
```

may be used when terminal capability permits.

A plain-text fallback should remain readable on limited terminals.

---

# 119. TTY Detection

Interactive prompts are permitted only when:

```text
stdin/stdout are interactive
and
CI/non-interactive mode is not active
```

Commands must never hang waiting for input in CI.

---

# 120. Prompts

Core project commands should minimize prompts.

Explicit flags are preferred for reproducible workflows.

Project creation may use a small number of prompts when arguments are omitted.

---

# 121. Prompt Defaults

Every interactive prompt must have:

```text
clear question
safe default
non-interactive equivalent flag
```

---

# 122. No Runtime Confirmation Prompts

`Ranu.js build` and `Ranu.js start` should not ask ordinary confirmation questions.

They are expected to be automation-friendly.

---

# 123. Logging Architecture

CLI output should use a shared Ranu.js logger.

Subsystems report structured diagnostics to the CLI rather than printing arbitrary output directly.

Plugins receive plugin-attributed loggers.

Adapters receive adapter-attributed loggers.

---

# 124. Log Levels

Conceptual:

```text
debug
info
warn
error
```

Human presentation may additionally use success/progress states.

---

# 125. Progress Indicators

Interactive terminals may show spinners/progress.

Non-interactive/CI output must use stable line-based logs.

Progress animation must never corrupt CI logs.

---

# 126. Error Format

Human-facing fatal error structure:

```text
<ERROR CODE>

<short message>

Context:
  ...

Cause:
  ...

Fix:
  ...
```

Not every error needs every section.

---

# 127. Error Codes

CLI-specific codes may include:

```text
RANU_CLI_UNKNOWN_COMMAND
RANU_CLI_UNKNOWN_OPTION
RANU_CLI_INVALID_ARGUMENT
RANU_CLI_PROJECT_NOT_FOUND
RANU_CLI_PROJECT_AMBIGUOUS
RANU_CLI_CONFIG_AMBIGUOUS
RANU_CLI_CONFIG_LOAD_FAILED
RANU_CLI_PORT_INVALID
RANU_CLI_PORT_IN_USE
RANU_CLI_BUILD_NOT_FOUND
RANU_CLI_NON_INTERACTIVE_REQUIRED
RANU_CLI_CREATE_TARGET_NOT_EMPTY
RANU_CLI_UNSAFE_PATH
```

Subsystem errors retain their subsystem codes.

---

# 128. Stack Traces

Default human output should avoid overwhelming users with internal stacks.

`--debug` shows stack traces for framework/plugin/config failures where useful.

Application runtime errors in development may show source-oriented stacks according to the runtime/build system.

---

# 129. Internal Error Handling

Unexpected internal framework failures should produce:

```text
RANU_INTERNAL_ERROR
```

with:

- concise default message;
- debug stack;
- framework version;
- command.

The CLI must not mislabel user source errors as internal errors.

---

# 130. Exit Codes

Core convention:

```text
0 = success
non-zero = failure
```

Ranu.js may use a small stable set of specific codes.

---

# 131. Recommended Exit Code Classes

Conceptual:

```text
0   success
1   general command/framework failure
2   CLI usage/argument error
3   project/config validation failure
4   build/compile failure
5   runtime startup failure
6   deployment adapter failure
```

Exact numeric values must be finalized once and documented.

---

# 132. No Success on Partial Failure

A command must not exit `0` if its requested primary operation failed.

Example:

```text
build failed but warnings printed
```

must exit non-zero.

---

# 133. Warnings Exit Code

Warnings alone do not change success exit code unless a strict option explicitly treats warnings as errors.

---

# 134. Strict Warnings

A future/global flag may support:

```bash
Ranu.js build --warnings-as-errors
```

Useful for CI.

Not required for minimal V1.

---

# 135. Signals

CLI commands must handle:

```text
SIGINT
SIGTERM
```

appropriately.

One-shot commands should stop cleanly where possible.

Long-running commands invoke subsystem cleanup.

---

# 136. Dev SIGINT

First `Ctrl+C`:

```text
begin graceful dev shutdown
```

Cleanup includes:

```text
watchers
dev server
plugin dev resources
temporary handles
```

---

# 137. Start SIGTERM

Production `SIGTERM` triggers server graceful shutdown.

This is essential for containers/orchestrators.

---

# 138. Build Interruption

If `Ranu.js build` is interrupted:

- stop build workers/processes;
- avoid promoting incomplete artifact;
- release temporary resources;
- exit non-zero/signal-appropriate.

---

# 139. Child Processes

If Ranu.js spawns framework-owned child processes/workers, it must terminate them during shutdown.

Plugins remain responsible for plugin-owned child processes, though cleanup hooks should be invoked.

---

# 140. Lock Files

Ranu.js may use a process lock to prevent unsafe simultaneous operations on the same generated output.

Examples:

```text
two Ranu.js build processes writing .ranu/build
build and clean racing
```

The exact lock mechanism must work cross-platform.

---

# 141. Dev + Build Concurrency

Running `Ranu.js dev` and `Ranu.js build` simultaneously may be allowed if their generated state is isolated safely.

If they share incompatible cache/output paths, Ranu.js must coordinate or fail rather than corrupt state.

---

# 142. Start + Build Concurrency

A running production server should continue using its completed build artifact.

A new build should be created atomically and must not mutate files currently required by the running process in unsafe ways.

Deployment processes should normally restart/switch after build completion.

---

# 143. Cache Directory

Canonical disposable cache:

```text
.ranu/cache/
```

Subdirectories may include:

```text
build/
dev/
plugins/
transforms/
```

The CLI owns lifecycle coordination.

---

# 144. Cache Corruption

If cache data is invalid, Ranu.js should discard/recompute it rather than fail permanently where possible.

A clean build must always be available.

---

# 145. `RANU_*` CLI Environment

Framework-specific CLI environment variables should be minimal.

Possible documented values:

```text
RANU_DEBUG
RANU_TELEMETRY_DISABLED
```

Only features actually implemented should be documented.

---

# 146. Telemetry

Ranu.js V1 must not silently require telemetry.

If telemetry is implemented later:

- it must be documented;
- it must not contain source/secrets;
- opt-out must be clear;
- core commands must work with telemetry disabled.

Telemetry is deferred unless explicitly added by product requirements.

---

# 147. Network Access

Core commands:

```text
Ranu.js dev
Ranu.js build
Ranu.js start
```

must not require Ranu.js cloud services.

Network access may still occur because:

- application build code fetches data;
- plugins access networks;
- package installation occurs;
- provider publishing occurs.

Ranu.js core itself remains local-first.

---

# 148. Update Checks

Automatic CLI update checks are deferred or must be non-blocking.

Core command execution must not fail because an update service is unavailable.

---

# 149. Package Manager Detection

Ranu.js may detect package manager from:

```text
packageManager field
lockfile
invocation context
```

Explicit user choice takes precedence.

---

# 150. Lockfile Handling

The CLI must not rewrite or delete package-manager lockfiles during normal dev/build/start.

Project creation may create/update them only through dependency installation.

---

# 151. Workspace Packages

Ranu.js must support application imports from workspace packages according to the build system.

The CLI must not assume every dependency exists under a flat `node_modules` layout.

---

# 152. Windows Support

The CLI must work on Windows.

Requirements include:

```text
path normalization
signal/shutdown fallbacks
process spawning
file locking
port handling
shell-independent command execution
```

Core logic must not depend on Bash.

---

# 153. Linux Support

Linux is a primary supported environment for:

```text
local development
CI
containers
production servers
```

---

# 154. macOS Support

macOS should be supported for local development.

Platform-specific filesystem behavior must be covered by tests where practical.

---

# 155. Path Output

Human output may use platform-native paths.

Machine-readable manifests/IDs should use normalized conventions defined by the build system.

---

# 156. Shell Safety

The CLI should invoke Node APIs or spawn commands with argument arrays rather than constructing unsafe shell strings.

User-provided paths/arguments must not become shell injection vectors.

---

# 157. Create Path Validation

Project names/paths must reject unsafe control characters and invalid filesystem targets.

Scoped/npm naming rules may be used for package names separately from directory names.

---

# 158. Package Name Derivation

If the directory name cannot safely become an npm package name, the CLI should normalize it or ask/provide an explicit package-name option.

It must not generate invalid `package.json`.

---

# 159. Config Secrets in Logs

If config contains:

```text
API keys
tokens
passwords
private URLs
```

debug output must not serialize the whole config object.

Diagnostics should print field names/locations, not secret values.

---

# 160. Plugin CLI Integration

V1 plugins cannot arbitrarily register top-level CLI commands unless a later stable CLI extension API is defined.

This preserves command namespace stability.

---

# 161. Plugin Lifecycle in Commands

Command integration:

```text
Ranu.js dev
  → plugin setup/config/dev hooks

Ranu.js build
  → plugin setup/config/build hooks

Ranu.js start
  → no build-plugin rediscovery
```

as defined by `07_PLUGIN_SYSTEM.md`.

---

# 162. Deployment Adapter CLI Integration

`Ranu.js deploy` loads the configured/selected deployment adapter after validating the generic build.

Adapter-specific flags should preferably be namespaced or passed through adapter configuration.

Core CLI should not accumulate every provider's options.

---

# 163. Provider Flag Namespace

Avoid:

```text
--vercel-region
--aws-memory
--cloudflare-compat-date
```

as permanent core global flags.

Prefer:

```text
adapter config
```

or a documented adapter-specific argument namespace.

---

# 164. Deployment Authentication

If a provider adapter supports publishing, authentication is adapter/provider-owned.

Core `Ranu.js build` and `Ranu.js start` must never require those credentials.

---

# 165. CLI Configuration Precedence

For settings that may exist in multiple places, precedence must be explicit.

General recommended model:

```text
CLI flag
→ command-specific environment variable
→ Ranu.js config
→ framework default
```

Not every setting needs every layer.

---

# 166. Boolean Flags

Boolean flags should support clear forms:

```text
--open
--no-open
```

where both states are meaningful.

Avoid ambiguous string booleans such as:

```text
--open=false
```

unless parser behavior is documented.

---

# 167. Repeated Flags

For list options, repeated flags may append:

```bash
--include a --include b
```

For scalar options, repeated conflicting values should use a documented rule or fail.

V1 preferred:

```text
last explicit scalar value wins
```

with debug visibility.

---

# 168. Flag Aliases

Short aliases should be limited to common unambiguous options.

Examples:

```text
-h = --help
-v = --version
```

Avoid excessive single-letter flags that become hard to evolve.

---

# 169. Deprecating Flags

Deprecated flags should:

1. continue working during the deprecation window;
2. print a warning;
3. identify replacement;
4. be removed only under versioning policy.

---

# 170. CLI Compatibility

Within an Ranu.js major version, existing documented command semantics should remain stable where practical.

Breaking changes require release notes/migration guidance and normally a major version.

---

# 171. Help Stability

Scripts must not parse human `--help` output as an API.

Automation should use documented machine-readable modes.

---

# 172. CI Output

CI logs should be:

```text
line-based
non-animated
timestamp-capable if enabled
deterministic enough for debugging
```

No interactive cursor manipulation.

---

# 173. CI Environment Detection

Ranu.js may detect common:

```text
CI=true
```

style environments.

Explicit `--ci` always enables CI behavior.

---

# 174. CI Fail Fast

Production build should fail as soon as a fatal correctness error makes successful completion impossible.

Independent validation may still be batched when it improves diagnostics without producing invalid output.

---

# 175. CI Artifacts

Machine-readable build summaries should make it easy to archive:

```text
.ranu/build/
build diagnostics
profile data
deployment output
```

The CLI does not need to upload CI artifacts itself.

---

# 176. Deterministic Build Command

Given equivalent:

```text
source
dependencies
config
plugins
environment inputs
Ranu.js version
```

`Ranu.js build` should produce functionally equivalent output.

CLI timestamps/progress are not part of artifact semantics.

---

# 177. Current Working Directory

Commands must not unexpectedly change the user's shell working directory.

Internal operations use absolute resolved paths.

---

# 178. Process Environment Mutation

The CLI may load environment variables into its process for command execution, but should avoid globally mutating unrelated parent-shell state—which is impossible for ordinary child processes anyway.

Subprocesses inherit only the intended environment.

---

# 179. Temporary Directories

Framework temporary files should live under:

```text
.ranu/
```

or OS temporary directories with Ranu.js-owned unique paths.

Cleanup must be best-effort and safe.

---

# 180. File Watching Limits

`Ranu.js dev` should watch only relevant project/workspace files.

It must avoid recursively watching:

```text
.git
.ranu/build
large unrelated directories
```

unless explicitly required.

---

# 181. Symlinked Workspaces

Watch/build project discovery must handle legitimate workspace symlinks without infinite recursion.

Security-sensitive path operations must still prevent escaping framework-owned deletion/output roots.

---

# 182. Error Recovery Guidance

Diagnostics should provide commands only when accurate.

Examples:

```text
Run:
  Ranu.js build
```

or:

```text
Try:
  Ranu.js build --clean
```

The CLI must not reflexively recommend cache clearing for unrelated errors.

---

# 183. Framework Bug Reporting

An internal error may print a concise bug-report payload:

```text
Ranu.js version
Node version
OS
command
error code
```

It must not include application secrets/source automatically.

---

# 184. Development Browser Error UI

Browser error overlays belong to the development build/runtime system.

The CLI remains the terminal representation of the same diagnostics.

Error codes/source locations should be consistent between them where practical.

---

# 185. Command Timing

Verbose/profile output may report:

```text
config load
plugin setup
route compile
server build
client build
static generation
manifest validation
adapter preparation
```

This helps identify slow stages.

---

# 186. No Hidden Build on Start

Locked rule:

```text
Ranu.js start ≠ Ranu.js build + start
```

The production server only starts an existing valid artifact.

---

# 187. No Hidden Deploy on Build

Locked rule:

```text
Ranu.js build ≠ provider deployment
```

Build output remains local/provider-neutral.

---

# 188. No Hidden Install on Dev

`Ranu.js dev` must not automatically install missing dependencies.

It should fail with an actionable package/dependency error.

Automatic dependency mutation during development startup is too surprising.

---

# 189. No Hidden Package Upgrade

Core commands must not automatically upgrade Ranu.js/plugins/dependencies.

Version changes are explicit package-manager operations.

---

# 190. No Hidden Source Rewrite

`Ranu.js dev`, `Ranu.js build`, and `Ranu.js start` must not rewrite application source files as part of normal execution.

Code generation goes to Ranu.js-owned generated locations unless an explicit scaffold/migration command is invoked.

---

# 191. Migrations

Automated framework migration/codemod commands are deferred.

A future command may be:

```bash
Ranu.js migrate
```

but it requires a separate safety/specification contract.

---

# 192. Interactive REPL

An Ranu.js REPL/shell is deferred.

It is not needed for V1 framework operation.

---

# 193. CLI Plugin Commands

Third-party command registration is deferred as defined by `07_PLUGIN_SYSTEM.md`.

If later added, command namespaces and security/compatibility must be specified separately.

---

# 194. Remote Dev

Remote/cloud development sessions are not part of core V1 CLI.

`Ranu.js dev` is local process-based development.

---

# 195. Built-In Deployment Publishing

Direct publishing to every provider is not required for V1.

Adapter preparation plus provider CLI/CI integration is sufficient.

---

# 196. Command API Internals

The CLI implementation should separate:

```text
argument parser
command definitions
project resolver
config loader
environment loader
logger/diagnostics
command runner
framework services
```

This makes commands testable without spawning a full shell process for every unit test.

---

# 197. Command Definition Contract

Conceptual internal structure:

```ts
interface CliCommand {
  name: string;
  description: string;
  run(context: ParsedCommandContext): Promise<number | void>;
}
```

Public third-party registration is not implied.

---

# 198. Parser Requirements

The parser must support:

```text
long options
selected short aliases
boolean negation
string values
numeric validation
-- separator where needed
help/version
unknown option detection
```

It should not rely on shell-specific parsing.

---

# 199. `--` Separator

Where command passthrough is supported, conventional:

```bash
Ranu.js <command> -- <args>
```

may separate Ranu.js arguments from downstream arguments.

No core V1 command should require passthrough unless clearly defined.

---

# 200. CLI Test Strategy

Required layers:

```text
parser unit tests
project discovery tests
config tests
environment tests
command service tests
process-level CLI tests
dev server E2E
build E2E
start E2E
create E2E
deployment adapter CLI E2E
signal tests
CI tests
Windows/Linux tests
security/path tests
```

---

# 201. Parser Test Matrix

At minimum:

- no args;
- help;
- version;
- known command;
- unknown command;
- typo suggestion;
- known flag;
- unknown flag;
- missing flag value;
- invalid number;
- boolean flag;
- negated boolean;
- repeated scalar flag;
- `--` separator;
- command help.

---

# 202. Project Discovery Test Matrix

At minimum:

- Ranu.js project in cwd;
- nested directory inside project;
- explicit `--root`;
- nonexistent root;
- monorepo app;
- ambiguous monorepo root;
- no Ranu.js project;
- multiple config files;
- no config with valid defaults.

---

# 203. Dev Test Matrix

At minimum:

- starts successfully;
- default host;
- explicit host;
- default port;
- explicit port;
- invalid port;
- occupied explicit port;
- recoverable source error;
- route conflict recovery;
- config restart;
- plugin dev hook;
- HMR;
- full reload;
- `--clean`;
- SIGINT;
- no browser opening in CI.

---

# 204. Build Test Matrix

At minimum:

- successful build;
- invalid route;
- server/client boundary violation;
- plugin build failure;
- static generation failure;
- manifest validation;
- build ID;
- clean build;
- cache reuse;
- corrupted cache recovery;
- interrupted build;
- incomplete artifact not promoted;
- debug output;
- JSON output;
- CI exit code.

---

# 205. Start Test Matrix

At minimum:

- valid build;
- missing build;
- incomplete build;
- corrupt manifest;
- host flag;
- port flag;
- `PORT` env;
- explicit flag precedence;
- occupied port;
- runtime private env;
- no plugin rediscovery;
- SSR;
- API;
- static assets;
- streaming;
- SIGTERM graceful shutdown.

---

# 206. Create Test Matrix

At minimum:

- create named project;
- TypeScript default;
- generated package scripts;
- selected package manager;
- skip install;
- existing empty directory;
- non-empty directory refusal;
- unsafe target refusal;
- offline file generation;
- generated app builds;
- generated app starts.

---

# 207. Deploy CLI Test Matrix

At minimum:

- valid existing build;
- missing build;
- explicit adapter;
- config adapter;
- CLI adapter precedence;
- incompatible adapter;
- capability failure;
- prepare-only;
- adapter output directory;
- generic build remains unchanged;
- adapter failure exit code;
- JSON output.

---

# 208. Signal Test Matrix

At minimum:

- dev SIGINT;
- dev repeated SIGINT;
- start SIGTERM;
- build interruption;
- plugin cleanup;
- child worker cleanup;
- port release;
- no incomplete artifact promotion.

---

# 209. CI Test Matrix

At minimum:

- `CI=true`;
- explicit `--ci`;
- no prompts;
- no spinners;
- stable line output;
- correct exit codes;
- JSON diagnostics;
- no automatic browser;
- no automatic port selection after explicit conflict.

---

# 210. Security Test Matrix

At minimum:

- unsafe root;
- clean path traversal;
- create path traversal;
- malicious filename;
- shell metacharacters in paths;
- config secret redaction;
- environment secret redaction;
- symlink deletion escape;
- output directory containment;
- no `.env` public copying.

---

# 211. Cross-Platform Test Matrix

At minimum:

```text
Windows
Linux
```

Preferably macOS.

Validate:

```text
paths
process spawning
signals/fallbacks
ports
file locks
symlinks
package manager detection
```

---

# 212. Performance Requirements

CLI overhead should be small relative to framework work.

Measure:

```text
CLI startup
config load
dev ready time
incremental rebuild time
production build time
production startup time
adapter preparation time
```

Avoid loading unnecessary heavy build modules for:

```text
Ranu.js --help
Ranu.js --version
```

---

# 213. Lazy Command Loading

The CLI should lazily import heavy command implementations where practical.

Example:

```text
Ranu.js --version
```

should not initialize the bundler.

---

# 214. Error Localization

Parser errors happen before project loading.

Project errors happen before framework build initialization.

This keeps failures fast and understandable.

---

# 215. CLI Acceptance Criteria

The Ranu.js V1 CLI is complete when:

1. the canonical executable is `Ranu.js`;
2. no-argument invocation shows help;
3. `--help` works;
4. `--version` works;
5. unknown commands fail clearly;
6. likely command typos may be suggested but never auto-executed;
7. unknown flags fail;
8. supported Node.js version is validated before framework execution;
9. project root discovery works;
10. explicit `--root` works;
11. ambiguous project discovery fails;
12. monorepo application roots work;
13. canonical `ranu.config.ts` loads;
14. multiple config files do not silently merge;
15. config failures identify the file/cause;
16. environment loading is command-mode aware;
17. environment values are not dumped into logs;
18. `Ranu.js dev` starts the development server;
19. dev defaults to a safe local binding;
20. `--host` works;
21. `--port` works;
22. invalid ports fail;
23. explicit occupied dev ports do not silently change;
24. recoverable source errors do not require restarting the dev command;
25. config changes can trigger controlled dev restart;
26. dev restart does not duplicate watchers;
27. `Ranu.js dev --clean` removes only Ranu.js-owned generated state;
28. `Ranu.js build` creates the generic production artifact;
29. build output is validated before success;
30. failed builds do not produce a misleading completed artifact;
31. `Ranu.js build` does not deploy to a provider;
32. build works non-interactively in CI;
33. `Ranu.js start` requires an existing valid build;
34. `Ranu.js start` never silently builds;
35. `Ranu.js start` does not rediscover build plugins;
36. runtime private env remains available;
37. start host/port precedence is deterministic;
38. production port collision fails;
39. graceful SIGTERM works;
40. `Ranu.js create` generates a valid Ranu.js project;
41. TypeScript is the default starter language;
42. generated package scripts use Ranu.js commands;
43. project creation never silently overwrites non-empty targets;
44. package-manager selection is deterministic;
45. dependency installation can be skipped;
46. deployment adapter invocation is available through the CLI;
47. deployment preparation consumes a valid generic build;
48. deployment failure does not mutate the generic build;
49. core commands require no Ranu.js cloud account;
50. global human logging is consistent;
51. plugin logs are attributable;
52. adapter logs are attributable;
53. `--verbose` works;
54. `--debug` works;
55. debug output redacts secrets;
56. `--quiet` works where supported;
57. machine-readable output exists for automation-relevant commands;
58. JSON mode does not mix human banners into stdout;
59. success exits `0`;
60. command failure exits non-zero;
61. CLI usage errors are distinguishable from build/runtime failures;
62. CI mode never waits for interactive input;
63. progress animation is disabled in non-TTY/CI output;
64. color is optional and respects terminal conventions;
65. SIGINT/SIGTERM cleanup is implemented;
66. interrupted builds do not promote incomplete output;
67. framework-owned child processes are cleaned up;
68. generated-path deletion is constrained to Ranu.js-owned locations;
69. shell injection through user paths/arguments is prevented;
70. Windows and Linux command tests pass.

---

# 216. Locked V1 CLI Decisions

The following are locked by this specification:

1. The canonical CLI binary is `Ranu.js`.
2. Core V1 commands include `create`, `dev`, `build`, `start`, help, and version.
3. Deployment adapter invocation is exposed through a stable CLI path.
4. Running `Ranu.js` without a command displays help.
5. Unknown commands fail rather than execute guesses.
6. Unknown flags fail rather than being silently ignored.
7. Ranu.js validates Node.js compatibility before framework commands run.
8. Project commands operate from a resolved project root.
9. `--root` may explicitly select an application.
10. Ambiguous monorepo discovery fails rather than guessing.
11. `ranu.config.ts` is the canonical config format.
12. Multiple simultaneous Ranu.js config files are treated as ambiguous rather than merged.
13. Config executes in trusted Node.js context.
14. Framework lifecycle modes are development and production.
15. `Ranu.js dev` uses development mode.
16. `Ranu.js build` uses production mode.
17. `Ranu.js start` runs a completed production artifact.
18. `Ranu.js dev` defaults to a safe local network binding.
19. `Ranu.js start` may default to a production/container-friendly binding.
20. Explicit port values are validated.
21. Production start never auto-selects a different occupied port.
22. `Ranu.js dev` owns development server/HMR lifecycle coordination.
23. Recoverable source errors should not kill the dev process.
24. Fatal config/project/startup errors do kill the dev command.
25. Dev config changes may trigger a controlled restart.
26. `Ranu.js build` creates provider-neutral output.
27. `Ranu.js build` never silently deploys.
28. Build completion is atomic/validated.
29. `Ranu.js start` never silently builds.
30. `Ranu.js start` does not rerun build-time plugin setup.
31. Runtime environment variables remain separate from build-time public values.
32. `Ranu.js create` uses TypeScript by default.
33. Project scaffolding never silently overwrites non-empty directories.
34. New projects receive `dev`, `build`, and `start` package scripts.
35. Core dev/build/start do not automatically install dependencies.
36. Core commands do not automatically upgrade Ranu.js or plugins.
37. Core dev/build/start do not rewrite application source.
38. Ranu.js-generated disposable state lives under framework-owned paths such as `.ranu/`.
39. Clean operations are constrained to Ranu.js-owned generated paths.
40. Human CLI output uses shared structured diagnostics.
41. Plugins use plugin-attributed logging.
42. Deployment adapters use adapter-attributed logging.
43. Default output hides unnecessary internal stack traces.
44. `--debug` may expose stacks and deep diagnostics.
45. Debug output must still redact secrets.
46. CI behavior is non-interactive.
47. CI output does not use animated terminal progress.
48. Machine-readable output is supported for automation-relevant operations.
49. Exit code `0` means success.
50. Failed requested operations never return success.
51. SIGINT/SIGTERM are handled by long-running commands.
52. Production SIGTERM triggers graceful server shutdown.
53. Interrupted builds cannot be promoted as complete builds.
54. CLI command parsing is shell-independent.
55. User paths are not interpolated into unsafe shell command strings.
56. Windows is a supported CLI platform.
57. Linux is a supported CLI platform.
58. Core ranu CLI does not require Ranu.js cloud services.
59. Third-party plugins cannot register arbitrary core CLI commands in V1.
60. Provider-specific flags do not pollute the core CLI namespace by default.

---

# 217. Deferred CLI Features

The following are deferred unless later specifications explicitly add them:

- interactive Ranu.js REPL;
- arbitrary third-party CLI command registration;
- remote/cloud development;
- automatic framework upgrades;
- automatic plugin upgrades;
- automatic dependency installation during `dev`;
- automatic source migrations;
- `Ranu.js migrate` codemod system;
- provider account management;
- universal direct provider publishing;
- DNS management;
- domain management;
- secret synchronization;
- database provisioning;
- cloud logs command;
- remote shell;
- remote build service;
- package registry login;
- Ranu.js plugin marketplace commands;
- automatic telemetry;
- mandatory update checks;
- local HTTPS certificate authority;
- production process manager;
- Kubernetes management;
- background-job CLI;
- cron management;
- queue management.

These features must not block a complete local-first V1 CLI.

---

# 218. Relationship to Product Requirements

`01_PRODUCT_REQUIREMENTS.md` defines the framework's developer-facing product goals.

The CLI is responsible for making those capabilities operational without requiring developers to manually coordinate internal Ranu.js packages.

The CLI must remain simple enough that the normal workflow is:

```bash
npm run dev
npm run build
npm run start
```

---

# 219. Relationship to Framework Architecture

`02_FRAMEWORK_ARCHITECTURE.md` defines subsystem boundaries.

The CLI is an orchestrator, not the implementation of:

```text
routing
rendering
server runtime
build graph
plugin system
deployment adaptation
```

It calls those subsystems through stable internal interfaces.

---

# 220. Relationship to Routing

`03_ROUTING_SPECIFICATION.md` owns route compilation and route errors.

The CLI:

- triggers route compilation;
- presents diagnostics;
- may inspect/display route counts.

It does not implement a second route parser.

---

# 221. Relationship to Rendering

`04_RENDERING_MODEL.md` owns static/server/client rendering behavior.

The CLI does not choose rendering modes.

`Ranu.js build` executes the rendering/static-generation plan produced by the framework.

---

# 222. Relationship to Server Runtime

`05_SERVER_RUNTIME_SPEC.md` owns request handling and graceful production shutdown.

`Ranu.js dev` and `Ranu.js start` initialize the appropriate runtime modes.

The CLI owns process-level lifecycle and presentation.

---

# 223. Relationship to Build System

`06_BUILD_SYSTEM.md` owns:

```text
module graphs
bundling
HMR
static generation
manifests
build artifacts
```

`Ranu.js build` is the user-facing command that invokes that system.

The CLI must not bypass build validation.

---

# 224. Relationship to Plugin System

`07_PLUGIN_SYSTEM.md` owns plugin resolution and lifecycle hooks.

The CLI invokes plugin-aware framework phases.

It does not expose arbitrary plugin command registration in V1.

---

# 225. Relationship to Deployment Adapters

`08_DEPLOYMENT_ADAPTERS.md` owns target packaging and capability mapping.

The CLI provides the user-facing adapter invocation while preserving:

```text
build
≠
deploy
```

The generic Ranu.js artifact remains the adapter input.

---

# 226. Required Next Specification

The next document in the Ranu.js development sequence should be:

```text
10_CONFIGURATION_SYSTEM.md
```

It should define:

- `ranu.config.ts`;
- `defineConfig()`;
- configuration schema;
- defaults;
- config resolution;
- environment-aware configuration;
- plugin registration;
- deployment adapter configuration;
- build configuration;
- server configuration;
- route/render defaults;
- public/private configuration boundaries;
- merge rules;
- CLI override precedence;
- validation;
- deprecation;
- configuration typing;
- configuration test matrix.

---

# 227. Final CLI Baseline

Ranu.js V1 exposes one canonical developer command:

```text
Ranu.js
```

The normal lifecycle is:

```bash
Ranu.js create
Ranu.js dev
Ranu.js build
Ranu.js start
```

with deployment adapter preparation available through the CLI without making provider deployment part of the production build itself.

`Ranu.js dev` initializes the Ranu.js development environment, route compiler, server/client development graphs, HMR, plugins, and local server.

`Ranu.js build` creates a validated provider-neutral production artifact.

It does not upload or deploy that artifact.

`Ranu.js start` runs an existing completed build.

It never silently builds and never reruns build-time plugin discovery.

`Ranu.js create` safely scaffolds a TypeScript Ranu.js application and never silently overwrites a non-empty target.

The CLI validates project roots, configuration, Node.js compatibility, flags, ports, and generated paths before performing framework work.

Human diagnostics are concise and actionable.

Debug output provides deeper technical detail without leaking secrets.

CI execution is non-interactive, line-oriented, and returns reliable exit codes.

Machine-readable output is available for automation-relevant commands.

Signals and process cleanup are handled correctly for development and production servers.

All destructive operations are constrained to framework-owned generated paths.

Core Ranu.js commands remain local-first and do not require an Ranu.js cloud service or hosting-provider account.

Provider-specific behavior belongs to deployment adapters rather than polluting core CLI semantics.

This specification is the authoritative Ranu.js V1 command-line interface contract.

---

**End of 09_CLI_SPECIFICATION.md**
