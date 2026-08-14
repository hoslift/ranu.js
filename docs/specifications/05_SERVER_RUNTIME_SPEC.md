# 05_SERVER_RUNTIME_SPEC.md

**Project:** Ranu.js — JavaScript/TypeScript Full-Stack Web Framework  
**Document Type:** Server Runtime Specification  
**Status:** Development Baseline  
**Date:** 2026-08-10  
**Depends On:** `00_FRAMEWORK_VISION.md`, `01_PRODUCT_REQUIREMENTS.md`, `02_FRAMEWORK_ARCHITECTURE.md`, `03_ROUTING_SPECIFICATION.md`, `04_RENDERING_MODEL.md`  
**Primary V1 Runtime:** Node.js  
**Primary HTTP Contract:** Web-standard `Request` / `Response`

---

# 1. Purpose

This document defines the Ranu.js V1 server runtime.

It specifies:

- the HTTP execution pipeline;
- runtime/adapter separation;
- Node.js runtime behavior;
- Web `Request` and `Response` contracts;
- request normalization;
- route dispatch;
- middleware;
- page request handling;
- API route method dispatch;
- headers;
- cookies;
- request bodies;
- redirects;
- not-found control flow;
- errors;
- streaming;
- static output serving;
- public files;
- request context;
- abort/cancellation;
- runtime configuration;
- graceful shutdown;
- development/runtime diagnostics;
- production safety requirements.

The server runtime is responsible for HTTP execution.

It does not define filesystem routing, React component semantics, or bundling.

---

# 2. Runtime Objective

Ranu.js must provide a predictable full-stack HTTP runtime without coupling application code to a specific hosting provider or Node HTTP API.

The V1 relationship is:

```text
Incoming HTTP Request
        ↓
Runtime Adapter
        ↓
Web Request
        ↓
Ranu.js Server Runtime
        ↓
Normalization
        ↓
Middleware
        ↓
Route Matching
        ↓
Page / API / Static Dispatch
        ↓
Web Response
        ↓
Runtime Adapter
        ↓
HTTP Response
```

---

# 3. Runtime Principles

## SRV-P01 — Web Standards First

Application-facing request/response APIs use Web-standard interfaces wherever practical.

## SRV-P02 — Adapter Isolation

Node.js-specific transport code remains outside framework HTTP semantics.

## SRV-P03 — One Request Pipeline

Development and production must share the same semantic request pipeline.

## SRV-P04 — Deterministic Dispatch

The same normalized request and route manifest must produce the same route-selection behavior.

## SRV-P05 — Explicit Control Flow

Redirects and not-found outcomes must be distinguishable from unexpected exceptions.

## SRV-P06 — Safe Defaults

Production must not expose stack traces, filesystem paths, secrets, or internal runtime details by default.

## SRV-P07 — Streaming Capable

The runtime contract must support streaming bodies even if a specific adapter buffers them.

## SRV-P08 — Abort Aware

Client disconnects and request abort signals should propagate where technically possible.

## SRV-P09 — Provider Neutrality

Core server behavior must not depend on Vercel, Cloudflare, Netlify, AWS, or another provider SDK.

## SRV-P10 — Inspectability

Runtime failures and dispatch decisions must be diagnosable without changing application semantics.

---

# 4. Runtime Packages

Recommended architecture:

```text
@ranu/runtime
@ranu/runtime-node
@ranu/server
```

Responsibilities:

```text
@ranu/runtime
  provider-neutral request pipeline and contracts

@ranu/runtime-node
  Node.js HTTP adapter and Node runtime integration

@ranu/server
  application-facing server helpers
```

Exact package names may be finalized during implementation, but responsibilities must remain separated.

---

# 5. Core Runtime Contract

Conceptual:

```ts
interface RanuServerRuntime {
  handle(request: Request): Promise<Response>;
}
```

The core runtime accepts a Web `Request` and returns a Web `Response`.

Runtime adapters bridge platform-specific transport objects into this contract.

---

# 6. Runtime Dependencies

The core runtime may depend on:

- compiled route metadata;
- server manifest;
- static manifest;
- renderer contract;
- middleware manifest/config;
- runtime configuration.

It must not require:

- source filesystem route scanning;
- React route discovery;
- deployment-provider SDKs;
- browser APIs.

---

# 7. Node.js V1 Runtime

Node.js is the required production server runtime for Ranu.js V1.

The initial supported line should be an actively supported Node.js LTS version selected at implementation/release time.

The framework must define the supported Node version in:

```text
package.json engines
documentation
CI
```

The specification intentionally does not hard-code a stale future Node version.

---

# 8. Node Adapter

The Node adapter receives:

```text
http.IncomingMessage
http.ServerResponse
```

and converts them to/from:

```text
Request
Response
```

Conceptually:

```text
Node IncomingMessage
        ↓
toWebRequest()
        ↓
Ranu.js Runtime
        ↓
Web Response
        ↓
writeNodeResponse()
        ↓
Node ServerResponse
```

Application route handlers must not need to interact with Node transport objects.

---

# 9. Runtime Adapter Interface

Conceptual:

```ts
interface RuntimeAdapter {
  createRequest(nativeRequest: unknown): Request;

  sendResponse(
    nativeResponse: unknown,
    response: Response
  ): Promise<void>;
}
```

An adapter may additionally expose:

- runtime capabilities;
- connection information;
- shutdown hooks;
- streaming support.

---

# 10. Request URL Construction

A valid absolute URL must be constructed before creating the Web `Request`.

The Node adapter may derive:

```text
protocol
host
pathname
query string
```

from trusted server configuration and incoming request headers.

Ranu.js must not blindly trust arbitrary forwarded headers.

---

# 11. Proxy Trust

V1 must support explicit proxy trust configuration.

Conceptual:

```ts
server: {
  trustProxy: false
}
```

or a documented trusted proxy mode.

When proxy trust is disabled, headers such as:

```text
X-Forwarded-Proto
X-Forwarded-Host
X-Forwarded-For
```

must not automatically override direct connection information.

---

# 12. Request Normalization

Before route matching, Ranu.js normalizes the request into an internal request context.

Normalization includes:

- HTTP method normalization;
- URL parsing;
- pathname normalization;
- host validation where applicable;
- query preservation;
- request ID creation;
- abort signal association;
- request metadata initialization.

Normalization must not mutate application-visible request semantics unexpectedly.

---

# 13. HTTP Method Normalization

Methods are treated case-insensitively at transport input and normalized to uppercase.

Examples:

```text
get  → GET
post → POST
Patch → PATCH
```

Unknown extension methods may remain usable by generic runtime logic where Web `Request` permits them.

API route export dispatch supports the defined V1 method set.

---

# 14. V1 API Methods

Ranu.js V1 route handlers may export:

```text
GET
HEAD
POST
PUT
PATCH
DELETE
OPTIONS
```

Example:

```ts
export async function GET(request: Request) {
  return Response.json({ ok: true });
}
```

---

# 15. Route Handler Signature

Conceptual API handler signature:

```ts
type RanuRouteHandler = (
  request: Request,
  context: RouteHandlerContext
) => Response | Promise<Response>;
```

Context:

```ts
interface RouteHandlerContext {
  params: Record<string, string | string[]>;
}
```

Additional stable context may be added before V1 release, but provider-specific objects must not be part of the standard signature.

---

# 16. API Handler Return Value

A route handler must return:

```text
Response
```

or a promise resolving to `Response`.

Returning unsupported values is a runtime/development error.

Invalid example:

```ts
export function GET() {
  return { ok: true };
}
```

Valid:

```ts
export function GET() {
  return Response.json({ ok: true });
}
```

---

# 17. API Method Dispatch

For:

```text
app/api/users/route.ts
```

and:

```text
POST /api/users
```

runtime flow is:

```text
match /api/users
→ endpoint kind = api
→ load route module
→ select POST export
→ execute handler
→ validate Response
→ send response
```

---

# 18. Missing API Method

If an API route matches the pathname but does not export the requested method, Ranu.js returns:

```text
405 Method Not Allowed
```

The response must include an appropriate:

```text
Allow
```

header listing supported methods.

---

# 19. Automatic HEAD

If an API route exports:

```text
GET
```

but not:

```text
HEAD
```

Ranu.js V1 automatically supports `HEAD` using GET-compatible response metadata while suppressing the response body.

If an explicit `HEAD` export exists, it takes precedence.

---

# 20. Automatic OPTIONS

If an API route does not export `OPTIONS`, Ranu.js V1 may generate a basic `OPTIONS` response using the known method set for that route.

The generated response must include:

```text
Allow
```

This automatic behavior does not implement application-specific CORS policy.

---

# 21. CORS

Ranu.js V1 does not globally enable permissive CORS.

Applications explicitly configure CORS through:

- middleware;
- route response headers;
- future Ranu.js helpers.

Default same-origin web security behavior is preserved.

---

# 22. Page Route Methods

Page routes support:

```text
GET
HEAD
```

by default.

Other methods sent directly to a page endpoint return:

```text
405 Method Not Allowed
```

unless a separate API/route-handler endpoint is used.

Because `page.*` and `route.*` cannot own the same effective URL, mutation endpoints should use dedicated `route.*` paths.

---

# 23. Page GET

For a matched page route:

```text
GET /products/42
```

runtime flow is:

```text
normalize request
→ middleware
→ route match
→ endpoint kind = page
→ determine render/static behavior
→ renderer/static dispatcher
→ Web Response
```

---

# 24. Page HEAD

For `HEAD` on a page route, Ranu.js returns the same response metadata that a corresponding GET would produce where practical, but no body.

For static output, headers may be determined without executing full page rendering.

For SSR output, implementation may need to perform sufficient rendering to determine headers/status.

The response body must not be sent.

---

# 25. Request Pipeline

The authoritative V1 conceptual pipeline is:

```text
1. Native adapter receives request
2. Create Web Request
3. Validate/normalize URL and method
4. Create Ranu.js request context
5. Run global middleware
6. Apply middleware rewrites if supported
7. Match compiled route/static/public target
8. Run route-aware middleware phase if configured
9. Dispatch endpoint
10. Handle redirect/not-found control results
11. Handle unexpected errors
12. Finalize response headers/cookies
13. Apply HEAD body suppression
14. Send through adapter
15. Complete request logging/cleanup
```

No subsystem should invent a competing request pipeline.

---

# 26. Request Context

Ranu.js maintains an internal request-scoped context.

Conceptual:

```ts
interface RanuRequestContext {
  requestId: string;
  request: Request;
  url: URL;
  params?: Record<string, string | string[]>;
  routeId?: string;
  routeKind?: "page" | "api";
  locals: Map<string, unknown>;
  signal: AbortSignal;
}
```

The exact implementation may use async-local context.

---

# 27. Request ID

Every request receives a request ID.

If an upstream request ID is accepted, it must be validated and bounded.

Otherwise Ranu.js generates one.

The ID is useful for:

- logs;
- production error correlation;
- debugging;
- observability.

It must not encode secrets.

---

# 28. Async Request Context

Node runtime may use:

```text
AsyncLocalStorage
```

to preserve request context across asynchronous server execution.

Application-facing helpers such as cookies/headers may use this context.

The core public semantics must not expose AsyncLocalStorage itself.

---

# 29. Server Helpers

Recommended application-facing module:

```ts
import {
  headers,
  cookies,
  redirect,
  notFound
} from "Ranu.js/server";
```

These helpers operate against the current Ranu.js request/render context.

Calling request-only helpers outside a valid request context must fail clearly.

---

# 30. Headers Helper

Conceptual:

```ts
const requestHeaders = headers();
```

It exposes request headers through Web `Headers`-compatible semantics.

Request header mutation through this helper is not required.

Response headers should be set on returned `Response` objects or documented response APIs.

---

# 31. Cookies Helper

Conceptual request API:

```ts
const cookieStore = cookies();

const session = cookieStore.get("session");
```

For server/API execution, the helper may also support response cookie mutations through a controlled response-cookie store.

The exact stable API should remain small.

---

# 32. Cookie Parsing

Ranu.js must parse the `Cookie` request header according to safe HTTP cookie semantics.

Malformed cookie pairs must not crash request processing.

Duplicate cookie-name behavior must be deterministic and documented.

---

# 33. Set-Cookie Handling

`Set-Cookie` headers must be preserved as separate cookie header values where required by HTTP semantics.

The runtime must not incorrectly combine multiple `Set-Cookie` values into a comma-joined single semantic cookie value.

---

# 34. Cookie Mutation

Recommended conceptual API:

```ts
const store = cookies();

store.set("session", value, {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/"
});
```

Mutations are accumulated into the outgoing response.

Application code remains responsible for selecting security attributes appropriate to its use case.

---

# 35. Cookie Deletion

Conceptual:

```ts
cookies().delete("session");
```

Deletion emits an expired cookie with compatible path/domain semantics.

If a cookie was originally set on a custom path/domain, application code may need to supply matching deletion options.

---

# 36. Cookie Safety Defaults

Ranu.js should encourage:

```text
HttpOnly
Secure in HTTPS production
SameSite
explicit Path
```

but must not invent cookie security attributes that would silently break legitimate application requirements.

Security-oriented helpers may provide recommended defaults.

---

# 37. Request Body

API route handlers receive the Web `Request`.

Applications use standard methods such as:

```ts
await request.json()
await request.text()
await request.formData()
await request.arrayBuffer()
```

Ranu.js does not create a separate proprietary body API.

---

# 38. Body Streaming

The Node adapter must support request-body streaming into the Web `Request` where supported by the Node/Web bridge.

It must not unnecessarily buffer all request bodies before route execution.

---

# 39. Body Size Limits

Ranu.js V1 must support configurable request-body limits.

Conceptual:

```ts
server: {
  bodyLimit: "1mb"
}
```

or numeric bytes.

The default must be documented.

Oversized bodies produce:

```text
413 Payload Too Large
```

rather than uncontrolled memory consumption.

---

# 40. Body Limit Scope

