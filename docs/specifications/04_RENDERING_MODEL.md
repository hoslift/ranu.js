# 04_RENDERING_MODEL.md

**Project:** Ranu.js — JavaScript/TypeScript Full-Stack Web Framework  
**Document Type:** Rendering Model Specification  
**Status:** Development Baseline  
**Date:** 2026-08-10  
**Depends On:** `00_FRAMEWORK_VISION.md`, `01_PRODUCT_REQUIREMENTS.md`, `02_FRAMEWORK_ARCHITECTURE.md`, `03_ROUTING_SPECIFICATION.md`  
**Primary V1 Renderer:** React  
**Rendering Modes:** Static, Server, Client  
**Primary V1 Runtime:** Node.js

---

# 1. Purpose

This document defines how Ranu.js V1 converts matched page routes into browser-visible applications.

It specifies:

- renderer boundaries;
- React integration;
- page and layout composition;
- server-side rendering;
- static generation;
- client rendering;
- hydration;
- client/server module boundaries;
- route rendering-mode selection;
- loading behavior;
- error rendering;
- not-found rendering;
- metadata/head generation;
- data serialization;
- browser asset association;
- client navigation rendering behavior;
- rendering diagnostics;
- production rendering requirements.

Routing semantics are defined by `03_ROUTING_SPECIFICATION.md`.

HTTP execution is defined by `05_SERVER_RUNTIME_SPEC.md`.

Build mechanics are defined by `06_BUILD_SYSTEM.md`.

---

# 2. Rendering Objective

Ranu.js must support modern full-stack rendering without making React itself the framework core.

The architectural relationship is:

```text
Route Match
    ↓
Ranu.js Rendering Contract
    ↓
Official React Renderer
    ↓
SSR / SSG / Client Rendering
    ↓
HTML + Browser Assets
```

The same route and component model should work across development and production.

---

# 3. Rendering Principles

## RND-P01 — Renderer Separation

The framework core and router must not directly depend on React rendering APIs.

## RND-P02 — Server First

Page modules are server-capable by default unless explicitly marked for browser execution.

## RND-P03 — Explicit Client Boundary

Browser-interactive code must cross an explicit client boundary.

## RND-P04 — Secret Safety

Server-only dependencies and private environment values must never silently enter browser bundles.

## RND-P05 — Shared Composition

SSR and SSG should use the same page/layout composition model.

## RND-P06 — Progressive Enhancement

Server-rendered content must remain useful before hydration whenever the application design permits it.

## RND-P07 — Deterministic Output

Equivalent build/runtime inputs should produce functionally equivalent rendering output.

## RND-P08 — Framework Simplicity

V1 must not depend on implementing a proprietary React Server Components transport protocol.

## RND-P09 — Web Compatibility

Generated HTML must follow normal web/document semantics.

## RND-P10 — Inspectability

Rendering mode and route asset requirements must be available through build metadata.

---

# 4. Renderer Contract

Ranu.js defines a renderer-neutral internal contract.

Conceptual:

```ts
interface RanuRenderer {
  name: string;
  capabilities: RendererCapabilities;

  render(
    request: RenderRequest
  ): Promise<RenderResult>;
}
```

Capabilities:

```ts
interface RendererCapabilities {
  ssr: boolean;
  staticRendering: boolean;
  clientHydration: boolean;
  streaming: boolean;
}
```

React-specific behavior belongs to the official React adapter.

---

# 5. Render Request

Conceptual internal request:

```ts
interface RenderRequest {
  route: CompiledPageRoute;
  request?: Request;
  params: Record<string, string | string[]>;
  mode: "static" | "server";
  context: RanuRenderContext;
}
```

Static build rendering may not have an ordinary incoming HTTP request.

The rendering context must therefore not require request-only state for every rendering mode.

---

# 6. Render Result

Conceptual:

```ts
interface RenderResult {
  status: number;
  headers: Headers;
  body: string | ReadableStream<Uint8Array>;
  assets: RenderAssetReference[];
  metadata?: ResolvedMetadata;
}
```

The exact internal representation may change, but rendering must return enough information for the server/build layer to produce a valid document response.

---

# 7. Official React Renderer

V1 ships an official React renderer.

Conceptual package:

```text
@ranu/react
```

It owns:

- React page execution;
- layout composition;
- document composition;
- SSR;
- hydration bootstrap;
- client boundaries;
- Ranu.js `Link`;
- React rendering errors;
- loading UI integration;
- metadata rendering.

Ranu.js core must remain usable without importing this package internally.

---

# 8. Page Module

A page route is defined by:

```text
page.tsx
```

or another supported extension.

The page module must export a default renderable component.

Example:

```tsx
export default function Page() {
  return <h1>Hello Ranu.js</h1>;
}
```

A missing valid default page export must produce a structured development/build error.

---

# 9. Layout Module

A layout module also exports a default component.

Conceptual:

```tsx
export default function Layout({
  children
}: {
  children: React.ReactNode;
}) {
  return <section>{children}</section>;
}
```

The renderer receives the ordered layout chain from the router.

It must not rediscover layout ancestry independently.

---

# 10. Root Layout

For applications containing page routes, `app/layout.*` is the root page layout.

The root layout owns the application document shell.

V1 root layout should produce:

```tsx
<html>
  <head />
  <body>{children}</body>
</html>
```

Ranu.js may inject resolved metadata and required runtime assets into the document during rendering.

---

# 11. Root Document Validation

The React renderer must validate that the final root document produces valid document-level structure.

At minimum, the final rendered document must contain:

```text
<html>
<body>
```

Missing required document structure should produce an actionable diagnostic in development/build.

Ranu.js may provide future helpers for document composition, but V1 should keep ordinary React/HTML semantics.

---

# 12. Layout Composition

Given:

```text
app/layout.tsx
app/dashboard/layout.tsx
app/dashboard/settings/page.tsx
```

the renderer composes:

```text
Root Layout
    ↓
Dashboard Layout
    ↓
Settings Page
```

Conceptually:

```tsx
<RootLayout>
  <DashboardLayout>
    <SettingsPage />
  </DashboardLayout>
</RootLayout>
```

---

# 13. Route Groups and Rendering

Route-group layouts participate normally in rendering.

Example:

```text
app/layout.tsx
app/(marketing)/layout.tsx
app/(marketing)/about/page.tsx
```

renders:

```text
Root Layout
→ Marketing Layout
→ About Page
```

The `(marketing)` name never appears in the URL.

---

# 14. Server-First Component Model

Ranu.js V1 treats page and layout modules as server-capable by default.

This means they may:

- read private environment variables;
- access databases;
- call server-only libraries;
- perform server-side data fetching;
- render HTML on the server.

They must not automatically be included in browser bundles.

---

# 15. Client Boundary Directive

Ranu.js V1 uses the directive:

```ts
"use client";
```

