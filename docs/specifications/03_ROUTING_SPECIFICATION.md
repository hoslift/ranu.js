# 03_ROUTING_SPECIFICATION.md

**Project:** Ranu.js — JavaScript/TypeScript Full-Stack Web Framework  
**Document Type:** Routing Specification  
**Status:** Development Baseline  
**Date:** 2026-08-10  
**Depends On:** `00_FRAMEWORK_VISION.md`, `01_PRODUCT_REQUIREMENTS.md`, `02_FRAMEWORK_ARCHITECTURE.md`  
**Routing Model:** File-system routing with compiled runtime manifest  
**Application Directory:** `app/`

---

# 1. Purpose

This document defines the authoritative Ranu.js V1 routing contract.

It specifies filesystem-to-URL mapping, reserved route files, route segments, dynamic parameters, catch-all routes, route groups, layouts, loading/error/not-found boundaries, API routes, precedence, collisions, route compilation, runtime matching, manifests, development updates, diagnostics, and routing acceptance criteria.

The router determines **what route matches and which route modules belong to it**. The renderer determines **how page/layout modules are rendered**. The server runtime determines **how HTTP requests are executed**.

---

# 2. Routing Goals

Ranu.js routing must be predictable, deterministic, file-system based by default, suitable for SSR/SSG/client navigation/API routes, independent from React internals and deployment providers, compiled before production request handling, and inspectable through framework-owned metadata.

---

# 3. Routing Root

The default routing root is:

```text
app/
```

Example:

```text
my-app/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── about/
│   │   └── page.tsx
│   └── products/
│       └── [id]/
│           └── page.tsx
└── ranu.config.ts
```

Ordinary directories outside `app/` do not automatically become routes.

---

# 4. Supported Route Source Extensions

V1 supports:

```text
.ts
.tsx
.js
.jsx
.mjs
```

A route filename is `<reserved-name>.<supported-extension>`.

Ranu.js must reject multiple files representing the same reserved role in one route directory, such as:

```text
app/about/page.tsx
app/about/page.jsx
```

Diagnostic: `RANU_ROUTE_DUPLICATE_MODULE`.

---

# 5. Reserved Route Filenames

V1 reserved filenames:

| Filename | Responsibility |
|---|---|
| `page.*` | UI/page endpoint |
| `layout.*` | Layout boundary |
| `route.*` | HTTP/API endpoint |
| `loading.*` | Loading UI boundary |
| `error.*` | Error UI boundary |
| `not-found.*` | Not-found UI boundary |

Other files are ordinary modules and do not become routes automatically.

---

# 6. Static Routes

`app/page.tsx` maps to `/`.

Normal directories create literal URL segments:

```text
app/about/page.tsx            → /about
app/company/team/page.tsx     → /company/team
```

A directory does not create an endpoint unless it contains `page.*` or `route.*`.

---

# 7. Dynamic Segments

Syntax:

```text
[param]
```

Example:

```text
app/products/[id]/page.tsx
```

matches:

```text
/products/123
/products/abc
```

Conceptual route context:

```ts
{
  params: {
    id: "123"
  }
}
```

Single dynamic parameters resolve to strings.

---

# 8. Dynamic Parameter Names

Parameter names must be non-empty, structurally valid, and unique within the active route path.

V1 validation:

```text
[A-Za-z_][A-Za-z0-9_]*
```

Valid:

```text
[id]
[slug]
[userId]
[product_id]
```

Invalid:

```text
[]
[user-id]
[[id]]
[id/name]
```

Malformed parameter syntax fails route compilation.

---

# 9. Multiple Dynamic Parameters

Example:

```text
app/users/[userId]/posts/[postId]/page.tsx
```

Request:

```text
/users/42/posts/100
```

Parameters:

```ts
{
  userId: "42",
  postId: "100"
}
```

The same parameter name cannot be declared twice in one route path.

Invalid:

```text
app/[id]/posts/[id]/page.tsx
```

Diagnostic: `RANU_ROUTE_DUPLICATE_PARAM`.

---

# 10. Catch-All Segments

Syntax:

```text
[...param]
```

Example:

```text
app/docs/[...slug]/page.tsx
```

matches:

```text
/docs/getting-started
/docs/guides/routing
/docs/api/server/request
```

It does not match `/docs`.

Captured value:

```ts
{
  slug: ["guides", "routing"]
}
```

Catch-all parameters resolve to `string[]`.

---

# 11. Optional Catch-All Segments

Syntax:

```text
[[...param]]
```

Example:

```text
app/docs/[[...slug]]/page.tsx
```