The body limit applies to request ingestion.

Applications needing large uploads should be able to configure a larger limit or use streaming/storage-specific approaches.

The runtime must not force large file uploads through full in-memory buffering.

---

# 41. Invalid JSON

`request.json()` follows Web-style parsing behavior and may throw on invalid JSON.

Application code may catch this.

Ranu.js should not automatically reinterpret invalid JSON as an empty object.

---

# 42. Content Type

Ranu.js does not assume every POST body is JSON.

Body parsing is driven by application code and Web Request APIs.

This permits:

```text
JSON
form data
multipart
text
binary
streams
```

---

# 43. URL Query

The request's:

```ts
new URL(request.url).searchParams
```

is authoritative for query parameters.

Ranu.js must not create a second query parser with conflicting semantics.

---

# 44. Route Params

Path parameters come from the compiled router match.

Example:

```ts
context.params.id
```

They are already safely URL-decoded according to routing rules.

Route params and query params remain separate.

---

# 45. Middleware

Ranu.js V1 supports middleware as server-runtime request interception.

Middleware is not a route endpoint and does not render React.

Its purpose includes:

- authentication gates;
- redirects;
- headers;
- request context;
- logging;
- simple rewrites where supported.

---

# 46. Middleware File

V1 uses a project-level middleware module:

```text
middleware.ts
```

at the project root.

Alternative supported extensions follow the framework source-extension policy.

Only one root middleware module is active in V1.

---

# 47. Middleware Signature

Conceptual:

```ts
export default async function middleware(
  request: Request,
  context: MiddlewareContext
): Promise<Response | MiddlewareNext | void> {
  ...
}
```

Ranu.js should provide a simple continuation helper.

Example:

```ts
import { next } from "Ranu.js/server";

export default function middleware(request) {
  return next();
}
```

---

# 48. Middleware Next Result

`next()` is an Ranu.js internal control result meaning:

```text
continue request processing
```

It is not sent directly to the browser.

Middleware may optionally attach:

- response headers;
- request locals;
- rewrite metadata where supported.

---

# 49. Middleware Direct Response

Middleware may return a normal Web `Response`.

Example:

```ts
return new Response("Unauthorized", {
  status: 401
});
```

When middleware returns a response, route dispatch stops.

---

# 50. Middleware Redirect

Middleware may use:

```ts
redirect("/login");
```

or return a standard redirect `Response`.

The runtime sends the redirect without executing the target page in the same request unless rewrite semantics are explicitly used.

---

# 51. Middleware Matching Configuration

Middleware may export path matching configuration.

Conceptual:

```ts
export const config = {
  matcher: ["/dashboard/:path*"]
};
```

The exact matcher syntax should reuse Ranu.js path-pattern infrastructure rather than inventing an unrelated parser.

If no matcher is specified, middleware applies to all application requests except framework-internal assets where documented.

---

# 52. Middleware Internal Assets

By default, middleware should not intercept Ranu.js internal asset requests under:

```text
/_ranu/
```

unless explicitly supported/configured.

This prevents authentication middleware from accidentally breaking framework runtime assets.

---

# 53. Middleware Public Files

Default middleware behavior for `public/` files must be documented.

V1 recommended rule:

```text
public static files bypass application middleware by default
```

Application routes remain middleware-aware.

A future config may allow middleware on public files.

---

# 54. Middleware Execution Environment

V1 middleware executes in the same Node.js runtime as the application server.

Ranu.js V1 does not require a separate Edge middleware runtime.

This avoids two incompatible server API environments in the initial release.

---

# 55. Middleware Server Access

Because V1 middleware is Node runtime code, it may use server-side application dependencies.

However, middleware should remain efficient because it may execute on many requests.

Provider portability remains an application consideration if Node-specific APIs are used.

---

# 56. Middleware Errors

Unexpected middleware errors enter the runtime error pipeline.

They do not pass through React route error boundaries because route rendering may not have begun.

Development shows detailed diagnostics.

Production returns a safe server error response.

---

# 57. Middleware Locals

Middleware may attach request-scoped values to Ranu.js context.

Conceptual:

```ts
context.locals.set("user", user);
```

Downstream server code may read them through a documented helper/context API.

Locals:

- are request-scoped;
- are not automatically serialized to the browser;
- must not leak across requests.

---

# 58. Rewrite

Ranu.js V1 may support an internal rewrite helper:

```ts
rewrite("/internal/path");
```

A rewrite changes the pathname used for route matching while preserving the browser-visible URL.

Rewrites must be bounded to prevent loops.

---

# 59. Rewrite Loop Protection

The runtime must track rewrite depth.

A configurable or fixed safe maximum prevents:

```text
/a → /b → /a → /b ...
```

from creating infinite request processing.

Exceeded rewrite depth returns a controlled server error and diagnostic.

---

# 60. Rewrite Query Behavior

A rewrite target may contain query parameters.

The runtime must define deterministic merge/replace semantics.

V1 recommended behavior:

```text
target query replaces keys explicitly present in target;
original query keys not replaced remain available
```

This behavior must be covered by tests if rewrites ship in V1.

---

# 61. Redirect Helper

Conceptual:

```ts
redirect("/login");
```

Default status for ordinary navigation redirect:

```text
307 Temporary Redirect
```

A permanent redirect helper or option may use:

```text
308 Permanent Redirect
```

This preserves HTTP methods more predictably than legacy 301/302 behavior.

---

# 62. External Redirects

Redirect targets may be external URLs where application code explicitly supplies them.

Applications must validate untrusted redirect destinations to prevent open-redirect vulnerabilities.

Ranu.js must not automatically trust user-provided redirect query values.

---

# 63. Not-Found Helper

Conceptual:

```ts
notFound();
```

This raises an Ranu.js internal control signal.

For page rendering:

```text
status = 404
selected not-found UI rendered
```

For API code, applications should normally return their own 404 `Response`; however, `notFound()` may be supported consistently if useful.

---

# 64. Control Signals

Internal control results include conceptually:

```text
RedirectSignal
NotFoundSignal
RewriteSignal
MiddlewareNextSignal
```

They must be distinguishable from unexpected application exceptions.

They must not be logged as framework crashes under normal use.

---

# 65. Control Signal Integrity

Ranu.js control signals must use internal identity checks that cannot be accidentally confused with arbitrary user-thrown objects containing similar fields.

Implementation may use:

- internal classes;
- symbols;
- branded objects.

The representation is private.

---

# 66. Static Route Dispatch

For a concrete path present in the static manifest:

```text
GET /about
```

runtime may serve the generated HTML directly.

It must not execute page SSR for that static route.

Associated headers/assets must remain consistent with build output.

---

# 67. Dynamic Static Dispatch

For:

```text
/products/[id]
```

configured static, the static manifest contains only generated concrete paths.

Example:

```text
/products/1
/products/2
```

Request:

```text
/products/3
```

must produce 404 according to `04_RENDERING_MODEL.md`.

It must not fall through to SSR.

---

# 68. Static Manifest Authority

Production static dispatch uses build-generated metadata.