at the top of a module to declare a browser/client boundary.

Example:

```tsx
"use client";

import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);

  return (
    <button onClick={() => setCount(count + 1)}>
      {count}
    </button>
  );
}
```

This directive is part of the Ranu.js V1 React rendering contract.

---

# 16. Client Module Semantics

A `"use client"` module:

- belongs to the browser/client graph;
- may use browser APIs;
- may use React client hooks;
- may be hydrated;
- must not import server-only modules;
- must not directly access private environment variables.

Its client-safe dependency graph may be bundled for the browser.

---

# 17. Client Boundary Propagation

Once a module is part of the client graph, its ordinary static imports are also treated as client-reachable unless explicitly transformed through a supported boundary.

Example:

```text
ClientComponent.tsx
    ↓
utils.ts
    ↓
formatter.ts
```

All three must be browser-compatible.

A nested imported module does not become server-safe merely because it lacks `"use client"`.

---

# 18. Server-Only Modules

Ranu.js V1 supports explicit server-only protection through:

```ts
import "Ranu.js/server-only";
```

Example:

```ts
import "Ranu.js/server-only";
import { db } from "./database";
```

A module containing this marker must never enter the client graph.

If client-reachable code imports it, build/dev must fail.

---

# 19. Server-Only Directory Convention

The project may use:

```text
server/
```

as a recommended organizational directory.

Files inside `server/` should be treated as server-only by Ranu.js build analysis.

Example:

```text
server/db.ts
server/auth.ts
```

Importing these from client code must fail.

The explicit `Ranu.js/server-only` marker remains useful for server-only modules outside that directory.

---

# 20. Browser-Only Modules

A client module may import browser-only dependencies.

Server rendering must not execute browser-only globals during module initialization unless the dependency is isolated appropriately.

Applications should avoid top-level unguarded access such as:

```ts
window.localStorage
```

in code that may be evaluated during SSR.

Ranu.js diagnostics should identify common failures where practical.

---

# 21. Shared Modules

Modules not classified as server-only or client-only may be shared.

Shared modules should contain portable logic such as:

- constants;
- pure utilities;
- validation;
- serializable types;
- formatting.

If a shared module is imported into a client graph, all client-reachable dependencies must be browser-safe.

---

# 22. Server Component to Client Component Composition

A server-rendered page/layout may import and render a client component.

Example:

```tsx
import { Counter } from "./Counter";

export default async function Page() {
  const product = await loadProduct();

  return (
    <>
      <h1>{product.name}</h1>
      <Counter initialValue={0} />
    </>
  );
}
```

The build system identifies the client boundary and generates the required browser bundle.

---

# 23. Client to Server Import Restriction

A client module must not directly import a server-only component/module.

Invalid:

```tsx
"use client";

import { getDatabase } from "../../server/db";
```

Result:

```text
RANU_RENDER_CLIENT_SERVER_BOUNDARY
```

The diagnostic should show the import chain.

---

# 24. Server Data Passed to Client Components

Data passed from server-rendered code into client components must be serializable.

Allowed baseline types include:

```text
null
boolean
number
string
arrays of serializable values
plain objects with serializable values
```

Support for additional values such as `Date` may be introduced through an explicit serializer.

V1 baseline should prefer JSON-compatible values.

---

# 25. Non-Serializable Props

The following must not cross the server-to-client boundary automatically:

```text
functions
database connections
Request
Response
streams
filesystem handles
class instances without explicit serialization
symbols
```

Development/build should detect statically obvious cases where possible.

Runtime serialization failure must produce a clear rendering error.

---

# 26. Rendering Modes

Ranu.js V1 defines three page rendering modes:

```text
static
server
client
```

Meaning:

- `static` — HTML is generated at build time.
- `server` — HTML is generated for requests at runtime.
- `client` — page shell is delivered and primary route UI is rendered in the browser.

Hybrid applications may contain routes using different modes.

---

# 27. Default Rendering Mode

The Ranu.js V1 default page rendering mode is:

```text
server
```

Reason:

- predictable full-stack behavior;
- access to request/runtime data;
- no accidental build-time execution of dynamic server logic;
- simpler migration from dynamic applications.

Developers explicitly opt routes into static or client rendering.

---

# 28. Route Rendering Configuration

V1 uses a route-module export:

```ts
export const render = "server";
```

Supported values:

```ts
export const render = "static";
export const render = "server";
export const render = "client";
```

If omitted:

```text
server
```

is used.

Invalid values fail build/dev validation.

---

# 29. Rendering Configuration Ownership

The `render` export belongs to the page route module.

Layouts do not independently change the route's final rendering mode in V1.

However, layout capabilities may make a requested mode invalid.

Example:

A static page using a layout that requires request-only data cannot be safely statically rendered.

The build must detect this during static generation or capability analysis.

---

# 30. Static Rendering

For:

```ts
export const render = "static";
```

Ranu.js renders the route during:

```text
Ranu.js build
```

and writes generated output into standard Ranu.js build artifacts.

At runtime, the generated output is served without executing page SSR for that concrete static path.

---

# 31. Static Rendering Constraints

A static route must be build-time renderable.

It must not require request-specific values such as:

- current request headers;
- request cookies;
- request body;
- authenticated request identity;
- runtime-only secrets unavailable during build;
- unpredictable per-request URL state.

Build-time environment access is allowed where explicitly available, but developers must understand that generated output becomes build output.

---

# 32. Static Route Failure

If a route marked:

```ts
render = "static"
```

cannot render at build time, `Ranu.js build` must fail unless a later specification defines an explicit fallback behavior.

Ranu.js V1 must not silently convert failed static routes to SSR.

This prevents deployment behavior from changing unexpectedly.

---

# 33. Dynamic Static Parameters

A dynamic route marked static must provide build-time parameter values.

V1 public API:

```ts
export async function generateStaticParams() {
  return [
    { id: "1" },
    { id: "2" }
  ];
}
```

Example route:

```text
app/products/[id]/page.tsx
```

---

# 34. Static Parameter Validation

For:

```text
/products/[id]
```

each generated parameter object must contain:

```text
id
```

For catch-all:

```text
/docs/[...slug]
```

the parameter must be:

```ts
{ slug: ["guide", "routing"] }
```

For optional catch-all root match:

```ts
{ slug: [] }
```

Invalid parameter shape must fail the build with route-specific diagnostics.

---

# 35. Duplicate Static Paths

`generateStaticParams()` must not produce duplicate concrete URLs after encoding/normalization.

Duplicates must be detected and reported.

Ranu.js must not silently overwrite one generated output with another.

---

# 36. Static Dynamic-Path Fallback

Ranu.js V1 locks the following behavior:

For a dynamic route with:

```ts
render = "static"
```

only paths generated during the build are valid.

An ungenerated dynamic value returns:

```text
404
```

Ranu.js V1 does not perform automatic runtime fallback rendering for static routes.

