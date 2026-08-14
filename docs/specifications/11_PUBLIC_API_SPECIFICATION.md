# 11_PUBLIC_API_SPECIFICATION.md

**Project:** Ranu.js — JavaScript/TypeScript Full-Stack Web Framework  
**Document Type:** Public API Specification  
**Status:** Development Baseline  
**Date:** 2026-08-10  
**Depends On:** `00_FRAMEWORK_VISION.md`, `01_PRODUCT_REQUIREMENTS.md`, `02_FRAMEWORK_ARCHITECTURE.md`, `03_ROUTING_SPECIFICATION.md`, `04_RENDERING_MODEL.md`, `05_SERVER_RUNTIME_SPEC.md`, `06_BUILD_SYSTEM.md`, `07_PLUGIN_SYSTEM.md`, `08_DEPLOYMENT_ADAPTERS.md`, `09_CLI_SPECIFICATION.md`, `10_CONFIGURATION_SYSTEM.md`  
**Primary Public Package:** `Ranu.js`  
**Primary Language:** TypeScript / JavaScript  
**Primary V1 Renderer:** React  
**Primary V1 Runtime:** Node.js  
**API Stability Model:** Stable / Experimental / Internal

---

# 1. Purpose

This document defines the authoritative public API surface for Ranu.js V1.

It specifies:

- public npm package names;
- package boundaries;
- public subpath exports;
- stable vs experimental vs internal APIs;
- application-facing imports;
- configuration exports;
- React exports;
- server-runtime exports;
- plugin author exports;
- CLI/package relationships;
- deployment adapter package naming;
- public TypeScript types;
- peer dependencies;
- runtime dependencies;
- compatibility guarantees;
- semantic versioning expectations;
- deprecation policy;
- experimental API policy;
- internal package policy;
- browser/server export boundaries;
- public API diagnostics;
- API testing requirements.

This document defines what third-party developers may safely depend on.

Repository visibility does not make every exported implementation symbol part of the stable Ranu.js API.

---

# 2. Public API Objective

Ranu.js must provide a small, coherent, predictable API.

The normal application should primarily use:

```text
Ranu.js
Ranu.js/react
Ranu.js/server
Ranu.js/plugin
Ranu.js/config
```

Developers should not need to import internal framework packages to build ordinary applications.

The public API must remain smaller than the implementation.

---

# 3. API Principles

## API-P01 — Intentional Public Surface

Only explicitly documented exports are public API.

## API-P02 — Small Surface

Ranu.js should expose the minimum API needed to build full-stack applications.

## API-P03 — Stable Imports

Public imports must not depend on repository-internal folder structure.

## API-P04 — Clear Runtime Boundaries

Browser-safe, server-only, build-only, and plugin-author APIs must be distinguishable.

## API-P05 — TypeScript First

Public APIs must ship accurate TypeScript declarations.

## API-P06 — Runtime Validation

Configuration/plugin/adapter contracts require runtime validation where appropriate.

## API-P07 — Semantic Compatibility

Stable APIs follow the Ranu.js compatibility policy.

## API-P08 — Explicit Experimental Status

Experimental APIs must be clearly marked.

## API-P09 — No Accidental Internal API

Internal implementation packages must not become stable merely because they are published or visible in GitHub.

## API-P10 — Open-Source Friendly

External contributors must be able to identify the supported public contract without reading private implementation details.

---

# 4. API Stability Classes

Every public-facing Ranu.js symbol belongs to one of three classes:

```text
stable
experimental
internal
```

---

# 5. Stable API

Stable API means:

- documented;
- supported for application use;
- covered by compatibility policy;
- covered by tests;
- changes require deprecation or breaking-version handling.

Examples:

```text
defineConfig
Link
useRouter
redirect
notFound
definePlugin
```

once finalized as stable.

---

# 6. Experimental API

Experimental API means:

- publicly accessible;
- documented as experimental;
- may change faster;
- migration may occur within the same major version if clearly communicated;
- not guaranteed for long-term compatibility.

Experimental APIs should use one or more of:

```text
experimental_ prefix
experimental subpath
documentation badge/warning
TypeScript JSDoc annotation
```

Ranu.js must not present an experimental API as stable.

---

# 7. Internal API

Internal API means:

- implementation-only;
- not supported for application use;
- may change at any time;
- may be inaccessible through package export maps.

Examples include:

```text
private route compiler nodes
private manifest loaders
private build graph internals
private renderer bridge modules
private HMR protocol internals
```

Open-source visibility does not change this status.

---

# 8. Primary Package

The primary package name is:

```text
Ranu.js
```

Ordinary framework applications should install:

```bash
npm install Ranu.js react react-dom
```

or equivalent package-manager command.

---

# 9. Main Package Responsibilities

The `Ranu.js` package provides:

- framework public entry points;
- stable subpath exports;
- public TypeScript types;
- configuration helper;
- framework version metadata where documented.

It should not expose every internal monorepo package.

---

# 10. Canonical Public Subpath Exports

V1 canonical exports are:

```text
Ranu.js
Ranu.js/config
Ranu.js/react
Ranu.js/server
Ranu.js/plugin
```

Potential future exports require an API decision before becoming stable.

---

# 11. `Ranu.js`

The root import should remain intentionally small.

Recommended V1 exports:

```ts
export {
  defineConfig
} from "ranu";
```

