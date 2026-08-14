# 01_PRODUCT_REQUIREMENTS.md

**Project:** Ranu.js — JavaScript/TypeScript Full-Stack Web Framework  
**Document Type:** Product Requirements  
**Status:** Development Baseline  
**Date:** 2026-08-10  
**Depends On:** `00_FRAMEWORK_VISION.md`  
**Primary Language:** TypeScript / JavaScript  
**Initial UI Integration:** React-first  
**Target:** Production-capable V1

---

# 1. Purpose

This document defines the product requirements for Ranu.js V1.

It translates the framework vision into concrete developer-facing behavior, capabilities, constraints, acceptance requirements, and product boundaries.

This document defines **what Ranu.js must do**.

Detailed internal architecture, algorithms, package boundaries, implementation techniques, and low-level runtime design belong in later technical specifications.

All implementation work must remain consistent with both:

- `00_FRAMEWORK_VISION.md`
- `01_PRODUCT_REQUIREMENTS.md`

If an implementation choice conflicts with these documents, the conflict must be resolved before that behavior becomes part of the supported framework.

---

# 2. Product Definition

Ranu.js is a TypeScript-first, JavaScript-compatible, full-stack web framework for building production web applications.

Ranu.js V1 must provide one coherent development system for:

- application creation;
- file-based routing;
- React rendering;
- browser interactivity;
- server-side rendering;
- static generation;
- backend API routes;
- middleware;
- server-only application code;
- request and response handling;
- cookies and headers;
- environment variables;
- development tooling;
- production builds;
- Node.js execution;
- Docker-compatible packaging;
- extension hooks;
- diagnostics;
- automated framework testing.

Ranu.js V1 is React-first, but framework-core contracts must not make React a permanent architectural dependency.

---

# 3. Target Users

## 3.1 Primary Users

Ranu.js V1 primarily targets:

- JavaScript developers;
- TypeScript developers;
- React developers;
- full-stack web developers;
- frontend developers moving into backend development;
- agencies building client applications;
- SaaS developers;
- teams building dashboards and internal systems;
- developers building APIs with web frontends.

## 3.2 Secondary Users

The architecture should later support:

- framework plugin authors;
- deployment adapter authors;
- library maintainers;
- platform engineering teams;
- alternative UI adapter authors.

V1 does not need to fully optimize the experience for every secondary user, but it must avoid architectural decisions that prevent these use cases.

---

# 4. Primary Developer Journey

The minimum successful Ranu.js journey is:

```text
Install/Create
    ↓
Run Development Server
    ↓
Create Routes
    ↓
Build UI
    ↓
Add Server Logic/API
    ↓
Use Environment Configuration
    ↓
Build for Production
    ↓
Run/Deploy Production Application
```

A developer should be able to complete this flow without manually assembling a separate router, SSR server, API framework, and production build pipeline.

---

# 5. Product Principles

The V1 product must follow these requirements.

## PR-P01 — Simple Defaults

A standard application must work with minimal configuration.

## PR-P02 — Explicit Boundaries

Client code and server-only code must have clear boundaries.

## PR-P03 — Web Standards

Ranu.js should use standards-compatible Web APIs where practical.

## PR-P04 — TypeScript First

Official APIs must provide strong TypeScript support.

## PR-P05 — JavaScript Compatible

Developers must not be required to use TypeScript.

## PR-P06 — Deployment Portability

Core application behavior must not depend on a single hosting provider.

## PR-P07 — Predictable Behavior

Routing, rendering, configuration, and build behavior must be deterministic and documented.

## PR-P08 — Actionable Errors

Errors must help developers understand and correct problems.

## PR-P09 — Progressive Complexity

Simple applications must remain simple while advanced applications can access deeper capabilities.

## PR-P10 — Production Readiness

Development conveniences must map to reliable production behavior.

---

# 6. V1 Functional Scope

Ranu.js V1 must include the following product areas:

1. Project Creation
2. Project Structure
3. Configuration
4. Development Server
5. File-Based Routing
6. Layouts
7. Dynamic Routing
8. Navigation
9. React Rendering
10. Client-Side Interactivity
11. Server-Side Rendering
12. Static Site Generation
13. Hybrid Route Rendering
14. API Routes
15. Server-Only Modules
16. Middleware
17. Request/Response APIs
18. Cookies
19. Headers
20. Redirects
21. Error Handling
22. Loading Behavior
23. Environment Variables
24. Static Assets
25. Build System
26. Production Server
27. Node.js Deployment
28. Docker-Compatible Deployment
29. Plugin/Extension Hooks
30. CLI
31. Diagnostics
32. TypeScript Integration
33. JavaScript Support
34. Security Defaults
35. Testing
36. Documentation
37. Starter Examples

---

# 7. Project Creation Requirements

## PR-CREATE-01

Ranu.js must provide an official project creation command.

Target developer experience:

```bash
npm create Ranu.js@latest my-app
```

Equivalent package-manager workflows may be supported.

## PR-CREATE-02

The generated application must contain all files necessary to start development.

## PR-CREATE-03

A default application must run without requiring the developer to manually create configuration files.

## PR-CREATE-04

The project generator must support TypeScript as the default language.

## PR-CREATE-05

JavaScript project generation must be supported.

## PR-CREATE-06

The generated project must include standard package scripts.

Expected baseline:

```json
{
  "scripts": {
    "dev": "Ranu.js dev",
    "build": "Ranu.js build",
    "start": "Ranu.js start"
  }
}
```

## PR-CREATE-07

Project creation must validate invalid or conflicting project names.

## PR-CREATE-08

Project creation failures must not leave misleading partially initialized projects without clearly reporting the failure.

---

# 8. Default Project Structure

The default V1 project should follow a structure conceptually similar to:

```text
my-app/
├── app/
│   ├── layout.tsx
│   └── page.tsx
├── public/
├── ranu.config.ts
├── package.json
└── tsconfig.json
```

Additional generated files may be included when required.

## PR-STRUCT-01

`app/` must be the default application routing directory.

## PR-STRUCT-02

`public/` must be the default static public asset directory.

## PR-STRUCT-03

Developers must be allowed to create ordinary application folders outside `app/`.

Examples:

```text
components/
lib/
server/
services/
styles/
```

These folders must not acquire special framework behavior unless documented.

## PR-STRUCT-04

Ranu.js must not require developers to place all application logic inside the routing directory.

---

# 9. Configuration Requirements

## PR-CONFIG-01

Ranu.js must support a root configuration file.

Preferred TypeScript form:

```text
ranu.config.ts
```

JavaScript equivalents may include:

```text
ranu.config.js
ranu.config.mjs
```

The final supported resolution order must be documented.

## PR-CONFIG-02

Ranu.js must provide a typed configuration helper.

Example:

