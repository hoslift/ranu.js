# 15_SECURITY_MODEL.md

**Project:** Ranu.js — JavaScript/TypeScript Full-Stack Web Framework  
**Document Type:** Security Model & Threat Specification  
**Status:** Implementation Baseline  
**Date:** 2026-08-10  
**Depends On:** `00_FRAMEWORK_VISION.md` through `14_TESTING_AND_QUALITY_STRATEGY.md`  
**Primary V1 Runtime:** Node.js  
**Primary V1 Renderer:** React  
**Security Goal:** Safe defaults, explicit trust boundaries, controlled browser exposure, secure build/runtime behavior, and actionable vulnerability handling

---

# 1. Purpose

This document defines the Ranu.js V1 security model.

It specifies:

- security objectives;
- trust boundaries;
- attacker model;
- protected assets;
- client/server isolation;
- environment and secret protection;
- rendering and XSS protections;
- hydration serialization;
- routing and path traversal;
- static/public asset security;
- HTTP request/response security;
- headers and cookies;
- proxy trust;
- middleware security;
- API route security boundaries;
- build-system security;
- source maps;
- manifests;
- plugin trust and supply-chain risk;
- deployment adapter security;
- development server security;
- CLI/filesystem safety;
- dependency security;
- production error handling;
- denial-of-service boundaries;
- vulnerability severity;
- disclosure and remediation;
- security release gates.

This specification does not claim that Ranu.js can make insecure application code safe automatically.

Ranu.js secures framework-controlled boundaries and provides safe primitives for application developers.

---

# 2. Security Objective

Ranu.js must prevent framework behavior from accidentally causing:

```text
server secrets to enter browser bundles
server-only code to execute in browser
arbitrary filesystem access through URLs
unsafe internal files to become public assets
cross-request state leakage
untrusted forwarded headers to redefine origin/security context
production stack traces to leak by default
plugins to overwrite protected framework artifacts through supported APIs
deployment adapters to publish secrets accidentally
CLI cleanup operations to escape project-owned generated directories
```

---

# 3. Security Principles

## SEC-P01 — Server Is a Trust Boundary

Browser code is untrusted relative to the server.

## SEC-P02 — Private by Default

Environment variables, server modules, filesystem state, and runtime internals are private unless explicitly exposed.

## SEC-P03 — Explicit Public Exposure

Browser-public data requires deliberate framework/application action.

## SEC-P04 — Validate at Boundaries

Validate paths, manifests, plugin metadata, adapter capabilities, config, and user-controlled routing inputs at their boundaries.

## SEC-P05 — Least Privilege

Subsystems should access only the capabilities they need.

## SEC-P06 — Fail Closed

When Ranu.js cannot safely determine whether a server/client or filesystem operation is allowed, it should reject rather than expose.

## SEC-P07 — Production Errors Are Sanitized

Development diagnostics may be rich; production responses must not leak internal details by default.

## SEC-P08 — Trusted Code Is Still Explicit

Plugins, config files, build scripts, and application server code are trusted code execution, not sandboxes.

## SEC-P09 — Provider Security Does Not Replace Framework Security

Deployment providers may add protection, but Ranu.js security semantics remain provider-neutral.

## SEC-P10 — Security Regressions Block Release

Critical and high-impact framework security defects must be resolved before stable release.

---

# 4. Protected Assets

Ranu.js security protects:

```text
private environment variables
database credentials
API secrets
session secrets
server source
filesystem paths
server-only modules
request-local state
cookies
authorization headers
internal manifests
build artifacts
deployment credentials
framework internal endpoints
application private files
```

---

# 5. Trust Zones

Ranu.js V1 has these primary trust zones:

```text
Zone A — Browser / external client
Zone B — Public HTTP boundary
Zone C — Ranu.js middleware/runtime
Zone D — Application server code
Zone E — Build/config/plugin process
Zone F — Local filesystem/build output
Zone G — Deployment adapter/provider
Zone H — Package/dependency supply chain
```

---

# 6. Browser Trust

The browser and all incoming browser-controlled values are untrusted.

This includes:

```text
URL
path
query
headers
cookies
request body
form data
client navigation state
serialized user input
```

Never infer trust because data originated from an ranu CLIent component.

---

# 7. Application Server Code

Application server code is trusted to execute with server privileges.

Examples:

```text
SSR pages
API routes
middleware
server helpers
build-time SSG code
```

Ranu.js cannot prevent intentionally malicious application server code from reading and leaking secrets.

---

# 8. Configuration Trust

`ranu.config.ts` is trusted Node.js code.

It may:

```text
read files
read process.env
load packages
execute arbitrary JavaScript
```

It is not sandboxed.

---

# 9. Plugin Trust

Installed Ranu.js plugins are trusted build/dev Node.js code.

A plugin may read:

```text
source files
environment variables
filesystem
network
```

subject to OS/process permissions.

The Ranu.js Plugin API controls framework extension integrity, not malicious-code sandboxing.

---

# 10. Dependency Trust

npm dependencies execute with application/build privileges where imported or during lifecycle scripts.