Potential public types:

```ts
export type {
  RanuUserConfig,
  RanuConfigContext
} from "ranu";
```

The root package must not become a dumping ground for every submodule export.

---

# 12. `Ranu.js/config`

Canonical configuration-authoring API.

Recommended exports:

```ts
export {
  defineConfig
} from "Ranu.js/config";

export type {
  RanuUserConfig,
  RanuConfigContext
} from "Ranu.js/config";
```

The root `Ranu.js` package may re-export `defineConfig()` for convenience.

---

# 13. `Ranu.js/react`

Application-facing React integration.

Recommended stable V1 exports:

```ts
export {
  Link,
  useRouter,
  usePathname,
  useSearchParams
} from "Ranu.js/react";
```

Potential future exports may include route-aware helpers only after explicit API approval.

---

# 14. `Link`

Canonical import:

```ts
import { Link } from "Ranu.js/react";
```

Conceptual usage:

```tsx
<Link href="/about">
  About
</Link>
```

Stable requirements:

- ordinary anchor-compatible semantics;
- same-origin navigation enhancement where available;
- external URL safety;
- modifier-key behavior preserved;
- no JavaScript required for basic link navigation.

---

# 15. `Link` Public Props

Minimum V1 public props should remain close to HTML anchor semantics.

Conceptual:

```ts
interface LinkProps {
  href: string;
  children?: React.ReactNode;
  replace?: boolean;
  prefetch?: boolean;
}
```

Normal compatible anchor attributes may be supported through React anchor props.

The exact final TypeScript definition must avoid exposing internal router implementation details.

---

# 16. `useRouter()`

Client-only React hook.

Canonical:

```ts
import { useRouter } from "Ranu.js/react";
```

V1 methods:

```ts
interface RanuRouter {
  push(href: string): void | Promise<void>;
  replace(href: string): void | Promise<void>;
  back(): void;
  refresh(): void | Promise<void>;
}
```

Exact return types must be finalized consistently with implementation.

---

# 17. `usePathname()`

Client-only hook.

Conceptual:

```ts
const pathname = usePathname();
```

Returns the current application pathname as a string.

It does not include query string or fragment.

---

# 18. `useSearchParams()`

Client-only hook.

Conceptual:

```ts
const searchParams = useSearchParams();
```

The returned API should be compatible with or closely resemble standard `URLSearchParams` read behavior.

V1 should prefer a read-only wrapper rather than exposing mutation that would not update navigation automatically.

---

# 19. Client Hook Boundary

These APIs are client-only:

```text
useRouter
usePathname
useSearchParams
```

Using them in server-only execution contexts must fail or be rejected through normal React/client-boundary behavior.

---

# 20. `Ranu.js/server`

Canonical server-only application API.

Recommended V1 exports:

```ts
export {
  cookies,
  headers,
  redirect,
  notFound,
  getRequestContext
} from "Ranu.js/server";
```

Additional APIs require explicit approval.

---

# 21. `cookies()`

Server/request-context helper.

Conceptual:

```ts
const cookieStore = cookies();

cookieStore.get("session");
cookieStore.set("session", value, options);
cookieStore.delete("session");
```

Exact mutation availability depends on runtime phase.

The public API must clearly distinguish read-only contexts if necessary.

---

# 22. Cookie Public Types

Conceptual:

```ts
interface RanuCookie {
  name: string;
  value: string;
}
```

and options compatible with standard HTTP cookie concepts:

```text
path
domain
httpOnly
secure
sameSite
maxAge
expires
```

Ranu.js should avoid inventing non-standard cookie terminology without need.

---

# 23. `headers()`

Server/request-context helper.

Conceptual:

```ts
const requestHeaders = headers();
```

It returns a read-oriented `Headers`-compatible interface for incoming request headers.

Response headers are primarily set through returned `Response` objects or explicit runtime APIs.

---

# 24. `redirect()`

Canonical:

```ts
import { redirect } from "Ranu.js/server";

redirect("/login");
```

V1 semantics:

- intentional control flow;
- default 307;
- not handled as ordinary application error;
- valid in supported server/render contexts.

Potential permanent redirect helper may be:

```ts
permanentRedirect()
```

but is not required unless explicitly added.

---

# 25. `notFound()`

Canonical:

```ts
import { notFound } from "Ranu.js/server";

notFound();
```

V1 semantics:

- intentional control flow;
- produces 404 semantics;
- integrates with nearest applicable page not-found boundary.

---

# 26. `getRequestContext()`

Server-only advanced helper.

Conceptual:

```ts
const context = getRequestContext();
```

Potential public shape should remain small:

```ts
interface RequestContext {
  requestId: string;
  routeId?: string;
  params?: Record<string, string | string[]>;
  locals: RequestLocals;
}
```

Only fields with stable application value should be public.

---

# 27. Request Locals

Request locals provide server-only request-scoped storage.

Conceptual:

```ts
context.locals.get("user");
context.locals.set("user", user);
```

The public API must not expose the internal AsyncLocalStorage implementation.

---

# 28. `Ranu.js/plugin`

Canonical public plugin-authoring API.

Recommended exports:

```ts
export {
  definePlugin
} from "Ranu.js/plugin";
```

Public types may include:

```ts
export type {
  RanuPlugin,
  PluginHooks,
  PluginSetupContext
} from "Ranu.js/plugin";
```