```ts
import { defineConfig } from "ranu";

export default defineConfig({
  // options
});
```

## PR-CONFIG-03

Invalid configuration must fail with a clear diagnostic.

## PR-CONFIG-04

Unknown or deprecated configuration keys should produce useful warnings or errors according to severity.

## PR-CONFIG-05

Ordinary projects must not require bundler-specific configuration.

## PR-CONFIG-06

Advanced build extension must be possible through documented Ranu.js hooks rather than requiring application code to depend on Ranu.js internals.

---

# 10. Development Server Requirements

## PR-DEV-01

The command:

```bash
Ranu.js dev
```

must start the development environment.

## PR-DEV-02

The development server must automatically discover application routes.

## PR-DEV-03

Changes to supported application files must update the running application without requiring a manual restart whenever technically safe.

## PR-DEV-04

React client changes should support fast refresh or equivalent state-preserving development behavior where technically possible.

## PR-DEV-05

Server-side changes must be reflected without requiring the developer to manually rebuild the application.

## PR-DEV-06

The terminal must display the local application URL.

## PR-DEV-07

The development server must provide clear startup errors.

Examples include:

- invalid configuration;
- route conflicts;
- missing dependencies;
- unsupported Node.js version;
- invalid framework usage.

## PR-DEV-08

Development diagnostics may contain detailed stack traces.

## PR-DEV-09

Development behavior must not silently differ from production in ways that materially change route semantics.

---

# 11. File-Based Routing

## PR-ROUTE-01

Ranu.js V1 must provide file-system routing under `app/`.

## PR-ROUTE-02

A root page:

```text
app/page.tsx
```

must map to:

```text
/
```

## PR-ROUTE-03

A nested page:

```text
app/about/page.tsx
```

must map to:

```text
/about
```

## PR-ROUTE-04

Route discovery must be deterministic.

## PR-ROUTE-05

Route conflicts must produce build or development errors.

## PR-ROUTE-06

Ordinary component files inside route directories must not automatically become public routes.

## PR-ROUTE-07

Route conventions must use reserved filenames documented by Ranu.js.

Initial reserved route filenames include:

```text
page
layout
route
loading
error
not-found
```

The exact supported extensions and semantics will be defined in the routing specification.

---

# 12. Dynamic Routing

## PR-DYNAMIC-01

Ranu.js must support dynamic route segments.

Example:

```text
app/products/[id]/page.tsx
```

must match routes such as:

```text
/products/123
/products/abc
```

## PR-DYNAMIC-02

Dynamic parameters must be available to route execution.

## PR-DYNAMIC-03

Catch-all routes must be supported.

Conceptual syntax:

```text
[...slug]
```

## PR-DYNAMIC-04

Optional catch-all routes should be supported in V1 if implementation complexity remains acceptable.

Conceptual syntax:

```text
[[...slug]]
```

## PR-DYNAMIC-05

Static routes must take precedence over ambiguous dynamic routes according to documented matching rules.

---

# 13. Layout Requirements

## PR-LAYOUT-01

Ranu.js must support a root layout.

Example:

```text
app/layout.tsx
```

## PR-LAYOUT-02

Nested layouts must be supported.

## PR-LAYOUT-03

Layouts must wrap descendant page content according to route hierarchy.

## PR-LAYOUT-04

Navigation between child routes should preserve eligible parent layouts where the active rendering mode permits it.

## PR-LAYOUT-05

Layout nesting behavior must be deterministic.

---

# 14. Route Groups

## PR-GROUP-01

Ranu.js should support route organization groups that do not change the public URL.

A conceptual syntax may use:

```text
(marketing)
(app)
(admin)
```

## PR-GROUP-02

Route groups must not create URL path segments.

## PR-GROUP-03

Route groups must not allow two source routes to silently resolve to the same public URL.

Conflicts must be reported.

---

# 15. Navigation Requirements

## PR-NAV-01

Ranu.js React integration must provide a framework-aware navigation component or API.

Example conceptual API:

```tsx
import { Link } from "Ranu.js/react";
```

## PR-NAV-02

Internal navigation should avoid unnecessary full-document reloads when client-side navigation is available.

## PR-NAV-03

Standard anchor navigation must remain valid.

## PR-NAV-04

Navigation must preserve expected browser behavior including:

- back;
- forward;
- open in new tab;
- modifier-key navigation;
- external links.

## PR-NAV-05

Programmatic navigation must be available.

The final API belongs in the React/routing specifications.

---

# 16. React Rendering Requirements

## PR-REACT-01

React is the official V1 UI renderer.

## PR-REACT-02

Ranu.js must support standard React components.

## PR-REACT-03

Ranu.js must not require application developers to import framework internals to render ordinary React components.

## PR-REACT-04

React-specific APIs must live outside framework-core contracts.

## PR-REACT-05

The framework must maintain an architecture where a future alternative UI adapter is technically possible without replacing the router and server-runtime foundations.

---

# 17. Client-Side Interactivity

## PR-CLIENT-01

Ranu.js must support interactive browser components.

## PR-CLIENT-02

The framework must provide a clear mechanism to distinguish code that requires browser execution from code that is server-only.

## PR-CLIENT-03

Browser bundles must not include server-only dependencies.

## PR-CLIENT-04

Client components must be able to use standard React browser features such as state and effects.

## PR-CLIENT-05

The exact client-boundary convention must be explicitly defined before implementation is considered stable.

Ranu.js must not accidentally inherit another framework's semantics merely because a similar syntax is familiar.

---

# 18. Server-Side Rendering

## PR-SSR-01

Ranu.js V1 must support server-side rendering.

## PR-SSR-02

An SSR route must be renderable from an incoming HTTP request.

## PR-SSR-03

The server-rendered document must be capable of becoming interactive in the browser when the route contains client-side functionality.

## PR-SSR-04

SSR must support route parameters.

## PR-SSR-05

SSR must support request-derived data where the route is configured for dynamic execution.

## PR-SSR-06

SSR errors must flow through the Ranu.js error-handling model.

## PR-SSR-07

SSR output must not expose server-only secrets.

---

# 19. Static Site Generation

## PR-SSG-01

Ranu.js V1 must support static generation during production builds.

## PR-SSG-02

Eligible routes must be renderable into static HTML and associated assets.

## PR-SSG-03

Static output must not require a server merely to serve already generated content unless the application otherwise requires server functionality.

## PR-SSG-04

Dynamic routes intended for static generation must provide the framework with the parameter set required for build-time generation.

The final API will be defined in the rendering specification.

## PR-SSG-05

Build-time rendering errors must identify the affected route.

---

# 20. Hybrid Rendering

## PR-HYBRID-01

One Ranu.js application must be able to contain both static and dynamic routes.

Example:

```text
/                 → static
/about            → static
/dashboard        → server-rendered
/api/users        → server endpoint
```

## PR-HYBRID-02

A developer must not need separate applications for SSR and SSG.

## PR-HYBRID-03

Route rendering mode must be inspectable.

## PR-HYBRID-04

The framework must not silently convert a route between static and dynamic behavior without providing understandable rules or diagnostics.

---

# 21. Streaming

## PR-STREAM-01

The architecture must support streamed server responses.

## PR-STREAM-02

Streaming SSR should be included in V1 if stable implementation is achieved without compromising the core release.

## PR-STREAM-03

The server runtime must not be designed in a way that prevents future streaming support.

---

# 22. Loading States

## PR-LOAD-01

Ranu.js should support route-level loading UI.

Conceptual convention:

```text
loading.tsx
```

## PR-LOAD-02

Loading behavior must integrate with supported asynchronous rendering/navigation behavior.

## PR-LOAD-03

Loading UI must not replace proper error handling.

---

# 23. Not-Found Handling

## PR-404-01

Ranu.js must support application-level not-found behavior.

Conceptual convention:

```text
not-found.tsx
```

## PR-404-02

Unmatched routes must return an appropriate HTTP status.

## PR-404-03

Applications must be able to render a custom not-found page.

## PR-404-04

Programmatic route logic should be able to signal a not-found result through a documented framework API.

---

# 24. API Routes

## PR-API-01

Ranu.js must support backend HTTP endpoints inside the application.

Example:

```text
app/api/users/route.ts
```

## PR-API-02

API routes must support standard HTTP methods as applicable:

- GET;
- POST;
- PUT;
- PATCH;
- DELETE;
- OPTIONS;
- HEAD.

## PR-API-03

A simple route should be expressible using Web-standard request/response concepts.

Conceptual example:

```ts
export async function GET() {
  return Response.json({
    message: "Hello from Ranu.js"
  });
}
```

## PR-API-04

Handlers must be able to receive a standard-compatible `Request`.

## PR-API-05

Handlers must be able to return a standard-compatible `Response`.

## PR-API-06

Dynamic API routes must receive route parameters.

## PR-API-07

Unsupported methods must produce correct HTTP behavior.

## PR-API-08

Unhandled API exceptions must not leak sensitive production information.

---

# 25. Server-Only Modules

## PR-SERVER-01

Ranu.js must provide a reliable server-only code boundary.

Server-only code may include:

- database clients;
- private API credentials;
- filesystem access on compatible runtimes;
- privileged service SDKs;
- authentication secrets.

## PR-SERVER-02

If server-only code becomes reachable from a browser bundle, Ranu.js must fail or produce a strong diagnostic rather than silently bundling the code.

## PR-SERVER-03

Server-only modules must be usable by:

- API routes;
- middleware where runtime-compatible;
- server-rendered routes;
- other server-side framework execution.

## PR-SERVER-04

The mechanism must be documented and testable.

---

# 26. Middleware

## PR-MW-01

Ranu.js V1 must support middleware.

## PR-MW-02

Middleware must be able to inspect incoming requests.

## PR-MW-03

Middleware must be able to:

- continue processing;
- modify supported request context;
- modify response headers;
- redirect;
- return a response early.

## PR-MW-04

Middleware matching must be configurable.

## PR-MW-05

Middleware execution order must be deterministic.

## PR-MW-06

Middleware errors must be observable.

## PR-MW-07

Middleware APIs must not assume one deployment provider.

---

# 27. Request API

## PR-REQ-01

Ranu.js server handlers should use standards-compatible `Request` semantics.

## PR-REQ-02

Application code must be able to access:

- method;
- URL;
- headers;
- body;
- query parameters;
- route parameters through Ranu.js route context;
- cookies through Ranu.js or standard-compatible utilities.

## PR-REQ-03

Request bodies must not be unexpectedly consumed by framework internals in a way that prevents documented handler usage.

---

# 28. Response API

## PR-RESP-01

Application handlers should be able to return standard-compatible `Response` objects.

## PR-RESP-02

Ranu.js may provide convenience helpers.

Potential helpers may include:

```ts
json()
redirect()
notFound()
```

## PR-RESP-03

Convenience helpers must map to understandable HTTP behavior.

## PR-RESP-04

Applications must retain access to low-level response control when required.

---

# 29. Cookies

## PR-COOKIE-01

Ranu.js must provide server-side cookie reading.

## PR-COOKIE-02

Supported server contexts must be able to set cookies.

## PR-COOKIE-03

Cookie APIs must support security attributes such as:

- `httpOnly`;
- `secure`;
- `sameSite`;
- `path`;
- `domain`;
- `maxAge`;
- `expires`.

## PR-COOKIE-04

Framework helpers should encourage secure defaults without preventing intentional configuration.

---

# 30. Headers

## PR-HEADER-01

Server handlers must be able to read request headers.

## PR-HEADER-02

Server responses must be able to set response headers.

## PR-HEADER-03

Multiple header values must be handled correctly according to HTTP semantics.

## PR-HEADER-04

Ranu.js must not silently overwrite application headers except where required for correct framework behavior.

---

# 31. Redirects

## PR-REDIRECT-01

Ranu.js must support redirects from server-side route execution.

## PR-REDIRECT-02

Middleware must support redirects.

## PR-REDIRECT-03

Configuration-level redirects may be supported if included in the architecture specification.

## PR-REDIRECT-04

Temporary and permanent redirect behavior must be distinguishable.

---

# 32. Error Handling

## PR-ERROR-01

Ranu.js must provide route-aware error handling.

Conceptual convention:

```text
error.tsx
```

## PR-ERROR-02

Development errors must provide useful diagnostic information.

## PR-ERROR-03

Production errors must avoid exposing:

- secrets;
- private environment variables;
- sensitive headers;
- internal filesystem information where avoidable;
- unnecessary stack traces to end users.

## PR-ERROR-04

API errors and page-rendering errors must be handled according to their execution context.

## PR-ERROR-05

Framework-originated errors should use stable error identifiers or codes where this improves troubleshooting.

## PR-ERROR-06

Build errors must identify relevant files and routes whenever possible.

---

# 33. Environment Variables

## PR-ENV-01

Ranu.js must support environment variables.

## PR-ENV-02

Server-side environment variables must remain private by default.

## PR-ENV-03

Variables intended for browser exposure must require an explicit public convention.

The exact prefix or mechanism will be defined before implementation.

## PR-ENV-04

Private environment variables must not be automatically included in client bundles.

## PR-ENV-05

Environment loading behavior must be documented across:

- development;
- build;
- production runtime;
- test environments where supported.

## PR-ENV-06

Missing required environment values should be easy for applications to validate.

---

# 34. Static Assets

## PR-ASSET-01