The server must not scan output directories heuristically on every request to determine route behavior.

---

# 69. Static HTML Response

Static HTML responses should include:

```text
Content-Type: text/html; charset=utf-8
```

and may include:

- ETag;
- Last-Modified;
- cache headers;
- compression metadata;

according to build/runtime configuration.

---

# 70. Public Directory

Files in:

```text
public/
```

are served as public static assets.

Example:

```text
public/logo.svg
```

maps to:

```text
/logo.svg
```

subject to the route-collision rules defined in routing/build specifications.

---

# 71. Public File Security

Public file resolution must prevent path traversal.

Requests such as encoded:

```text
../
```

must never escape the public directory.

Resolved filesystem paths must be verified against the configured public root.

---

# 72. Public Dotfiles

V1 should not serve hidden/dotfiles from `public/` by default unless explicitly allowed.

Examples:

```text
.env
.git/*
```

must never become publicly accessible through generic static serving.

A narrow allowlist may be used for legitimate standardized files if explicitly configured.

---

# 73. Framework Internal Assets

Ranu.js owns:

```text
/_ranu/
```

for generated runtime/client assets.

These assets are resolved from the build output, not the application's public directory.

Application code cannot override framework-internal assets.

---

# 74. Asset Cache Headers

Hashed immutable Ranu.js assets should receive long-lived immutable cache headers.

Conceptual:

```text
Cache-Control: public, max-age=31536000, immutable
```

Non-hashed HTML must not receive immutable caching by default.

Exact cache defaults are finalized in the build/runtime implementation.

---

# 75. MIME Types

Static/public asset serving must set appropriate content types based on known build metadata or safe MIME mapping.

Unknown binary files should use a safe generic type such as:

```text
application/octet-stream
```

The runtime must not guess executable content types dangerously.

---

# 76. Range Requests

Byte-range support for large public/static assets is desirable but not required for the first functional runtime.

If implemented, it must correctly handle:

```text
Range
Content-Range
206 Partial Content
416 Range Not Satisfiable
```

It must not alter application route semantics.

---

# 77. Conditional Requests

Ranu.js may support:

```text
ETag
If-None-Match
Last-Modified
If-Modified-Since
```

for static assets/output.

A valid conditional hit may return:

```text
304 Not Modified
```

with no response body.

---

# 78. Compression

HTTP compression is an adapter/server concern.

Ranu.js Node runtime may support:

```text
gzip
brotli
```

through built-in or middleware behavior.

Already compressed assets should not be wastefully recompressed.

Compression must preserve streaming where possible.

---

# 79. Response Headers

Application `Response` headers are preserved unless Ranu.js must add or normalize framework-required headers.

Ranu.js must not silently delete legitimate application headers.

Forbidden transport headers are handled according to runtime/platform requirements.

---

# 80. Multiple Header Values

Headers with special multi-value semantics must be handled correctly.

In particular:

```text
Set-Cookie
```

must not be corrupted through generic comma joining.

---

# 81. Response Body Types

Web `Response` supports body forms such as:

```text
string
Uint8Array
ArrayBuffer
ReadableStream
Blob where supported
FormData where supported
```

The Node adapter must send supported body forms correctly.

---

# 82. Streaming Responses

API handlers may return streaming `Response` bodies.

Example conceptual:

```ts
return new Response(stream, {
  headers: {
    "content-type": "text/plain"
  }
});
```

The runtime must not force the entire stream into memory.

---

# 83. Renderer Streaming

SSR render results may also contain a stream.

The runtime forwards it through the adapter while respecting:

- headers;
- status;
- abort signals;
- backpressure where possible.

---

# 84. Response Commitment

Once headers/body are committed to the native response, status/header changes may no longer be possible.

The runtime must track this reality during streaming.

Late errors must not attempt invalid response rewrites.

---

# 85. Stream Error

If a stream fails after response commitment:

- terminate/close safely;
- log the request/error ID;
- do not expose a stack trace in the stream by default;
- perform cleanup.

If failure occurs before commitment, normal server error handling may still replace the response.

---

# 86. Backpressure

The Node adapter should respect Node/Web stream backpressure.

It must not read an unbounded streaming body into memory faster than the network can send it.

---

# 87. Request Abort

The Web `Request.signal` must be associated with client disconnect/abort where technically possible.

When the client disconnects:

```text
AbortSignal → aborted
```

Downstream server code can observe cancellation.

---

# 88. Render Abort

SSR should receive the same or linked abort signal.

Long-running render/data operations should stop where supported.

Abort is not necessarily an application error.

---

# 89. API Abort

API handlers may pass:

```ts
request.signal
```

to fetch/database libraries that support cancellation.

Ranu.js does not invent a second cancellation primitive.

---

# 90. Request Timeout

Ranu.js Node runtime should support configurable request/render timeout policy.

Conceptual:

```ts
server: {
  requestTimeout: 30000
}
```

The exact default is implementation-defined and must be documented.

A timeout produces a controlled failure rather than hanging indefinitely.

---

# 91. Timeout Status

If no response has been committed and the framework timeout is reached, Ranu.js may return:

```text
504 Gateway Timeout
```

or a documented server timeout status.

The selected V1 status must remain consistent.

V1 recommendation:

```text
504
```

for framework-enforced upstream/render timeout.

---

# 92. API Error Handling

Unexpected exceptions from API handlers produce:

```text
500 Internal Server Error
```

unless the application catches them and returns another response.

Development may include rich diagnostics.

Production response body must be safe and generic by default.

---

# 93. Page Error Handling

Unexpected page rendering errors are delegated to the rendering error-boundary model.

If no application boundary can produce a valid response, the runtime returns a safe root:

```text
500
```

document.

---

# 94. Production API Error Body

Recommended default:

```json
{
  "error": "Internal Server Error",
  "requestId": "..."
}
```

The framework must not include:

- stack traces;
- absolute source paths;
- environment values;
- database errors;
- provider credentials.

Applications may define their own API error responses.

---

# 95. Production HTML Error

Default root HTML error response should be minimal and safe.

It may expose a request/error reference ID for support correlation.

Detailed errors belong in server logs/observability.

---

# 96. Development Errors

Development error output may include:

- stack;
- route;
- source file;
- code frame;
- request method/path;
- Ranu.js diagnostic code;
- import chain;
- cause.

Sensitive environment values should still not be intentionally dumped.

---

# 97. Error Logging

Unexpected runtime errors should be logged once at the appropriate ownership layer.

Nested layers must avoid duplicating the same exception five times.

Log records should include:

```text
requestId
routeId if known
method
pathname
error code/type
```

---

# 98. 400 Bad Request

Ranu.js returns 400 for structurally invalid requests such as:

- malformed URL encoding;
- invalid request framing detected by adapter;
- invalid host where required;
- other parse failures.

A malformed request must not be treated as a normal 404 route miss.

---

# 99. 404 Not Found

404 occurs when:

- no application route matches;
- a static-only dynamic route path was not generated;
- page execution intentionally calls `notFound()`;
- a requested public/static file does not exist where that target is authoritative.

Page 404 UI follows rendering rules.

