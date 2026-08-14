# 08_DEPLOYMENT_ADAPTERS.md

**Project:** Ranu.js — JavaScript/TypeScript Full-Stack Web Framework  
**Document Type:** Deployment Adapter Specification  
**Status:** Development Baseline  
**Date:** 2026-08-10  
**Depends On:** `00_FRAMEWORK_VISION.md`, `01_PRODUCT_REQUIREMENTS.md`, `02_FRAMEWORK_ARCHITECTURE.md`, `03_ROUTING_SPECIFICATION.md`, `04_RENDERING_MODEL.md`, `05_SERVER_RUNTIME_SPEC.md`, `06_BUILD_SYSTEM.md`, `07_PLUGIN_SYSTEM.md`  
**Primary V1 Runtime:** Node.js  
**Primary V1 Deployment Target:** Generic Node.js / Container  
**Provider Strategy:** Adapter-based, provider-neutral core

---

# 1. Purpose

This document defines the Ranu.js V1 deployment adapter architecture.

It specifies:

- the generic Ranu.js deployment artifact;
- deployment adapter responsibilities;
- adapter identity and versioning;
- capability declarations;
- Node standalone deployment;
- Docker/container deployment;
- serverless deployment mapping;
- static asset deployment;
- route mapping;
- middleware mapping;
- environment handling;
- streaming requirements;
- filesystem requirements;
- external dependency packaging;
- build/deploy separation;
- provider-specific configuration;
- deployment manifests;
- adapter diagnostics;
- compatibility validation;
- Vercel adapter strategy;
- Cloudflare/future runtime boundaries;
- provider lock-in prevention;
- deployment testing and acceptance criteria.

The deployment adapter system converts Ranu.js's provider-neutral production artifact into a deployment-target-specific package without changing application semantics.

---

# 2. Deployment Objective

The core deployment flow is:

```text
Ranu.js Application Source
        ↓
     Ranu.js build
        ↓
Generic Ranu.js Production Artifact
        ↓
Deployment Adapter
        ↓
Target-Specific Deployment Package
        ↓
Deployment Platform
```

The generic Ranu.js build must remain useful independently of any commercial hosting provider.

---

# 3. Core Rule

Ranu.js core does not compile an application directly into a provider SDK.

The authoritative application semantics remain:

```text
Ranu.js Router
Ranu.js Rendering Model
Ranu.js Server Runtime
Ranu.js Build Manifests
```

A deployment adapter maps those semantics to a target environment.

---

# 4. Deployment Principles

## DEP-P01 — Provider-Neutral Core

Core Ranu.js applications must not require Vercel, Cloudflare, AWS, Netlify, or another provider SDK.

## DEP-P02 — Generic Artifact First

`Ranu.js build` produces a valid generic production artifact before provider adaptation.

## DEP-P03 — Capability Validation

An adapter must declare what the target can support.

## DEP-P04 — No Silent Semantic Downgrades

Unsupported target capabilities must produce errors or explicit documented limitations.

## DEP-P05 — Manifest-Driven Mapping

Adapters consume Ranu.js manifests rather than rediscovering routes from application source.

## DEP-P06 — Environment Separation

Build-time public configuration and runtime-private environment configuration remain distinct.

## DEP-P07 — Deployment Reproducibility

Adapters should produce deterministic packages from equivalent Ranu.js artifacts and adapter configuration.

## DEP-P08 — Secure Defaults

Private server files, source maps, environment files, and secrets must not become public assets.

## DEP-P09 — Adapter Isolation

Provider-specific logic belongs in adapters, not core routing/rendering APIs.

## DEP-P10 — Portable Applications

Moving between compatible deployment targets should require deployment configuration changes, not application rewrites.

---

# 5. Deployment Target Categories

Ranu.js recognizes conceptual target categories:

```text
standalone-node
container
serverless-node
static-host
future-edge
```

V1 guarantees:

```text
standalone-node
container
```

V1 architecture should permit:

```text
serverless-node
```

through adapters.

Edge runtimes are future targets and are not part of the core V1 runtime guarantee.

---

# 6. Generic Production Artifact

`Ranu.js build` produces the generic artifact defined in `06_BUILD_SYSTEM.md`.

Conceptual:

```text
.ranu/
└── build/
    ├── BUILD_ID
    ├── manifest/
    │   ├── routes.json
    │   ├── server.json
    │   ├── client.json
    │   └── static.json
    ├── server/
    │   ├── entry.mjs
    │   ├── runtime/
    │   ├── routes/
    │   └── chunks/
    ├── static/
    │   ├── pages/
    │   └── assets/
    └── types/
```

Adapters must consume this artifact.

They must not require source route discovery.

---

# 7. Deployment Descriptor

Ranu.js should generate a deployment-oriented descriptor in or alongside the generic build.

Conceptual:

```json
{
  "schemaVersion": 1,
  "buildId": "01J...",
  "runtime": "node",
  "entry": "./server/entry.mjs",
  "manifests": {
    "routes": "./manifest/routes.json",
    "server": "./manifest/server.json",
    "client": "./manifest/client.json",
    "static": "./manifest/static.json"
  },
  "publicAssetRoot": "./static/assets"
}
```

The exact filename/schema is implementation-specific but must be versioned.

---

# 8. Deployment Adapter

A deployment adapter is an implementation that transforms or describes the generic Ranu.js artifact for a target.

Conceptual:

```ts
interface RanuDeploymentAdapter {
  name: string;
  apiVersion: number;
  capabilities: DeploymentCapabilities;

  prepare(
    context: DeploymentAdapterContext
  ): Promise<DeploymentResult>;
}
```

The final interface may be split into multiple hooks, but the architectural responsibility remains fixed.

---

# 9. Adapter vs Plugin

Deployment adapters are not ordinary Ranu.js plugins.

A plugin:

```text
extends framework lifecycle
```

A deployment adapter:

```text
maps a completed Ranu.js application artifact to a target environment
```

A provider package may contain both a plugin and deployment adapter, but those roles must remain logically separate.

---

# 10. Adapter Registration

Ranu.js should support an explicit deployment target in config or CLI.

Conceptual config:

```ts
export default defineConfig({
  deployment: {
    adapter: "node"
  }
});
```

or:

```ts
import nodeAdapter from "@ranu/adapter-node";

export default defineConfig({
  deployment: {
    adapter: nodeAdapter()
  }
});
```

Exact public syntax is finalized with CLI/config implementation.

---

# 11. CLI Override

Deployment adapter selection may be overridden by a deployment command where appropriate.

Conceptual:

```bash
Ranu.js deploy --adapter vercel
```

However, `Ranu.js build` itself must remain capable of producing the generic artifact without requiring a provider adapter.

---

# 12. Adapter Identity

Every adapter has a stable name.

Examples:

```text
node
container
vercel
cloudflare
```

Official packages may use names such as:

```text
@ranu/adapter-node
@ranu/adapter-vercel
```

Final package naming is a release decision.

---

# 13. Deployment Adapter API Version

V1 adapter API version:

```text
1
```

Adapters declare:

```ts
apiVersion: 1
```

Unsupported versions fail before adaptation.

---

# 14. Framework Compatibility

An adapter may declare compatible Ranu.js versions.

Conceptual:

```ts
Ranu.js: "^1.0.0"
```

This is validated before adapter execution.

---

# 15. Adapter Capabilities

Every adapter must declare target capabilities.

Conceptual:

```ts
interface DeploymentCapabilities {
  runtime: "node" | "edge" | "static";
  ssr: boolean;
  apiRoutes: boolean;
  middleware: boolean;
  streaming: boolean;
  staticFiles: boolean;
  runtimeEnvironment: boolean;
  writableFilesystem: "none" | "temporary" | "persistent";
  longLivedProcess: boolean;
}
```

The final capability model may be more detailed.

---

# 16. Capability Validation

Before adaptation, Ranu.js compares application requirements with adapter capabilities.

Example:

```text
Application requires:
  SSR
  API routes
  streaming

Adapter supports:
  static only
```

The deployment must fail before producing a misleading artifact.

---

# 17. Required Application Capabilities

The generic build/deployment descriptor should allow Ranu.js to derive required capabilities from the application.

Examples:

```text
has server-rendered routes
has API routes
has middleware
requires Node built-ins
has streaming routes
has static-only routes
```

Adapters should not need to inspect source code to infer these.

---

# 18. No Silent Fallback

An adapter must not silently transform:

```text
SSR → static
API route → unavailable
streaming → buffered response
Node runtime → incompatible edge runtime
```

unless that behavior is explicitly part of a documented compatible mapping and does not violate Ranu.js semantics.

Unsupported semantics fail.

---

# 19. Deployment Phases

Conceptual:

```text
1. Load completed Ranu.js artifact
2. Validate artifact integrity
3. Load deployment adapter
4. Validate adapter compatibility
5. Derive application capabilities
6. Compare target capabilities
7. Generate target package/config
8. Trace/copy required runtime dependencies
9. Map public/static assets
10. Generate target route/function mapping
11. Validate target package
12. Emit deployment summary
```

Actual upload/publish may be handled separately.

---

# 20. Build vs Deploy

Ranu.js distinguishes:

```text
build
```

from:

```text
deploy
```

`Ranu.js build` creates application output.

Deployment adaptation creates target-specific output/configuration.

Publishing/uploading may be performed by:

- Ranu.js adapter tooling;
- provider CLI;
- CI;
- container registry tooling;
- platform integration.

These layers should not be conflated.

---

# 21. Generic Node Target

The reference V1 deployment target is generic Node.js.

It must work without provider-specific services.

Conceptual:

```bash
Ranu.js build
Ranu.js start
```

or direct execution of the generated production entry.

---

# 22. Node Standalone Adapter

The Node standalone adapter packages everything required to run the Ranu.js Node runtime on a conventional server.

Output may conceptually be:

```text
.ranu/deploy/node/
├── server/
├── static/
├── manifest/
├── package.json
└── START_INFO
```

The exact layout may reuse `.ranu/build/` if no transformation is necessary.

---

# 23. Node Runtime Requirements

The standalone adapter must declare:

```text
supported Node.js version
required environment variables
listening host/port contract
external production dependencies
filesystem expectations
```

The Node baseline must match `05_SERVER_RUNTIME_SPEC.md`.

---

# 24. Node Start Contract

Production startup should support:

```bash
Ranu.js start
```

and/or:

```bash
node .ranu/build/server/entry.mjs
```

depending on final packaging.

The canonical user-facing command remains:

```bash
Ranu.js start
```

---

# 25. Host and Port

Generic Node deployment should support conventional runtime configuration such as:

```text
HOST
PORT
```

with Ranu.js-documented defaults.

Provider adapters may bind through provider-specific invocation instead of opening a socket.

---

# 26. Reverse Proxy Compatibility

Generic Node Ranu.js must work behind reverse proxies such as:

```text
Nginx
Caddy
HAProxy
cloud load balancers
```

Correct forwarded-header trust behavior belongs to server runtime configuration.

The deployment adapter must not assume direct public internet exposure.

---

# 27. Static Asset Serving on Node

The Node runtime may serve:

```text
/_ranu/*
public assets
generated static pages
```

directly.

For production scale, a reverse proxy/CDN may serve these assets instead.

Both paths must preserve the same public URLs.

---

# 28. Immutable Asset Caching

Content-hashed assets under:

```text
/_ranu/assets/
```

should support long-lived immutable cache headers.

Conceptual:

```text
Cache-Control: public, max-age=31536000, immutable
```

HTML/static route responses must not automatically receive the same immutable policy.

---

# 29. Static HTML Caching

Static-generated HTML may be cacheable, but policy must reflect Ranu.js rendering semantics.

V1 static pages are build-generated and remain unchanged until a new deployment.

Adapters/CDNs may therefore cache them according to configured policy.

---

# 30. Public Assets

Files from the application `public/` directory retain their stable public paths.

Because their filenames may not be content-hashed, adapters must not assume they are immutable forever.

---

# 31. Container Target

Container deployment is a first-class V1 deployment path.

The Ranu.js generic Node artifact should be container-friendly without requiring framework-specific container orchestration.

---

# 32. Container Strategy

Recommended model:

```text
Build Stage
  install dependencies
  Ranu.js build

Runtime Stage
  copy production artifact
  copy required runtime dependencies
  run Ranu.js production entry
```

Multi-stage container builds are recommended.

---

# 33. Dockerfile Ownership

Ranu.js may provide a generated/sample Dockerfile.

The Dockerfile is not part of application semantics.

Users may customize container base images, process managers, security settings, and deployment infrastructure.

---

# 34. Conceptual Dockerfile

Example only:

```dockerfile
FROM node:<supported>-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:<supported>-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/.ranu/build ./.ranu/build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

EXPOSE 3000

CMD ["node", ".ranu/build/server/entry.mjs"]
```

The final production recommendation may use dependency tracing to copy less than all `node_modules`.

---

# 35. Container Runtime User

Official container guidance should recommend running as a non-root user where practical.

This is deployment hardening, not a framework runtime requirement.

---

# 36. Container Filesystem

Applications must not assume container local filesystem persistence unless their deployment explicitly provides it.

Ranu.js's generated artifact is read-only during normal request handling.

Temporary runtime writes should use an appropriate temp directory.

---

# 37. Health Checks

The Node/container deployment model should permit health checks.

Ranu.js may provide a runtime health endpoint only if explicitly configured; it should not automatically reserve arbitrary public application paths beyond documented namespaces.

Infrastructure may also use TCP/process health checks.

---

# 38. Graceful Shutdown

Container deployments depend on `05_SERVER_RUNTIME_SPEC.md` graceful shutdown behavior.

The Ranu.js Node runtime must respond appropriately to process termination signals and stop accepting new work according to runtime rules.

---

# 39. Horizontal Scaling

Generic Node/container Ranu.js applications should be horizontally scalable when application state is externalized.

The framework must not require in-memory session state for correctness.

Application/plugin state may still introduce such constraints.

---

# 40. Serverless Node Target

Ranu.js architecture should support mapping server execution to Node-compatible serverless functions.

This is an adapter feature.

Core V1 does not require a specific provider.

---

# 41. Serverless Mapping Models

An adapter may choose:

```text
single function
```

or:

```text
multiple route/function groups
```

as long as Ranu.js semantics are preserved.

---