matches:

```text
/docs
/docs/getting-started
/docs/guides/routing
```

For `/docs`, V1 locks the parameter representation to:

```ts
{
  slug: []
}
```

---

# 12. Catch-All Placement

Catch-all and optional catch-all segments are terminal URL-consuming segments.

Invalid:

```text
app/docs/[...slug]/edit/page.tsx
app/docs/[[...slug]]/edit/page.tsx
```

Ranu.js V1 rejects descendants beneath catch-all segments that would create additional routing structure.

Diagnostic: `RANU_ROUTE_INVALID_CATCH_ALL`.

---

# 13. Route Groups

Syntax:

```text
(groupName)
```

Route groups organize source files without adding URL segments.

Example:

```text
app/
├── (marketing)/
│   ├── about/page.tsx
│   └── pricing/page.tsx
└── (app)/
    └── dashboard/page.tsx
```

Public URLs:

```text
/about
/pricing
/dashboard
```

Group names do not become parameters and do not participate in matching precedence.

---

# 14. Route Group Collisions

Different groups do not make identical public routes valid.

Invalid:

```text
app/(a)/about/page.tsx
app/(b)/about/page.tsx
```

Both resolve to `/about`.

Diagnostic: `RANU_ROUTE_COLLISION`.

---

# 15. Group-Specific Layouts

Groups participate in source/layout hierarchy.

```text
app/
├── layout.tsx
├── (marketing)/
│   ├── layout.tsx
│   └── about/page.tsx
└── (dashboard)/
    ├── layout.tsx
    └── settings/page.tsx
```

`/about` composition metadata:

```text
Root Layout
→ Marketing Layout
→ About Page
```

`/settings`:

```text
Root Layout
→ Dashboard Layout
→ Settings Page
```

The renderer performs composition; the router only records the ordered hierarchy.

---

# 16. Root Layout

For applications containing page routes, V1 requires:

```text
app/layout.*
```

If page routes exist without a root layout, validation fails with `RANU_ROUTE_MISSING_ROOT_LAYOUT`.

API-only applications may omit the root layout.

V1 uses one application root layout. Group layouts may exist beneath it.

---

# 17. Nested Layouts

Example:

```text
app/
├── layout.tsx
└── dashboard/
    ├── layout.tsx
    └── settings/
        └── page.tsx
```

Ordered composition metadata:

```text
app/layout.tsx
→ app/dashboard/layout.tsx
→ app/dashboard/settings/page.tsx
```

A layout does not independently create a URL endpoint.

---

# 18. Loading Boundaries

`loading.*` defines loading UI metadata for the applicable page subtree.

```text
app/dashboard/
├── loading.tsx
└── page.tsx
```

The router records the boundary. The rendering/navigation system determines when it appears.

`loading.*` never creates an endpoint.

---

# 19. Error Boundaries

`error.*` defines page error-boundary metadata.

For nested page routes, the nearest applicable boundary takes precedence, with ancestor boundaries available as fallback according to the rendering specification.

API responses are not wrapped by React page error UI.

---

# 20. Not-Found Boundaries

`not-found.*` defines custom page not-found UI.

Example:

```text
app/
├── not-found.tsx
└── products/
    ├── not-found.tsx
    └── [id]/page.tsx
```

An explicit not-found result from `/products/[id]` uses the nearest `products/not-found.*`, then root fallback when necessary.

A completely unmatched URL uses root not-found UI when available.

---

# 21. Page Routes

A directory becomes a rendered endpoint only when it contains `page.*`.

```text
app/blog/page.tsx → /blog
```

Page routes are rendering endpoints. HTTP method behavior belongs to the server runtime specification.

---

# 22. API Routes

A directory containing `route.*` defines an HTTP endpoint.

```text
app/api/users/route.ts → /api/users
```

Conceptual module:

```ts
export async function GET() {
  return Response.json({ ok: true });
}

export async function POST(request: Request) {
  // ...
}
```

HTTP method semantics are defined by `05_SERVER_RUNTIME_SPEC.md`.

---

# 23. `/api` Is Not Reserved

`/api` is a recommended convention, not a framework requirement.

Valid:

```text
app/health/route.ts              → /health
app/webhooks/payment/route.ts    → /webhooks/payment
```

Endpoint type is determined by `route.*`, not by the `/api` prefix.

---

# 24. Dynamic API Routes

Dynamic syntax is identical for page and API routes.

```text
app/api/users/[id]/route.ts → /api/users/:id
```

For `/api/users/123`:

```ts
{
  params: {
    id: "123"
  }
}
```