API routes should normally return API-appropriate 404 responses explicitly for missing resources.

---

# 100. 405 Method Not Allowed

405 occurs when the pathname resolves to an endpoint but the HTTP method is unsupported.

The response includes:

```text
Allow
```

where applicable.

---

# 101. 413 Payload Too Large

Request-body size enforcement produces:

```text
413
```

The runtime should stop unnecessary body consumption and close/handle the request safely.

---

# 102. 431 Request Header Fields Too Large

Header-size limits are primarily enforced by Node/server infrastructure.

Where Ranu.js detects excessive normalized header data, it may return:

```text
431
```

The runtime must document the effective limit and interaction with Node settings.

---

# 103. 500 Internal Server Error

500 is reserved for unexpected internal/application failures not represented by more specific control/status outcomes.

Ranu.js control signals such as redirect/not-found must not become 500.

---

# 104. Status Preservation

If an application returns:

```ts
new Response("Created", { status: 201 })
```

the runtime preserves 201 unless protocol/runtime rules require adjustment.

Ranu.js must not normalize every successful API response to 200.

---

# 105. Response Validation

Before sending an API response, Ranu.js validates that the handler returned a valid `Response`.

Development diagnostics should identify the route and method when validation fails.

---

# 106. Response Finalization

Before adapter transmission, Ranu.js may perform a finalization phase:

```text
apply accumulated cookies
apply framework-required headers
apply request ID header if configured
apply security defaults if configured
HEAD body suppression
normalize content length/transfer semantics
```

This phase must not unexpectedly replace application response content.

---

# 107. Request ID Response Header

Ranu.js may expose:

```text
X-Ranu.js-Request-Id
```

or a generic configured request ID header.

V1 should allow this to be disabled or customized.

Internal request IDs remain available to logs regardless.

---

# 108. Server Header

Ranu.js should not expose detailed framework/runtime version information through an HTTP `Server` header by default.

Fingerprinting information should be minimized.

---

# 109. Security Headers

Ranu.js may provide opt-in or recommended defaults for:

```text
X-Content-Type-Options
Referrer-Policy
Content-Security-Policy
Strict-Transport-Security
Permissions-Policy
```

But application-specific CSP/HSTS policies must not be guessed blindly.

The runtime should provide configuration/hooks rather than unsafe universal assumptions.

---

# 110. Request Host

The runtime must parse the request host safely.

Host values may be used for absolute URL construction but must not be trusted for security-sensitive tenancy logic without application validation.

---

# 111. HTTPS Detection

When directly serving HTTPS, protocol is known from the transport.

Behind proxies, forwarded protocol is used only according to explicit proxy-trust configuration.

This prevents spoofed protocol assumptions.

---

# 112. Client IP

Ranu.js may expose client address metadata through request context.

Forwarded IP headers are honored only under trusted-proxy configuration.

The value is metadata, not a guaranteed identity.

---

# 113. Runtime Locals

Request locals provide server-only per-request storage.

Conceptual helper:

```ts
import { getRequestContext } from "Ranu.js/server";

const ctx = getRequestContext();
const user = ctx.locals.get("user");
```

This API should be used sparingly and remain typed/extensible.

---

# 114. Context Isolation

Request context must never leak between concurrent requests.

Tests must explicitly verify concurrent isolation.

This is critical when AsyncLocalStorage is used.

---

# 115. Context Lifetime

Request context begins before middleware and ends after response completion/stream cleanup.

Long-lived background tasks must not assume the request context remains valid after the request finishes.

---

# 116. Background Work

Ranu.js V1 does not guarantee durable background task execution after a response is sent.

Applications needing durable jobs should use an external queue/job system or future explicit Ranu.js workflow integration.

The runtime must not imply that fire-and-forget promises are reliable.

---

# 117. API Route Module Loading

Production route modules are loaded through compiled server-manifest references.

The runtime must not resolve route source paths dynamically from the `app/` filesystem.

---

# 118. Module Caching

Production may rely on normal module caching for route/runtime modules.

Development must support invalidation/HMR according to the development system.

Application code must not depend on a module being re-evaluated per request.

---

# 119. Global State

Server modules may persist in process memory across requests.

Therefore developers must not store user-specific request state in mutable global variables.

Ranu.js documentation must make this explicit.

Request-scoped state belongs in request context.

---

# 120. Development Runtime

`Ranu.js dev` uses the same high-level request semantics but may:

- transform modules on demand;
- reload route modules;
- show rich errors;
- update route manifests in memory;
- disable production caching;
- inject development client assets.

Development convenience must not change API/page semantics.

---

# 121. Production Runtime

Production runtime uses only built output required for execution.

It must not require:

```text
TypeScript compiler
source route scanning
development HMR server
source maps exposed publicly
```

unless explicitly configured.

---

# 122. Source Maps

Server source maps may be retained privately for diagnostics.

They must not automatically become publicly accessible static assets.

Client source map publication must be a build configuration decision.

---

# 123. Runtime Configuration

Server runtime configuration is loaded from normalized Ranu.js config/build metadata.

Conceptual:

```ts
defineConfig({
  server: {
    host: "0.0.0.0",
    port: 3000,
    trustProxy: false,
    bodyLimit: "1mb",
    requestTimeout: 30000
  }
});
```

CLI options may override selected development/start values.

---

# 124. Port

Default local port may be:

```text
3000
```

but the runtime must allow:

```text
PORT environment variable
CLI --port
configuration
```

with documented precedence.

---

# 125. Host Binding

Development may default to localhost for safety.

Production `Ranu.js start` may bind to a configurable host such as:

```text
0.0.0.0
```

The selected defaults must be documented clearly.

---

# 126. Startup

Production startup flow:

```text
Load normalized runtime config
→ Load server manifest
→ Validate build compatibility
→ Initialize renderer
→ Initialize route matcher
→ Initialize middleware
→ Create Node server
→ Listen
```

A corrupt/incompatible build must fail before accepting traffic.

---

# 127. Build Compatibility

Server manifest must contain enough version information to ensure runtime/build compatibility.

Conceptual:

```text
manifestVersion
frameworkVersion
buildId
```

An unsupported manifest version must stop startup with a clear error.

---

# 128. Startup Failure

Fatal startup failures include:

- missing server manifest;
- unsupported manifest version;
- missing runtime entry;
- invalid production config;
- port binding failure.

Ranu.js must exit non-zero rather than pretending the server is healthy.

---

# 129. Graceful Shutdown

Node production runtime must handle termination signals appropriately.

At minimum:

```text
SIGTERM
SIGINT
```

Conceptual shutdown:

```text
stop accepting new connections
→ allow in-flight requests to finish
→ enforce shutdown deadline
→ close remaining connections/resources
→ exit
```

---

# 130. Shutdown Timeout

Graceful shutdown must have a bounded timeout.

After the deadline, remaining requests/connections may be forcefully closed.

The timeout should be configurable.

---

# 131. Application Shutdown Hooks

V1 may expose lifecycle hooks for resources such as database pools.

Conceptual:

```ts
export async function onShutdown() {
  await db.close();
}
```