Files in `public/` must be servable as public static assets.

## PR-ASSET-02

Public asset URLs must be predictable.

## PR-ASSET-03

The framework build must handle imported frontend assets through the selected build pipeline.

## PR-ASSET-04

Asset fingerprinting or hashing should be supported for generated production assets.

## PR-ASSET-05

Ranu.js must distinguish public source assets from generated build assets.

---

# 35. Styling

## PR-STYLE-01

Ranu.js must support standard CSS imports appropriate to the build system.

## PR-STYLE-02

Ranu.js must not require a proprietary styling system.

## PR-STYLE-03

The architecture should permit integrations with common styling approaches.

Examples include:

- CSS;
- CSS Modules;
- PostCSS-based tooling;
- utility CSS frameworks;
- CSS-in-JS libraries where compatible.

## PR-STYLE-04

Specific third-party styling frameworks must not become core runtime dependencies.

---

# 36. TypeScript Requirements

## PR-TS-01

TypeScript must work without complex manual setup in generated Ranu.js projects.

## PR-TS-02

Ranu.js public APIs must ship TypeScript declarations.

## PR-TS-03

Route context and configuration should provide useful inferred types where practical.

## PR-TS-04

Ranu.js must not require developers to disable important TypeScript safety settings merely to use the framework.

## PR-TS-05

Framework-generated types, if used, must be reproducible and documented.

---

# 37. JavaScript Requirements

## PR-JS-01

JavaScript applications must be supported.

## PR-JS-02

JavaScript users must not need to add TypeScript files merely to configure basic Ranu.js behavior.

## PR-JS-03

JavaScript projects should still benefit from editor type information where JSDoc/declaration support makes this practical.

---

# 38. Module System

## PR-MODULE-01

Ranu.js V1 should use ESM as the primary module model.

## PR-MODULE-02

Node.js runtime compatibility requirements must be explicitly documented.

## PR-MODULE-03

CommonJS interoperability may be supported where practical but must not compromise the primary architecture.

## PR-MODULE-04

Framework packages must expose stable package entry points rather than requiring imports from internal build paths.

---

# 39. Path Aliases

## PR-ALIAS-01

Generated TypeScript projects should support a convenient application-root alias.

Conceptual example:

```ts
import { db } from "@/server/db";
```

## PR-ALIAS-02

Alias behavior must work consistently in:

- development;
- type checking;
- production builds;
- server execution;
- tests where Ranu.js provides test integration.

---

# 40. Build Requirements

## PR-BUILD-01

The command:

```bash
Ranu.js build
```

must create a production build.

## PR-BUILD-02

The build must analyze application routes.

## PR-BUILD-03

The build must separate server and browser dependency graphs.

## PR-BUILD-04

The build must produce route/build manifests required by the Ranu.js runtime.

## PR-BUILD-05

The build must perform code splitting where appropriate.

## PR-BUILD-06

The build must support tree shaking through the underlying build toolchain.

## PR-BUILD-07

Static routes must be generated during the build.

## PR-BUILD-08

Build failures must return a non-zero process exit code.

## PR-BUILD-09

Successful builds must provide a concise summary.

## PR-BUILD-10

The build must not require access to a specific hosting provider.

## PR-BUILD-11

The framework must own the public build contract even when Vite is used internally.

---

# 41. Build Output

## PR-OUTPUT-01

Ranu.js must use a framework-owned build output directory.

The final name will be fixed in the architecture specification.

A conceptual structure is:

```text
.ranu/
├── client/
├── server/
├── assets/
├── manifests/
└── metadata.json
```

## PR-OUTPUT-02

The output structure must distinguish:

- browser assets;
- server code;
- manifests;
- deployment metadata.

## PR-OUTPUT-03

Application developers must not be expected to manually edit generated output.

## PR-OUTPUT-04

Build output must be suitable for consumption by deployment adapters.

## PR-OUTPUT-05

Production output must be deterministic for identical inputs to the extent reasonably possible.

---

# 42. Production Server

## PR-START-01

The command:

```bash
Ranu.js start
```

must run a production build on the default supported server runtime.

## PR-START-02

`Ranu.js start` must not silently perform a development build.

## PR-START-03

Starting without a valid production build must produce a clear error.

## PR-START-04

The production server must support configurable host and port values.

## PR-START-05

The production server must handle graceful shutdown where the runtime permits it.

---

# 43. Node.js Deployment

## PR-NODE-01

Node.js is the required first-party V1 production runtime.

## PR-NODE-02

An Ranu.js application must be deployable to a standard Node.js environment without a proprietary cloud service.

## PR-NODE-03

The supported Node.js version range must be explicitly defined and tested.

## PR-NODE-04

The Node adapter/runtime must support Ranu.js:

- pages;
- SSR;
- APIs;
- middleware;
- static assets;
- cookies;
- headers;
- redirects.

## PR-NODE-05

Node-specific application capabilities must not be falsely advertised as portable to non-Node runtimes.

---

# 44. Docker-Compatible Deployment

## PR-DOCKER-01

Ranu.js V1 production output must be capable of running inside a normal Docker container.

## PR-DOCKER-02

Docker support must not require application source rewrites.

## PR-DOCKER-03

Official documentation must include at least one production Docker deployment example.

## PR-DOCKER-04

A proprietary Ranu.js container service is not required.

---

# 45. Deployment Adapter Requirements

## PR-ADAPTER-01

The deployment model must support adapter-based packaging.

## PR-ADAPTER-02

Node must have an official V1 adapter/runtime.

## PR-ADAPTER-03

The architecture must permit future adapters for:

- Vercel;
- Cloudflare;
- AWS;
- other platforms.

## PR-ADAPTER-04

Vercel and Cloudflare support are roadmap targets and must not be falsely treated as completed V1 requirements unless implemented and tested.

## PR-ADAPTER-05

Deployment adapters must consume documented Ranu.js build contracts rather than private arbitrary compiler state.

---

# 46. CLI Requirements

The official CLI is a required V1 component.

Required commands:

```text
Ranu.js dev
Ranu.js build
Ranu.js start
```

Project creation must be supported through the official create package/workflow.

## PR-CLI-01

Commands must return appropriate process exit codes.

## PR-CLI-02

Commands must support CI/non-interactive environments where relevant.

## PR-CLI-03

Unknown commands and invalid arguments must produce useful help.

## PR-CLI-04

CLI output should remain readable in standard terminals.

## PR-CLI-05

The CLI must not expose internal stack traces for ordinary user input errors unless debug output is requested.

## PR-CLI-06

A future `Ranu.js inspect` command must be considered in architecture design.

## PR-CLI-07

A future `Ranu.js doctor` command must be possible without redesigning the framework.

---

# 47. Diagnostics

## PR-DIAG-01

Ranu.js must provide meaningful diagnostics for:

- invalid routes;
- route collisions;
- build failures;
- server/client boundary violations;
- configuration errors;
- missing required framework dependencies;
- unsupported runtime versions.

## PR-DIAG-02

Diagnostics should include the relevant source file where known.

## PR-DIAG-03

Diagnostics should distinguish:

- errors;
- warnings;
- informational messages.

## PR-DIAG-04

Debug mode should be available for deeper framework troubleshooting.

## PR-DIAG-05

Diagnostic output must avoid printing secret values.

---

# 48. Plugin System Requirements

## PR-PLUGIN-01

V1 must establish a documented basic extension contract.

## PR-PLUGIN-02

Plugins must not depend on arbitrary undocumented internal imports.

## PR-PLUGIN-03

Initial plugin hooks may target:

- configuration;
- build lifecycle;
- route metadata;
- development lifecycle.

The exact stable V1 hook set must be intentionally limited.

## PR-PLUGIN-04

Plugin APIs must be versionable.

## PR-PLUGIN-05

A plugin failure must identify the plugin when possible.

## PR-PLUGIN-06

Ranu.js must not attempt to create a large plugin ecosystem before core contracts are stable.

---

# 49. Vite Integration Requirements

## PR-VITE-01

Ranu.js V1 may use Vite as its underlying development/build foundation.

## PR-VITE-02

Developers must primarily interact with Ranu.js APIs rather than Vite internals.

## PR-VITE-03

Ranu.js may expose controlled Vite extension where useful.

## PR-VITE-04

Ranu.js public routing, runtime, rendering, and deployment contracts must not simply be aliases for private Vite behavior.

## PR-VITE-05

Replacing or substantially changing the internal build foundation in a future major version must remain architecturally possible.

---

# 50. Security Requirements

## PR-SEC-01

Private environment variables must not be exposed to browser bundles by default.

## PR-SEC-02

Server-only modules must be protected from accidental client inclusion.

## PR-SEC-03

Production errors must avoid exposing secrets.

## PR-SEC-04

Cookie helpers must support secure cookie attributes.

## PR-SEC-05

Framework-generated HTTP behavior must avoid insecure defaults where a safe default is practical.

## PR-SEC-06

Ranu.js documentation must distinguish framework security responsibilities from application security responsibilities.

## PR-SEC-07

The framework must not claim that using Ranu.js automatically makes an application secure.

## PR-SEC-08

Dependency vulnerabilities in framework-owned packages must be treated as release-maintenance issues.

---

# 51. Performance Requirements

## PR-PERF-01

Development startup must avoid unnecessary full-project work where possible.

## PR-PERF-02

Route-level browser code splitting must be supported.

## PR-PERF-03

Server-only dependencies must not inflate browser bundles.

## PR-PERF-04

Production browser assets should be optimized by the build pipeline.

## PR-PERF-05

Static routes should avoid unnecessary server execution.

## PR-PERF-06

Performance optimization must not make framework behavior impossible to reason about.

## PR-PERF-07

Framework overhead should be benchmarked before stable release.

Exact numerical performance budgets will be defined during architecture and development planning.

---

# 52. Accessibility

Ranu.js is a framework rather than an opinionated UI component library.

## PR-A11Y-01

Framework-generated document structure must not unnecessarily prevent accessible applications.

## PR-A11Y-02

Framework navigation utilities must preserve native browser semantics where possible.

## PR-A11Y-03

Ranu.js documentation and starter templates should demonstrate valid semantic HTML practices.

## PR-A11Y-04

The framework must not claim application-level accessibility compliance automatically.

---

# 53. Browser Support

## PR-BROWSER-01

Supported browser targets must be documented before V1 stable release.

## PR-BROWSER-02

The default target should prioritize actively supported modern browsers.

## PR-BROWSER-03

The build pipeline may transform syntax according to supported targets.

## PR-BROWSER-04

Unsupported legacy browser requirements must not unnecessarily increase default framework complexity.

---

# 54. Package Manager Support

## PR-PM-01

npm must be officially supported.

## PR-PM-02

pnpm should be officially supported.

## PR-PM-03

Yarn should be supported where ordinary Node package behavior is sufficient.

## PR-PM-04

Bun package-management workflows may be supported where compatible.

## PR-PM-05

Runtime support for Bun is separate from package-manager support and must not be implied automatically.

---

# 55. Testing Requirements for Ranu.js

## PR-TEST-01

Core routing behavior must have automated tests.

## PR-TEST-02

SSR must have automated tests.

## PR-TEST-03

SSG must have automated tests.

## PR-TEST-04

API routes must have automated tests.

## PR-TEST-05

Middleware must have automated tests.

## PR-TEST-06

Client/server boundary protection must have automated tests.

## PR-TEST-07

Production builds must be exercised through integration tests.

## PR-TEST-08

Node production execution must have end-to-end tests.

## PR-TEST-09

CLI commands must have automated tests.

## PR-TEST-10

Known framework regressions must receive regression tests.

## PR-TEST-11

Example/fixture applications should cover realistic combinations of framework capabilities.

---

# 56. Application Testing Support

Ranu.js V1 does not need to create a proprietary test runner.

## PR-APPTEST-01

Ranu.js applications must remain compatible with common JavaScript testing tools where technically possible.

## PR-APPTEST-02

Framework internals must not unnecessarily prevent component, unit, integration, or browser testing.

## PR-APPTEST-03

Official test utilities may be introduced later.

---

# 57. Documentation Requirements

Before V1 stable release, documentation must include at minimum:

- installation;
- project creation;
- project structure;
- routing;
- layouts;
- dynamic routes;
- navigation;
- rendering modes;
- API routes;
- middleware;
- server-only code;
- environment variables;
- configuration;
- static assets;
- production builds;
- Node deployment;
- Docker deployment;
- troubleshooting.

## PR-DOC-01

Every stable public API must be documented.

## PR-DOC-02

Experimental APIs must be clearly identified.

## PR-DOC-03

Documentation examples must be tested or validated where practical.

## PR-DOC-04

Documentation must distinguish current functionality from roadmap functionality.

---

# 58. Starter Examples

Ranu.js V1 must include example applications or fixtures.

Minimum examples:

## Example 1 — Hello World

Demonstrates:

- project structure;
- page;
- layout;
- styling.

## Example 2 — Routing

Demonstrates:

- nested routes;
- dynamic route;
- not-found behavior.

## Example 3 — Full-Stack App

Demonstrates:

- frontend page;
- API route;
- server-side data access pattern;
- environment variables.

## Example 4 — Hybrid Rendering

Demonstrates:

- static route;
- SSR route;
- API route.

## PR-EXAMPLE-01

Examples must use supported public APIs only.

## PR-EXAMPLE-02

Examples must not rely on hidden framework internals.