# 42. Single Function Mapping

Conceptual:

```text
all dynamic Ranu.js requests
        ↓
one Ranu.js Node serverless handler
        ↓
Ranu.js router/runtime dispatch
```

Advantages:

- simplest semantics;
- fewer route-mapping differences;
- shared runtime behavior.

Disadvantages:

- larger function;
- potentially slower cold start;
- less provider-specific optimization.

---

# 43. Multi-Function Mapping

Conceptual:

```text
page route groups → SSR functions
API route groups  → API functions
middleware        → provider middleware/entry
static routes     → CDN/static files
```

This may improve scaling/size but requires stronger adapter logic.

The adapter must preserve route precedence and runtime behavior.

---

# 44. Function Grouping

If routes are grouped into functions, grouping must be deterministic.

Possible inputs:

```text
route kind
shared server chunks
runtime requirements
provider size limits
configuration
```

The grouping algorithm is adapter-specific and must not alter URLs.

---

# 45. Serverless Request Adapter

Provider request objects must be normalized into Ranu.js's server runtime request contract.

Conceptually:

```text
Provider Request/Event
        ↓
Provider Adapter
        ↓
Ranu.js Request
        ↓
Ranu.js Runtime Pipeline
        ↓
Ranu.js Response
        ↓
Provider Response
```

Provider-specific event formats must not leak into ordinary Ranu.js route handlers.

---

# 46. Web Standards Boundary

Where possible, provider adapters should normalize to web-standard:

```text
Request
Response
Headers
URL
```

before entering Ranu.js runtime abstractions.

Node-specific runtime services remain available only where the target supports them.

---

# 47. Serverless Streaming

An adapter declaring:

```text
streaming: true
```

must preserve meaningful Ranu.js streaming behavior.

If the provider buffers all output, the adapter must not claim full streaming support.

---

# 48. Streaming Capability Levels

Ranu.js may later distinguish:

```text
none
buffered
streaming
```

rather than a simple boolean.

For V1 capability validation, the implementation must be precise enough to reject targets that cannot satisfy required streaming semantics.

---

# 49. Serverless Timeouts

Providers impose request duration limits.

Adapters should expose/document relevant target limitations.

Ranu.js cannot guarantee that a route completing on a long-lived Node server will fit every serverless timeout.

---

# 50. Serverless Filesystem

Serverless targets commonly provide:

```text
read-only deployment filesystem
temporary writable filesystem
no durable local storage
```

Adapters must declare filesystem capability.

Applications needing durable storage must use external storage.

---

# 51. Serverless Cold Starts

Cold-start optimization is adapter/build optimization.

It must not change application semantics.

Adapters may:

- split functions;
- trace dependencies;
- reduce bundle size;
- preload manifests.

---

# 52. Static-Only Adapter

A static-host adapter may deploy an application only if all required routes can be served statically.

If the application contains:

```text
SSR routes
API routes
runtime middleware
```

and no compatible static mapping exists, deployment fails.

---

# 53. Static Host Output

Conceptual static target:

```text
dist/
├── index.html
├── docs/
│   └── index.html
├── _hfx/
│   └── assets/
└── public assets
```

The adapter may rewrite manifest-mapped static pages into host-friendly path layouts.

---

# 54. Static Dynamic Routes

Dynamic routes are deployable to static hosting only when every supported path is generated during `Ranu.js build`.

Unknown runtime params cannot be handled without a server.

---

# 55. Client-Rendered Static Hosting

A `render = "client"` route may be statically hostable if Ranu.js produces a suitable HTML shell and route mapping.

Deep-link handling may require host rewrite configuration.

The adapter must generate that configuration where supported.

---

# 56. SPA Fallback

Ranu.js must not globally enable SPA fallback for every application because it could mask real 404s and conflict with static/SSR semantics.

A static adapter may use route-specific fallback behavior only where compatible with compiled Ranu.js routes.

---

# 57. Static API Routes

API routes are not converted to static files by default.

A future explicit build-time API export mechanism would require a separate specification.

---

# 58. Middleware Deployment

Ranu.js application middleware is defined by `05_SERVER_RUNTIME_SPEC.md`.

Adapters must map it according to target capability.

---

# 59. Node Middleware Mapping

On generic Node:

```text
middleware executes inside the Ranu.js request pipeline
```

No transformation is required beyond the normal server build.

---

# 60. Serverless Middleware Mapping

A serverless adapter may:

1. execute Ranu.js middleware inside each function; or
2. map compatible middleware to a provider-native middleware layer.

Either approach must preserve Ranu.js middleware ordering and semantics.

---

# 61. Provider-Native Middleware

Provider-native middleware may have different runtime capabilities.

An adapter must not move Node-dependent Ranu.js middleware into an edge/native middleware runtime if it would become incompatible.

Fallback to Node execution is preferred where semantics require it.

---

# 62. Middleware Capability Validation

If an application middleware imports:

```text
Node built-ins
server-only Node packages
```

the adapter must ensure the selected middleware execution target supports them.

Otherwise deployment fails.

---

# 63. Route Mapping

Adapters use `routes.json` and related manifests to generate provider routing configuration.

They must preserve:

```text
static routes
dynamic routes
catch-all routes
optional catch-all routes
API routes
route precedence
not-found behavior
reserved /_ranu/ namespace
```

---

# 64. Route Mapping Source of Truth

The Ranu.js route manifest is authoritative.

Adapters must not independently walk:

```text
app/
```

and reconstruct route patterns.

This prevents provider and Ranu.js routing from diverging.

---

# 65. Provider Rewrites

If a provider requires rewrites, the adapter generates them from Ranu.js route metadata.

Provider rewrites are an implementation detail.

Application developers should not need to duplicate every Ranu.js route in provider config.

---

# 66. Redirects

Application redirects produced at runtime remain Ranu.js responses.

Build-time/provider-level redirect configuration may be added later through explicit Ranu.js config.

Adapters must not infer permanent redirects from arbitrary route behavior.

---

# 67. 404 Mapping

Adapters must preserve Ranu.js not-found semantics.

Static targets may map generated 404 output to provider-specific 404 files.

Dynamic targets should allow the Ranu.js runtime to produce route-aware not-found responses.

---

# 68. Error Mapping

Provider infrastructure errors and Ranu.js application errors are distinct.

Adapters should preserve Ranu.js status/body behavior when the application successfully handles a request.

Provider-level crashes/timeouts may still produce provider-specific responses.

---

# 69. Static Assets

Deployment adapters must publish:

```text
/_ranu/assets/*
```

and other Ranu.js public build assets at their manifest-defined URLs.

They may use:

```text
local server
CDN
object storage
provider static hosting
```

as long as URLs/semantics remain correct.

---

# 70. Asset Prefix

A future configurable asset/CDN prefix may be supported.

If implemented, it must be an Ranu.js build/deployment setting and applied consistently to generated HTML/manifests.

Adapters must not ad hoc rewrite only some asset URLs.

---

# 71. CDN Separation

An adapter may upload static assets to a CDN while server functions run elsewhere.

Conceptual:

```text
Browser
  ├── /_ranu/assets/* → CDN
  └── dynamic routes → Ranu.js server/runtime
```

Build IDs/content hashes ensure compatibility.

---

# 72. Build ID Integrity