If lifecycle hooks are not ready for initial V1, resource cleanup remains application/bootstrap responsibility.

The core runtime architecture must leave room for them.

---

# 132. Unhandled Rejections

The runtime must not silently swallow unhandled promise rejections.

Fatal process-level behavior should follow Node production best practices.

Request-level exceptions must be caught within the request pipeline when possible.

---

# 133. Uncaught Exceptions

An uncaught process-level exception may leave process state unsafe.

Ranu.js should log the fatal error and allow process supervision/container infrastructure to restart the process rather than pretending continued health is always safe.

Exact fatal policy must be documented.

---

# 134. Health Endpoints

Ranu.js does not automatically claim:

```text
/health
```

because `/health` is an application route.

Applications can define:

```text
app/health/route.ts
```

or infrastructure-specific health checks.

This preserves the routing rule that `/api` and `/health` are not reserved.

---

# 135. Framework Reserved Paths

The runtime reserves:

```text
/_ranu/
```

for framework assets/internal endpoints.

Any internal HTTP endpoints added under this namespace must be documented as internal and must not expose secrets.

---

# 136. Development Internal Endpoints

Development may use `/_ranu/` for:

- HMR;
- dev runtime metadata;
- error overlay assets.

Production must not expose unnecessary development endpoints.

---

# 137. Runtime Internal Endpoint Security

Internal endpoints must validate:

- build IDs;
- expected methods;
- path parameters;
- environment/mode.

Development-only functionality must be absent or disabled in production.

---

# 138. Static vs Route Precedence

Routing specification locks application route precedence over colliding public-file paths.

Therefore request dispatch checks authoritative application route/static route metadata before a colliding public asset path.

A build/dev warning should already identify such collisions.

---

# 139. Framework Asset Precedence

`/_ranu/` framework assets always take precedence and cannot be shadowed by application routes/public files.

---

# 140. Unknown Framework Asset

A missing `/_ranu/...` asset returns 404.

It must not fall through to an application catch-all route.

This protects internal namespace semantics.

---

# 141. Catch-All Application Routes

Application catch-all routes may match unknown ordinary paths, but never reserved framework-internal paths.

Middleware matching must respect the same namespace rules.

---

# 142. API Content Negotiation

Ranu.js does not impose a global JSON API format.

Applications may return:

```text
JSON
HTML
text
binary
streams
redirects
empty responses
```

through Web `Response`.

---

# 143. Response JSON

Applications may use:

```ts
Response.json(data, options)
```

where supported by the target Node/Web runtime.

Ranu.js may provide a compatibility helper if required by supported Node versions.

---

# 144. Empty Response

Valid examples include:

```ts
new Response(null, { status: 204 })
```

The adapter must respect HTTP semantics that prohibit bodies for statuses such as 204/304.

---

# 145. Content-Length

The adapter/build runtime may calculate `Content-Length` for known buffered bodies.

For streaming responses, transfer semantics are handled by Node/HTTP.

Incorrect application-provided content length must not cause unsafe response behavior.

---

# 146. HEAD Body Suppression

Regardless of endpoint implementation, final `HEAD` responses must not transmit a response body.

Relevant metadata headers should remain where valid.

---

# 147. Statuses Without Bodies

The runtime must enforce body restrictions for HTTP statuses where bodies are prohibited.

At minimum:

```text
204
304
```

and applicable informational responses.

---

# 148. Redirect Response

Redirect helpers produce valid `Location` headers and redirect statuses.

Relative locations are allowed where valid.

Header values must be validated against response splitting/injection.

---

# 149. Header Injection Protection

The adapter/runtime must reject or safely handle invalid header names/values containing prohibited control characters.

Application-controlled headers must not enable raw HTTP response splitting.

---

# 150. Request Smuggling Boundary

Low-level HTTP parser protections primarily belong to Node/proxy infrastructure.

Ranu.js must avoid contradictory parsing of:

```text
Content-Length
Transfer-Encoding
Host
```

that could create request-smuggling inconsistencies.

The Node adapter should rely on Node's validated request framing rather than reparsing raw HTTP manually.

---

# 151. Path Traversal Protection

Static/public file resolution must decode/normalize carefully and verify containment.

Application route matching itself operates on URL segments and must never map arbitrary URL text directly to filesystem source paths at runtime.

---

# 152. Open Redirect Protection

Ranu.js cannot determine whether every external redirect is legitimate.

Documentation/helpers should make safe relative redirects easy.

User-provided redirect targets must be validated by applications.

---

# 153. Error Cause Exposure

Production logging may preserve internal error causes.

Production client responses must not automatically serialize `error.cause`.

---

# 154. Runtime Logging

Ranu.js should expose structured logging hooks.

Conceptual event fields:

```text
timestamp
level
requestId
method
pathname
routeId
status
duration
error
```

The framework should not force one third-party logging vendor.

---

# 155. Access Logging

Development may print concise request logs.

Production access logging should be configurable.

Sensitive query values and headers must not be dumped by default.

---

# 156. Sensitive Headers

Default diagnostics/logging must redact or omit headers such as:

```text
Authorization
Cookie
Set-Cookie
Proxy-Authorization
```

Applications may add custom redaction rules.

---

# 157. Query Redaction

Because query strings may contain sensitive values, production logs should prefer pathname-only logging by default or configurable query logging.

Ranu.js must not assume query parameters are harmless.

---

# 158. Runtime Metrics

The architecture should permit metrics such as:

```text
request count
status counts
duration
active requests
SSR duration
API duration
errors
```

No vendor-specific metrics backend is required.

---

# 159. Tracing

Future OpenTelemetry integration should be possible around:

```text
request
middleware
route match
SSR
API handler
```

V1 core must not require a telemetry vendor.

---

# 160. Runtime Hooks

Internal runtime hooks may include:

```text
onRequestStart
onRouteMatched
onResponse
onError
```

They must be designed so observability does not change request semantics.

A public stable hook API may be deferred.

---

# 161. API Example

```ts
// app/api/users/[id]/route.ts

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = await findUser(params.id);

  if (!user) {
    return Response.json(
      { error: "User not found" },
      { status: 404 }
    );
  }

  return Response.json(user);
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  await deleteUser(params.id);

  return new Response(null, {
    status: 204
  });
}
```

---

# 162. Middleware Example

```ts
// middleware.ts

import { next, redirect } from "Ranu.js/server";

export const config = {
  matcher: ["/dashboard/:path*"]
};

export async function middleware(request: Request) {
  const session = await readSession(request);

  if (!session) {
    redirect("/login");
  }

  return next();
}

export default middleware;
```

The exact export shape may be simplified during implementation, but there must be one authoritative documented form.

---

# 163. Cookie Example

```ts
import { cookies } from "Ranu.js/server";

export async function POST(request: Request) {
  const session = await createSession();

  cookies().set("session", session.id, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/"
  });

  return Response.json({
    ok: true
  });
}
```

The runtime appends the cookie mutation to the outgoing response.

---

# 164. Redirect Example