Ranu.js cannot guarantee safety of arbitrary third-party packages.

Users must treat dependency installation as a trust decision.

---

# 11. Threat Actors

Relevant attackers include:

```text
remote unauthenticated attacker
malicious authenticated application user
malicious request client
malicious third-party package/plugin
compromised dependency
malicious build input
misconfigured deployment
accidental developer mistake
```

---

# 12. Out-of-Scope Security Claims

Ranu.js V1 does not claim to provide:

```text
application authentication
authorization
database row-level security
business-logic fraud prevention
malware sandboxing
plugin sandboxing
OS isolation
DDoS protection
WAF
secret vault
dependency trust verification
automatic CSP correctness
automatic CSRF protection for every application
```

These may be provided by application/provider tooling.

---

# 13. Client/Server Boundary

The client/server graph boundary is a core security boundary.

Browser-reachable modules must not include:

```text
server-only modules
Node built-ins
private environment values
server credentials
server runtime implementation
```

unless explicitly safe and supported.

---

# 14. `"use client"` Boundary

A module marked:

```ts
"use client";
```

is a browser-reachable entry.

Its transitive dependencies are treated as client-reachable according to `06_BUILD_SYSTEM.md`.

Security validation applies to the entire reachable graph.

---

# 15. Server-Only Marker

Ranu.js supports server-only protection through the authoritative build contract, including:

```text
Ranu.js/server-only
server/ convention
```

A client-reachable import of server-only code must fail development/build.

---

# 16. Transitive Boundary Enforcement

This must fail:

```text
Client.tsx
→ helper.ts
→ database.ts
```

if `database.ts` is server-only.

Checking only direct imports is insufficient.

---

# 17. Node Built-ins in Client Graph

Client-reachable code must not import server-only Node modules such as:

```text
fs
path
net
tls
child_process
worker_threads
```

unless a future explicit browser-compatible abstraction exists.

Ranu.js must not silently polyfill sensitive Node APIs into browser bundles.

---

# 18. Private Environment Variables

Private environment variables must not be substituted into browser output.

Only:

```text
RANU_PUBLIC_*
```

is browser-public through Ranu.js's environment system.

---

# 19. Entire Environment Injection

Ranu.js must never transform:

```ts
process.env
```

into a browser object containing the server environment.

Dynamic client access must not provide arbitrary private values.

---

# 20. Secret Leak Scanning

Release/security tests seed private values and scan:

```text
client JS
CSS
HTML
public manifests
public source maps
static assets
deployment public output
```

Unexpected private secret occurrence is a release blocker.

---

# 21. Public Environment Caveat

`RANU_PUBLIC_*` values are public.

Documentation must clearly warn developers not to place secrets under that prefix.

Example unsafe:

```text
RANU_PUBLIC_DATABASE_PASSWORD
```

The prefix means intentional browser exposure.

---

# 22. SSG Secret Boundary

SSG may use private build-time secrets.

Example:

```text
CMS_BUILD_TOKEN
```

The framework must not automatically publish the token.

However, if application code renders the value into HTML, that is an application leak.

---

# 23. Runtime Secret Boundary

SSR/API/middleware may read runtime secrets through server environment.

Ranu.js must keep those values out of client manifests and bundles unless explicitly returned/rendered by application code.

---

# 24. Serialization Boundary

Any data crossing:

```text
server → browser
```

must be treated as public.

Examples:

```text
HTML
hydration payload
client component props
metadata
JSON response
```

Server secrets must not cross this boundary accidentally.

---

# 25. Hydration Serialization

Ranu.js must serialize hydration data safely.

Requirements:

- no executable code generation from arbitrary values;
- escape HTML-sensitive sequences;
- prevent closing-script breakout;
- support only approved serializable types;
- reject unsupported values clearly.

---

# 26. Script Breakout Protection

Serialized data embedded in HTML must not allow values containing sequences such as:

```text
</script>
```

to escape the data container and create executable markup.

The serializer must encode dangerous sequences safely.

---

# 27. Serialization Types

V1 should prefer a constrained serializable model.

Unsupported values such as:

```text
functions
symbols
open sockets
database clients
arbitrary class instances
```

must not silently cross the server/client boundary.

---

# 28. React Escaping

Ranu.js relies on React's normal escaping behavior for JSX text/attribute interpolation.

Ranu.js must not bypass React escaping for normal rendering.

---

# 29. Raw HTML

Application use of React raw HTML mechanisms such as:

```text
dangerouslySetInnerHTML
```

is application-controlled.

Ranu.js cannot automatically guarantee safety of raw HTML.

Documentation should advise sanitizing untrusted HTML.

---

# 30. Framework-Generated HTML

Any Ranu.js-generated HTML outside normal React escaping must escape untrusted values.

Examples:

```text
metadata
error pages
development overlays
serialized state
```

---

# 31. Metadata Security

Metadata values derived from application/user data must be escaped before HTML emission.

This includes:

```text
title
meta content
link attributes
Open Graph values
```

Ranu.js must not concatenate raw metadata into HTML unsafely.