Catch-all API routes are permitted under the same rules.

---

# 25. Page/API Same-URL Collision

Ranu.js V1 does not allow a page and generic API route to own the same effective URL.

Invalid:

```text
app/users/
├── page.tsx
└── route.ts
```

Both target `/users`.

Diagnostic: `RANU_ROUTE_KIND_COLLISION`.

Recommended separation:

```text
app/users/page.tsx
app/api/users/route.ts
```

---

# 26. Parent and Child Endpoints

Valid page structure:

```text
app/products/
├── page.tsx
└── [id]/page.tsx
```

creates:

```text
/products
/products/:id
```

Valid API structure:

```text
app/api/users/
├── route.ts
└── [id]/route.ts
```

creates:

```text
/api/users
/api/users/:id
```

Parent endpoints do not consume child endpoints.

---

# 27. API Boundary Isolation

Page layouts/loading/error/not-found UI do not transform API responses.

Example:

```text
app/
├── layout.tsx
└── api/users/route.ts
```

`app/layout.tsx` does not wrap `/api/users`.

React is not involved in API route matching or execution.

---

# 28. Private Directories

A directory beginning with `_` is private/non-routing.

Example:

```text
app/products/
├── page.tsx
└── _components/
    └── ProductCard.tsx
```

`_components` creates no URL segment.

Reserved endpoint files placed inside private directories do not become public routes. Ranu.js should emit a diagnostic to prevent confusion.

---

# 29. Ordinary Colocation

Ordinary files can live directly beside route modules:

```text
app/products/
├── page.tsx
├── ProductList.tsx
├── queries.ts
└── styles.css
```

Only reserved filenames carry routing semantics.

---

# 30. Special Directory Syntax

Recognized routing forms:

```text
[id]
[...slug]
[[...slug]]
(group)
_private
```

Malformed reserved syntax must be rejected rather than silently treated as static.

Examples:

```text
[id
id]
(...)
[...]
[[slug]]
```

Diagnostic: `RANU_ROUTE_INVALID_SEGMENT` or a more specific routing code.

---

# 31. URL Construction

Public URL paths are produced after removing:

- the `app/` root;
- route groups;
- reserved endpoint filenames.

Example:

```text
app/(shop)/products/[id]/page.tsx
```

becomes:

```text
/products/:id
```

Route-group ancestry remains available internally for layout/boundary composition.

---

# 32. URL Normalization

Ranu.js always uses `/` as the URL separator regardless of OS.

Windows source path:

```text
app\products\[id]\page.tsx
```

must compile to:

```text
/products/:id
```

Filesystem enumeration order must never determine routing behavior.

---

# 33. Trailing Slash Policy

Ranu.js V1 treats `/about` and `/about/` as the same application route identity.

Canonical path:

```text
/about
```

Root remains:

```text
/
```

Runtime may redirect non-canonical trailing-slash variants. Exact HTTP redirect semantics belong to the server runtime specification.

---

# 34. Query Strings and Fragments

Query strings do not participate in route selection:

```text
/products
/products?page=2
/products?sort=price
```

all match `/products`.

URL fragments do not reach server route matching and do not affect route identity.

---

# 35. Percent-Encoding and Unicode

Dynamic values must be safely URL-decoded.

Example:

```text
/search/hello%20world
```

may produce:

```text
"hello world"
```

Malformed encoding must produce controlled request failure, not process termination.

Encoded path content must not bypass route boundaries or static-file traversal protections.

Unicode URL values are supported through standards-compatible URL parsing.

---

# 36. Case Sensitivity

Ranu.js V1 URL matching is case-sensitive.

```text
/About
/about
```

are distinct semantic paths.

Because some filesystems are case-insensitive, definitions such as:

```text
app/About/page.tsx
app/about/page.tsx
```

must fail portability validation with `RANU_ROUTE_CASE_COLLISION`.

---

# 37. Route Precedence

Sibling matching priority is locked to:

```text
1. Static segment
2. Dynamic segment
3. Catch-all segment
4. Optional catch-all segment
```

Route groups do not participate in URL precedence.

---

# 38. Static Over Dynamic

Given:

```text
app/products/new/page.tsx
app/products/[id]/page.tsx
```

`/products/new` matches the static route.

---

# 39. Dynamic Over Catch-All

Given:

```text
app/docs/[section]/page.tsx
app/docs/[...slug]/page.tsx
```

`/docs/api` matches `[section]`.

`/docs/api/server` matches `[...slug]`.

---

# 40. Ambiguous Catch-All Definitions

Ranu.js rejects overlapping sibling definitions that cannot be made sufficiently clear through the locked precedence model.