```ts
import { redirect } from "Ranu.js/server";

export default async function Page() {
  const user = await currentUser();

  if (!user) {
    redirect("/login");
  }

  return <Dashboard user={user} />;
}
```

Runtime outcome:

```text
307
Location: /login
```

No error boundary should treat the redirect as an application crash.

---

# 165. Not-Found Example

```ts
import { notFound } from "Ranu.js/server";

export default async function Page({ params }) {
  const product = await findProduct(params.id);

  if (!product) {
    notFound();
  }

  return <Product product={product} />;
}
```

Runtime outcome:

```text
404
+
nearest applicable not-found UI
```

---

# 166. Streaming API Example

```ts
export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode("hello\n")
      );

      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8"
    }
  });
}
```

Ranu.js forwards the stream without full buffering.

---

# 167. Runtime Diagnostic Codes

Required conceptual diagnostics include:

```text
RANU_SERVER_INVALID_REQUEST
RANU_SERVER_INVALID_URL
RANU_SERVER_INVALID_RESPONSE
RANU_SERVER_METHOD_NOT_ALLOWED
RANU_SERVER_BODY_TOO_LARGE
RANU_SERVER_REQUEST_TIMEOUT
RANU_SERVER_MIDDLEWARE_ERROR
RANU_SERVER_REWRITE_LOOP
RANU_SERVER_REQUEST_CONTEXT_MISSING
RANU_SERVER_MANIFEST_MISSING
RANU_SERVER_MANIFEST_VERSION
RANU_SERVER_RUNTIME_ENTRY_MISSING
RANU_SERVER_STREAM_ERROR
RANU_SERVER_PUBLIC_PATH_TRAVERSAL
RANU_SERVER_STARTUP_ERROR
RANU_SERVER_SHUTDOWN_TIMEOUT
```

Exact final codes may be refined before stable release.

---

# 168. Invalid Response Diagnostic

Example:

```text
RANU_SERVER_INVALID_RESPONSE

API handler did not return a Response.

Route:
  /api/users

Method:
  POST

Source:
  app/api/users/route.ts

Received:
  object

Return a Web Response, for example:
  return Response.json(data)
```

---

# 169. Missing Method Diagnostic

Development may report:

```text
POST /api/users → 405

Available methods:
  GET
  HEAD
  OPTIONS
```

This is an HTTP outcome, not necessarily a build error.

---

# 170. Request Context Diagnostic

If:

```ts
cookies()
```

is called outside a request/static-compatible context, Ranu.js should report an error identifying the unsupported execution environment.

For static rendering, the rendering diagnostic should explain that request cookies are unavailable during build.

---

# 171. Runtime Test Layers

Required test layers:

```text
core runtime unit tests
Node adapter tests
middleware tests
API integration tests
page dispatch tests
static dispatch tests
streaming tests
abort tests
cookie/header tests
security tests
production startup tests
shutdown tests
```

---

# 172. Request Pipeline Test Matrix

At minimum:

- valid GET;
- valid HEAD;
- query string;
- Unicode path;
- malformed URL encoding;
- route params;
- middleware continuation;
- middleware direct response;
- middleware redirect;
- middleware error;
- route no-match;
- framework internal asset;
- public asset;
- application route/public collision.

---

# 173. API Test Matrix

At minimum:

- GET;
- automatic HEAD;
- explicit HEAD;
- POST;
- PUT;
- PATCH;
- DELETE;
- automatic OPTIONS;
- explicit OPTIONS;
- 405 + Allow;
- JSON response;
- text response;
- binary response;
- 204 response;
- streaming response;
- thrown error;
- redirect;
- body parsing;
- oversized body.

---

# 174. Cookie Test Matrix

At minimum:

- read cookie;
- missing cookie;
- multiple cookies;
- set cookie;
- multiple Set-Cookie values;
- delete cookie;
- HttpOnly;
- Secure;
- SameSite;
- path/domain options;
- malformed incoming cookie;
- concurrent request isolation.

---

# 175. Header Test Matrix

At minimum:

- request headers;
- custom response headers;
- repeated headers;
- Set-Cookie preservation;
- invalid header characters;
- HEAD behavior;
- 204/304 body restrictions;
- content type;
- request ID.

---

# 176. Middleware Test Matrix

At minimum:

- global middleware;
- matcher include;
- matcher exclude;
- `next()`;
- response;
- redirect;
- rewrite if implemented;
- rewrite loop;
- locals;
- concurrent locals isolation;
- internal `/_ranu/` bypass;
- public file bypass;
- middleware exception.

---

# 177. Static Serving Test Matrix

At minimum:

- generated static page;
- generated dynamic static page;
- ungenerated static dynamic path;
- public file;
- missing public file;
- path traversal;
- dotfile denial;
- MIME type;
- ETag if implemented;
- 304 if implemented;
- immutable hashed asset cache;
- framework asset namespace.

---

# 178. Streaming Test Matrix

At minimum:

- API stream;
- SSR stream;
- stream backpressure;
- client disconnect;
- abort propagation;
- stream error before commitment;
- stream error after commitment;
- HEAD body suppression.

---

# 179. Production Safety Test Matrix

At minimum:

- API exception does not leak stack;
- HTML exception does not leak stack;
- secrets absent from error body;
- Authorization redacted from logs;
- cookies redacted from logs;
- source files not publicly accessible;
- source maps private by default;
- `/_ranu/` dev endpoints unavailable in production;
- public path traversal blocked;
- proxy headers ignored when trust disabled.

---

# 180. Concurrency Tests

The Node runtime must be tested with concurrent requests to ensure:

- params isolation;
- cookie isolation;
- locals isolation;
- request IDs remain distinct;
- redirects do not leak;
- response headers do not leak;
- AsyncLocalStorage context remains correct.

---

# 181. Runtime Performance Measurements

Before stable V1, measure:

- framework request overhead;
- route match overhead;
- middleware overhead;
- static-file throughput;
- API throughput;
- SSR request overhead;
- memory under concurrent requests;
- streaming memory behavior.

Performance work must not weaken correctness or safety.

---

# 182. Runtime Acceptance Criteria

The Ranu.js V1 server runtime is complete when:

1. Node requests are converted to Web `Request`.
2. Web `Response` values are correctly sent through Node.
3. production uses compiled manifests.
4. URL normalization is deterministic.
5. malformed requests fail safely.
6. global middleware works.
7. middleware can continue, respond, and redirect.
8. request locals are isolated.
9. page GET dispatch works.
10. page HEAD works.
11. unsupported page methods return 405.
12. API method dispatch works.
13. missing API methods return 405 with `Allow`.
14. automatic HEAD works for GET API routes.
15. automatic OPTIONS works as specified.
16. route params reach API handlers.
17. Web Request body APIs work.
18. request-body limits work.
19. request headers are available.
20. cookies can be read.
21. response cookies can be set/deleted.
22. multiple Set-Cookie values are preserved.
23. redirects are intentional control flow.
24. not-found is intentional control flow.
25. API exceptions return safe production 500 responses.
26. page exceptions integrate with rendering boundaries.
27. static pages are served without SSR.
28. ungenerated static dynamic paths return 404.
29. public files are served safely.
30. path traversal is blocked.
31. `/_ranu/` is protected as framework namespace.
32. streaming API responses work.
33. streaming SSR responses work where renderer supports it.
34. request abort signals propagate where supported.
35. production logs redact sensitive headers by default.
36. runtime/build manifest versions are validated.
37. startup failures exit non-zero.
38. graceful shutdown stops new traffic and drains requests.
39. concurrent request context isolation passes tests.
40. core runtime does not require a provider SDK.
41. application handlers do not require Node request/response objects.
42. required runtime/security test matrices pass.