---

# 59. Framework Package Requirements

The exact package map will be fixed in `02_FRAMEWORK_ARCHITECTURE.md`.

The product requires logical separation between:

```text
Core
Router
Server Runtime
React Integration
Build Integration
CLI
Deployment Runtime/Adapters
Shared Utilities
```

## PR-PKG-01

React-specific code must not become a dependency of framework core unless an architecture review explicitly changes the vision.

## PR-PKG-02

Deployment-provider packages must remain isolated from core application behavior.

## PR-PKG-03

Internal packages must not automatically be considered stable public APIs.

---

# 60. Dependency Requirements

## PR-DEP-01

Framework dependencies must be intentional and reviewed.

## PR-DEP-02

Ranu.js should avoid unnecessary runtime dependencies.

## PR-DEP-03

Large dependencies must have a clear framework purpose.

## PR-DEP-04

Dependencies with incompatible licensing must not be introduced.

## PR-DEP-05

Framework behavior must not depend on unmaintained critical packages without a mitigation plan.

---

# 61. Licensing and Independence

## PR-LICENSE-01

Ranu.js source code and dependencies must follow a documented licensing strategy before public release.

## PR-LICENSE-02

Code from other frameworks must not be copied without compatible licensing and intentional review.

## PR-LICENSE-03

Ranu.js must maintain its own product identity, documentation, APIs, and architecture.

---

# 62. Compatibility Policy

## PR-COMPAT-01

Ranu.js does not promise source compatibility with Next.js.

## PR-COMPAT-02

Ranu.js does not promise that Next.js applications can be copied into Ranu.js unchanged.

## PR-COMPAT-03

Ranu.js may intentionally use familiar conventions when they are technically appropriate, but behavior must be defined by Ranu.js documentation.

## PR-COMPAT-04

V1 compatibility promises apply only to documented Ranu.js public APIs.

---

# 63. Versioning

## PR-VERSION-01

Ranu.js packages must follow semantic versioning once public stability guarantees begin.

## PR-VERSION-02

Experimental APIs may change more rapidly but must be marked.

## PR-VERSION-03

Breaking stable API changes require a major-version process unless a documented pre-1.0 policy applies.

## PR-VERSION-04

Release notes must identify significant:

- features;
- fixes;
- breaking changes;
- deprecations;
- security updates.

---

# 64. Deprecation

## PR-DEPRECATE-01

Stable APIs should not be removed without a deprecation path except where security or correctness makes immediate removal necessary.

## PR-DEPRECATE-02

Deprecation warnings must identify the replacement where one exists.

## PR-DEPRECATE-03

Deprecated APIs must be documented as such.

---

# 65. Observability Requirements

Ranu.js V1 must establish enough internal observability to troubleshoot framework behavior.

## PR-OBS-01

Development logs must distinguish framework startup, build, route, and runtime failures.

## PR-OBS-02

Production logging must not expose secrets.

## PR-OBS-03

The architecture must allow future tracing and metrics integration.

## PR-OBS-04

Ranu.js should eventually expose route/build inspection through official tooling.

---

# 66. Developer Inspection

A future command such as:

```bash
Ranu.js inspect
```

should be able to expose information including:

```text
Routes
Rendering Modes
Middleware
Server Entries
Client Entries
Build Target
Deployment Adapter
```

## PR-INSPECT-01

V1 architecture must preserve the metadata necessary for this capability.

The command itself may be delivered during V1 if development capacity permits.

---

# 67. Runtime Portability Rules

## PR-PORT-01

Framework-wide APIs must not claim portability where they depend on Node-only behavior.

## PR-PORT-02

Runtime-specific APIs must be identifiable.

## PR-PORT-03

Future edge adapters must be able to reject incompatible application code with useful diagnostics.

## PR-PORT-04

Core request/response contracts should remain Web-standard compatible wherever practical.

---

# 68. Caching

Advanced framework-managed caching is not a mandatory V1 feature.

However:

## PR-CACHE-01

The architecture must not prevent standard HTTP caching.

## PR-CACHE-02

Applications must be able to set appropriate cache-related response headers.

## PR-CACHE-03

Static generated content may use efficient static asset caching.

## PR-CACHE-04

A future framework caching/revalidation system must be possible without replacing routing architecture.

---

# 69. Data Fetching

Ranu.js V1 must not invent a proprietary mandatory data-fetching language.

## PR-DATA-01

Server-side application code must be able to use ordinary asynchronous JavaScript.

## PR-DATA-02

Standard `fetch()` must be usable where available.

## PR-DATA-03

Applications must be able to use database libraries from server-only code.

## PR-DATA-04

Applications must be able to use third-party SDKs where runtime-compatible.

## PR-DATA-05

Future Ranu.js data caching must not be required for basic server data access.

---

# 70. Database Integration

## PR-DB-01

Ranu.js V1 must not require a proprietary database.

## PR-DB-02

Node-target applications must be able to use normal Node-compatible database libraries.

## PR-DB-03

Ranu.js must not require a specific ORM.

## PR-DB-04

Official examples may use one database/ORM for demonstration but must not imply exclusivity.

---

# 71. Authentication Integration

Authentication is an application/integration concern in V1.

## PR-AUTH-01

Ranu.js must provide the primitives needed by common authentication systems:

- cookies;
- headers;
- middleware;
- redirects;
- server routes;
- server-only secrets.

## PR-AUTH-02

Ranu.js V1 must not require a proprietary authentication provider.

## PR-AUTH-03

Official authentication integration packages may be developed later.

---

# 72. Forms

## PR-FORM-01

Standard HTML forms must work in Ranu.js applications.

## PR-FORM-02

Forms must be able to submit to API routes or external endpoints.

## PR-FORM-03

Server-side request handlers must support form-compatible request bodies through standard request APIs.

## PR-FORM-04

Framework-native server actions are not a mandatory V1 requirement.

The architecture may reserve space for a future server-function model.

---

# 73. Real-Time Features

WebSockets and server-sent events are not required to block V1.

## PR-REALTIME-01

The Node runtime architecture should avoid preventing future WebSocket support.

## PR-REALTIME-02

Standard streaming responses must remain possible.

## PR-REALTIME-03

Deployment adapters may have different real-time capability constraints, which must be documented.

---

# 74. Background Jobs

Background jobs are outside mandatory V1 scope.

Future support may include:

- queues;
- delayed jobs;
- scheduled jobs;
- durable workflows.

## PR-JOB-01

Core route/runtime architecture must not assume that all server work happens only during an HTTP request.

This is an architectural future-proofing requirement, not a V1 user-facing job system requirement.

---

# 75. Internationalization

Built-in internationalization is not mandatory for V1.

## PR-I18N-01

Routing architecture must not prevent locale-based application routing.