---

# 32. URL Security

Ranu.js must parse URLs using standards-compliant URL handling.

Avoid manual string concatenation for security-sensitive URL decisions.

---

# 33. Redirect Security

`redirect()` may accept application-provided URLs.

Ranu.js should preserve correct HTTP behavior.

Application developers remain responsible for avoiding open redirects when redirect targets are derived from untrusted input.

Ranu.js documentation should warn about this.

---

# 34. Internal URL Namespace

The framework internal namespace:

```text
/_ranu/
```

is reserved.

Application routes/plugins must not override protected internal endpoints through supported APIs.

---

# 35. Route Path Security

Filesystem route discovery must not allow URL segments to escape the application route root.

Route source paths are canonicalized before use.

---

# 36. Path Traversal

All filesystem operations derived from URLs or route names must defend against:

```text
../
..\
percent-encoded traversal
double-encoded traversal where decoded
mixed separators
absolute paths
drive-letter escape
UNC path escape
symlink escape where applicable
```

---

# 37. Canonical Path Rule

Before authorizing filesystem access:

```text
resolve/canonicalize
→ verify inside allowed root
→ access
```

Do not validate raw path strings and then resolve afterward.

---

# 38. Public Directory

Only files under the configured/public:

```text
public/
```

root are automatically public as static files.

Ranu.js must not serve arbitrary project-root files.

---

# 39. Dotfiles

Sensitive dotfiles must not be publicly served by default.

Examples:

```text
.env
.env.local
.git/*
.npmrc
```

Even if accidentally placed in a public-like location, security-sensitive names may be rejected where practical.

---

# 40. `.env` Publication

Ranu.js must never copy `.env*` files into public output automatically.

This is a locked release-security invariant.

---

# 41. Static Asset Root

Static file resolution must remain inside the static/public artifact root after canonicalization.

---

# 42. Symlink Security

If public assets contain symlinks, Ranu.js must ensure resolved targets do not escape the allowed public root.

The implementation may reject unsafe symlinks entirely.

---

# 43. Build Output Paths

Build/plugin/adapter artifact paths must be canonicalized and constrained to owned output roots.

A plugin hook must not write outside allowed output through an Ranu.js artifact API.

---

# 44. CLI Delete Safety

Commands such as:

```text
clean
rebuild cleanup
temporary directory cleanup
```

must never recursively delete arbitrary user paths because of malformed config or path resolution.

---

# 45. Delete Authorization

Before recursive deletion:

1. resolve path;
2. verify it is an Ranu.js-owned/generated path;
3. reject filesystem root/home/project source;
4. perform deletion.

---

# 46. Request Body Limits

Node runtime must support bounded request-body handling.

Ranu.js must not automatically buffer unlimited request bodies.

Streaming APIs may avoid buffering.

---

# 47. Header Limits

Underlying Node/server limits apply.

Ranu.js should not intentionally disable safe platform limits without documented reason.

---

# 48. HTTP Request Smuggling

Ranu.js should rely on maintained Node HTTP parsing rather than implementing a custom raw HTTP parser.

Adapters/proxies must preserve standard request semantics.

---

# 49. Hop-by-Hop Headers

Proxy/adapter code must treat hop-by-hop headers correctly and not forward invalid connection-specific headers blindly.

---

# 50. Response Splitting

Framework helpers must not permit untrusted values to inject arbitrary response headers through CR/LF sequences.

Use standard `Headers` validation where possible.

---

# 51. Cookies

Cookie APIs must validate/serialize according to web standards.

Cookie values must not permit header injection.

---

# 52. Secure Cookie Attributes

Ranu.js provides attributes such as:

```text
HttpOnly
Secure
SameSite
Path
Domain
Max-Age
Expires
```

but application policy determines which are required.

---

# 53. Session Security

Ranu.js V1 does not implement a built-in session/authentication framework.

If applications create sessions, they must choose secure cookie/session settings.

---

# 54. CSRF

Ranu.js does not claim automatic universal CSRF protection.

State-changing cookie-authenticated endpoints may require CSRF defenses.

Documentation should explain this boundary.

---

# 55. CORS

Ranu.js does not enable permissive CORS globally by default.

Applications/API routes may configure CORS intentionally.

---

# 56. CSP

Ranu.js does not automatically generate a complete Content Security Policy for every application.

Framework-generated inline scripts should be minimized and documented so applications can configure CSP appropriately.

Future nonce/hash integration may be added separately.

---

# 57. Security Headers

Ranu.js may provide documentation/helpers for common security headers, but V1 should not silently impose policies that break valid applications.

Safe framework-controlled defaults may be added only when behavior is clear.

---

# 58. Proxy Trust

Forwarded headers such as:

```text
X-Forwarded-For
X-Forwarded-Proto
X-Forwarded-Host
Forwarded
```

must not automatically be trusted in every deployment.

---

# 59. Trusted Proxy Configuration

Ranu.js runtime must have an explicit trust model.

If proxy trust is disabled, external forwarded headers cannot redefine:

```text
client IP
protocol
host/origin security context
```

---

# 60. Provider Adapters and Proxy Trust

Official adapters may establish trusted provider-specific forwarding behavior when the platform contract guarantees it.

This must be explicit in the adapter.

---

# 61. Host Header

Applications should not treat arbitrary incoming `Host` as trusted tenant/security identity without validation.

Ranu.js URL construction must respect configured/trusted origin behavior.

---

# 62. Middleware Security

Middleware executes before application route handling and may affect:

```text
authentication
redirects
headers
request locals
```

It is trusted server code.

---

# 63. Middleware Locals

Request locals must be isolated per request.

No cross-request shared mutable object may carry user-specific authorization/session state.

---

# 64. Middleware Bypass

Framework internal assets/endpoints and public assets follow the locked middleware behavior.

Security-sensitive bypass rules must be tested.

---

# 65. API Route Security Boundary

API routes receive untrusted HTTP input.

Ranu.js does not automatically validate:

```text
JSON schema
authorization
business permissions
SQL inputs
file uploads
```

Applications must validate these.

---

# 66. JSON Parsing

If Ranu.js provides body helpers later, malformed JSON must fail safely and body limits must still apply.

---

# 67. File Uploads

V1 does not require a framework upload abstraction.

Applications must handle:

```text
size
type
storage
filename
path
malware
```

safely.

---

# 68. Server-Side Request Forgery

Ranu.js does not automatically prevent SSRF from application code that fetches user-controlled URLs.

Documentation should identify this as application responsibility.

---

# 69. Build Process Trust

`Ranu.js build` executes trusted project code including:

```text
config
plugins
SSG
application server modules
bundler plugins
```

Therefore build environments may have access to secrets.

---

# 70. Build Secret Minimization

CI should expose only secrets required for the build.

Runtime-only production secrets should preferably be withheld from build jobs when not needed.

---

# 71. Build Artifact Security

Production artifacts must not include unnecessary:

```text
.env files
deployment credentials
repository metadata
test fixtures
private source files
server source maps in public directory
```

---

# 72. Build Manifest Security

Public/client manifests must not contain:

```text
private env values
authorization tokens
absolute private filesystem paths
server source
```

---

# 73. Build ID Security

Build IDs must not contain raw secrets or private environment values.

They may be random or derived from safe hashes according to implementation.

---

# 74. Source Maps

Client source maps may expose application source.

Production source-map publication must be explicit.

Server source maps must remain non-public by default.

---

# 75. Hidden Source Maps

If source maps are generated for observability without public serving, adapters must keep them outside public static paths.

---

# 76. Development Source Maps

Development source maps may be rich because the dev environment is trusted.

Dev server should not be exposed to untrusted public networks by default.

---

# 77. Dev Server Binding

Default `Ranu.js dev` should bind to a local interface unless the user explicitly requests broader host exposure.

Example safe default:

```text
localhost
```

not:

```text
0.0.0.0
```

unless configured.

---

# 78. Dev Server Is Not Production

Ranu.js development server is not hardened as an internet-facing production server.

Documentation must state this clearly.

---

# 79. Dev Internal Endpoints

HMR/error-overlay/internal development endpoints under framework namespace must validate expected request shape and avoid arbitrary filesystem exposure.

---

# 80. Development Error Output

Development may expose:

```text
stack traces
source locations
code frames
```

because it is intended for local trusted use.

Production must differ.

---

# 81. Production Error Sanitization

By default, production HTTP responses must not expose:

```text
stack traces
absolute paths
environment values
source code
internal package details
```

Unexpected server errors should return a generic safe response.

---

# 82. Server Logging

Detailed errors may be logged server-side for operators.

Logging must still avoid intentionally dumping:

```text
full process.env
authorization headers
session cookies
secret tokens
```

---

# 83. Error IDs

Ranu.js may generate/request correlation IDs to connect sanitized client errors with server logs.

This is recommended but not required for the first prototype.

---

# 84. Not-Found Security

404 handling must not reveal whether arbitrary private filesystem paths exist.

Routing is based on compiled route manifests, not raw filesystem probing from URLs.

---

# 85. Manifest Runtime Security

Production runtime must validate manifest version/build compatibility before serving.

Malformed/corrupt manifests should fail startup rather than create undefined routing behavior.

---

# 86. Runtime Source Scanning

Production runtime should use build manifests and artifacts.

It should not scan arbitrary source directories to dynamically execute unexpected files.

---

# 87. Plugin API Security

Supported plugin hooks must not permit plugins to redefine protected invariants such as:

```text
reserved route namespace
canonical route IDs
server/client security classification
manifest schema version
core security diagnostics
```

without an explicit future API.

---

# 88. Plugin Artifact Ownership

Plugins may write only to approved artifact namespaces/locations through supported APIs.

Artifact collisions must fail.

---

# 89. Plugin Ordering

Deterministic plugin ordering reduces security ambiguity.

The same config must not produce nondeterministic security-sensitive output based on filesystem enumeration.

---

# 90. Malicious Plugins