Example:

```text
app/docs/[...slug]/page.tsx
app/docs/[[...path]]/page.tsx
```

Diagnostic: `RANU_ROUTE_AMBIGUOUS`.

Build-time rejection is preferred over surprising runtime behavior.

---

# 41. Dynamic Name Collision

These routes collide:

```text
app/users/[id]/page.tsx
app/users/[username]/page.tsx
```

Parameter names do not distinguish matching patterns.

Both normalize to a matching signature equivalent to:

```text
S(users)/D
```

Diagnostic: `RANU_ROUTE_COLLISION`.

The same rule applies to API routes.

---

# 42. Matching Signatures

Collision detection uses parameter-name-independent structural signatures.

Examples:

```text
/users/[id]       → S(users)/D
/users/[name]     → S(users)/D
/docs/[...slug]   → S(docs)/C
/docs/[[...slug]] → S(docs)/OC
```

Route groups are removed from matching signatures.

---

# 43. Route IDs

Every endpoint receives a stable Ranu.js route ID.

Conceptual examples:

```text
page:/
page:/about
page:/products/[id]
api:/api/users
```

Route IDs are framework metadata and must not depend on filesystem enumeration order.

Source-tree nodes may have separate internal IDs for group/boundary ancestry.

---

# 44. Structured Route Pattern

Runtime/build logic should use structured segments rather than reparsing human-readable strings.

Conceptual:

```ts
interface CompiledRoutePattern {
  segments: CompiledRouteSegment[];
}
```

Example:

```ts
{
  segments: [
    { kind: "static", value: "products" },
    { kind: "dynamic", param: "id" }
  ]
}
```

---

# 45. Route Tree

Conceptual internal node:

```ts
interface RouteTreeNode {
  id: string;
  sourceSegment: string;
  segment: RouteSegment;
  parentId?: string;
  children: string[];

  page?: RouteModuleRef;
  api?: RouteModuleRef;
  layout?: RouteModuleRef;
  loading?: RouteModuleRef;
  error?: RouteModuleRef;
  notFound?: RouteModuleRef;
}
```

The tree supports hierarchy, validation, boundary inheritance, and endpoint derivation.

---

# 46. Route Compilation Phases

The router must compile through explicit phases:

```text
1. Filesystem discovery
2. Source syntax parsing
3. Route tree construction
4. Local reserved-module validation
5. Endpoint derivation
6. Pattern normalization
7. Collision/ambiguity validation
8. Boundary inheritance
9. Precedence compilation
10. Manifest generation
```

Development and production build must use the same parser and validator.

---

# 47. Route Discovery Algorithm

Conceptual algorithm:

```text
Locate app/
    ↓
Walk supported source directories
    ↓
Normalize filesystem paths
    ↓
Ignore private/tooling paths
    ↓
Parse source segments
    ↓
Detect reserved route modules
    ↓
Build route tree
    ↓
Validate syntax and duplicates
    ↓
Resolve public patterns
    ↓
Detect collisions
    ↓
Resolve boundary ancestry
    ↓
Compile matcher records
    ↓
Emit route metadata
```

---

# 48. Production Route Discovery

Production request handling must never walk the source `app/` directory.

Required flow:

```text
Build-Time Route Discovery
        ↓
Compiled Route Manifest
        ↓
Production Runtime Matcher
```

This is a locked architectural requirement.

---

# 49. Runtime Matcher

The matcher receives a normalized pathname and compiled route records.

Conceptual result:

```ts
interface RouteMatch {
  routeId: string;
  kind: "page" | "api";
  params: Record<string, string | string[]>;
  pathname: string;
}
```

No-match must be represented explicitly rather than as an arbitrary exception.

The matcher must not load React merely to decide whether a path matches.

---

# 50. Matcher Implementation

The implementation may use a trie, radix tree, generated matcher, or validated ordered matcher table.

The data structure is internal.

Required observable behavior is deterministic matching according to this specification.

Precedence should be encoded at compile time rather than re-decided ad hoc for each request.

---

# 51. API Method Independence

Routing matches the path before the server runtime chooses an HTTP method handler.

Example:

```text
POST /api/users
```

first matches `/api/users`, then the server runtime selects `POST` from `route.*`.

HTTP methods are not separate filesystem routes.

---

# 52. Page HTTP Independence

The router does not encode GET/HEAD policy for pages.

It identifies a page endpoint. The server runtime determines permitted HTTP methods and response behavior.

---

# 53. Boundary Inheritance

Example:

```text
app/
├── layout.tsx
├── error.tsx
└── dashboard/
    ├── layout.tsx
    ├── loading.tsx
    ├── error.tsx
    └── settings/page.tsx
```

Compiled metadata for `/dashboard/settings` identifies:

```text
Layouts:
1. app/layout.tsx
2. app/dashboard/layout.tsx

Nearest loading boundary:
app/dashboard/loading.tsx

Error hierarchy:
1. app/dashboard/error.tsx
2. app/error.tsx
```

The rendering specification defines execution/fallback behavior.

---

# 54. Static Generation Does Not Change Routing Syntax

An SSG route and SSR route use the same routing language.

Example:

```text
app/products/[id]/page.tsx
```

always represents the pattern:

```text
/products/:id
```

Static generation records concrete generated paths separately.

---

# 55. Static Manifest Relationship

The route manifest describes patterns.

A static-output manifest describes generated concrete paths.

Conceptual:

```json
{
  "/": { "routeId": "page:/" },
  "/about": { "routeId": "page:/about" },
  "/products/1": { "routeId": "page:/products/[id]" }
}
```

Whether an ungenerated dynamic SSG parameter returns 404 or falls back to dynamic rendering is defined by `04_RENDERING_MODEL.md`.

---

# 56. Route Manifest

Production routing metadata must be versioned.

Conceptual:

```ts
interface RouteManifest {
  version: number;
  routes: RouteManifestEntry[];
}
```

Runtime must reject unsupported manifest versions rather than interpreting them silently.

---

# 57. Page Manifest Entry

Conceptual fields:

```ts
interface PageRouteManifestEntry {
  id: string;
  kind: "page";
  pattern: CompiledRoutePattern;
  pathnameTemplate: string;
  page: RuntimeModuleRef;
  layouts: RuntimeModuleRef[];
  loading?: RuntimeModuleRef;
  errors: RuntimeBoundaryRef[];
  notFound?: RuntimeModuleRef;
  renderMode: "static" | "server" | "client";
  runtimeEntry: string;
  assets: string[];
}
```

Exact serialized schema is finalized in `06_BUILD_SYSTEM.md`.

---

# 58. API Manifest Entry

Conceptual:

```ts
interface ApiRouteManifestEntry {
  id: string;
  kind: "api";
  pattern: CompiledRoutePattern;
  pathnameTemplate: string;
  handler: RuntimeModuleRef;
  runtimeEntry: string;
}
```

API method validation belongs to the server/build specifications.

---

# 59. Client-Safe Route Metadata

Browser navigation may receive a reduced route manifest.

It must not expose:

- server-only module paths;
- private filesystem paths;
- secrets;
- private runtime metadata.

Client-safe metadata may include route pattern, route ID, navigation information, and client asset references.

---

# 60. Server Route Metadata

Server-side metadata may include runtime module references, rendering mode, boundaries, runtime requirements, and server entry information.

It is not a browser-public asset by default.

---

# 61. Manifest Security

Route manifests must never contain environment secret values, request data, database credentials, or arbitrary runtime state.

Source paths retained for diagnostics must not be unnecessarily exposed to browsers.

---

# 62. Development Route Updates

During `Ranu.js dev`:

```text
Create page.tsx       → add route
Delete page.tsx       → remove route
Rename [id] → [slug]  → update route metadata
Add layout.tsx        → recompute affected descendants
Add error.tsx         → update affected boundary ancestry
```

The development route graph must not remain stale because of module caching.

---

# 63. Development Collisions

If a developer creates an invalid collision while the dev server is running, Ranu.js must surface an error and must not arbitrarily select one route.

The same invalid source tree must fail production build.

---

# 64. File Watching Impact

Routing structural changes can affect more than the changed file.

For example, adding:

```text
app/dashboard/layout.tsx
```

changes composition metadata for all descendant page routes.

Route invalidation must account for ancestry.

---

# 65. Empty and Boundary-Only Directories

Empty directories create no endpoints.

Directories containing only `layout.*`, `loading.*`, `error.*`, or `not-found.*` create no endpoints by themselves.

Their metadata matters only when an applicable descendant page route exists.

---

# 66. `index.*` Has No Routing Semantics

Ranu.js V1 does not use `index.tsx` as an endpoint convention.

Directory endpoints use:

```text
page.tsx
```

An `index.tsx` file can exist as an ordinary imported module.

---

# 67. Reserved Filename Case

Reserved role names are exact and case-sensitive at the Ranu.js semantic level.

These are not `page.*`:

```text
Page.tsx
PAGE.tsx
pages.tsx
```

This prevents OS-dependent routing interpretation.