Server HTML and client assets from incompatible builds must not be mixed intentionally.

Adapters should deploy build artifacts atomically or use versioned asset paths where the platform supports it.

---

# 73. Atomic Deployment

Preferred deployment sequence:

```text
upload immutable assets
→ upload server functions/runtime
→ validate package
→ switch routing/alias to new deployment
```

Exact atomicity is provider-specific.

Adapters should minimize windows where server and client artifacts disagree.

---

# 74. Rollback

Adapters/providers should preserve build identity so deployments can be rolled back as complete units.

Rollback is primarily a deployment-platform concern.

Ranu.js manifests must make each artifact self-consistent.

---

# 75. Environment Categories

Deployment must preserve the environment model from `06_BUILD_SYSTEM.md`:

```text
public build-time env
private build-time env
private runtime env
```

These categories must not be collapsed.

---

# 76. Public Environment Variables

`RANU_PUBLIC_*` values used by browser code are embedded/compiled during build.

Changing provider runtime environment variables after build does not update those client values.

A rebuild is required.

---

# 77. Private Runtime Environment Variables

Server code may read private values such as:

```text
DATABASE_URL
API_SECRET
SESSION_SECRET
```

from the target runtime environment.

Adapters should map provider secret/env configuration to process/runtime environment without serializing values into deployment manifests.

---

# 78. No Secret Copying

Adapters must not write secret values into:

```text
public assets
client manifests
static JS
deployment metadata intended for public access
```

unless the application explicitly renders/exposes them.

---

# 79. Build-Time Secrets

Some static generation/build plugins may require private build-time secrets.

Those are provided to the build environment.

They must not automatically become runtime secrets or public artifacts.

---

# 80. Environment Validation

Adapters may validate required runtime environment variable names if Ranu.js/application metadata declares them.

They should not require secret values to be stored in the build artifact.

---

# 81. Runtime Environment Declaration

A future Ranu.js API may allow:

```ts
runtimeEnv: [
  "DATABASE_URL",
  "SESSION_SECRET"
]
```

for deployment validation.

This declaration is optional/deferred unless required for V1 adapter implementation.

---

# 82. Node Built-ins

The V1 Ranu.js server runtime supports Node.js.

Generic Node/container adapters therefore support Node built-ins according to the Node version baseline.

---

# 83. Edge Runtime Boundary

An edge target does not automatically support Node APIs.

Therefore an Ranu.js application that imports:

```text
node:fs
node:net
native Node addons
Node-specific database drivers
```

cannot be mapped to an edge runtime without a compatible implementation.

---

# 84. Edge Is Not V1 Core Runtime

Ranu.js V1 does not promise that every Ranu.js server application runs on:

```text
Cloudflare Workers
Vercel Edge Runtime
Deno Deploy
other edge isolates
```

Node.js remains the V1 runtime baseline.

---

# 85. Future Edge Adapter

A future edge adapter requires:

- edge-compatible server runtime adapter;
- module graph capability analysis;
- Web API-compatible runtime abstractions;
- no unsupported Node dependencies;
- streaming validation;
- middleware validation;
- deployment-specific bundling.

This is a separate runtime capability, not just a deployment flag.

---

# 86. External Dependencies

The generic server build may bundle or externalize dependencies.

Deployment adapters must package all required external runtime dependencies.

---

# 87. Dependency Trace Input

Adapters consume build dependency tracing metadata where available.

Conceptual:

```json
{
  "externalDependencies": [
    "package-a",
    "package-b"
  ]
}
```

The adapter must not copy the entire repository merely because dependency tracing is incomplete without warning.

---

# 88. Node Modules Packaging

For standalone/container deployments, initial V1 may include production `node_modules`.

A more optimized traced-dependency output is preferred once stable.

Correctness takes priority over minimum package size.

---

# 89. Native Addons

Native Node addons must match the deployment OS/architecture/Node ABI.

Adapters should detect or document this.

Cross-building native modules for a different runtime environment may require provider/container-specific installation.

---

# 90. Package Manager Files

Deployment output should not require development lockfiles at runtime unless the deployment process installs dependencies from them.

If dependencies are prepackaged, only runtime files are required.

---

# 91. Source Files

Production deployment does not require application source files unless a specific runtime dependency intentionally reads them.

The generic goal is compiled artifact deployment.

---

# 92. Source Maps

Server source maps are deployment-private by default.

Adapters may:

- include them in server-only packages;
- upload them to observability tooling through separate integration;
- omit them from runtime package if configured.

They must not publish them as public static files by default.

---

# 93. Client Source Maps

Public client source maps are included only when build configuration explicitly enables them.

Deployment adapters preserve the build's source map policy.

They must not enable public source maps independently.

---

# 94. Deployment Configuration

Provider-specific settings belong under adapter configuration.

Conceptual:

```ts
deployment: {
  adapter: vercelAdapter({
    regions: ["..."]
  })
}
```

Core Ranu.js config should not accumulate every provider's proprietary settings.

---

# 95. Adapter Config Validation

Each adapter validates its own options.

Ranu.js validates the adapter contract and compatibility.

Errors must identify:

```text
adapter
invalid option
expected type/value
```

---

# 96. Adapter Setup Context

Conceptual:

```ts
interface DeploymentAdapterContext {
  projectRoot: string;
  buildRoot: string;
  buildId: string;
  hfxVersion: string;
  manifests: DeploymentManifests;
  capabilities: ApplicationCapabilities;
  logger: DeploymentLogger;
}
```

The adapter receives the completed artifact, not mutable compiler internals.

---

# 97. Adapter Output

Conceptual result:

```ts
interface DeploymentResult {
  outputDirectory: string;
  target: string;
  files: DeploymentFileSummary[];
  warnings: DeploymentWarning[];
}
```

Publishing may be a separate step.

---

# 98. Adapter Generated Directory

Target-specific output should live under a framework-owned location such as:

```text
.ranu/deploy/<adapter-name>/
```

Example:

```text
.ranu/deploy/vercel/
```

This output is disposable/generated.

---

# 99. Adapter Cleanup

Adapters may clean only their own validated output directory.

They must never recursively delete arbitrary project paths based on unsafe config input.

---

# 100. Deployment Manifest

An adapter may generate target-specific deployment metadata.

Conceptual:

```json
{
  "schemaVersion": 1,
  "adapter": "vercel",
  "adapterVersion": "1.0.0",
  "buildId": "...",
  "functions": [],
  "staticAssets": [],
  "routes": []
}
```

This is separate from core Ranu.js manifests.

---

# 101. Adapter Metadata Privacy

Target deployment manifests must not contain secret values.

They may contain:

```text
environment variable names
route patterns
function mappings
asset paths
runtime versions
regions
```

as required.

---

# 102. Adapter Diagnostics

Conceptual diagnostic categories:

```text
RANU_DEPLOY_ADAPTER_INVALID
RANU_DEPLOY_ADAPTER_INCOMPATIBLE
RANU_DEPLOY_CAPABILITY_UNSUPPORTED
RANU_DEPLOY_ARTIFACT_INVALID
RANU_DEPLOY_ROUTE_MAPPING_FAILED
RANU_DEPLOY_MIDDLEWARE_UNSUPPORTED
RANU_DEPLOY_STREAMING_UNSUPPORTED
RANU_DEPLOY_RUNTIME_UNSUPPORTED
RANU_DEPLOY_DEPENDENCY_MISSING
RANU_DEPLOY_NATIVE_MODULE_INCOMPATIBLE
RANU_DEPLOY_ENV_INVALID
RANU_DEPLOY_OUTPUT_COLLISION
```