A malicious plugin can still execute arbitrary Node code.

Ranu.js V1 does not sandbox it.

Security documentation must distinguish:

```text
framework extension integrity
```

from:

```text
malicious code containment
```

---

# 91. Adapter Security

Deployment adapters are trusted build/deployment code.

They may access:

```text
build artifacts
provider credentials
deployment configuration
```

They must not place provider credentials into application public output.

---

# 92. Adapter Capability Validation

If a target cannot safely support required behavior, deployment must fail.

Do not silently downgrade security-sensitive runtime semantics.

---

# 93. Runtime Environment in Adapters

Adapters must distinguish:

```text
build env
runtime private env
browser-public build env
provider deployment credentials
```

These categories must not be merged.

---

# 94. Container Security

Official container guidance should recommend:

```text
minimal runtime image
non-root user
only runtime-required files
no build secrets
graceful shutdown
read-only filesystem where practical
```

---

# 95. Vercel Security

The Vercel adapter must use current platform-supported mechanisms.

It must verify:

```text
public/static output
server function packaging
environment separation
source-map placement
middleware mapping
```

before stable release.

---

# 96. CLI Input Security

CLI inputs such as:

```text
project path
output path
template name
adapter name
port
host
```

must be validated before filesystem/process operations.

---

# 97. Scaffold Safety

`create-ranu` must not overwrite a non-empty directory unless the user has explicitly selected a safe supported overwrite behavior.

V1 default is refusal.

---

# 98. Template Security

Built-in templates must not contain:

```text
real credentials
unsafe default secrets
hard-coded production tokens
insecure remote scripts
```

---

# 99. Package Manager Execution

Scaffolding may invoke package managers.

Arguments must be passed through safe process-spawn APIs rather than shell-concatenating untrusted project names.

---

# 100. Shell Injection

Avoid:

```text
exec("npm install " + userInput)
```

for untrusted values.

Prefer argument arrays:

```text
spawn(command, args)
```

with controlled executable selection.

---

# 101. Filesystem Race Conditions

Security-sensitive file operations should minimize check-then-use races.

Where possible, operate on canonical paths and framework-owned directories.

---

# 102. Symlink Attacks in Cleanup

Cleanup/build operations must account for symlinks that could redirect writes/deletes outside intended roots.

Unsafe symlink targets should be rejected.

---

# 103. Dependency Lifecycle Scripts

Third-party package lifecycle scripts may execute during installation.

Ranu.js cannot make npm installation inherently safe.

Official documentation should recommend normal dependency hygiene.

---

# 104. Official Package Integrity

Official Ranu.js packages should use:

```text
protected release workflow
npm provenance where supported
2FA/secure publisher controls
signed/protected Git tags where practical
```

Detailed governance belongs to `16_OPEN_SOURCE_GOVERNANCE_AND_RELEASES.md`.

---

# 105. Typosquatting

Official documentation must clearly identify canonical package names:

```text
Ranu.js
create-ranu
@ranu/adapter-*
```

to reduce typosquatting risk.

---

# 106. Dependency Pinning

Repository lockfile is committed.

Critical build/release tooling updates should be reviewed intentionally.

---

# 107. Vulnerability Scanning

CI should run dependency vulnerability checks.

Security advisories must be triaged for actual Ranu.js exposure.

---

# 108. Denial of Service

Ranu.js should avoid obvious unbounded framework-controlled resource consumption.

Examples:

```text
unlimited buffered request body
unbounded route recursion
unbounded manifest parsing
unbounded error serialization
```

---

# 109. Request Timeouts

Generic Ranu.js Node runtime may support configurable timeout behavior.

Provider environments may enforce their own limits.

V1 does not need to invent one universal timeout policy, but runtime must not prevent operators from configuring safe limits.

---

# 110. Static Generation Resource Limits

SSG should avoid uncontrolled parallelism.

Build system should bound concurrency to avoid exhausting memory/file descriptors.

---

# 111. Route Complexity

Route compilation should detect conflicts deterministically and avoid pathological repeated scanning where possible.

Security testing may include large route sets.

---

# 112. Regex Safety

If user-defined middleware matchers or framework routing use regex, avoid constructing vulnerable catastrophic patterns from untrusted input.

Prefer constrained matcher syntax.

---

# 113. Development WebSocket/HMR Security

If HMR uses WebSocket or similar transport:

- bind according to dev host policy;
- validate internal protocol messages;
- do not expose arbitrary file read/write commands;
- treat browser messages as untrusted.

---

# 114. Cross-Origin Dev Access

If development server is exposed beyond localhost, origin/host checks may be required for sensitive dev endpoints.

This should be evaluated during implementation.

---

# 115. Cache Security

V1 has no broad framework cache API.

Any internal build/dev cache must not become a cross-user authorization cache.

Runtime request-specific private data must not be globally cached by default.

---

# 116. Request-Local State

Use request-scoped context mechanisms.

Do not store user request state in shared module globals.

---

# 117. Concurrency Security

Tests must verify concurrent requests do not leak:

```text
cookies
headers
params
locals
authorization context
```

---

# 118. Logging Security

Framework logs should redact or avoid:

```text
Authorization
Cookie
Set-Cookie values
secret env values
provider tokens
```

unless an explicitly secure debug workflow requires them.

---

# 119. URL Logging

URLs may contain sensitive query parameters.

Ranu.js should avoid promising that request URL logs are safe for secrets.

Applications should not place credentials in URLs.

---

# 120. Telemetry

Ranu.js V1 does not require framework telemetry.

If telemetry is introduced later, it requires a separate privacy/security specification and transparent user control.

---

# 121. Cryptography

Ranu.js should not invent custom cryptographic algorithms.

Use established platform/library primitives.

---

# 122. Randomness

Security-sensitive random values, if generated by Ranu.js, must use cryptographically secure randomness.

Do not use `Math.random()` for tokens/secrets.

---

# 123. Secret Generation

If `create-ranu` ever generates development secrets, use cryptographically secure randomness and clearly distinguish development vs production use.

Not required in V1.

---

# 124. Authentication Helpers

No built-in authentication framework is required for V1.

Future auth APIs require dedicated threat modeling.

---

# 125. Authorization

Ranu.js routing does not imply authorization.

A matched route remains accessible unless application middleware/route logic enforces access controls.

---

# 126. Multi-Tenant Security

Ranu.js V1 does not automatically isolate tenants.

Applications using host/path-based tenancy must validate tenant identity and authorization.

---

# 127. Database Security

Ranu.js does not automatically sanitize SQL/ORM queries.

Use parameterized queries and trusted database libraries.

---

# 128. Template Injection

React JSX rendering is not a general-purpose server template interpreter.

Ranu.js must not evaluate arbitrary user strings as JavaScript/templates.

---

# 129. Dynamic Import Security

Application/plugin dynamic imports are trusted code behavior.

Ranu.js should not create dynamic module paths directly from unvalidated request values.

---

# 130. Module Resolution

Build/runtime module resolution must remain inside intended dependency/project boundaries.

Unexpected arbitrary absolute request-driven imports are forbidden.

---

# 131. Error Boundary Security

React error boundaries may render application-defined error content.

Framework-provided production fallback content must remain sanitized.

---

# 132. Error Digest

If Ranu.js uses an error digest/ID, it must not encode raw secret/error content reversibly.

---

# 133. Static HTML Security

Generated static HTML is public.

Any data included during SSG must be treated as public deployment content.

---

# 134. Build Logs

Build logs may include content fetched/generated during SSG.

Application/plugin code should avoid logging secrets.

Ranu.js diagnostics should not print environment values unnecessarily.

---

# 135. CI Security Boundary

CI runners execute repository code.

Protected secrets must not be exposed to untrusted fork PR workflows.

---

# 136. Release Security Boundary

npm publishing credentials must be available only to protected release workflows.

No pull-request job may publish official packages.

---

# 137. GitHub Permissions

Release workflows should use least-privilege GitHub token permissions.

Detailed configuration belongs to governance/release implementation.

---

# 138. Security Test Categories

Mandatory V1 security regression suites:

```text
client-server-boundary
secret-leakage
path-traversal
static-file-escape
source-map-exposure
production-error-leakage
header-injection
cookie-serialization
proxy-trust
request-context-isolation
plugin-artifact-protection
CLI-delete-safety
deployment-secret-separation
```

---

# 139. Security Test Location

Repository:

```text
tests/security/
```

Package-local security tests may additionally live with owning packages.

---

# 140. Security Fixture Design

Use deliberately fake markers such as:

```text
RANU_TEST_PRIVATE_SECRET_8f7b2e
```

Never use real credentials in security fixtures.

---

# 141. Security Severity Model

Ranu.js uses:

```text
Critical
High
Medium
Low
```

for framework vulnerabilities.

---

# 142. Critical Severity

Examples:

```text
remote code execution through normal framework input
arbitrary filesystem read/write outside allowed root
private secrets automatically exposed to browser
official build artifact includes deployment credentials
```

---

# 143. High Severity

Examples:

```text
cross-request authorization/session state leak
path traversal requiring constrained conditions
production source/stack exposure with sensitive data
security boundary bypass in client/server graph
```

---

# 144. Medium Severity

Examples:

```text
limited information disclosure
unsafe behavior requiring unusual misconfiguration
security header/cookie issue with meaningful but constrained impact
```

---

# 145. Low Severity

Examples:

```text
minor hardening issue
low-impact information exposure
defense-in-depth improvement
```

---

# 146. Severity Context

Severity considers:

```text
exploitability
default configuration
remote/local access
required privileges
confidentiality
integrity
availability
user interaction
deployment prevalence
```

---

# 147. Vulnerability Handling

Security reports should be handled privately until a fix/coordinated disclosure is ready where appropriate.

Public issue trackers should not be the preferred channel for undisclosed exploitable vulnerabilities.

---

# 148. SECURITY.md

Before public beta, repository must contain:

```text
SECURITY.md
```

with:

- supported versions;
- private reporting method;
- expected report information;
- disclosure expectations.

---

# 149. Security Contact

The exact security reporting channel is defined before public beta.

Do not publish placeholder contact information as if operational.

---

# 150. Remediation Priority

Target response priority:

```text
Critical → immediate emergency handling
High → urgent
Medium → scheduled security fix
Low → normal hardening backlog
```

Exact SLA may be defined later by governance.

---

# 151. Security Release

Security fixes may require:

```text
patch release
advisory
CVE/GHSA coordination where applicable
upgrade instructions
mitigation guidance
```

---

# 152. Supported Versions

Security support policy is finalized by `16_OPEN_SOURCE_GOVERNANCE_AND_RELEASES.md`.

At minimum, stable current release must have a clear support statement.

---

# 153. Security Backports

Backports are based on supported-version policy and severity.

V1 does not promise indefinite support for all pre-1.0 versions.

---

# 154. Security Review Gates

Security review occurs:

```text
before public alpha — baseline boundary review
before beta — full V1 threat review
before RC — release audit
before 1.0 — final regression + artifact audit
```

---

# 155. Alpha Security Gate

Required:

- private/public env separation;
- client/server graph enforcement;
- path containment;
- production error sanitization baseline;
- no known Critical vulnerabilities;
- basic seeded secret scan.

---

# 156. Beta Security Gate

Required:

- complete mandatory security regression suite;
- plugin boundary tests;
- CLI delete safety;
- proxy trust behavior;
- source-map policy;
- deployment artifact scan;
- dependency vulnerability triage;
- operational `SECURITY.md`;
- no unresolved Critical/High defects.

---

# 157. RC Security Gate

Required:

- feature freeze;
- threat model review;
- packed package scan;
- provider deployment scan;
- production artifact scan;
- security tests green;
- no unresolved release-blocking advisory.

---

# 158. Stable Security Gate

Before `1.0.0`:

```text
all RC security gates
supported-version policy
security reporting channel
release workflow protections
npm publication protections
final secret scan
final path traversal suite
final production error suite
```

must pass.

---

# 159. Security Definition of Done — Feature

A security-sensitive feature is Done when:

1. trust boundary is identified;
2. untrusted inputs are identified;
3. validation occurs before privileged operation;
4. failure mode is safe;
5. production diagnostics do not leak secrets;
6. regression tests exist;
7. documentation states application responsibilities where relevant.

---

# 160. Security Definition of Done — Package

A package is security-ready when:

- dependency privileges are understood;
- no accidental public exports;
- no secret-bearing test data;
- filesystem writes are constrained;
- package tarball contains only intended files;
- security tests pass where applicable.

---

# 161. Security Definition of Done — Adapter

An adapter is security-ready when:

- target capability mapping is explicit;
- provider credentials remain deployment-only;
- public/private artifacts are separated;
- source maps follow policy;
- environment categories remain separate;
- target E2E passes;
- unsupported security-sensitive capability fails rather than silently downgrades.

---

# 162. Security Acceptance Criteria

This specification is complete when:

1. trust zones are defined;
2. protected assets are defined;
3. attacker classes are defined;
4. client/server boundary is security-critical;
5. private env is protected;
6. public env exposure is explicit;
7. hydration serialization requirements are defined;
8. XSS responsibilities are defined;
9. route/path traversal defenses are defined;
10. public static root is constrained;
11. `.env` publication is forbidden;
12. symlink escape is addressed;
13. request body limits are addressed;
14. header injection is addressed;
15. cookie security boundary is defined;
16. proxy trust is explicit;
17. request context isolation is required;
18. API application-security responsibilities are explicit;
19. build process trust is explicit;
20. source-map policy is defined;
21. production error sanitization is required;
22. plugin trust/sandbox limitation is explicit;
23. plugin artifact integrity is protected;
24. adapter credential separation is required;
25. dev server is local/trusted by default;
26. CLI delete/scaffold safety is defined;
27. supply-chain risks are acknowledged;
28. DoS resource boundaries are addressed;
29. mandatory security regression suites are defined;
30. vulnerability severity is defined;
31. security release gates are defined;
32. `SECURITY.md` is required before beta.

---

# 163. Locked V1 Security Decisions

The following are locked:

1. Browser input is untrusted.
2. Application server code is trusted code.
3. `ranu.config.ts` is trusted Node code.
4. Ranu.js plugins are trusted Node code and are not sandboxed.
5. Private environment variables remain server/build-only by default.
6. Only `RANU_PUBLIC_*` is browser-public through Ranu.js env handling.
7. Ranu.js never serializes the complete server environment into the browser.
8. Client-reachable transitive dependencies are subject to server/client enforcement.
9. Server-only modules cannot enter the client graph.
10. Sensitive Node built-ins cannot enter client bundles through Ranu.js polyfills.
11. Data crossing server-to-browser is treated as public.
12. Hydration serialization must prevent script breakout.
13. Framework-generated HTML must escape untrusted values.
14. Raw application HTML remains application responsibility.
15. Filesystem paths are canonicalized before containment authorization.
16. URL-derived filesystem access cannot escape allowed roots.
17. `.env*` files are never automatically public.
18. unsafe public symlink escape is rejected.
19. recursive cleanup is restricted to Ranu.js-owned generated paths.
20. request body handling cannot be unbounded by default.
21. header values must not permit response splitting.
22. forwarded headers are not universally trusted by default.
23. request-local state must not leak across requests.
24. API authentication/authorization/input validation remains application responsibility.
25. build/config/plugin execution may access build secrets and must be treated as trusted.
26. runtime-only secrets should not be exposed to build jobs unnecessarily.
27. public manifests cannot contain private secrets.
28. server source maps are non-public by default.
29. dev server is not a production server.
30. dev server should default to local binding.
31. production error responses are sanitized by default.
32. production runtime uses compiled artifacts/manifests rather than arbitrary source scanning.
33. supported plugin APIs cannot override protected framework invariants.
34. plugin artifact collisions fail.
35. deployment credentials never become application public env/artifacts.
36. adapters fail unsupported security-sensitive capabilities rather than silently downgrading.
37. scaffolding refuses unsafe non-empty target overwrite by default.
38. CLI uses safe process spawning rather than shell-concatenating untrusted input.
39. official packages use protected release mechanisms.
40. Ranu.js does not invent custom cryptography.
41. mandatory security regression tests are release gates.
42. unresolved Critical security defects block release.
43. unresolved High security defects block beta/stable unless formally reclassified with documented rationale.
44. `SECURITY.md` is required before public beta.
45. stable release requires final security artifact and secret scans.

---

# 164. Deferred Security Features

Deferred unless separately specified:

- plugin sandboxing;
- built-in WAF;
- built-in DDoS service;
- universal CSRF middleware;
- built-in authentication;
- built-in session framework;
- built-in authorization engine;
- automatic CSP generation;
- CSP nonce framework;
- built-in secret vault;
- automatic secret rotation;
- malware scanning;
- file-upload framework;
- Edge runtime threat model;
- Server Actions security model;
- RSC transport security model;
- framework cache security API;
- signed application manifests;
- package signature verification;
- runtime permission sandbox;
- multi-tenant isolation framework.

These are not V1 security defects because they are outside V1 scope.

---

# 165. Relationship to Build System

`06_BUILD_SYSTEM.md` owns implementation semantics for:

```text
server/client graphs
"use client"
server-only enforcement
browser env substitution
artifact generation
```

This document classifies those mechanisms as security boundaries.

---

# 166. Relationship to Plugin System

`07_PLUGIN_SYSTEM.md` owns plugin extension behavior.

This document defines the plugin trust model and protected security invariants.

---

# 167. Relationship to Deployment Adapters

`08_DEPLOYMENT_ADAPTERS.md` owns deployment capability behavior.

This document requires provider credentials, private runtime environment, and public browser artifacts to remain separated.

---

# 168. Relationship to Configuration and Environment

`10_CONFIGURATION_SYSTEM.md` and `11_ENVIRONMENT_VARIABLES.md` own environment loading/exposure semantics.

This document establishes those rules as secret-protection requirements.

---

# 169. Relationship to Testing Strategy

`14_TESTING_AND_QUALITY_STRATEGY.md` owns test architecture.

Mandatory security regression categories defined here must be implemented under that strategy.

---

# 170. Required Next Document

The next required planning document is:

```text
16_OPEN_SOURCE_GOVERNANCE_AND_RELEASES.md
```

It should lock:

- open-source license;
- repository governance;
- maintainer roles;
- contribution process;
- issue/PR process;
- RFC/ADR process;
- versioning;
- SemVer;
- pre-release naming;
- Changesets;
- npm publishing;
- provenance;
- GitHub Releases;
- release branches/tags;
- security support policy;
- deprecation policy;
- changelog;
- package ownership;
- release rollback/yank policy.

---

# 171. Final Security Baseline

Ranu.js V1 treats the browser and incoming HTTP data as untrusted, while application server code, config, plugins, and build tooling execute as trusted code.

Private is the default.

Server secrets and server-only modules must not enter browser bundles through framework behavior.

All server-to-browser serialization is treated as public and must be safely encoded.

Filesystem access is constrained through canonicalized paths and allowed roots.

Public assets cannot expose project-private files.

Production errors are sanitized.

Forwarded proxy headers are trusted only through explicit runtime/provider policy.

Request-local state is isolated.

Plugins are not sandboxed, but supported plugin APIs cannot compromise protected framework invariants accidentally.

Deployment adapters must preserve public/private environment and artifact boundaries.

The development server is intended for trusted local development and is not a production server.

Security regressions are tested continuously.

Critical vulnerabilities block release.

Public beta requires an operational private vulnerability-reporting process.

Ranu.js `1.0.0` requires successful security regression, secret-leakage, path-traversal, production-error, package-artifact, and deployment-artifact audits.

This document is the authoritative Ranu.js V1 security and threat-model baseline.

---

**End of 15_SECURITY_MODEL.md**