Only the stable V1 plugin contract should be exported.

---

# 29. `definePlugin()`

Canonical:

```ts
import { definePlugin } from "Ranu.js/plugin";
```

It provides:

- typed plugin definitions;
- metadata validation support;
- compatibility boundary.

It must not auto-register plugins globally.

---

# 30. Plugin Public API Scope

Stable V1 plugin API includes only the hooks approved in `07_PLUGIN_SYSTEM.md`:

```text
configuration
route metadata
build lifecycle
development lifecycle
controlled build extension where shipped
```

Internal plugin manager APIs remain non-public.

---

# 31. Public Plugin Types

Potential stable types:

```ts
RanuPlugin
PluginSetupContext
PluginHooks
PluginLogger
PluginDiagnostic
PluginRouteInfo
```

Only fields Ranu.js can maintain compatibly should be included.

---

# 32. Deployment Adapter Packages

Deployment adapters are separate packages.

Canonical official naming:

```text
@ranu/adapter-node
@ranu/adapter-container
@ranu/adapter-vercel
```

Future official adapters may include:

```text
@ranu/adapter-cloudflare
@ranu/adapter-aws
```

only when implemented.

---

# 33. Adapter Public API

Each official adapter package exports a typed adapter factory.

Example:

```ts
import { vercelAdapter } from "@ranu/adapter-vercel";

export default defineConfig({
  deployment: {
    adapter: vercelAdapter()
  }
});
```

Alternative default-export style may be used, but one canonical style must be documented.

---

# 34. Adapter Core Types

Deployment adapter authoring types may live in:

```text
hfx/adapter
```

or a dedicated package only if third-party adapter authoring is supported as a stable V1 surface.

If not required for V1 third-party authors, keep adapter internals out of the stable API until the contract matures.

---

# 35. Node Adapter Package

`@ranu/adapter-node` represents the generic Node deployment target where an explicit adapter package is useful.

However, generic:

```bash
Ranu.js build
Ranu.js start
```

must work without requiring application code to import this adapter.

---

# 36. Container Adapter Package

Container deployment may primarily be documentation/template-driven.

If an adapter package exists:

```text
@ranu/adapter-container
```

it must not imply that Docker itself becomes a runtime dependency of Ranu.js.

---

# 37. `create-ranu`

The official project scaffolder package is:

```text
create-ranu
```

Canonical usage should support:

```bash
npm create Ranu.js@latest my-app
```

and equivalent package-manager forms.

It must create an application using supported public APIs only.

---

# 38. CLI Package

The user-facing executable is:

```text
Ranu.js
```

The repository may implement the CLI in:

```text
@ranu/cli
```

internally or as a published package.

Applications should not depend on CLI internal JavaScript APIs unless separately documented.

---

# 39. Internal Monorepo Packages

The repository may contain packages such as:

```text
@ranu/core
@ranu/router
@ranu/runtime
@ranu/runtime-node
@ranu/build
@ranu/dev
@ranu/diagnostics
@ranu/manifests
```

These are internal by default.

Even if published for framework assembly reasons, application developers must not treat them as stable unless explicitly documented.

---

# 40. Export Maps

Public packages must use `package.json` export maps.