This keeps static behavior deterministic.

---

# 37. Static Generation Pipeline

```text
Compiled Page Route
      ↓
render = static
      ↓
Resolve generateStaticParams if dynamic
      ↓
Validate Concrete Paths
      ↓
Create Static Render Context
      ↓
Compose Layout + Page
      ↓
React Server Render
      ↓
Resolve Metadata
      ↓
Generate HTML
      ↓
Associate Client Assets
      ↓
Write Static Output
      ↓
Write Static Manifest
```

---

# 38. Server Rendering

For:

```ts
export const render = "server";
```

Ranu.js renders the page for each applicable HTTP request.

Pipeline:

```text
Request
   ↓
Route Match
   ↓
Middleware
   ↓
Create Render Context
   ↓
Load Page + Layout Chain
   ↓
Execute Server Data Logic
   ↓
React Render
   ↓
Resolve Metadata
   ↓
HTML / Stream
   ↓
Attach Client Assets
   ↓
Response
```

---

# 39. Server Rendering Request Access

Server-rendered route execution may access request-scoped data through documented Ranu.js server APIs.

Examples to be finalized in `05_SERVER_RUNTIME_SPEC.md`:

```text
request URL
headers
cookies
route params
request context
```

Rendering modules must not depend on undocumented Node request objects.

---

# 40. Client Rendering

For:

```ts
export const render = "client";
```

Ranu.js generates a minimal server-delivered document shell and browser entry for the route.

Primary page rendering occurs in the browser.

Client-rendered routes cannot directly depend on server-only data during initial component execution.

Server data must be accessed through HTTP/API endpoints or future explicit server-function mechanisms.

---

# 41. Client Route Module Requirement

A route configured:

```ts
render = "client"
```

must have a client-compatible page graph.

The page module itself should contain or resolve through a `"use client"` boundary suitable for browser execution.

If the route graph requires server-only imports, build must fail.

---

# 42. Client Rendering Use Cases

Client mode is appropriate for applications such as:

- browser-only tools;
- authenticated dashboards where SEO is irrelevant;
- interfaces heavily dependent on browser APIs;
- fully client-driven applications.

It should not be the automatic default.

---

# 43. Hybrid Rendering

An application may contain:

```text
/                 static
/blog             static
/blog/[slug]      static
/dashboard        server
/editor           client
/api/...          API
```

The build/runtime must preserve each route's configured mode.

---

# 44. SSR and Client Components

A server-rendered route may contain client components.

This does **not** make the entire route client-rendered.

Example:

```text
Page Route: server
 ├── Server-rendered product content
 └── Client Counter component
```

Initial HTML contains server-rendered content and hydration markers/assets for interactive client boundaries.

---

# 45. SSG and Client Components

A static route may also contain client components.

Build-time output:

```text
Static HTML
+
Client JS assets
```

Browser:

```text
Load HTML
→ Load route/client assets
→ Hydrate interactive boundaries
```

Static rendering therefore does not mean "no JavaScript."

---

# 46. Hydration

Hydration connects server/static HTML to client-side React execution.

Ranu.js must generate a browser bootstrap entry that:

1. loads required client modules;
2. reconstructs client-safe serialized inputs;
3. hydrates the React tree/boundaries;
4. activates ranu CLIent navigation.

---

# 47. Hydration Asset Association

The build system must know which client bundles belong to each page route.

Conceptual route metadata:

```ts
{
  routeId: "page:/products/[id]",
  assets: [
    "/_ranu/assets/product-page.abc.js",
    "/_ranu/assets/counter.xyz.js"
  ]
}
```

The renderer/server inserts appropriate references into generated HTML.

---

# 48. Hydration Data

Serialized client hydration data must be embedded or referenced safely.

Requirements:

- valid encoding;
- no executable-string injection;
- no raw secret values;
- no arbitrary server object serialization;
- compatible build ID;
- route identity where required.

JSON embedded in HTML must be escaped against script-breaking sequences.

---

# 49. Hydration Mismatch

Development mode should surface React hydration mismatches clearly.

Ranu.js diagnostics should add route/source context when possible.

Production must not expose internal stack traces to clients.

---

# 50. Client Bootstrap

Ranu.js owns the default client bootstrap.

Applications should not need to manually call:

```text
hydrateRoot(...)
```

for ordinary Ranu.js pages.

Advanced custom bootstrap support may be added later.

---

# 51. Full Document Navigation Fallback

If client-side navigation cannot execute, ordinary internal links must still work through normal browser document navigation.

This is a V1 progressive-enhancement requirement.

Ranu.js routing must not depend on JavaScript merely to reach server/static pages.

---

# 52. Ranu.js Link

The React package provides a framework-aware:

```tsx
import { Link } from "Ranu.js/react";
```

Example:

```tsx
<Link href="/about">About</Link>
```

It must render an ordinary anchor-compatible navigation element.

Client-side optimization may enhance it when available.

---

# 53. Link Accessibility

`Link` must preserve normal web semantics.

It must not:

- break modifier-key behavior;
- prevent opening in a new tab;
- intercept external links incorrectly;
- require JavaScript for basic navigation.

---

# 54. Client Navigation Model

Ranu.js V1 may enhance eligible same-origin internal links.

Conceptual flow:

```text
Click Internal Link
    ↓
ranu CLIent Router
    ↓
History Update
    ↓
Obtain New Route Representation
    ↓
Render/Hydrate New UI
```

However, V1 correctness does not depend on implementing complex partial-server-component navigation.

---

# 55. V1 Navigation Baseline

The minimum acceptable V1 behavior is:

- server/static first load works;
- ordinary document navigation works;
- Ranu.js `Link` preserves anchor behavior;
- client-rendered routes support SPA navigation where practical;
- enhanced navigation must never change route semantics.

Advanced partial page streaming/navigation may be added after the baseline is stable.

---

# 56. Loading UI

A `loading.*` boundary is associated by the router.

Its actual display depends on rendering/navigation state.

V1 server initial rendering does not need to display loading UI if the server can complete the render before sending the response.

For client navigation or streaming-capable rendering, the nearest loading boundary may be displayed while route content is pending.

---

# 57. Loading Boundary Composition

For:

```text
Root Layout
→ Dashboard Layout
→ Dashboard Loading
→ Settings Page
```

the loading boundary applies within the relevant layout subtree.

It must not replace unrelated parent layout UI.

Exact React Suspense integration may be implementation-specific.

---

# 58. Streaming SSR

Ranu.js V1 architecture supports streaming SSR.

The official React renderer may use React streaming APIs where stable.

Streaming is not required for every route.

The renderer capability must declare:

```text
streaming: true/false
```

---

# 59. Streaming Fallback

If streaming is unavailable in a runtime adapter, the framework may buffer the completed render if route behavior remains correct.

An adapter must not claim streaming support when it cannot preserve required semantics.