Exact codes may be refined.

---

# 103. Capability Error Example

```text
RANU_DEPLOY_CAPABILITY_UNSUPPORTED

Adapter:
  static

Application requires:
  server-rendered route /dashboard

Target capability:
  ssr = false

Choose a Node/serverless adapter or change the route's rendering model explicitly.
```

Ranu.js must not silently convert the route.

---

# 104. Runtime Error Example

```text
RANU_DEPLOY_RUNTIME_UNSUPPORTED

Adapter:
  cloudflare

Module:
  server/database.ts

Requires:
  node:net

The selected target does not provide the Ranu.js Node.js runtime capabilities required by this module.
```

---

# 105. Streaming Error Example

```text
RANU_DEPLOY_STREAMING_UNSUPPORTED

Adapter:
  example-serverless

Route:
  /reports

The route requires streaming response support, but the selected deployment target buffers responses.
```

---

# 106. Deployment Logging

Adapter execution should report:

```text
adapter
target runtime
route/function count
static asset count
output directory
warnings
validation result
```

It should not print secrets.

---

# 107. Dry Run

A deployment adapter system should support a prepare/dry-run mode where practical.

This allows users/CI to inspect target output without publishing it.

Target packaging must not inherently require remote deployment.

---

# 108. Offline Adaptation

If an adapter only generates local deployment files, it should work offline.

Remote provider API calls belong to an optional publish/deploy phase.

This separation improves reproducibility.

---

# 109. Publish Phase

A future adapter may expose:

```text
prepare
publish
```

as separate operations.

Example:

```text
prepare → generate Vercel-compatible output
publish → upload via provider API
```

V1 does not require Ranu.js to implement provider account authentication.

---

# 110. Provider CLI Interoperability

Adapters may generate output that an official provider CLI deploys.

This is preferable to reimplementing provider authentication/upload protocols unnecessarily.

---

# 111. Vercel Strategy

Vercel is an important deployment target but not part of Ranu.js core semantics.

The Vercel adapter should map Ranu.js output to Vercel's supported deployment primitives.

---

# 112. Vercel Adapter Responsibilities

Conceptually:

```text
Ranu.js static assets
→ Vercel static output/CDN

Ranu.js static pages
→ Vercel static files

Ranu.js SSR/API runtime
→ Node-compatible Vercel Functions

Ranu.js routing
→ Vercel routing configuration

Ranu.js middleware
→ Node-compatible execution or provider-native mapping only when semantics permit
```

Exact implementation must follow current Vercel platform contracts at development time.

---

# 113. Vercel Node Runtime First

The initial Ranu.js Vercel adapter should target Node-compatible Vercel Functions rather than forcing Ranu.js applications into an edge runtime.

This aligns with the Ranu.js V1 Node baseline.

---

# 114. Vercel Static Assets

Content-hashed `/_ranu/assets/*` should be deployed as immutable static assets where Vercel supports that mapping.

Public files retain their Ranu.js URL paths.

---

# 115. Vercel Function Strategy

The first implementation should choose the simplest correct function mapping after a prototype:

```text
single Ranu.js function
or
route-grouped functions
```

Correct Ranu.js semantics take priority over aggressive function splitting.

---

# 116. Vercel Streaming

The adapter must verify the current Vercel Node runtime's streaming behavior before declaring the capability.

Provider capability assumptions must be tested against current platform behavior.

---

# 117. Vercel Configuration Isolation

Vercel-specific settings such as regions or function configuration belong to the Vercel adapter.

They must not become generic Ranu.js route APIs unless they represent provider-independent concepts.

---

# 118. Vercel Output Validation

The adapter must validate:

- function entry files exist;
- static files exist;
- Ranu.js route mapping is preserved;
- build ID matches;
- Node runtime compatibility is valid;
- private source maps are not published;
- server-only files are not static assets.

---

# 119. Cloudflare Strategy

Cloudflare deployment is a future target unless the chosen Cloudflare product provides a fully compatible Node execution environment for the required Ranu.js V1 runtime.

The adapter must be based on verified target capabilities, not branding assumptions.

---

# 120. Cloudflare Workers Boundary

A traditional isolate-style Worker runtime is not equivalent to the Ranu.js V1 Node server runtime.

An application using unrestricted Node APIs cannot simply be deployed there through route rewrites.

---

# 121. Cloudflare Future Options

Potential future approaches:

```text
A. edge-compatible Ranu.js runtime adapter
B. limited compatibility mode
C. Cloudflare product with sufficient Node compatibility
```

Any approach requires a separate capability audit and implementation.

---

# 122. Cloudflare Static Assets

Even before a full edge runtime adapter exists, static-only Ranu.js output may be deployable to a Cloudflare static hosting product through a static adapter.

SSR/API support must not be implied by static deployment success.

---

# 123. Other Providers

Future adapters may target:

```text
AWS Lambda
AWS ECS
Google Cloud Run
Azure Functions
Netlify
Fly.io
Railway
Render
DigitalOcean
Bun hosts
Deno hosts
```

Core application APIs must not need provider-specific branches for these targets when capabilities match.

---

# 124. Provider Detection

Ranu.js should not automatically change deployment semantics merely because it detects a provider environment variable.

Explicit adapter selection is preferred.

A provider CLI integration may select an adapter explicitly during build.

---

# 125. No Hidden Auto-Deployment

`Ranu.js build` must not automatically upload code to a provider.

Build is local/CI artifact generation unless a distinct deployment command explicitly publishes.

---

# 126. Provider Credentials

Provider credentials are deployment secrets.

They must not be embedded into Ranu.js build output.

If Ranu.js later supports direct publishing, credentials are read from secure environment/config mechanisms at deploy time.

---

# 127. Custom Domains

Custom domain configuration is a provider/infrastructure concern.

The Ranu.js adapter may expose provider-specific helpers later, but domain ownership/DNS is not part of core application deployment semantics.

---

# 128. TLS

TLS termination may occur at:

```text
reverse proxy
load balancer
CDN
provider platform
```

The Ranu.js Node runtime does not need to terminate TLS itself in ordinary managed deployments.

---

# 129. Forwarded Headers

Behind proxies/providers, Ranu.js must receive correct scheme/host/client information through trusted forwarded headers.

Trust policy belongs to the server runtime configuration.

Adapters may supply safe known proxy defaults only when the provider contract is well-defined.

---

# 130. Base URL

Applications should not require a hard-coded deployment hostname for ordinary routing.

When an absolute origin is required for metadata/callbacks, it should be provided through explicit application/runtime configuration.

Adapters must not guess a permanent public domain.

---

# 131. Preview Deployments

Providers may create temporary preview URLs.

Ranu.js application routing should work without source changes.

Public environment variables that depend on preview URLs may require provider/build integration.

---

# 132. Build-Time Deployment URL

If a provider exposes a preview URL only during/after deployment, it cannot automatically be treated as a universal build-time application origin.