---

# 68. Hidden Files and Tooling Entries

Ranu.js may ignore common hidden filesystem entries beginning with `.` during route discovery.

The ignore behavior must be deterministic and documented.

Hidden/tooling entries must not accidentally become routes.

---

# 69. Symlink Handling

V1 should not recursively follow directory symlinks inside `app/` by default.

This avoids:

- infinite traversal;
- duplicate route discovery;
- source-root escapes;
- cross-platform inconsistencies.

Future explicit configuration may add controlled support.

---

# 70. Route Source Security

Route discovery must remain inside the configured application root.

Normalized filesystem paths must prevent traversal outside the intended project source tree.

---

# 71. Public Asset Collisions

Application route endpoints take precedence over conflicting `public/` paths.

A conflict must emit:

```text
RANU_PUBLIC_ROUTE_COLLISION
```

as a warning or stronger diagnostic where serving would be unsafe.

Developers should remove such collisions.

---

# 72. Framework Internal Namespace

Ranu.js V1 reserves:

```text
/_ranu/
```

for framework-generated assets/internal endpoints.

Examples may include:

```text
/_ranu/assets/...
/_ranu/runtime/...
```

Subpaths are internal and may evolve.

Applications must not claim this namespace through routes, public assets, rewrites, or future programmatic routing.

---

# 73. Route Parameter Types

The router exposes:

```text
string
```

for normal dynamic parameters and:

```text
string[]
```

for catch-all/optional catch-all parameters.

Ranu.js V1 does not infer integer, UUID, boolean, or custom regex types from route names.

Application code validates and converts values.

---

# 74. Regex and Wildcard Routes

V1 does not support filesystem syntax such as:

```text
[id:\d+]
*
**
```

Catch-all behavior uses only:

```text
[...param]
[[...param]]
```

Application-specific validation occurs after matching.

---

# 75. Literal Special-Syntax Paths

Bracket and parenthesis forms are reserved inside `app/`.

V1 does not require an escaping syntax for literal source directory names that resemble Ranu.js special routing syntax.

A future programmatic/escaping mechanism may address this edge case.

---

# 76. Base Path

A configurable base path is architecturally permitted but not required for the earliest V1 milestone.

Conceptual:

```ts
export default defineConfig({
  basePath: "/portal"
});
```

Internal route identity remains `/dashboard`; external URL may become `/portal/dashboard`.

If implemented, base path must apply consistently across server matching, navigation, generated URLs, redirects, and assets where applicable.

---

# 77. Rewrites and Redirects

Advanced rewrites and configuration redirects are separate server/configuration layers, not alternate filesystem route identities.

A rewrite such as:

```text
/company → /about
```

does not create a second source route.

Detailed execution belongs to `05_SERVER_RUNTIME_SPEC.md`.

---

# 78. Middleware Relationship

Middleware is not an endpoint.

The router exposes matching/path-pattern capabilities to the server runtime.

Conceptual request flow may be:

```text
URL normalization
→ global middleware
→ route match
→ route-aware middleware
→ endpoint
```

Exact middleware stages are defined in the server runtime specification.

---

# 79. Programmatic Routing

V1's primary public model is filesystem routing.

A public `router.get()` style page registration API is not required.

The internal router architecture must nevertheless avoid assumptions that make future programmatic route sources impossible.

---

# 80. Route Aliases

One endpoint source maps to one primary route pattern.

Multiple public aliases should use explicit redirect/rewrite/additional-route mechanisms rather than hidden automatic aliasing.

---

# 81. Host-Based Routing

Ranu.js V1 does not define separate route trees by hostname.

Host-based application behavior can use infrastructure, middleware, or separate Ranu.js applications.

---

# 82. Locale Routing

There is no built-in locale segment type in V1.

Applications may use ordinary routes such as:

```text
app/[locale]/page.tsx
```

Future i18n tooling can build on the normal router.

---

# 83. Deferred Advanced Routing Features

Not part of mandatory V1:

- parallel routes;
- intercepted/modal routes;
- host-based routing;
- built-in locale routing;
- regex filesystem segments;
- typed parameter schemas;
- public programmatic page registration;
- multi-root applications;
- nested independent Ranu.js apps;
- complex rewrite engine;
- automatic route aliases;
- arbitrary optional static segments.

These must not delay the deterministic core router.

---

# 84. Route Inspection

Framework metadata must support future output such as:

```text
PAGE  /                         static
PAGE  /about                    static
PAGE  /products/[id]            server
API   /api/users                server
API   /api/users/[id]           server
```

Inspection must read authoritative framework metadata rather than invent a second route parser.