---

# 60. Streaming and Errors

Errors occurring before headers/body commitment can use normal error-boundary/status behavior.

Errors occurring after streaming begins require controlled stream termination and safe logging.

Exact HTTP status limitations are handled by the server runtime.

---

# 61. Error Module

An `error.*` file defines a React error UI boundary.

Conceptual component:

```tsx
"use client";

export default function ErrorView({
  error,
  reset
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div>
      <h2>Something went wrong</h2>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
```

The exact public props must be finalized before stable release.

---

# 62. Error Boundary Client Requirement

Ranu.js V1 error UI modules are client boundaries.

Therefore an `error.*` module must be client-compatible.

Ranu.js may automatically treat it as client-side or require `"use client"`.

V1 locks the clearer rule:

```text
error.* must declare "use client".
```

Missing directive produces a development/build diagnostic.

---

# 63. Error Boundary Selection

The nearest applicable error boundary handles rendering failures within its descendant page subtree.

If it cannot handle/render successfully, the error propagates to the next parent boundary.

Ultimately, the root production error response provides a safe fallback.

---

# 64. Error Information Safety

Development may provide:

- message;
- stack;
- source;
- route;
- component context.

Production error UI must not automatically receive sensitive internal details.

The renderer/runtime may provide a sanitized error identifier.

---

# 65. Reset Behavior

The `reset` capability requests another attempt to render the failed boundary subtree where technically valid.

It must not promise that permanent server errors will disappear.

Exact retry mechanics may differ between initial server rendering and client navigation.

---

# 66. Not-Found Rendering

The router selects the applicable `not-found.*` boundary.

A page/server execution may explicitly request not-found behavior through an Ranu.js helper.

Conceptual:

```ts
import { notFound } from "Ranu.js/server";

notFound();
```

The server runtime converts this control signal to HTTP 404 behavior.

The renderer renders the selected not-found UI.

---

# 67. Root Unmatched URL

For an entirely unmatched page URL:

```text
router → no match
```

the server runtime uses:

```text
app/not-found.*
```

when available.

If no custom root not-found module exists, Ranu.js supplies a minimal default 404 document.

---

# 68. Nested Not-Found

For:

```text
/products/[id]
```

a page may determine that the requested product does not exist.

Calling:

```text
notFound()
```

uses the nearest applicable not-found boundary, such as:

```text
app/products/not-found.tsx
```

and returns HTTP 404.

---

# 69. Not-Found and Static Generation

During static generation, calling `notFound()` for one generated parameter prevents creation of a normal successful page for that parameter.

The build records or omits that path according to static manifest rules.

It must not emit a successful 200 HTML file containing a not-found page.

---

# 70. Metadata System

Ranu.js V1 provides page metadata through route-module exports.

Static metadata:

```ts
export const metadata = {
  title: "About",
  description: "About our company"
};
```

Dynamic metadata:

```ts
export async function generateMetadata(context) {
  return {
    title: `Product ${context.params.id}`
  };
}
```

---

# 71. Metadata Scope

Metadata may be defined by:

- root layout;
- nested layouts;
- page.

The renderer resolves metadata from root to leaf.

Page-level values generally override parent values where the field is singular.

Structured fields may use field-specific merge rules.

---

# 72. Metadata Precedence

Conceptual precedence:

```text
Framework defaults
    ↓
Root layout metadata
    ↓
Nested layout metadata
    ↓
Page metadata
```

For a simple field such as:

```text
title
```

the nearest child value wins.

---

# 73. Metadata Title Template

Ranu.js V1 may support:

```ts
metadata = {
  title: {
    default: "My App",
    template: "%s | My App"
  }
}
```

A child page:

```ts
metadata = {
  title: "About"
}
```

resolves to:

```text
About | My App
```

If implementation complexity threatens core V1 stability, title templates may be delivered after basic metadata while preserving this planned contract.

---

# 74. Metadata Fields

V1 core metadata should support at least:

```text
title
description
robots
canonical
openGraph basic fields
icons
```

The exact TypeScript schema must be defined in implementation.

Ranu.js should avoid attempting to encode every possible HTML head tag into a proprietary metadata language.

Applications may still render appropriate document elements through supported escape hatches.

---

# 75. Metadata Rendering

Resolved metadata is converted into document head elements.

Examples:

```html
<title>...</title>
<meta name="description" content="..." />
<link rel="canonical" href="..." />
```

Ranu.js must safely escape metadata values.

---

# 76. Static Metadata Resolution

For static routes, metadata is resolved during build.

Dynamic `generateMetadata()` must therefore be build-time executable for static routes.

If it requires unavailable request-only state, the static build fails.

---

# 77. Server Metadata Resolution

For server routes, dynamic metadata may execute per request.

It receives route params and documented render context.

It must obey the same server/client safety rules as other server route logic.

---

# 78. Client Route Metadata

For `render = "client"`, route metadata should still be generated server/build-side where possible so initial document head is meaningful.

Client-only metadata updates after navigation may be supported by the ranu CLIent runtime.

SEO-critical metadata should not depend solely on browser execution when avoidable.

---

# 79. Data Fetching Model

Ranu.js V1 does not introduce a proprietary universal data-fetching API.

Server-rendered components may use ordinary async TypeScript/JavaScript:

```tsx
export default async function Page() {
  const products = await getProducts();
  return <ProductList products={products} />;
}
```

They may use:

- database clients;
- `fetch`;
- internal server services;
- ordinary promises.

---

# 80. Server Fetch

Ranu.js should use or preserve Web-standard `fetch` semantics in server environments.

V1 does not automatically redefine every `fetch` call with framework-specific caching behavior.

Caching/revalidation may be introduced later through explicit APIs.

This avoids hidden data semantics.

---

# 81. Build-Time Fetch

Static generation may execute `fetch` during build.

Failures are build failures unless application code handles them.

Ranu.js should surface the route being generated and relevant safe error information.

---

# 82. Request-Time Fetch

SSR routes execute data loading during the request lifecycle.

Timeout/cancellation behavior should integrate with the request/runtime signal where possible.

Detailed request cancellation semantics belong in the server runtime specification.

---

# 83. No Implicit Global Data Loader

Ranu.js V1 does not require APIs such as:

```text
getServerSideProps
getStaticProps
```

Page modules may use ordinary async component/server code.

Static-vs-server behavior is declared through:

```ts
export const render = ...
```

This keeps the model compact.

---

# 84. Render Context

Server/static page execution may receive Ranu.js context through documented helpers or component props.

The baseline page props should include route parameters.

Conceptual:

```tsx
export default async function Page({
  params
}: {
  params: { id: string }
}) {
  ...
}
```

V1 locks `params` as direct page/layout render input.

---

# 85. Search Parameters

For server-rendered page routes, current URL search parameters may be exposed to the page.

Conceptual:

```tsx
export default function Page({
  params,
  searchParams
}) {}
```

`searchParams` do not participate in route identity.

For static routes, arbitrary request-time search parameters cannot affect build-time HTML.

Applications needing search-driven dynamic server HTML should use server mode.

---

# 86. Layout Parameters

Layouts receive parameters applicable to their descendant route context.

The exact typing may be generated later.

A layout must not assume parameters from unrelated route branches.

---

# 87. Static Search Parameters

A static route may still be requested with:

```text
?page=2
```

but the static HTML is selected by pathname, not query string.

Client code may inspect the browser query and update UI.

If query-specific server output is required, use `render = "server"`.

---

# 88. Request Cookies in Rendering

Request cookies are available only in request-capable server rendering.

Using request cookies in a static route is invalid because there is no individual user request during build.

Ranu.js must fail clearly if a static route attempts a request-only API.

---

# 89. Request Headers in Rendering

The same rule applies to request headers.

Static rendering cannot depend on arbitrary incoming request headers.

Server rendering can.

---

# 90. Rendering Capability Tracking

Ranu.js should track request-only API usage where technically feasible.

At minimum, static generation must fail at execution time with an Ranu.js-specific diagnostic when request-only APIs are called without a request context.

This prevents misleading undefined behavior.

---

# 91. Environment Variables

Server/static rendering may access private environment variables available in its execution environment.

Client modules may access only explicitly public variables defined by the build system convention.

Private variables must not be serialized simply because a server component passes a large environment-derived object to a client component.

---

# 92. Public Environment Variables

The exact public prefix is defined in `06_BUILD_SYSTEM.md`.

Rendering assumes:

```text
private by default
explicitly public when opted in
```

Client bundles receive only public variables.

---

# 93. CSS and Rendering

CSS assets imported by page/client modules are processed by the build system.

The renderer associates required CSS assets with the generated document.

Global CSS should be imported from the root layout or another documented global entry.

CSS Modules may be imported by components.

---

# 94. Asset Imports

Renderable components may import supported build assets such as:

```text
CSS
images
fonts through supported build mechanisms
```

Asset transformation is owned by the build system.

The renderer consumes generated URLs/metadata.

---

# 95. Public Assets

Assets under:

```text
public/
```

are referenced through public URL paths.

The renderer does not bundle them merely because they appear in markup.

---

# 96. HTML Escaping

React handles ordinary text escaping.

Ranu.js metadata and hydration serializers must independently ensure safe HTML embedding.

Framework-generated HTML must not interpolate untrusted strings directly into executable script contexts.

---

# 97. CSP Compatibility

Ranu.js should avoid unnecessary inline executable JavaScript.

Where hydration data or bootstrap code requires inline elements, the architecture should allow nonce-based CSP integration.

Full CSP policy management is not required in this rendering specification, but the renderer must not make strong CSP impossible.

---

# 98. Build ID in Rendering

Generated documents may include or reference the current Ranu.js build ID.

Client runtime must not combine incompatible server-rendered payloads/assets from different builds without detection where practical.

---

# 99. Production Rendering Errors

If server rendering fails before a response is committed:

```text
nearest applicable error UI
or
safe root error document
```

is rendered according to error semantics.

The HTTP status should indicate server failure unless the failure is an intentional control result such as not-found or redirect.

---

# 100. Development Error UI

Development rendering failures should provide:

- Ranu.js error code;
- route;
- source file;
- stack where available;
- import chain for boundary violations;
- actionable hint.

Developer diagnostics are not production response content.

---

# 101. Redirect During Rendering

Server/static page logic may invoke an Ranu.js redirect helper.

Conceptual:

```ts
import { redirect } from "Ranu.js/server";

redirect("/login");
```

During SSR:

```text
control signal → HTTP redirect response
```

During static generation, unconditional redirects may become static redirect metadata if supported by the build/deployment system.

Otherwise build should reject unsupported static redirect behavior clearly.

---

# 102. Redirect Before Client Boundary

Redirect decisions based on private/authentication state belong on the server.

Client components may navigate using client navigation APIs, but that is not equivalent to secure server access control.

---

# 103. Render Control Signals

Ranu.js internal rendering must distinguish intentional control flow from unexpected exceptions.

Examples:

```text
RedirectSignal
NotFoundSignal
```

These must not be logged as ordinary application crashes.

They are converted by the server/build layer into defined outcomes.

---

# 104. Client Navigation API

The React package may expose:

```ts
useRouter()
```

with baseline capabilities:

```text
push
replace
back
refresh
```

The exact stable API must be kept minimal.

It must use the same public route semantics as server routing.

---

# 105. Client Search/Path Hooks

The React integration may expose:

```text
usePathname()
useSearchParams()
```

for browser/client modules.

These APIs are client-only.

Server-rendered modules should use server render context rather than client hooks.

---

# 106. Refresh Semantics

For server-rendered routes, a client `refresh()` may request a fresh server representation or perform full document reload in the initial V1 implementation.

The framework must prioritize correct data refresh over sophisticated partial transport.

---

# 107. No Mandatory RSC Protocol

Ranu.js V1 explicitly does not require:

- React Flight as a public Ranu.js transport contract;
- proprietary server-component payload URLs;
- a custom RSC bundler implementation;
- server actions as a prerequisite.

Ranu.js may adopt compatible React capabilities later through a separately specified architecture.

---

# 108. React Version Strategy

Ranu.js should define a supported React version range through package peer dependencies.

The rendering architecture must not depend on undocumented React internals.

Where streaming/hydration APIs differ by React version, Ranu.js should isolate compatibility inside `@ranu/react`.

---

# 109. Renderer Independence Test

A core architecture test should verify that:

```text
@ranu/router
@ranu/core
@ranu/runtime
```

can be imported/tested without requiring React to initialize.

This protects future renderer extensibility.

---

# 110. Future Renderer Contract

A future renderer must be able to receive:

```text
route composition
params
render context
mode
asset/build integration
```

without changing filesystem route semantics.

Examples could include:

```text
Preact
Solid
Vue
```

No alternative renderer is required for V1.

---

# 111. Rendering Cache

Ranu.js V1 does not require automatic SSR response caching.

Server routes render per request unless application/infrastructure caching is explicitly configured.

This avoids hidden cache behavior.

---

# 112. Revalidation

ISR-style timed revalidation is deferred from the core V1 rendering contract.

V1 static output is generated at build time and remains unchanged until a new build/deployment.

A future revalidation model must be explicit.

---

# 113. Dynamic Rendering Detection

Ranu.js does not silently switch:

```text
static → server
```

because dynamic APIs were used.

If a route is declared static and uses incompatible behavior, build fails.

This is a locked predictability rule.

---

# 114. Server Rendering Determination

If `render` is omitted, Ranu.js uses server rendering even if the route appears statically renderable.