## PR-I18N-02

Applications must be able to use ordinary internationalization libraries.

## PR-I18N-03

A first-party Ranu.js i18n system may be considered after core routing stabilizes.

---

# 76. Image Optimization

A proprietary image optimization service is not required for V1.

## PR-IMAGE-01

Applications must be able to use standard image assets.

## PR-IMAGE-02

The architecture may support a future framework image component and optimizer.

## PR-IMAGE-03

Ranu.js must not tie basic image rendering to a hosted Ranu.js service.

---

# 77. Metadata and Document Head

## PR-META-01

Applications must be able to define essential HTML document metadata.

This includes at minimum:

- title;
- meta description;
- viewport behavior where appropriate;
- common head elements.

## PR-META-02

Metadata must work for server-rendered and statically generated pages.

## PR-META-03

Nested metadata behavior must be defined before V1 stable release.

The exact API belongs in the rendering specification.

---

# 78. SEO Fundamentals

Ranu.js does not guarantee SEO results.

However:

## PR-SEO-01

SSR and SSG output must produce crawlable HTML when application code provides semantic content.

## PR-SEO-02

Applications must be able to define canonical/meta information.

## PR-SEO-03

Applications must be able to create:

- `robots.txt`;
- sitemap output;
- structured data.

These may initially be implemented as normal routes/static files rather than proprietary APIs.

---

# 79. Route Configuration

Individual routes must be able to express framework-relevant behavior without a large central configuration file.

Potential route-level configuration includes:

- rendering mode;
- static generation behavior;
- runtime requirements;
- metadata.

## PR-RCONFIG-01

The exact V1 route configuration API must be defined in the routing/rendering specifications.

## PR-RCONFIG-02

Route configuration must be statically analyzable where the build requires it.

---

# 80. Server/Client Boundary Requirements

This is a critical Ranu.js requirement.

## PR-BOUNDARY-01

Ranu.js must know which modules are intended for browser execution.

## PR-BOUNDARY-02

Ranu.js must know which modules are server-only.

## PR-BOUNDARY-03

Private server dependencies must not cross into client output.

## PR-BOUNDARY-04

Boundary violations must generate useful errors.

## PR-BOUNDARY-05

The boundary model must be documented independently from React terminology.

## PR-BOUNDARY-06

The model must support future UI adapters.

---

# 81. Route Manifest

## PR-MANIFEST-01

Ranu.js builds must generate a machine-readable route manifest or equivalent internal artifact.

It must provide enough information for the runtime to understand:

- route pattern;
- route type;
- source entry;
- rendering behavior;
- relevant generated output.

## PR-MANIFEST-02

Manifest format must be framework-owned.

## PR-MANIFEST-03

Deployment adapters must not rediscover application routes independently when the Ranu.js build has already produced authoritative route metadata.

---

# 82. Build Manifest

## PR-BMANIFEST-01

Production builds must generate metadata sufficient to connect server entries, browser assets, and routes.

## PR-BMANIFEST-02

Manifest details may remain internal in V1, but the format must be versionable.

## PR-BMANIFEST-03

Adapters must be able to validate incompatible manifest versions.

---

# 83. Source Maps

## PR-SOURCEMAP-01

Development must provide usable source mapping.

## PR-SOURCEMAP-02

Production source maps should be configurable.

## PR-SOURCEMAP-03

Production defaults must consider both debugging value and source disclosure risk.

---

# 84. Hot Module Replacement

## PR-HMR-01

Ranu.js must leverage fast module updates during development.

## PR-HMR-02

React changes should use Fast Refresh or equivalent supported integration.

## PR-HMR-03

Route additions and removals must update the development route graph.

## PR-HMR-04

When a full restart is required, Ranu.js must handle or clearly communicate it.

---

# 85. Framework-Owned Error Codes

## PR-ECODE-01

Frequently encountered framework failures should receive stable diagnostic codes.

Conceptual examples:

```text
RANU_ROUTE_CONFLICT
RANU_SERVER_CLIENT_BOUNDARY
RANU_INVALID_CONFIG
RANU_BUILD_FAILED
```

The exact taxonomy will be defined during implementation.

## PR-ECODE-02

Error codes must be searchable in official documentation before V1 stable release.

---

# 86. Development Environment Compatibility

## PR-DEVENV-01

Ranu.js V1 must support major desktop development environments capable of running the supported Node.js versions.

Target environments include:

- Windows;
- macOS;
- Linux.

## PR-DEVENV-02

Path handling must not assume POSIX-only filesystem semantics.

## PR-DEVENV-03

Automated tests should include cross-platform coverage where infrastructure permits.

---

# 87. CI/CD Requirements

## PR-CI-01

`Ranu.js build` must work non-interactively.

## PR-CI-02

Build errors must produce non-zero exit codes.

## PR-CI-03

The framework must not require a local graphical interface for CI builds.

## PR-CI-04

Build artifacts must be suitable for CI/CD pipelines.

## PR-CI-05

No vendor-specific CI provider is mandatory.

---

# 88. Telemetry

## PR-TELEM-01

Ranu.js V1 must not require telemetry for framework operation.

## PR-TELEM-02

If anonymous telemetry is introduced, it must have a documented purpose and privacy model.

## PR-TELEM-03

Any telemetry system must provide a clear opt-out mechanism.

## PR-TELEM-04

Secrets, source code, environment-variable values, and application data must not be collected as routine telemetry.

---

# 89. Offline Development

## PR-OFFLINE-01

After project dependencies are installed, ordinary local framework development must not require connection to an Ranu.js-hosted service.

## PR-OFFLINE-02

Framework compilation and local execution must not depend on a mandatory remote Ranu.js API.

---

# 90. Vendor Independence

## PR-VENDOR-01

No mandatory Ranu.js cloud account is required for V1.

## PR-VENDOR-02

No Vercel account is required to develop or run a standard Ranu.js Node application.

## PR-VENDOR-03

No Cloudflare account is required to develop or run a standard Ranu.js Node application.

## PR-VENDOR-04

Future commercial services must remain separable from the open framework runtime unless the product strategy is explicitly revised.

---

# 91. V1 Non-Goals

The following are explicitly outside mandatory Ranu.js V1 scope:

- custom JavaScript runtime;
- custom bundler from scratch;
- custom package manager;
- proprietary database;
- proprietary ORM;
- proprietary authentication provider;
- CMS;
- visual page builder;
- visual IDE;
- native mobile framework;
- React Native replacement;
- complete Next.js compatibility;
- React Server Components clone;
- built-in e-commerce platform;
- built-in payment system;
- mandatory cloud platform;
- advanced workflow engine;
- distributed queue platform;
- full observability SaaS;
- every possible deployment adapter;
- every possible UI framework.

These items must not delay the core V1 unless scope is explicitly revised.