---

# 85. Required Routing Diagnostics

At minimum, Ranu.js routing needs structured diagnostics for:

```text
RANU_ROUTE_DUPLICATE_MODULE
RANU_ROUTE_INVALID_SEGMENT
RANU_ROUTE_INVALID_PARAM
RANU_ROUTE_DUPLICATE_PARAM
RANU_ROUTE_COLLISION
RANU_ROUTE_KIND_COLLISION
RANU_ROUTE_AMBIGUOUS
RANU_ROUTE_INVALID_CATCH_ALL
RANU_ROUTE_MISSING_ROOT_LAYOUT
RANU_ROUTE_CASE_COLLISION
RANU_PUBLIC_ROUTE_COLLISION
```

Codes may be refined before public stable release, but diagnostics must remain structured and actionable.

---

# 86. Diagnostic Quality

A collision diagnostic should show both source files and the normalized conflicting pattern.

Example:

```text
RANU_ROUTE_COLLISION

Two page routes resolve to the same URL pattern:

  app/users/[id]/page.tsx
  app/users/[name]/page.tsx

Normalized pattern:
  /users/:dynamic

Rename or remove one route.
```

Routing errors must never depend on arbitrary filesystem enumeration order.

---

# 87. Routing Test Matrix

The automated router test suite must cover at minimum:

- root page;
- static page;
- nested static page;
- single dynamic segment;
- multiple dynamic segments;
- catch-all;
- optional catch-all;
- static-over-dynamic precedence;
- dynamic-over-catch-all precedence;
- route groups;
- nested route groups;
- group collision;
- dynamic-name collision;
- page/API collision;
- parent/child page routes;
- parent/child API routes;
- root layout requirement;
- API-only app without layout;
- nested layouts;
- nested error boundaries;
- nested not-found boundaries;
- private directories;
- ordinary colocated modules;
- Windows path normalization;
- case collision;
- malformed segment syntax;
- duplicate parameter name;
- invalid catch-all descendants;
- route add/remove during development;
- manifest serialization;
- manifest version validation.

---

# 88. Runtime Routing Tests

Integration tests must make actual HTTP requests against representative routes including:

```text
/
/about
/products/123
/docs/a/b
/api/users
/api/users/123
/unknown
```

Tests must validate parameters and endpoint type, not merely status codes.

---

# 89. Cross-Platform Tests

Critical route parser tests must validate both POSIX and Windows path forms.

CI should execute broader Windows coverage where infrastructure permits.

---

# 90. Performance Validation

Before V1 stable, benchmark route compilation and matching with synthetic applications containing approximately:

```text
100 routes
1,000 routes
10,000 routes
```

The purpose is to identify pathological design, not to establish premature marketing benchmarks.

---

# 91. Reference Routing Fixture

Given:

```text
app/
├── layout.tsx
├── not-found.tsx
├── page.tsx
├── about/
│   └── page.tsx
├── (shop)/
│   └── products/
│       ├── layout.tsx
│       ├── page.tsx
│       └── [id]/
│           ├── error.tsx
│           └── page.tsx
├── docs/
│   └── [...slug]/
│       └── page.tsx
└── api/
    └── products/
        ├── route.ts
        └── [id]/
            └── route.ts
```

Ranu.js must compile:

```text
PAGE  /
PAGE  /about
PAGE  /products
PAGE  /products/[id]
PAGE  /docs/[...slug]
API   /api/products
API   /api/products/[id]
```

For `/products/42`, page composition metadata identifies:

```text
app/layout.tsx
app/(shop)/products/layout.tsx
app/(shop)/products/[id]/page.tsx
```

plus the applicable nested error boundary.

For `/api/products/42`, no React layout is applied.

---

# 92. Routing Acceptance Criteria

The Ranu.js V1 router is complete when:

1. `app/` discovery works cross-platform.
2. Static routes compile correctly.
3. Dynamic routes compile correctly.
4. Catch-all routes compile correctly.
5. Optional catch-all routes compile correctly.
6. Route groups disappear from public URLs.
7. Group layouts remain in source/composition ancestry.
8. Nested layouts resolve deterministically.
9. Loading/error/not-found boundaries are recorded.
10. API routes use the same path-segment language.
11. Page/API endpoint collisions are rejected.
12. Dynamic-name collisions are rejected.
13. Static routes outrank dynamic routes.
14. Dynamic routes outrank catch-all routes.
15. Ambiguous catch-all definitions are rejected.
16. Duplicate parameter names are rejected.
17. Malformed route syntax is rejected.
18. Production uses compiled route metadata.
19. Development route changes update the matcher.
20. Route manifests are versioned.
21. Client-safe metadata excludes server-only references.
22. Route matching does not require React.
23. API route matching does not require React.
24. Route matching does not depend on a deployment provider.
25. The required routing test matrix passes.