Conceptual:

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./react": "./dist/react.js",
    "./server": "./dist/server.js",
    "./plugin": "./dist/plugin.js",
    "./config": "./dist/config.js"
  }
}
```

The exact build layout may differ.

Undocumented internal files should not be importable through deep package paths where practical.

---

# 41. No Deep Internal Imports

Unsupported:

```ts
import something from "hfx/dist/internal/router";
```

or:

```ts
import something from "@ranu/router/src/internal";
```

Public documentation must explicitly discourage deep imports.

Export maps should block them where possible.

---

# 42. Public TypeScript Types

Every stable public API must ship declarations.

Requirements:

- no missing declarations;
- no `any` as a substitute for unresolved public contracts without justification;
- exported generic types should be comprehensible;
- internal implementation types should not leak unnecessarily.

---

# 43. TypeScript Support Policy

Ranu.js should define a supported TypeScript range for each release.

The exact version range is a release policy, not hard-coded permanently in this specification.

Public `.d.ts` output must be compatible with the supported range.

---

# 44. React Peer Dependency

React is an application-level peer dependency of the Ranu.js React renderer.

The main Ranu.js package should declare compatible peer ranges for:

```text
react
react-dom
```

rather than bundling a conflicting private React copy into applications.

---

# 45. React Version Strategy

Ranu.js V1 must target a documented supported React range.

The implementation must not rely on undocumented React internals.

Breaking React requirements require compatibility review.

---

# 46. Node Runtime Requirement

Ranu.js packages used for server/build/CLI execution must declare/document the supported Node.js baseline.

The exact Node version is selected by release policy and enforced by CLI/build tooling.

---

# 47. Browser Compatibility

Browser-facing Ranu.js runtime must define a supported browser policy.

The API specification does not require legacy browser support.

The build system may transpile according to the documented browser baseline.

---

# 48. ESM

Ranu.js V1 public packages should be ESM-first.

Application documentation should use:

```ts
import ...
```

rather than CommonJS `require()` as the primary API.

CommonJS compatibility may exist where practical but is not required to define the public model.

---

# 49. Public Runtime Environment Boundary

Public package exports must respect runtime domains.

Examples:

```text
Ranu.js/react  → browser/client-compatible APIs
Ranu.js/server → server-only APIs
Ranu.js/plugin → build/dev plugin authoring
Ranu.js/config → config/build-side authoring
```

The build system should help prevent cross-boundary misuse.

---

# 50. `Ranu.js/server` Browser Import

Client-reachable modules importing:

```ts
"Ranu.js/server"
```

must fail build/dev validation.

Ranu.js must not ship browser stubs that silently return undefined.

---

# 51. `Ranu.js/plugin` Application Runtime Import

Plugin authoring APIs are build/dev-side.

Ordinary browser application code must not depend on them.

Plugin packages may separately export normal application components/utilities from their own package.

---

# 52. `Ranu.js/config` Runtime Import

Application browser code must not import config-authoring APIs as runtime application dependencies.

The build may reject inappropriate client reachability.

---

# 53. Route Module Public Contract

Public route module conventions are part of the Ranu.js application API.

Stable V1 reserved exports include as applicable:

```text
default page component
default layout component
render
metadata
generateMetadata
generateStaticParams
HTTP method exports in route.ts
middleware default/function export
middleware config
```

Exact shapes are governed by subsystem specs.

---

# 54. Page Component Signature

Conceptual V1:

```ts
export default function Page({
  params,
  searchParams
}: {
  params: Record<string, string | string[]>;
  searchParams: URLSearchParamsLike;
}) {
  ...
}
```

The exact public typing must be finalized consistently with rendering/runtime implementation.

---

# 55. Layout Component Signature

Conceptual:

```ts
export default function Layout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Record<string, string | string[]>;
}) {
  ...
}
```

Layouts should not receive undocumented internal route graph objects.

---

# 56. `render` Export

Stable route declaration:

```ts
export const render = "server";
```

Allowed V1 values:

```text
static
server
client
```

This is application-facing public API.

---

# 57. `generateStaticParams()`

Stable V1 contract for dynamic static routes.

Example:

```ts
export async function generateStaticParams() {
  return [
    { slug: "getting-started" },
    { slug: "routing" }
  ];
}
```

Returned values must match route parameter names/shapes.

---

# 58. `metadata`

Static metadata export:

```ts
export const metadata = {
  title: "About"
};
```

The public metadata type should be exported if useful.

Potential:

```ts
import type { Metadata } from "ranu";
```

or:

```ts
import type { Metadata } from "Ranu.js/react";
```

The final location must be locked before implementation release.

---

# 59. `generateMetadata()`

Dynamic metadata generation:

```ts
export async function generateMetadata(context) {
  return {
    title: "..."
  };
}
```

Public context and return types must not expose renderer internals.

---

# 60. API Route Handler Contract

Canonical:

```ts
export async function GET(
  request: Request,
  context: RouteHandlerContext
): Promise<Response> {
  ...
}
```

Supported method exports:

```text
GET
HEAD
POST
PUT
PATCH
DELETE
OPTIONS
```

---

# 61. Route Handler Context Type

Public type should be available from a server-oriented export.

Conceptual:

```ts
import type { RouteHandlerContext } from "Ranu.js/server";
```

Baseline:

```ts
interface RouteHandlerContext {
  params: Record<string, string | string[]>;
}
```

---

# 62. Middleware Public Contract

Canonical application file:

```text
middleware.ts
```

Conceptual:

```ts
export default function middleware(
  request: Request,
  context: MiddlewareContext
) {
  ...
}
```

Continuation uses a documented server helper/API.

---

# 63. Middleware Helper

If the stable API uses:

```ts
next()
```

it should be exported from:

```text
Ranu.js/server
```

Conceptual:

```ts
import { next } from "Ranu.js/server";
```

This must be finalized before middleware implementation stabilizes.

---

# 64. Middleware Context Type

Potential:

```ts
import type { MiddlewareContext } from "Ranu.js/server";
```

Only stable request-local and route-aware fields should be public.

---

# 65. Config Public Types

Potential stable exports:

```ts
RanuUserConfig
RanuConfigContext
RanuBuildConfig
RanuServerConfig
RanuRoutingConfig
RanuRenderingConfig
RanuDeploymentConfig
```

Do not expose every resolved/internal config implementation type.

---

# 66. Metadata Public Type

Potential:

```ts
Metadata
MetadataContext
```

should be exported from one canonical location.

Recommended:

```text
Ranu.js
```

if metadata is considered a framework-wide route API.

---

# 67. Cookie Types

Potential stable server exports:

```ts
CookieOptions
RequestCookie
ResponseCookie
CookieStore
```

Only if applications need explicit typing.

Do not expose private cookie parser implementation types.

---

# 68. Request Context Types

Potential:

```ts
RanuRequestContext
RequestLocals
```

should remain minimal.

Avoid exposing mutable framework internals such as native Node request/response objects.

---

# 69. Plugin Types

Plugin public types should be imported from:

```text
Ranu.js/plugin
```

rather than the root package unless commonly needed by ordinary apps.

---

# 70. Adapter Types

If third-party adapter authoring becomes stable, use a dedicated canonical export.

Potential:

```text
hfx/adapter
```

Until then, keep deployment adapter authoring types internal/experimental.

---

# 71. Diagnostics Public API

Application developers should not need internal diagnostic classes.

Plugin authors may receive documented diagnostic/logging capabilities through plugin contexts.

A standalone public diagnostics package is not required for V1 application API.

---

# 72. Framework Version Export

Ranu.js may expose:

```ts
import { version } from "ranu";
```

but this is optional.

Applications should not branch core behavior based on framework version unless necessary.

CLI remains the canonical version-reporting interface.

---

# 73. Public Constants

Avoid exporting implementation constants merely for convenience.

Only values with genuine application-level stability should be public.

Examples of internal-only constants:

```text
manifest filenames
chunk prefixes
private runtime symbol names
private HMR message types
```

---

# 74. Package Side Effects

Public packages should accurately declare package side effects for bundlers.

Configuration/plugin packages must not perform global registration merely by import.

Importing:

```ts
import { defineConfig } from "ranu";
```

must not initialize servers or modify global process state.

---

# 75. Tree-Shaking

Browser-safe public APIs should be tree-shakeable where practical.

The package architecture must not force all client runtime features into every application bundle.

---

# 76. Browser Bundle Isolation

Imports from `Ranu.js/react` should not automatically pull server runtime, build system, CLI, or deployment adapter code into browser bundles.

This is a release-blocking package-graph requirement.

---

# 77. Server Bundle Isolation

Server-only Ranu.js code may import shared runtime contracts but should not pull unnecessary CLI/dev tooling into production server output.

---

# 78. Build/CLI Isolation

`Ranu.js build` and CLI packages may depend on heavy tooling that should not become runtime application dependencies.

Package boundaries must preserve this separation.

---

# 79. Public API Compatibility

Stable APIs follow semantic versioning.

Conceptually:

```text
PATCH
  bug fixes without intended public API change