Automatic static optimization is not required in V1.

Future tooling may suggest static mode without silently changing behavior.

---

# 115. Client Rendering Determination

Ranu.js does not automatically convert a route to `client` merely because it contains client components.

Server/static routes may contain client boundaries.

Whole-route client rendering requires:

```ts
export const render = "client";
```

---

# 116. Render Mode Validation

Build/dev must validate combinations such as:

```text
static route + request-only API → invalid
client route + server-only import → invalid
static dynamic route + no generateStaticParams → invalid
client route + server-only layout dependency → invalid
```

Diagnostics must identify the route and conflicting capability.

---

# 117. Client Route Layout Constraint

A `render = "client"` route still uses the Ranu.js root document/layout system.

However, any layout code that must execute as part of the browser-rendered route subtree must be client-compatible.

Ranu.js may server-render the outer document shell while hydrating/rendering the client route application inside it.

The build system must determine safe graph boundaries.

---

# 118. Recommended Client Mode Architecture

For V1, client routes should use:

```text
Server-generated root document shell
    ↓
Client route mount point
    ↓
Browser React render
```

This preserves metadata/document generation while keeping the route body client-driven.

---

# 119. Client Route SEO

Client-rendered route body content may not be present in initial HTML.

Ranu.js documentation must make this clear.

Developers requiring indexable initial content should prefer static or server rendering.

---

# 120. SSR HTML Completeness

A server-rendered route must produce meaningful initial HTML for server-rendered content.

Ranu.js must not ship an empty root div and call it SSR.

---

# 121. Static HTML Completeness

A static route must produce complete initial HTML for its server-renderable content at build time.

Interactive client boundaries may hydrate afterward.

---

# 122. Head and Body Asset Placement

Ranu.js should place:

- critical metadata in `<head>`;
- CSS references in appropriate document positions;
- client JS using non-blocking loading strategies where practical;
- hydration data safely.

Exact optimization strategy is implementation-specific.

---

# 123. Script Ordering

Client bootstrap must execute only after required document/client metadata is available.

The build system must preserve dependency ordering between runtime and route chunks.

Applications must not depend on generated chunk filenames.

---

# 124. Preload/Prefetch

Ranu.js may preload critical route assets.

Client navigation may prefetch linked routes.

Prefetching is an optimization, not a correctness requirement.

V1 must permit disabling or avoiding aggressive prefetching.

---

# 125. Link Prefetch

A future or initial `Link` API may support:

```tsx
<Link href="/about" prefetch>
```

The exact default is not locked here.

Prefetch must not execute unsafe server mutations.

---

# 126. Forms

Ordinary HTML forms must work through standard browser submission.

Ranu.js V1 rendering does not require server actions.

Forms may submit to:

- API routes;
- external endpoints;
- ordinary server endpoints.

Enhanced client form handling may be implemented by application code.

---

# 127. Mutation Model

Ranu.js V1 does not create a hidden mutation protocol.

Mutations use explicit HTTP/API behavior unless future server functions are introduced.

This keeps browser/server boundaries visible.

---

# 128. Suspense

React Suspense may be used by applications and Ranu.js loading integration.

Ranu.js should not expose a second competing suspense abstraction.

Streaming support should leverage stable React capabilities where possible.

---

# 129. Async Components

Server-rendered page/layout components may be async.

Example:

```tsx
export default async function Page() {
  const data = await loadData();
  return <View data={data} />;
}
```

Client components must follow React-supported client component rules.

---

# 130. Async Layouts

Layouts may also be async in server/static rendering.

A static route with async layouts executes them during build.

A server route executes them per request.

---

# 131. Rendering Concurrency

Independent static pages may be rendered concurrently during build.

Within a React render, React controls component rendering concurrency according to its APIs.

Ranu.js must bound build-level concurrency to avoid resource exhaustion.

---

# 132. Render Cancellation

When the runtime provides request cancellation/abort signals, server rendering and data fetching should receive or respect them where practical.

The renderer must not keep expensive work running indefinitely after a client disconnect when cancellation can safely propagate.

---

# 133. Render Timeout

A global or adapter-level timeout may terminate server rendering.

Timeout configuration belongs to runtime/deployment specifications.

Rendering diagnostics must distinguish timeout from application exception where possible.

---

# 134. Serialization Version

If Ranu.js uses a framework-specific hydration payload, it must include a schema/build version.

Client runtime must not silently parse incompatible payload formats.

---

# 135. Client-Safe Error Serialization

Errors crossing to client error UI must be sanitized.

Conceptual production payload:

```ts
{
  id: "err_...",
  message: "An unexpected error occurred."
}
```

Development may include richer information.

---

# 136. Metadata Error Behavior

If metadata generation fails, it is a route rendering failure.

Ranu.js must not silently omit metadata and return a successful page unless the application explicitly handles the failure.

---

# 137. Static Metadata Failure

A metadata failure for a static route fails the build for that route and therefore the build unless future partial-build policies explicitly allow otherwise.

---

# 138. Browser Error Recovery

Errors after hydration may be handled by React error boundaries/client runtime.

Ranu.js should preserve route-level error boundary behavior during client navigation where practical.

A browser-only exception must not crash the development server process.

---

# 139. Route Transition Error

If enhanced client navigation to another route fails, Ranu.js may:

- render the applicable error boundary;
- fall back to full document navigation;
- surface development diagnostics.

It must not leave browser history/UI in an irrecoverably inconsistent state.

---

# 140. 404 During Client Navigation

Client navigation to a not-found destination must ultimately show the same not-found semantics as direct navigation.

The HTTP/server route remains authoritative.

---

# 141. Redirect During Client Navigation

A server redirect encountered during enhanced navigation must update browser location/history correctly.

Redirect loops should be handled by normal browser/runtime protections and clear diagnostics where detectable.

---

# 142. Rendering and API Routes

API routes do not use the React renderer.

This document applies only to page rendering except where page code communicates with APIs.

The architecture must maintain:

```text
API Route
→ Server Runtime
```

not:

```text
API Route
→ React Renderer
```

---

# 143. Rendering and Middleware

Middleware executes outside React rendering.

Middleware may:

- continue;
- redirect;
- return a response;
- add context/headers where supported.

Only after middleware permits page execution does the renderer run.

---

# 144. Rendering and Cookies

Server rendering may read request cookies through Ranu.js server APIs.

Cookie mutation semantics are controlled by the server runtime.

A React renderer must not directly manipulate Node response objects.

---

# 145. Rendering and Headers

Page rendering may contribute response metadata/headers through documented Ranu.js APIs where supported.

The final response is normalized by the server runtime.

Renderer-specific code must not assume Node's `ServerResponse`.

---

# 146. Content Type

Successful HTML page rendering uses an HTML content type with UTF-8 semantics.

The server runtime owns final header normalization.

Static output must be served with equivalent semantics.

---