---

# 183. Locked V1 Server Runtime Decisions

The following are locked by this specification:

1. Node.js is the required V1 production runtime.
2. Application-facing HTTP uses Web `Request` and `Response`.
3. Node transport logic lives in an adapter.
4. Core runtime does not expose Node HTTP objects to route handlers.
5. Production uses compiled route/server/static manifests.
6. Production does not scan source routes.
7. API handlers export HTTP-method functions.
8. Supported V1 handler methods are GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS.
9. Missing API methods return 405.
10. `Allow` is returned for method-not-allowed responses.
11. GET implies automatic HEAD when explicit HEAD is absent.
12. Basic OPTIONS may be generated when explicit OPTIONS is absent.
13. Ranu.js does not globally enable CORS.
14. Page routes support GET and HEAD by default.
15. Mutation methods do not execute page modules.
16. Request bodies use Web Request APIs.
17. Request body size is bounded/configurable.
18. Middleware is project-level in V1.
19. V1 middleware executes in Node runtime.
20. Middleware may continue, return a Response, or redirect.
21. Middleware may use request-scoped locals.
22. Request locals never automatically serialize to clients.
23. `/_ranu/` bypasses ordinary application routing and is framework-reserved.
24. Public files bypass middleware by default.
25. Ranu.js control signals are not ordinary errors.
26. `redirect()` defaults to 307.
27. Permanent redirects use 308 where applicable.
28. `notFound()` produces 404 semantics.
29. Static routes are served from build output.
30. Static dynamic routes never fall back to SSR in V1.
31. Public-file path traversal is forbidden.
32. Public dotfiles are denied by default.
33. Hashed framework assets may use immutable caching.
34. API responses may stream.
35. SSR responses may stream.
36. Runtime must respect backpressure where possible.
37. Request abort is represented through `AbortSignal`.
38. Production errors are sanitized.
39. Sensitive headers are redacted from default logs.
40. Request context is isolated across concurrent requests.
41. Global mutable state is not request-scoped.
42. Ranu.js does not guarantee durable background work after response completion.
43. Proxy forwarding headers are trusted only when explicitly configured.
44. Startup validates build/runtime compatibility.
45. Graceful shutdown is required.
46. Provider SDKs are not part of core runtime semantics.
47. API routes never execute through React rendering.
48. Middleware never executes through React rendering.
49. The runtime owns HTTP execution; renderer owns page rendering.
50. Development and production share the same semantic request model.

---

# 184. Deferred Server Runtime Features

The following are deferred unless later requirements explicitly add them:

- Edge runtime;
- Bun runtime;
- Deno runtime;
- provider-specific serverless semantics;
- durable background jobs;
- built-in job queues;
- built-in WebSocket application framework;
- built-in SSE abstraction beyond ordinary streaming Response;
- automatic global CORS policy;
- advanced rate limiting;
- distributed sessions;
- distributed cache;
- multi-region coordination;
- host-based application routing;
- automatic authentication;
- built-in CSRF framework;
- advanced file-upload storage;
- automatic API schema generation;
- automatic RPC;
- server actions/functions;
- framework-managed database connections.

These features must not block a stable Node-based V1.

---

# 185. Relationship to Routing

`03_ROUTING_SPECIFICATION.md` owns:

```text
route discovery
URL patterns
params
precedence
collisions
route kind
route manifest identity
```

This runtime consumes compiled routing data.

It must not reinterpret filesystem route syntax.

---

# 186. Relationship to Rendering

`04_RENDERING_MODEL.md` owns:

```text
React page/layout composition
SSR
SSG generation
client rendering
hydration
metadata
error UI
not-found UI
```

The runtime owns:

```text
request lifecycle
HTTP status
middleware
dispatch
response transmission
```

The renderer returns rendering results to the runtime.

---

# 187. Relationship to Build System

`06_BUILD_SYSTEM.md` must define:

- production server bundle generation;
- server manifest;
- static manifest;
- public/build asset layout;
- runtime entry generation;
- environment replacement;
- build ID;
- route/runtime chunking;
- middleware bundle;
- production start artifact;
- development module pipeline.

The runtime must execute these artifacts without source-tree discovery.

---

# 188. Relationship to Deployment Adapters

Future deployment adapters translate Ranu.js build/runtime contracts to providers.

Examples:

```text
Node standalone server
serverless function adapter
container deployment
future edge adapter
```

Adapters must preserve Ranu.js HTTP semantics or explicitly declare unsupported capabilities.

---

# 189. Required Next Specification

The next document is:

```text
06_BUILD_SYSTEM.md
```

It must lock:

- compiler/bundler strategy;
- development transform pipeline;
- client graph;
- server graph;
- route compilation integration;
- environment variable handling;
- server-only/client-only enforcement;
- CSS/assets;
- static generation orchestration;
- output directory;
- server manifest;
- route manifest;
- client manifest;
- static manifest;
- build ID;
- production entry;
- source maps;
- incremental builds;
- build diagnostics;
- `Ranu.js build`;
- `Ranu.js start`.

---

# 190. Final Server Runtime Baseline

Ranu.js V1 uses Node.js as its first production runtime while exposing Web-standard `Request` and `Response` interfaces to application server code.

A Node adapter translates native HTTP transport into the provider-neutral Ranu.js runtime contract.

Every request passes through one deterministic pipeline:

```text
adapter
→ normalization
→ request context
→ middleware
→ route/static matching
→ page or API dispatch
→ control/error handling
→ response finalization
→ adapter
```

API routes export HTTP method handlers and return Web `Response` objects.

Page routes support GET and HEAD and delegate rendering to the rendering subsystem.

Middleware runs outside React, can continue or terminate requests, and may attach server-only request-scoped context.

Cookies, headers, request bodies, redirects, not-found behavior, streaming, abort signals, and status handling follow explicit HTTP/runtime semantics.

Static pages are served from build-generated metadata and never silently fall back to SSR.

Framework-generated assets live under the reserved `/_ranu/` namespace.

Public files are served from `public/` with path traversal and dotfile protections.

Production errors are sanitized, sensitive request data is not logged by default, proxy headers are trusted only when configured, and request state is isolated across concurrent requests.

The runtime supports streaming and cancellation without forcing response buffering.

Production startup validates build compatibility, and graceful shutdown is required.

Provider-specific deployment behavior remains outside the core runtime.

This specification is the authoritative Ranu.js V1 HTTP/server execution contract.

---

**End of 05_SERVER_RUNTIME_SPEC.md**