---

# 93. Locked V1 Routing Decisions

The following decisions are locked by this specification:

1. Routing root is `app/`.
2. Endpoint files are `page.*` and `route.*`.
3. Root layout is required when page routes exist.
4. API-only applications may omit root layout.
5. Dynamic syntax is `[param]`.
6. Catch-all syntax is `[...param]`.
7. Optional catch-all syntax is `[[...param]]`.
8. Optional catch-all zero-segment value is `[]`.
9. Route groups use `(group)`.
10. Route groups do not affect public URLs.
11. `_name` directories are private/non-routing.
12. Catch-all segments are terminal.
13. Duplicate parameter names in one route are invalid.
14. Static segments outrank dynamic segments.
15. Dynamic segments outrank catch-all segments.
16. Ambiguous route definitions are compilation errors.
17. Parameter names do not distinguish matching patterns.
18. `page.*` and `route.*` cannot own the same effective URL.
19. `/api` is not framework-reserved.
20. Query strings do not participate in route selection.
21. URL fragments do not participate in route selection.
22. URL matching is case-sensitive.
23. Canonical paths omit trailing slash except `/`.
24. Production runtime does not scan source routes.
25. Route manifests are versioned.
26. `/_ranu/` is reserved for Ranu.js internals.
27. Layouts affect page rendering, not API response rendering.
28. V1 does not support regex route segments.
29. V1 does not support parallel routes.
30. V1 does not support route interception.
31. V1 does not require host-based routing.
32. V1 does not require public programmatic page routing.
33. Filesystem enumeration order never determines precedence.
34. React is not a dependency of route matching.
35. Provider SDKs are not a dependency of route matching.

---

# 94. Relationship to Rendering

This specification ends at:

```text
Matched Page Route
+
Ordered Layout/Boundary Metadata
+
Route Parameters
+
Rendering Configuration Reference
```

`04_RENDERING_MODEL.md` must define:

- page/layout composition;
- React server rendering;
- hydration;
- browser/client boundaries;
- SSR;
- SSG;
- rendering-mode API;
- loading behavior;
- error rendering;
- not-found rendering;
- metadata/head behavior;
- server-to-browser serialization;
- dynamic static-route fallback behavior.

---

# 95. Relationship to Server Runtime

`05_SERVER_RUNTIME_SPEC.md` must define:

- incoming HTTP normalization;
- middleware stages;
- API method dispatch;
- page HTTP methods;
- request context;
- cookies;
- headers;
- redirects;
- request-body handling;
- 400/404/405 behavior;
- runtime errors;
- streaming response handling.

The router provides matches and parameters; the server runtime owns HTTP execution semantics.

---

# 96. Relationship to Build System

`06_BUILD_SYSTEM.md` must define:

- route-discovery integration;
- route manifest serialization;
- runtime module references;
- client/server manifests;
- static route output;
- route-to-asset associations;
- development invalidation;
- output paths.

The build system must consume this routing contract and must not create a second interpretation of Ranu.js routes.

---

# 97. Final Routing Baseline

Ranu.js V1 uses a deterministic filesystem router rooted at `app/`.

Pages use `page.*`; HTTP endpoints use `route.*`. Layout, loading, error, and not-found files contribute page hierarchy/boundary metadata without independently creating endpoints.

The routing language supports static segments, `[param]`, `[...param]`, `[[...param]]`, `(group)`, and private `_name` directories. Route groups affect source/layout hierarchy but never public URLs.

Static segments outrank dynamic segments, and dynamic segments outrank catch-all segments. Ambiguous definitions are rejected at compilation rather than resolved through surprising runtime behavior. Parameter names do not differentiate otherwise identical patterns.

Page and API endpoints cannot claim the same effective URL. `/api` remains an application convention rather than a hard-coded framework namespace. Ranu.js reserves `/_ranu/` for framework internals.

Development and production use the same route parser and validator. Production requests consume compiled, versioned route metadata and never depend on source-directory scanning.

The router remains independent from React rendering, HTTP provider implementations, and deployment platforms. It provides route identity, parameters, endpoint kind, hierarchy, and boundary metadata to the rendering, server-runtime, build, and developer-tooling systems.

This document is the authoritative Ranu.js V1 routing specification.

---

**End of 03_ROUTING_SPECIFICATION.md**