# 147. HEAD Requests

HEAD behavior for page routes is handled by the server runtime.

The renderer should not need to generate/send a body for HEAD if the runtime can derive required headers appropriately.

Exact behavior is defined in `05_SERVER_RUNTIME_SPEC.md`.

---

# 148. Rendering Diagnostics

Required conceptual diagnostic categories include:

```text
RANU_RENDER_INVALID_PAGE_EXPORT
RANU_RENDER_INVALID_LAYOUT_EXPORT
RANU_RENDER_INVALID_MODE
RANU_RENDER_STATIC_DYNAMIC_API
RANU_RENDER_STATIC_PARAMS_REQUIRED
RANU_RENDER_STATIC_PARAMS_INVALID
RANU_RENDER_CLIENT_SERVER_BOUNDARY
RANU_RENDER_SERVER_ONLY_IMPORT
RANU_RENDER_NON_SERIALIZABLE_PROP
RANU_RENDER_ROOT_DOCUMENT_INVALID
RANU_RENDER_ERROR_BOUNDARY_CLIENT_REQUIRED
RANU_RENDER_METADATA_ERROR
RANU_RENDER_HYDRATION_ERROR
```

Stable final codes may be refined before release.

---

# 149. Boundary Diagnostic Example

Given:

```text
app/dashboard/Counter.tsx
  "use client"

imports:

server/db.ts
```

Ranu.js should report:

```text
RANU_RENDER_CLIENT_SERVER_BOUNDARY

Client code cannot import a server-only module.

Client entry:
  app/dashboard/Counter.tsx

Server-only module:
  server/db.ts

Import chain:
  Counter.tsx
  → server/db.ts
```

---

# 150. Static API Diagnostic Example

Given a static route that calls a request-cookie API:

```text
RANU_RENDER_STATIC_DYNAMIC_API

Route /account is configured for static rendering,
but it accessed request cookies during build rendering.

Use:
  export const render = "server"

or remove request-specific behavior.
```

---

# 151. Rendering Test Layers

Required tests:

```text
Renderer unit tests
React adapter tests
Boundary graph tests
SSR integration tests
SSG integration tests
Hydration browser tests
Client route tests
Error/not-found tests
Metadata tests
Production build/runtime tests
```

---

# 152. SSR Test Matrix

At minimum:

- simple page SSR;
- nested layouts;
- async page;
- async layout;
- dynamic params;
- search params;
- client component inside SSR page;
- metadata;
- redirect;
- not-found;
- nested error boundary;
- production error sanitization;
- CSS/client asset association.

---

# 153. SSG Test Matrix

At minimum:

- root static page;
- nested static page;
- static page with client component;
- dynamic static route;
- catch-all static route;
- optional catch-all static route;
- duplicate static params;
- invalid params;
- missing `generateStaticParams`;
- static not-found;
- static metadata;
- static route using request-only API;
- ungenerated dynamic path returns 404.

---

# 154. Client Rendering Test Matrix

At minimum:

- client route bootstrap;
- React hooks;
- browser API access;
- client navigation;
- server-only import rejection;
- private environment rejection;
- metadata shell;
- direct browser reload;
- external link behavior;
- full document fallback.

---

# 155. Hydration Test Matrix

At minimum:

- SSR hydration;
- SSG hydration;
- nested client components;
- serialized props;
- non-serializable prop failure;
- build ID compatibility;
- hydration mismatch development reporting;
- client event handling after hydration.

---

# 156. Error Test Matrix

At minimum:

- page render error;
- layout render error;
- nested boundary handling;
- boundary failure propagation;
- root fallback;
- client error after hydration;
- metadata failure;
- error sanitization;
- redirect not treated as crash;
- not-found not treated as crash.

---

# 157. Rendering Performance Measurements

Before stable V1, measure:

- SSR framework overhead;
- static render throughput;
- hydration bundle overhead;
- client bootstrap size;
- time to first HTML byte;
- time to first meaningful content;
- memory during static generation;
- memory during concurrent SSR.

Targets should be established after baseline measurements.

---

# 158. Rendering Security Review

Before stable V1, explicitly test:

1. secret leakage into browser bundles;
2. secret leakage into hydration data;
3. XSS through serialized hydration state;
4. XSS through metadata;
5. source-path leakage;
6. production stack leakage;
7. server-only import enforcement;
8. public environment variable boundaries;
9. unsafe redirect values where applicable;
10. CSP compatibility.

---

# 159. Rendering Build Artifacts

The build system should produce enough rendering metadata to identify:

```text
route mode
server entry
client entry/chunks
CSS assets
static HTML output
metadata output where precomputed
hydration requirements
build ID
```

The renderer must not require source-tree discovery at runtime.

---

# 160. Renderer/Build Boundary

The renderer is responsible for:

```text
component composition
React rendering
document output
metadata conversion
hydration semantics
```

The build system is responsible for:

```text
module graphs
bundling
asset generation
client/server separation
static-generation orchestration
manifest writing
```

Neither should duplicate the other's responsibilities.

---

# 161. Renderer/Server Boundary

The renderer produces a render result.

The server runtime owns:

```text
HTTP request lifecycle
middleware
status normalization
response commitment
cookies
headers
redirect response execution
timeout/cancellation policy
```

The React renderer must not own the Node HTTP server.

---

# 162. Renderer/Router Boundary

The router supplies:

```text
page module
ordered layouts
loading boundary
error boundaries
not-found boundary
params
route ID
route pattern
```

The renderer must not scan the filesystem to rediscover these.

---

# 163. V1 Rendering Example

Source:

```text
app/
├── layout.tsx
├── page.tsx
├── products/
│   ├── layout.tsx
│   ├── page.tsx
│   └── [id]/
│       ├── error.tsx
│       ├── page.tsx
│       └── Counter.tsx
└── api/
    └── products/
        └── route.ts
```

`app/products/[id]/page.tsx`:

```tsx
import { Counter } from "./Counter";

export const render = "server";

export default async function ProductPage({ params }) {
  const product = await getProduct(params.id);

  if (!product) {
    notFound();
  }

  return (
    <>
      <h1>{product.name}</h1>
      <Counter />
    </>
  );
}
```

`Counter.tsx`:

```tsx
"use client";

import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);

  return (
    <button onClick={() => setCount(count + 1)}>
      {count}
    </button>
  );
}
```

Result:

```text
Request /products/42
→ route match
→ middleware
→ server data load
→ root layout
→ products layout
→ product page
→ server HTML
→ client Counter asset
→ response
→ browser hydration
```

---

# 164. Static Example

```tsx
export const render = "static";

export async function generateStaticParams() {
  return [
    { slug: "getting-started" },
    { slug: "routing" }
  ];
}

export default async function Page({ params }) {
  const article = await loadArticle(params.slug);

  return <article>{article.content}</article>;
}
```

Build:

```text
/docs/getting-started
/docs/routing
```

are generated.

Request:

```text
/docs/unknown
```

returns:

```text
404
```

without runtime SSR fallback.

---

# 165. Client Example

```tsx
"use client";

import { useState } from "react";

export const render = "client";

export default function EditorPage() {
  const [text, setText] = useState("");

  return (
    <textarea
      value={text}
      onChange={(event) => setText(event.target.value)}
    />
  );
}
```

Ranu.js generates the document shell and client entry.

The editor UI is rendered in the browser.

---

# 166. Locked V1 Rendering Decisions

The following are locked by this specification:

1. React is the official V1 renderer.
2. Ranu.js core/router remain renderer-neutral.
3. Page/layout modules are server-capable by default.
4. `"use client"` defines a client module boundary.
5. Client-boundary imports propagate client compatibility requirements.
6. `Ranu.js/server-only` marks explicit server-only modules.
7. `server/` is treated as a server-only project area.
8. Server-only modules cannot enter client bundles.
9. Server-to-client props must be serializable.
10. V1 baseline serialization is JSON-compatible data.
11. Rendering modes are `static`, `server`, and `client`.
12. Default page rendering mode is `server`.
13. Page modules declare mode with `export const render`.
14. Ranu.js does not silently auto-convert rendering modes.
15. Static rendering occurs at build time.
16. Static routes that require request-only data fail the build.
17. Dynamic static routes use `generateStaticParams()`.
18. Ungenerated paths for static dynamic routes return 404.
19. V1 does not provide runtime static fallback.
20. V1 does not require ISR/revalidation.
21. SSR occurs per request.
22. Client mode explicitly opts the route into browser-primary rendering.
23. SSR/SSG routes may contain client components.
24. Hydration is owned by the Ranu.js React integration.
25. Ordinary links must work without client JavaScript.
26. Ranu.js `Link` preserves anchor semantics.
27. V1 does not require a proprietary RSC/Flight transport.
28. V1 does not require server actions.
29. Ordinary async server components/page logic are supported.
30. Ranu.js does not require `getServerSideProps`/`getStaticProps`.
31. `params` are provided to page rendering.
32. Server routes may receive search parameters.
33. Query parameters do not alter static pathname output.
34. Request cookies/headers are invalid during static rendering.
35. `error.*` must be a client boundary.
36. `notFound()` is intentional control flow producing 404 semantics.
37. `redirect()` is intentional control flow.
38. Metadata is resolved root-to-leaf.
39. Metadata may be static or dynamically generated.
40. API routes never pass through the React renderer.
41. Middleware executes outside the renderer.
42. Renderer output is HTTP-runtime-neutral.
43. Production error details are sanitized.
44. Client manifests must not expose server-only module references.
45. Rendering must use compiled route/build metadata in production.

---

# 167. Deferred Rendering Features

The following are deferred unless later requirements explicitly add them:

- React Server Components transport as an Ranu.js public protocol;
- server actions/functions;
- ISR;
- stale-while-revalidate framework semantics;
- automatic fetch caching;
- automatic static optimization;
- partial prerendering;
- parallel route rendering;
- intercepted/modal routes;
- advanced partial-navigation payload protocol;
- cross-request SSR response cache;
- multiple renderer implementations;
- typed serialization beyond the baseline;
- built-in image optimization;
- built-in font optimization service.

These must not block a stable V1.

---

# 168. Acceptance Criteria

The Ranu.js V1 rendering system is complete when:

1. a page renders through the React adapter;
2. nested layouts compose correctly;
3. root document output is valid;
4. server mode SSR works in development;
5. server mode SSR works in production Node runtime;
6. static mode generates HTML during build;
7. generated static pages are served without page SSR;
8. dynamic static routes generate declared parameter paths;
9. undeclared static dynamic paths return 404;
10. client mode renders in the browser;
11. SSR pages can contain hydrated client components;
12. SSG pages can contain hydrated client components;
13. `"use client"` boundaries generate browser graphs;
14. server-only imports from client code fail;
15. private environment values remain outside browser output;
16. server-to-client data serialization is safe;
17. non-serializable boundary values fail clearly;
18. route params reach page modules;
19. server search parameters reach supported page modules;
20. static routes reject request-only APIs;
21. nested error boundaries work;
22. not-found rendering produces HTTP 404;
23. redirects produce correct control outcomes;
24. metadata renders into document head;
25. static metadata resolves during build;
26. server metadata can resolve per request;
27. Ranu.js `Link` works as ordinary navigation without JS;
28. hydration activates client interactions;
29. production errors do not leak sensitive details;
30. API routes remain independent of React rendering;
31. renderer core contracts do not require Node HTTP objects;
32. production rendering uses manifests/build output rather than source scanning;
33. required rendering test matrices pass;
34. the reference application passes SSR, SSG, client, hydration, error, and metadata scenarios.

---

# 169. Required Next Specification

The next document is:

```text
05_SERVER_RUNTIME_SPEC.md
```

It must lock:

- HTTP request normalization;
- Web `Request`/`Response` behavior;
- Node adapter request bridge;
- middleware execution;
- API method dispatch;
- page method handling;
- request context;
- headers;
- cookies;
- body handling;
- redirects;
- not-found signals;
- error handling;
- streaming response behavior;
- static-file dispatch;
- runtime capabilities;
- graceful shutdown;
- production security behavior.

---

# 170. Final Rendering Baseline

Ranu.js V1 uses a renderer-neutral framework architecture with React as the official first renderer.

Page and layout modules are server-capable by default.

Interactive browser modules use the explicit:

```text
"use client"
```

boundary.

Server-only application code is protected from browser inclusion through build graph validation and explicit server-only conventions.

Every page route has one declared rendering mode:

```text
static
server
client
```

with:

```text
server
```

as the default.

Static routes render during build and never silently fall back to runtime SSR.

Dynamic static routes enumerate valid concrete paths through:

```text
generateStaticParams()
```

and ungenerated paths return 404.

Server routes render per request.

Client routes explicitly move primary route rendering into the browser.

Static and server routes may still contain interactive client components that hydrate after initial HTML delivery.

Ranu.js uses ordinary async TypeScript/JavaScript for server-side data loading rather than requiring legacy page-data lifecycle APIs.

Layouts, loading boundaries, error boundaries, and not-found boundaries are supplied by the compiled router hierarchy and executed by the React renderer.

Metadata is resolved through the layout/page hierarchy and emitted into the document head.

The renderer never owns API routing, middleware execution, deployment-provider behavior, or the Node HTTP server.

V1 intentionally avoids making React Server Components transport, server actions, ISR, automatic fetch caching, or complex partial-navigation protocols prerequisites.

This rendering model establishes a stable, understandable foundation for SSR, SSG, browser interactivity, and future renderer/runtime evolution.

---

**End of 04_RENDERING_MODEL.md**