---

# 92. V1 Release Gates

Ranu.js V1 must not be considered production-ready until the following gates pass.

## Gate A — Project Creation

A developer can create and start a new project.

## Gate B — Routing

Static, nested, and dynamic routes work consistently.

## Gate C — React

React pages and browser interactivity function correctly.

## Gate D — SSR

Dynamic server rendering works in production.

## Gate E — SSG

Eligible routes generate static production output.

## Gate F — API

HTTP API routes work with standard request/response behavior.

## Gate G — Boundary Safety

Server-only code cannot silently enter browser bundles.

## Gate H — Middleware

Middleware behavior is deterministic and tested.

## Gate I — Build

Production builds are reproducible and fail clearly on invalid applications.

## Gate J — Node Runtime

A built application runs correctly on the supported Node.js runtime.

## Gate K — Docker

The Node production output runs successfully inside a documented Docker setup.

## Gate L — Security Baseline

Known secret-exposure and production-error requirements pass automated validation.

## Gate M — Testing

Critical framework paths have automated integration coverage.

## Gate N — Documentation

Required V1 behavior is documented.

---

# 93. V1 Acceptance Scenario

The framework must successfully support a reference application with:

```text
/
├── Home page                     [SSG]
├── About page                    [SSG]
├── Products
│   ├── Listing                   [SSR or SSG]
│   └── /products/[id]            [Dynamic route]
├── Dashboard                     [SSR]
├── API
│   ├── /api/products             [GET/POST]
│   └── /api/products/[id]        [GET/PATCH/DELETE]
├── Middleware
├── Custom 404
├── Error boundary
├── Public assets
├── Server-only database module
└── Browser-interactive component
```

The same reference application must:

1. run through `Ranu.js dev`;
2. build through `Ranu.js build`;
3. run through `Ranu.js start`;
4. preserve private environment variables;
5. execute API routes;
6. render SSR pages;
7. serve generated static pages;
8. support dynamic routes;
9. support browser navigation;
10. run in the documented Docker deployment.

This application will act as one of the primary V1 integration acceptance fixtures.

---

# 94. Quality Requirements

## PR-QUALITY-01

Critical framework behavior must not rely solely on manual testing.

## PR-QUALITY-02

Stable APIs must have documented behavior.

## PR-QUALITY-03

Framework source must follow a consistent formatting and linting strategy.

## PR-QUALITY-04

TypeScript framework source must pass type checking.

## PR-QUALITY-05

Production releases must pass the defined automated test suite.

## PR-QUALITY-06

Known critical regressions block stable releases.

---

# 95. Product Decision Rules

When evaluating a proposed V1 feature, use the following questions:

1. Does it directly support building a complete full-stack application?
2. Does it belong in framework core or can an ecosystem package handle it?
3. Does it create unnecessary vendor lock-in?
4. Does it make server/client behavior less understandable?
5. Can it work with the framework's future UI-independent architecture?
6. Can it be tested reliably?
7. Can it be documented clearly?
8. Does it materially delay the production-capable V1?

Features that fail these tests should normally be deferred or redesigned.

---

# 96. Requirements Priority

Requirements are classified as:

### MUST

Required for V1 correctness or architectural integrity.

### SHOULD

Expected for V1 unless implementation risk threatens the core release.

### MAY

Useful but optional for V1.

The requirement wording in this document intentionally uses "must", "should", and "may" according to these priorities.

Where a conflict exists, explicit numbered requirements and release gates take precedence over illustrative examples.

---

# 97. Traceability to Framework Vision

This product requirements document preserves the major commitments from `00_FRAMEWORK_VISION.md`:

| Vision Commitment | Product Requirement Direction |
|---|---|
| TypeScript-first | TypeScript default + typed public APIs |
| JavaScript support | JS projects supported |
| Full-stack | Pages + SSR + SSG + APIs + middleware |
| React-first | Official V1 React renderer |
| Not React-locked | Core/UI separation requirement |
| Web standards | Request/Response-based server APIs |
| Portable | Node first + adapter architecture |
| No vendor lock-in | No mandatory hosted service |
| Modular | Logical package/runtime boundaries |
| Production-ready | Build, start, tests, release gates |
| Secure boundaries | Server/client isolation |
| Extensible | Basic plugin contract |
| Inspectable | Manifests and diagnostics |
| Simple DX | Create → dev → build → start |

No V1 product requirement intentionally overrides the framework vision.

---

# 98. Documents Required After This Specification

The following documents must refine this product baseline:

```text
02_FRAMEWORK_ARCHITECTURE.md
03_ROUTING_SPECIFICATION.md
04_RENDERING_MODEL.md
05_SERVER_RUNTIME_SPEC.md
06_BUILD_SYSTEM.md
07_PLUGIN_SYSTEM.md
08_DEPLOYMENT_ADAPTERS.md
09_CLI_SPECIFICATION.md
12_DEVELOPMENT_PLAN.md
```

These documents may define implementation details but must not silently change the product requirements.

Any necessary product-level change must be reflected back into this document.

---

# 99. Final Product Baseline

Ranu.js V1 is defined as a TypeScript-first, JavaScript-compatible, React-first full-stack framework with an architecture that remains capable of supporting future UI adapters.

The V1 product must provide:

```text
Project Creation
+
Development Server
+
File-Based Routing
+
Layouts
+
Dynamic Routes
+
React Rendering
+
Client Interactivity
+
SSR
+
SSG
+
Hybrid Rendering
+
API Routes
+
Server-Only Code
+
Middleware
+
Request/Response APIs
+
Cookies/Headers
+
Environment Safety
+
Production Build
+
Node Runtime
+
Docker-Compatible Deployment
+
Basic Extension Hooks
+
Diagnostics
+
Automated Testing
+
Documentation
```

The V1 product does **not** need to reproduce every capability of mature existing frameworks.

Its primary objective is to establish a coherent, independent, production-capable framework foundation with strong architectural boundaries.

Feature breadth must not take priority over correctness, security, maintainability, portability, or framework integrity.

---

# 100. Definition of Done for This Requirements Baseline

`01_PRODUCT_REQUIREMENTS.md` is ready to drive architecture when:

- every mandatory V1 product area is represented;
- the requirements remain consistent with `00_FRAMEWORK_VISION.md`;
- roadmap features are distinguished from V1 requirements;
- vendor-specific capabilities are not treated as framework-core requirements;
- React is the V1 renderer without becoming a core architectural dependency;
- SSR, SSG, API, middleware, build, Node runtime, and Docker deployment are explicitly required;
- server/client security boundaries are explicit;
- release gates and a reference acceptance application are defined;
- later architecture documents can trace implementation decisions back to these requirements.

---

**End of 01_PRODUCT_REQUIREMENTS.md**