MINOR
  backwards-compatible public additions

MAJOR
  breaking stable public API changes
```

Pre-1.0 policy may be more flexible but must be explicitly documented in the release/governance plan.

---

# 80. Pre-1.0 Compatibility

Before Ranu.js 1.0, APIs may evolve faster.

However, public alpha/beta users still need clear changelogs and migration notes.

Ranu.js must not use "pre-1.0" as an excuse for undocumented arbitrary breaking changes.

---

# 81. Stable 1.x Policy

After `1.0.0`, stable APIs should not break within `1.x` except for critical security/correctness cases where no compatible alternative is possible.

Normal removals follow deprecation.

---

# 82. Deprecation Process

Stable API removal should follow:

```text
introduce replacement
→ deprecate old API
→ document migration
→ retain for defined compatibility window
→ remove in breaking release
```

---

# 83. TypeScript Deprecation Marking

Deprecated APIs should use JSDoc:

```ts
/** @deprecated Use newApi instead. */
```

where practical.

CLI/build warnings may also be emitted for runtime-detectable deprecated usage.

---

# 84. Experimental API Evolution

Experimental APIs may change without major versioning, but changes must still be:

- documented;
- included in changelog;
- clearly identified as experimental.

Stable APIs must never be silently downgraded to experimental.

---

# 85. Internal API Evolution

Internal APIs may change freely.

Application code depending on them is unsupported.

Export maps should make accidental use difficult.

---

# 86. Public API Removal Safety

Removing a stable export requires checking:

- application imports;
- type exports;
- plugin contracts;
- adapter contracts;
- docs/examples;
- generated starters;
- migration path.

---

# 87. API Naming Rules

Public names should be:

- concise;
- descriptive;
- consistent;
- web/React ecosystem-aligned where reasonable;
- not tied to current internal implementation.

Avoid names like:

```text
InternalRouteNodeV2
ViteClientReference
NodeIncomingMessageAdapterThing
```

in stable application APIs.

---

# 88. Framework Prefixing

Not every type needs `Ranu.js` prefix.

Use prefixing where it prevents collision or clarifies framework-specific meaning.

Examples:

```text
RanuUserConfig
RanuPlugin
RanuRequestContext
```

Common concepts may remain:

```text
Metadata
Link
```

where module import already establishes context.

---

# 89. Error Classes

Ranu.js should not require applications to catch implementation-specific error classes for ordinary control flow.

Use:

```text
redirect()
notFound()
Response status
```

instead.

Internal control signal classes remain private.

---

# 90. Public Exceptions

Only if a real application use case requires it should Ranu.js expose stable error classes.

V1 should keep them minimal.

---

# 91. Public Route IDs

Route IDs are useful for diagnostics/internal manifests.

They are not automatically stable application identifiers.

Unless a public route-ID API is explicitly defined, applications must not depend on internal route ID string formatting.

---

# 92. Public Manifest Access

Production manifests are internal runtime/build contracts.

Ordinary applications must not import/read them directly as stable APIs.

Plugin/deployment authors receive controlled metadata through their defined contracts.

---

# 93. Build Internals

The following remain internal:

```text
bundler instance
raw Vite/Rollup/esbuild configuration
module graph implementation
chunk graph
private virtual modules
static-generation scheduler
manifest writer internals
```

---

# 94. Router Internals

Internal:

```text
trie/radix implementation
matching signature encoding
route node classes
private route IDs
source scanner implementation
```

Public route semantics remain documented independently.

---

# 95. Renderer Internals

Internal:

```text
hydration payload format
private client reference format
React streaming implementation details
internal bootstrap protocol
private error-boundary transport
```

Applications should use documented React/server APIs instead.

---

# 96. Server Runtime Internals

Internal:

```text
AsyncLocalStorage keys
control signal brands
native Node bridge objects
response finalizer internals
stream pump implementation
```

---

# 97. Plugin Internals

Internal:

```text
plugin manager
hook runner state
plugin cache layout
artifact ownership database
raw build system object
```

---

# 98. Deployment Internals

Internal:

```text
provider function grouping algorithm
target-specific file naming
provider route JSON details
private packaging manifests
```

unless explicitly documented by the adapter package.

---

# 99. Package Publication Policy

Not every monorepo package must be published.

Possible categories:

```text
published public
published internal
workspace-only internal
```

The repository/package structure specification locks which category each package uses.

---

# 100. Public Package Minimum Set

Minimum likely published set:

```text
Ranu.js
create-ranu
@ranu/adapter-vercel
```

Potential additional published packages depend on implementation architecture.

Generic Node support may remain within `Ranu.js` rather than requiring every user to install `@ranu/adapter-node`.

---

# 101. Internal Package Publishing

If internal packages are published to support modular installation, they should be clearly marked:

```text
not public application API
```

and protected by documentation/export discipline.

---

# 102. Package Version Alignment

Official Ranu.js packages should preferably share aligned framework versions when they are tightly coupled.

Example:

```text
Ranu.js@1.2.0
@ranu/adapter-vercel@1.2.0
```

Adapters with looser compatibility may later use independent versions plus explicit compatibility ranges.

The release plan must lock this model.

---

# 103. Peer Dependency Policy

Use peer dependencies for host-library singletons such as React where duplicate installations could break behavior.

Do not abuse peer dependencies for ordinary implementation details.

---

# 104. Optional Dependencies

Provider-specific or platform-specific optional packages should not be installed by every Ranu.js user unless needed.

Keep provider adapters separate.

---

# 105. Dependency Minimalism

The main `Ranu.js` application runtime should avoid unnecessary dependencies from:

```text
CLI
build analyzers
provider SDKs
test frameworks
release tooling
```

Package graph size directly affects installation and runtime quality.

---

# 106. Public API Documentation Requirement

Every stable public export must have:

- documentation page or API reference entry;
- basic example;
- runtime domain classification;
- version availability;
- TypeScript type.

An undocumented export should not be considered stable merely because it appears in a package.

---

# 107. Examples Must Use Public APIs

Official examples and starters must not import internal packages.

This is a release gate.

If official examples need internal APIs, the public surface is incomplete or the example is invalid.

---

# 108. Framework Self-Hosting Rule

Where practical, Ranu.js's own examples/docs should exercise stable public APIs.

This provides real-world validation of the contract.

---

# 109. Public API Tests

Required test categories:

```text
export map tests
TypeScript compile tests
browser/server boundary tests
React API tests
server API tests
plugin API tests
adapter package tests
semver compatibility fixtures
starter application tests
```

---

# 110. Export Map Test Matrix

At minimum:

- `import "ranu"`;
- `import "Ranu.js/config"`;
- `import "Ranu.js/react"`;
- `import "Ranu.js/server"`;
- `import "Ranu.js/plugin"`;
- undocumented deep import rejected;
- CommonJS behavior if supported;
- TypeScript type resolution.

---

# 111. Client Boundary Test Matrix

At minimum:

- client component imports `Ranu.js/react` successfully;
- client code imports `Ranu.js/server` and fails;
- client code imports plugin/config build APIs and fails where applicable;
- browser bundle excludes server runtime code;
- browser bundle excludes provider SDKs.

---

# 112. Server API Test Matrix

At minimum:

- `cookies()`;
- `headers()`;
- `redirect()`;
- `notFound()`;
- request context isolation;
- API route handler type;
- middleware helper/context.

---

# 113. React API Test Matrix

At minimum:

- `Link`;
- `useRouter`;
- `usePathname`;
- `useSearchParams`;
- SSR + Link;
- hydration;
- direct document fallback;
- external link behavior.

---

# 114. Plugin API Test Matrix

At minimum:

- `definePlugin`;
- plugin setup typing;
- stable hook types;
- unsupported internal hook unavailable;
- plugin API version validation;
- third-party fixture plugin built only with public imports.

---

# 115. Adapter API Test Matrix

If third-party adapter authoring is stable:

- adapter definition;
- capability typing;
- compatibility validation;
- no private build internals required.

If not stable, verify adapter authoring internals are not documented as stable.

---

# 116. Type Compatibility Tests

Ranu.js should maintain compile fixtures against supported TypeScript/React versions.

Public declarations must not require internal source access.

---

# 117. Starter Test

A freshly generated:

```bash
npm create Ranu.js@latest my-app
```

project must:

```text
install
typecheck
Ranu.js dev
Ranu.js build
Ranu.js start
```

using only public packages/APIs.

---

# 118. Public API Security

Export boundaries must reduce accidental misuse.

Examples:

- server-only APIs unavailable in browser graph;
- config secrets not imported into browser;
- internal manifest files not exposed as public JS APIs;
- deployment credentials not in application exports.

---

# 119. API Diagnostics

Misuse should produce framework-specific diagnostics where possible.

Example:

```text
RANU_API_SERVER_IMPORT_IN_CLIENT