Ranu.js should avoid framework APIs that assume a final domain is always known during build.

---

# 133. Multi-Region Deployment

Multi-region execution is provider-specific.

Adapters may expose region configuration.

Applications using local in-memory state must understand that requests may reach different instances/regions.

---

# 134. Sessions

Ranu.js deployment architecture must not require sticky sessions.

Applications should use signed cookies or external session storage where appropriate.

A provider may support affinity, but core correctness must not depend on it by default.

---

# 135. Cache Storage

In-memory caches are process-local.

Deployment adapters do not magically make them distributed.

A future Ranu.js cache adapter system must distinguish local and shared caches explicitly.

---

# 136. Background Jobs

Long-running background workers are not automatically mapped from Ranu.js API routes.

Deployment adapters may later support provider-specific worker/job primitives through separate specifications.

---

# 137. Cron

Scheduled jobs are not part of the core deployment adapter V1 contract.

Provider cron configuration may be added later.

It must not be inferred from ordinary page/API routes.

---

# 138. WebSockets

WebSocket deployment support is not guaranteed by Ranu.js V1.

If later supported, it requires:

```text
runtime API
server capability
adapter capability
provider validation
```

An adapter must not claim WebSocket support solely because the provider offers some WebSocket product.

---

# 139. Durable Connections

Serverless targets may not support long-lived connections in the same way as standalone Node.

Applications requiring them need compatible deployment targets.

---

# 140. Uploads

Large request body/file upload behavior may differ by provider limits.

Adapters should document relevant target limits.

Core Ranu.js request semantics remain defined by the server runtime.

---

# 141. Response Size Limits

Provider function response limits are target constraints.

Adapters may warn when known, but cannot generally determine application response size at build time.

---

# 142. Function Memory

Provider memory configuration is adapter-specific.

It must not become a core route property unless Ranu.js later defines a provider-neutral resource-hint abstraction.

---

# 143. Function Duration

Likewise, provider timeout configuration belongs to adapters.

Ranu.js route semantics must not depend on a specific provider timeout value.

---

# 144. Regions as Hints

If Ranu.js later introduces deployment hints such as region affinity, they should be provider-neutral concepts with adapter mapping.

V1 may keep region configuration entirely inside provider adapters.

---

# 145. Runtime Capability Manifest

The build should produce or permit derivation of application runtime requirements.

Conceptual:

```json
{
  "runtime": "node",
  "requires": {
    "ssr": true,
    "apiRoutes": true,
    "middleware": true,
    "streaming": true,
    "nodeBuiltins": true
  }
}
```

This enables early adapter validation.

---

# 146. Route-Level Capabilities

Some capabilities may vary by route.

Conceptual:

```json
{
  "page:/reports": {
    "runtime": "node",
    "streaming": true
  }
}
```

This can support future multi-runtime/function mapping without changing route APIs.

---

# 147. Mixed Runtime Applications

Ranu.js V1 does not require one application to mix:

```text
Node routes
Edge routes
```

The V1 baseline is Node server runtime plus static/client assets.

Mixed runtime support is deferred.

---

# 148. Deployment Artifact Security

Adapters must enforce that public deployment roots contain only intended public content.

At minimum, public output must exclude:

```text
.env*
server source maps by default
server manifests not intended for browser
private plugin metadata
server chunks
database files
private keys
.git
```

---

# 149. Secret Scan Tests

Deployment tests should seed known secrets and scan target public output.

Example:

```text
RANU_DEPLOY_TEST_SECRET_...
```

It must not appear in:

```text
public JS
CSS
static assets
public manifests
provider static directories
```

unless application code intentionally renders it.

---

# 150. Path Traversal Protection

Adapter output path generation must reject:

```text
../
absolute path escape
unsafe symlink traversal
```

when emitting target files.

A malformed route/plugin asset must not write outside the adapter output root.

---

# 151. Symlinks

When copying runtime dependencies/assets, adapters must handle symlinks safely.

They must preserve legitimate workspace/package behavior without following arbitrary links into sensitive filesystem locations for public deployment.

---

# 152. Deployment File Permissions

Adapters may set safe file permissions where the platform/package format supports them.

Server runtime files need not be world-writable.

Private key material should never be part of normal deployment output.

---

# 153. Integrity Validation

Before declaring adaptation successful, Ranu.js must validate:

- source build is complete;
- manifest versions are supported;
- build IDs agree;
- adapter compatibility is valid;
- required capabilities are supported;
- all target entry files exist;
- all target public assets exist;
- no required external dependency is missing;
- no output path collision occurred.

---

# 154. Target Validation

Provider adapters should additionally validate provider-specific constraints where practical.

Examples:

```text
function size
runtime version
route config syntax
unsupported filenames
reserved paths
```

Remote-only constraints may still be discovered by provider deployment tooling.

---

# 155. Adapter Failure Atomicity

A failed adapter run must not leave a directory that appears to be a valid completed target package.

Use:

```text
temporary output
→ validate
→ promote/mark complete
```

where practical.

---

# 156. Completion Marker

Target packages may include a completion descriptor.

A deploy/publish command should refuse incomplete target output.

---

# 157. Adapter Cache

Deployment adaptation may use a disposable cache.

Cache keys must include:

```text
build ID/content
adapter version
adapter config
target runtime
```

A clean adaptation path must always exist.

---

# 158. Reproducibility

Equivalent generic build + adapter version/config should produce functionally equivalent target output.

Provider-generated deployment IDs/timestamps may differ.

---

# 159. Debug Output

Adapter debug mode may show:

```text
application capability matrix
adapter capability matrix
route → target mapping
function grouping
static asset mapping
external dependency trace
middleware execution target
```

This is important for diagnosing provider differences.

---

# 160. Deployment Summary

Example:

```text
Ranu.js Deployment Adapter: Vercel

Build ID: 01J...
Runtime: Node.js
Static pages: 18
SSR routes: 6
API routes: 4
Functions: 3
Static assets: 42
Streaming: supported

✓ Capability validation
✓ Route mapping
✓ Runtime packaging
✓ Asset packaging
✓ Target validation

Output:
  .ranu/deploy/vercel/
```

---

# 161. Adapter Test Layers

Required:

```text
adapter contract tests
capability validation tests
Node standalone tests
container tests
route mapping tests
asset tests
middleware tests
environment tests
dependency packaging tests
security tests
provider fixture tests
cross-platform tests
end-to-end deployment tests
```

---

# 162. Node Standalone Test Matrix

At minimum:

- `Ranu.js build`;
- `Ranu.js start`;
- SSR page;
- static page;
- client route;
- API route;
- middleware;
- dynamic route;
- catch-all;
- 404;
- redirect;
- streaming;
- cookies;
- runtime env;
- public assets;
- `/_ranu/` assets;
- graceful shutdown.

---

# 163. Container Test Matrix

At minimum:

- multi-stage build;
- runtime image starts;
- non-root execution where supported;
- correct port binding;
- SSR;
- API;
- static assets;
- runtime secrets;
- no source requirement;
- graceful SIGTERM;
- read-only application artifact;
- horizontal instance compatibility.

---

# 164. Static Adapter Test Matrix

At minimum:

- fully static app succeeds;
- dynamic SSG paths succeed;
- client-rendered static route;
- deep link;
- custom 404;
- public assets;
- Ranu.js assets;
- SSR route fails capability validation;
- API route fails capability validation;
- runtime middleware fails capability validation.

---

# 165. Serverless Adapter Test Matrix

At minimum:

- request normalization;
- response normalization;
- SSR;
- API methods;
- cookies;
- headers;
- redirects;
- dynamic params;
- middleware;
- static bypass;
- streaming if declared;
- runtime env;
- temporary filesystem assumptions;
- cold-start initialization;
- function grouping;
- dependency tracing.

---

# 166. Vercel Adapter Test Matrix

Before stable release, test against current Vercel behavior for:

- Node runtime version;
- static assets;
- SSR;
- API routes;
- dynamic routes;
- middleware strategy;
- streaming;
- cookies;
- redirects;
- preview deployment;
- production deployment;
- runtime environment variables;
- function size/dependency packaging;
- rollback/build identity;
- public source-map policy.

---

# 167. Capability Test Matrix

At minimum:

```text
app requirement     adapter support     result
------------------------------------------------
SSR                 yes                 pass
SSR                 no                  fail
API                 yes                 pass
API                 no                  fail
middleware          yes                 pass
middleware          no                  fail
streaming           yes                 pass
streaming           no                  fail
Node built-ins      node                pass
Node built-ins      static              fail
```

No unsupported combination may silently pass.

---

# 168. Environment Test Matrix

At minimum:

- build-time public env;
- build-time private env;
- runtime private env;
- runtime secret absent;
- runtime secret present;
- no secret in public target output;
- preview env;
- production env;
- adapter config without secret serialization.

---

# 169. Asset Test Matrix

At minimum:

- hashed JS;
- hashed CSS;
- imported image;
- public asset;
- static HTML;
- immutable Ranu.js asset caching;
- non-immutable public asset policy;
- missing asset validation;
- CDN mapping where supported;
- build ID consistency.

---

# 170. Security Test Matrix

At minimum:

- seeded secret scan;
- `.env` exclusion;
- `.git` exclusion;
- server chunk exclusion from public root;
- private source-map exclusion;
- path traversal rejection;
- symlink escape test;
- plugin private metadata exclusion;
- adapter credential exclusion;
- incomplete artifact rejection.

---

# 171. Cross-Platform Tests

Local adaptation must be tested on:

```text
Linux
Windows
```

and preferably macOS.

Container/provider execution may naturally target Linux, but output generation must handle platform path normalization correctly.

---

# 172. Deployment Performance

Measure:

- adapter preparation time;
- target package size;
- server/function bundle size;
- cold start where relevant;
- static asset count;
- deployment upload size;
- startup time.

Optimization must not compromise correctness.

---

# 173. Reference Deployment Fixtures

Maintain reference applications for:

```text
static-only
SSR-only
full-stack SSR + API
client-heavy
middleware-enabled
streaming
Node-built-in dependency
native dependency where supported
```

Each compatible adapter should run the relevant fixture set.

---

# 174. Adapter Acceptance Criteria

The Ranu.js V1 deployment adapter architecture is complete when:

1. `Ranu.js build` produces a provider-neutral production artifact.
2. The generic artifact runs on the Ranu.js Node runtime without a provider adapter.
3. Deployment adapters consume manifests instead of source route discovery.
4. Adapters have stable identities.
5. Adapter API versioning exists.
6. Unsupported adapter API versions fail clearly.
7. Ranu.js/framework compatibility can be validated.
8. Adapters declare target capabilities.
9. Application deployment requirements can be derived from build metadata.
10. Unsupported capability combinations fail before deployment.
11. No adapter silently changes declared route rendering mode.
12. Node standalone deployment works.
13. Node runtime private environment variables work at startup/request time.
14. Ranu.js public browser env remains build-time.
15. Static assets deploy at correct Ranu.js URLs.
16. `/_ranu/` remains reserved.
17. content-hashed assets can use immutable caching.
18. public assets preserve stable paths.
19. container deployment works.
20. container shutdown works correctly.
21. production artifact does not require source route scanning.
22. external runtime dependencies are packaged/traced.
23. native dependency limitations are surfaced.
24. static-only adapter rejects SSR/API/runtime middleware requirements.
25. dynamic SSG paths can deploy to static hosting.
26. serverless request/response normalization architecture is defined.
27. serverless function grouping cannot change URLs.
28. middleware mapping preserves Ranu.js semantics.
29. Node-dependent middleware is not silently moved to incompatible edge runtime.
30. streaming support is capability-validated.
31. route precedence is preserved in provider routing.
32. Ranu.js not-found behavior is preserved.
33. server source maps are private by default.
34. client source-map policy follows build configuration.
35. provider credentials are not embedded into build output.
36. target output excludes private server files from public roots.
37. target path traversal is rejected.
38. incomplete target packages are not marked successful.
39. deployment output is build-ID consistent.
40. adapter debug output can show route/function/asset mapping.
41. Vercel has a defined Node-first adapter strategy.
42. Vercel-specific settings remain isolated to the Vercel adapter.
43. Cloudflare edge deployment is not falsely claimed as Node-compatible.
44. future edge support requires a runtime capability implementation.
45. deployment providers do not become core framework dependencies.
46. applications can move between compatible Node/container targets without source rewrites.
47. adapter tests include security and capability validation.
48. Node standalone and container E2E tests pass.
49. target-specific failures identify the adapter and unsupported requirement.
50. generic Ranu.js artifact remains the authoritative deployment input.

---

# 175. Locked V1 Deployment Decisions

The following are locked by this specification:

1. Ranu.js core is provider-neutral.
2. `Ranu.js build` creates a generic Ranu.js production artifact first.
3. The generic artifact is usable without a commercial hosting provider.
4. Deployment adapters consume completed Ranu.js build artifacts.
5. Deployment adapters do not rediscover application routes from source.
6. Ranu.js manifests are the route/build source of truth for adapters.
7. Deployment adapter API is versioned.
8. V1 deployment adapter API version is `1`.
9. Adapters explicitly declare capabilities.
10. Ranu.js validates application requirements against adapter capabilities.
11. Unsupported capabilities fail rather than silently downgrade semantics.
12. Node.js is the Ranu.js V1 server runtime baseline.
13. Generic standalone Node is a first-class V1 deployment target.
14. Container deployment is a first-class V1 deployment target.
15. Serverless Node is an adapter architecture target.
16. Edge runtimes are not part of the core V1 runtime guarantee.
17. Static-only deployment is allowed only for compatible applications/routes.
18. SSR routes are never silently converted to static by deployment adapters.
19. API routes are never silently removed by deployment adapters.
20. Runtime middleware is never silently dropped.
21. Streaming is capability-validated.
22. Node built-in requirements are capability-validated.
23. Provider request objects are normalized before ordinary Ranu.js route execution.
24. Provider-specific request APIs do not become ordinary route-handler APIs.
25. Static assets may be served by Node, CDN, or provider static hosting.
26. Public asset URLs must remain consistent with Ranu.js manifests.
27. Content-hashed Ranu.js assets may use immutable caching.
28. `public/` files are not automatically treated as immutable.
29. `/_ranu/` remains framework-reserved across all adapters.
30. build ID consistency must be preserved across server/client/static artifacts.
31. deployment should be atomic/version-consistent where target capabilities permit.
32. public `RANU_PUBLIC_*` values remain build-time browser values.
33. private server environment variables may be deployment/runtime values.
34. adapters do not serialize secret values into public manifests.
35. build-time secrets and runtime secrets remain separate concepts.
36. external server dependencies must be bundled, traced, or packaged.
37. native addons must match deployment runtime ABI/platform.
38. production deployment should not require application source files by default.
39. server source maps are private by default.
40. provider-specific configuration belongs to the provider adapter.
41. target-specific output lives under framework-owned generated directories.
42. adapter output is validated before success.
43. failed adaptation must not masquerade as a complete deployment package.
44. Vercel is supported through an adapter, not core Ranu.js semantics.
45. the initial Vercel strategy is Node-runtime first.
46. Vercel function splitting is an implementation optimization, not an application API.
47. Cloudflare Workers/edge isolates are not assumed to be Node-compatible.
48. future Cloudflare edge support requires explicit runtime compatibility work.
49. provider detection does not silently change application deployment semantics.
50. provider credentials never belong in the generic Ranu.js build artifact.
51. custom domains and DNS are deployment infrastructure concerns.
52. TLS normally terminates outside the Ranu.js Node process on managed platforms.
53. multi-region behavior is provider-specific.
54. Ranu.js does not require sticky sessions.
55. local in-memory state is not assumed to be shared across instances.
56. WebSockets are not guaranteed in V1.
57. background jobs and cron are not part of the core V1 deployment adapter contract.
58. mixed Node/Edge route runtimes are deferred.
59. deployment adapters are architecturally distinct from plugins.
60. portable application semantics take priority over provider-specific optimization.

---

# 176. Deferred Deployment Features

The following are deferred unless later specifications add them:

- first-class edge runtime;
- mixed Node/Edge routes;
- Cloudflare Workers full runtime support;
- Deno runtime;
- Bun runtime;
- AWS Lambda official adapter;
- Azure Functions official adapter;
- Netlify official adapter;
- provider-neutral region hints;
- provider-neutral memory/timeout hints;
- WebSocket deployment abstraction;
- background worker abstraction;
- cron/scheduled job abstraction;
- queue deployment abstraction;
- durable object abstraction;
- automatic database provisioning;
- automatic CDN provisioning;
- automatic DNS management;
- automatic TLS certificate management;
- provider account authentication in core;
- direct provider billing integration;
- automatic secret synchronization;
- automatic production rollback command;
- canary deployment abstraction;
- blue/green deployment abstraction;
- multi-cloud orchestration;
- Kubernetes operator;
- remote build service;
- universal native-addon cross compilation.

These must not block a reliable Node/container V1.

---

# 177. Relationship to Framework Architecture

`02_FRAMEWORK_ARCHITECTURE.md` defines deployment as an adapter boundary.

This document makes that boundary concrete.

Conceptually:

```text
Application
    ↓
Core Ranu.js
    ↓
Generic Build Artifact
    ↓
Deployment Adapter
    ↓
Provider / Infrastructure
```

Provider logic must not flow backward into router/render APIs without a provider-neutral framework reason.

---

# 178. Relationship to Routing

`03_ROUTING_SPECIFICATION.md` owns route semantics.

Adapters map compiled route patterns to infrastructure routing.

They must preserve:

```text
URL
params
precedence
route kind
not-found behavior
```

They cannot reinterpret filesystem routing.

---

# 179. Relationship to Rendering

`04_RENDERING_MODEL.md` owns:

```text
static
server
client
```

rendering modes.

Deployment adapters package those modes.

They do not choose a new mode for optimization.

---

# 180. Relationship to Server Runtime

`05_SERVER_RUNTIME_SPEC.md` owns the Ranu.js Node HTTP/runtime semantics.

Generic Node/container deployment executes that runtime directly.

Serverless adapters normalize provider invocation into the same Ranu.js runtime behavior where practical.

---

# 181. Relationship to Build System

`06_BUILD_SYSTEM.md` owns generic artifact generation.

Deployment adapters begin after a valid build exists.

They may perform target-specific bundling/tracing/package transformation, but the generic Ranu.js build remains authoritative.

---

# 182. Relationship to Plugin System

`07_PLUGIN_SYSTEM.md` owns framework lifecycle extensions.

Plugins may contribute deployment metadata through supported Ranu.js mechanisms.

They cannot replace deployment adapter contracts through ordinary plugin hooks.

---

# 183. Relationship to CLI

The next document:

```text
09_CLI_SPECIFICATION.md
```

must define the user-facing commands around:

```text
development
build
start
deployment preparation
diagnostics
project creation
```

The CLI must preserve the separation between generic build and provider deployment.

---

# 184. Required Next Specification

The next document in the Ranu.js development sequence is:

```text
09_CLI_SPECIFICATION.md
```

It should define:

- `Ranu.js` executable behavior;
- `Ranu.js dev`;
- `Ranu.js build`;
- `Ranu.js start`;
- project creation/scaffolding;
- command flags;
- config discovery;
- environment modes;
- host/port flags;
- clean/cache controls;
- debug/verbose output;
- machine-readable diagnostics;
- exit codes;
- deployment adapter invocation;
- version/help commands;
- package manager integration;
- CI behavior;
- signal handling;
- command safety;
- CLI test matrix.

---

# 185. Final Deployment Baseline

Ranu.js V1 is deployable without being tied to a hosting provider.

The framework first produces a generic, validated production artifact containing:

```text
server runtime output
route manifests
server manifest
client manifest
static manifest
static pages
browser assets
build identity
```

Deployment adapters consume that artifact and map it to target infrastructure.

They never reconstruct application routing from source files and never become the source of truth for application semantics.

The reference V1 server deployment is generic Node.js.

Container deployment is a first-class V1 path.

Serverless Node deployment is supported by the adapter architecture and may be implemented provider by provider.

Every adapter declares its runtime and platform capabilities.

Ranu.js validates those capabilities against the compiled application's actual requirements before target packaging.

An adapter cannot silently remove API routes, disable middleware, buffer required streaming while claiming streaming compatibility, change SSR into static rendering, or move Node-dependent code into an incompatible edge runtime.

Static assets may be delivered by the Ranu.js Node server, a CDN, or provider static hosting while preserving Ranu.js public URLs.

`/_ranu/` remains reserved.

Content-hashed framework assets may be cached immutably.

Private environment variables remain server-side.

`RANU_PUBLIC_*` browser configuration remains build-time.

Provider credentials and runtime secrets are never stored in the generic public build metadata.

Vercel support is implemented as an adapter with a Node-first V1 strategy.

Vercel-specific configuration remains inside that adapter.

Cloudflare edge/Worker execution is not falsely treated as equivalent to the Ranu.js Node runtime; full edge support requires an explicit compatible runtime implementation.

Deployment adapters are distinct from plugins, renderers, and the core server runtime.

This architecture allows Ranu.js applications to move between compatible infrastructure targets while retaining the same routing, rendering, server, build, and application contracts.

This specification is the authoritative Ranu.js V1 deployment adapter and portability contract.

---

**End of 08_DEPLOYMENT_ADAPTERS.md**