Client module cannot import:
  Ranu.js/server

Move the server operation to a server route/component or API endpoint.
```

---

# 120. Deprecated API Diagnostic

When runtime/build detection is possible:

```text
RANU_API_DEPRECATED

API:
  oldApi()

Use:
  newApi()

oldApi() will be removed in Ranu.js 2.
```

---

# 121. Invalid Deep Import Diagnostic

Where build/package tooling can detect:

```text
hfx/internal/...
```

a clear message is preferable to a generic unresolved module error.

Export maps remain the primary enforcement.

---

# 122. Public API Changelog

Every release changing public APIs must update:

```text
CHANGELOG.md
```

or the approved release-note system.

New stable exports, deprecations, removals, and experimental changes must be listed.

---

# 123. Migration Documentation

Breaking changes require migration guidance.

For larger releases, provide:

```text
migration guide
before/after code
deprecated API mapping
automated codemod where practical
```

---

# 124. API RFC Requirement

Major public API additions should use an RFC/ADR process after public development begins.

Examples:

```text
Server Actions
RSC transport
Edge runtime
new router syntax
new plugin hook family
new adapter authoring API
```

---

# 125. Stable API Freeze Gate

Before Ranu.js `1.0.0`, the team must explicitly freeze:

```text
package names
subpath exports
route module exports
React public API
server public API
plugin API v1
configuration API
CLI command names
deployment adapter contracts intended as stable
```

---

# 126. Experimental Namespace Strategy

If many experimental APIs are introduced later, use a dedicated subpath such as:

```text
hfx/experimental
```

rather than polluting stable exports.

V1 should avoid adding this until needed.

---

# 127. Server Actions

Server Actions are not part of the V1 stable public API.

If introduced later, they require a dedicated specification and public API review.

---

# 128. React Server Components Transport

A public RSC/Flight transport contract is not part of V1.

Internal implementation experimentation must not accidentally create a stable public endpoint/API.

---

# 129. ISR / Revalidation API

Not part of V1 stable API.

Future APIs such as:

```text
revalidatePath
revalidateTag
```

require separate caching/revalidation architecture.

---

# 130. Cache API

No framework-wide stable cache API is required in V1.

Applications may use ordinary data-layer caching.

Future Ranu.js cache APIs require an explicit specification.

---

# 131. Image API

No built-in stable `<Image>` component is required for V1.

Ordinary HTML/React images work.

A future image optimization system needs a separate contract.

---

# 132. Font API

No built-in font optimization API is required in V1.

---

# 133. Edge API

No stable edge-runtime API is part of V1.

Node remains the server baseline.

---

# 134. Typed Routes

Typed route generation/navigation is deferred.

If introduced later, it should extend—not replace—the existing string URL public APIs.

---

# 135. Telemetry API

No application-facing telemetry API is required in V1.

Observability integration may be added later.

---

# 136. Public API Acceptance Criteria

The Ranu.js V1 public API is ready when:

1. the primary package is `Ranu.js`;
2. canonical subpaths are defined;
3. `Ranu.js`, `Ranu.js/config`, `Ranu.js/react`, `Ranu.js/server`, and `Ranu.js/plugin` resolve correctly;
4. `defineConfig()` has one canonical import path and optional root re-export;
5. React client APIs are documented and typed;
6. server-only APIs are documented and typed;
7. plugin-author APIs are documented and typed;
8. client code cannot import `Ranu.js/server`;
9. browser bundles do not include server/build/provider internals;
10. API route handler types are public where needed;
11. route module public exports are documented;
12. rendering-mode export is documented;
13. static param generation is documented;
14. metadata exports are documented;
15. middleware public contract is documented;
16. internal route/build/runtime types are not exposed accidentally;
17. export maps block unsupported deep imports;
18. TypeScript declarations compile against supported versions;
19. React is handled as a compatible peer dependency;
20. Node runtime requirement is declared;
21. official examples use only public APIs;
22. `create-ranu` generates only public API usage;
23. plugin fixtures can be built using only public plugin APIs;
24. official deployment adapter packages use consistent naming;
25. stable, experimental, and internal classifications are documented;
26. deprecation rules are documented;
27. stable APIs follow semantic compatibility policy;
28. experimental APIs are visibly marked;
29. internal APIs are not presented as supported;
30. changelog/release process tracks API changes;
31. stable public API freeze occurs before 1.0.0;
32. required public API tests pass.

---

# 137. Locked V1 Public API Decisions

The following are locked:

1. Primary framework package is `Ranu.js`.
2. Project scaffolder package is `create-ranu`.
3. Canonical public subpaths are `Ranu.js/config`, `Ranu.js/react`, `Ranu.js/server`, and `Ranu.js/plugin`.
4. `defineConfig()` is a stable public API.
5. Root `Ranu.js` may re-export `defineConfig()` for convenience.
6. `Link` is exported from `Ranu.js/react`.
7. `useRouter()` is exported from `Ranu.js/react`.
8. `usePathname()` is exported from `Ranu.js/react`.
9. `useSearchParams()` is exported from `Ranu.js/react`.
10. Client navigation hooks are client-only.
11. `cookies()` is exported from `Ranu.js/server`.
12. `headers()` is exported from `Ranu.js/server`.
13. `redirect()` is exported from `Ranu.js/server`.
14. `notFound()` is exported from `Ranu.js/server`.
15. Request-context access may be exposed through `Ranu.js/server` with a minimal stable shape.
16. `definePlugin()` is exported from `Ranu.js/plugin`.
17. Plugin API v1 types are exported from `Ranu.js/plugin`.
18. Official provider adapter naming uses `@ranu/adapter-*`.
19. Vercel adapter package is `@ranu/adapter-vercel`.
20. Generic Node execution remains available without requiring an application import from an adapter package.
21. React remains an application peer dependency rather than an isolated bundled duplicate.
22. Node.js is the V1 server baseline.
23. Public packages are ESM-first.
24. Stable APIs must ship TypeScript declarations.
25. Package export maps define the supported import surface.
26. Deep imports into framework internals are unsupported.
27. Open-source source visibility does not make internal modules public API.
28. Public API stability classes are stable, experimental, and internal.
29. Stable APIs follow semantic compatibility rules.
30. Experimental APIs are explicitly marked.
31. Internal APIs may change without compatibility guarantees.
32. `render = "static" | "server" | "client"` is a public route-module contract.
33. `generateStaticParams()` is a public V1 route API.
34. `metadata` and `generateMetadata()` are public V1 route APIs.
35. API route HTTP method exports are public V1 contracts.
36. Middleware file/export semantics are public V1 contracts.
37. Internal control-signal classes are not public.
38. Internal route IDs/manifests are not stable application APIs.
39. Raw bundler objects are not public application API.
40. Raw Node request/response objects are not normal route-handler public API.
41. Build/plugin/provider internals must not leak into browser exports.
42. Official starters/examples must use public APIs only.
43. Server Actions are deferred.
44. Public RSC/Flight transport is deferred.
45. ISR/revalidation APIs are deferred.
46. Framework cache APIs are deferred.
47. Image optimization API is deferred.
48. Font optimization API is deferred.
49. Edge runtime public API is deferred.
50. Typed routing API is deferred.
51. API changes must be reflected in release notes/changelog.
52. Stable public API freeze is required before Ranu.js 1.0.0.

---

# 138. Deferred Public APIs

Deferred unless separately specified:

- `hfx/experimental`;
- Server Actions;
- RSC/Flight public APIs;
- ISR/revalidation APIs;
- route/tag cache invalidation;
- built-in cache API;
- image optimization component;
- font loader/optimizer;
- edge runtime APIs;
- mixed runtime route declarations;
- typed route/navigation API;
- route interceptors;
- parallel-route API;
- WebSocket framework API;
- cron/job APIs;
- queue APIs;
- OpenTelemetry public integration;
- third-party CLI command API;
- runtime plugin middleware API;
- stable third-party deployment-adapter authoring API if not needed for V1;
- public manifest APIs.

---

# 139. Relationship to Repository Structure

`13_REPOSITORY_AND_PACKAGE_STRUCTURE.md` must map the public API defined here to actual workspace packages.

It must explicitly classify every package:

```text
public stable
public experimental
published internal
workspace-only internal
```

The repository structure may not contradict this public API contract.

---

# 140. Relationship to Development Plan

`12_DEVELOPMENT_PLAN.md` must implement public APIs in dependency order.

Implementation may start with internal primitives, but public API conformance tests must be added before alpha release.

---

# 141. Relationship to Configuration

`10_CONFIGURATION_SYSTEM.md` owns config semantics.

This document owns the public import/type surface used to author that config.

---

# 142. Relationship to Plugin System

`07_PLUGIN_SYSTEM.md` owns plugin behavior.

This document owns the public package/export boundary plugin authors may use.

---

# 143. Relationship to Deployment Adapters

`08_DEPLOYMENT_ADAPTERS.md` owns adapter semantics.

This document locks official package naming and the distinction between public application APIs and deployment packages.

---

# 144. Relationship to CLI

`09_CLI_SPECIFICATION.md` owns CLI behavior.

The CLI executable is public, but its internal JavaScript command-runner modules are not application APIs.

---

# 145. Required Next Specification

The next required document is:

```text
12_DEVELOPMENT_PLAN.md
```

It must convert the frozen product, architecture, subsystem, configuration, and public API contracts into an implementation sequence.

It should define:

- milestone order;
- package implementation order;
- prototype gates;
- alpha/beta/RC/stable gates;
- acceptance criteria;
- test gates;
- reference applications;
- release readiness.

---

# 146. Final Public API Baseline

Ranu.js V1 exposes a deliberately small public API.

The primary package is:

```text
Ranu.js
```

The canonical application-facing subpaths are:

```text
Ranu.js/config
Ranu.js/react
Ranu.js/server
Ranu.js/plugin
```

Project scaffolding uses:

```text
create-ranu
```

Official deployment adapters use:

```text
@ranu/adapter-*
```

naming.

React application APIs, server helpers, configuration helpers, route-module contracts, API-route contracts, middleware contracts, and plugin-authoring APIs are intentionally documented and typed.

Internal router, renderer, build, HMR, manifest, runtime, and provider implementation details remain internal even though the repository is open source.

Package export maps enforce the intended import surface.

Stable APIs follow semantic compatibility rules.

Experimental APIs are explicitly identified.

Internal APIs carry no compatibility guarantee.

Client/server package boundaries are enforced structurally.

Official starters, documentation, examples, and integration tests must use only supported public APIs.

The stable public API surface is frozen before Ranu.js 1.0.0.

This specification is the authoritative Ranu.js V1 public API and package-surface contract.

---

**End of 11_PUBLIC_API_SPECIFICATION.md**
