# 11_ENVIRONMENT_VARIABLES.md

**Project:** Ranu.js — JavaScript/TypeScript Full-Stack Web Framework  
**Document Type:** Environment Variables & Secret Boundary Specification  
**Status:** Supporting Development Baseline  
**Date:** 2026-08-10  
**Depends On:** `05_SERVER_RUNTIME_SPEC.md`, `06_BUILD_SYSTEM.md`, `09_CLI_SPECIFICATION.md`, `10_CONFIGURATION_SYSTEM.md`  
**Primary V1 Runtime:** Node.js  
**Public Environment Prefix:** `RANU_PUBLIC_`

---

# 1. Purpose

This document consolidates the Ranu.js V1 environment-variable model.

It defines:

- environment file names;
- loading precedence;
- process environment behavior;
- public vs private variables;
- build-time vs runtime variables;
- browser exposure;
- `RANU_PUBLIC_*`;
- static-generation environment behavior;
- runtime server secrets;
- environment validation;
- deployment integration;
- secret handling;
- diagnostics;
- development reload behavior;
- testing and security requirements.

This document does **not** replace the authoritative environment rules already defined by:

```text
05_SERVER_RUNTIME_SPEC.md
06_BUILD_SYSTEM.md
09_CLI_SPECIFICATION.md
10_CONFIGURATION_SYSTEM.md
```

If a contradiction exists, those owning subsystem specifications take precedence.

---

# 2. Environment Model

Ranu.js V1 has three primary environment classes:

```text
1. Build-Time Private
2. Runtime Server-Private
3. Build-Time Browser-Public
```

Conceptually:

```text
Environment
   │
   ├── Private Build Values
   │      └── config / build / SSG
   │
   ├── Private Runtime Values
   │      └── Node server / API / SSR / middleware
   │
   └── RANU_PUBLIC_* Values
          └── client/browser bundle
```

---

# 3. Core Principles

## ENV-P01 — Private by Default

Any variable without the Ranu.js public prefix is private by default.

## ENV-P02 — Explicit Browser Exposure

Only variables prefixed with:

```text
RANU_PUBLIC_
```

may be exposed by Ranu.js to browser code.

## ENV-P03 — Build and Runtime Are Different

A variable available during `Ranu.js build` is not automatically a runtime variable.

A runtime secret available to `Ranu.js start` is not automatically embedded into browser output.

## ENV-P04 — Process Environment Wins

Explicit process/CI/deployment environment values take precedence over dotenv files.

## ENV-P05 — No Full Environment Injection

Ranu.js must never inject the entire `process.env` object into browser bundles.

## ENV-P06 — No Secret Logging

Environment values must not be dumped into normal diagnostics.

## ENV-P07 — Static Generation Uses Build Environment

SSG executes during build and therefore sees build-time server environment, not request-time environment.

## ENV-P08 — Deployment Providers Are Not the Source of Truth

Provider-specific environment systems map into the Ranu.js model; they do not redefine it.

---

# 4. Supported Environment Files

Ranu.js V1 supports the following project-root environment files:

```text
.env
.env.local
.env.development
.env.development.local
.env.production
.env.production.local
```

No separate framework-specific environment directory is required.

---

# 5. Project Root

Environment files are resolved relative to the resolved Ranu.js application root.

They are not searched recursively across unrelated parent projects.

Monorepo applications use the environment files belonging to the resolved Ranu.js app unless explicitly configured otherwise by future functionality.

---

# 6. Mode Selection

Framework modes:

```text
development
production
```

Command mapping:

```text
Ranu.js dev   → development
Ranu.js build → production
Ranu.js start → production artifact/runtime
```

---

# 7. Development Environment Files

For:

```bash
Ranu.js dev
```

the applicable dotenv sources are:

```text
.env
.env.local
.env.development
.env.development.local
```

---

# 8. Production Build Environment Files

For:

```bash
Ranu.js build
```

the applicable dotenv sources are:

```text
.env
.env.local
.env.production
.env.production.local
```

---

# 9. Production Runtime Environment

For:

```bash
Ranu.js start
```

Ranu.js primarily relies on the process environment supplied at runtime.

The completed production artifact must not require dotenv files to exist in production.

A local standalone deployment may still load dotenv files if the runtime explicitly supports that behavior, but deployment environments should prefer real process-level runtime variables.

---

# 10. Precedence

The authoritative precedence from highest to lowest is:

```text
1. Existing process environment
2. .env.<mode>.local
3. .env.local
4. .env.<mode>
5. .env
```

Example in production build:

```text
process.env
→ .env.production.local
→ .env.local
→ .env.production
→ .env
```

Higher-priority values override lower-priority values.

---

# 11. Existing Process Environment

If CI defines:

```text
DATABASE_URL=ci-value
```

and `.env.production` defines:

```text
DATABASE_URL=file-value
```

the effective value is:

```text
ci-value
```

Ranu.js must not overwrite explicit process environment values with dotenv files.

---

# 12. Public Environment Prefix

The fixed public prefix is:

```text
RANU_PUBLIC_
```

Examples:

```text
RANU_PUBLIC_API_ORIGIN
RANU_PUBLIC_ANALYTICS_ID
RANU_PUBLIC_APP_NAME
```

These values may be exposed to browser code.

---

# 13. Public Prefix Is Not Configurable

V1 does not allow replacing:

```text
RANU_PUBLIC_
```

with another prefix.

This avoids:

- ecosystem inconsistency;
- accidental exposure;
- plugin disagreement;
- migration problems.

---

# 14. Private Variables

Examples:

```text
DATABASE_URL
SESSION_SECRET
JWT_SECRET
PAYMENT_SECRET
SMTP_PASSWORD
API_PRIVATE_KEY
```

These remain server/build-only unless application code explicitly leaks them.

---

# 15. Browser Access

Client/browser code should use the canonical public environment API defined by the build implementation.

Preferred V1 form:

```ts
import.meta.env.RANU_PUBLIC_API_ORIGIN
```

The exact syntax must remain consistent with `06_BUILD_SYSTEM.md`.

---

# 16. Client Environment Restriction

Client code must not access private values such as:

```ts
process.env.DATABASE_URL
```

or:

```ts
import.meta.env.DATABASE_URL
```

and receive the real server value.

Ranu.js must reject or leave such values unavailable according to the build contract.

It must never silently expose the private value.

---

# 17. No `process.env` Browser Serialization

This is forbidden:

```ts
const env = process.env;
```

becoming a browser object containing server environment values.

Ranu.js must not generate a complete client-side environment object from server process state.

---

# 18. Dynamic Environment Access in Client Code

Patterns such as:

```ts
process.env[name]
```

cannot be used to retrieve arbitrary Ranu.js private values in browser code.

Only explicitly supported public environment references may be substituted.

---

# 19. Build-Time Public Values

`RANU_PUBLIC_*` values used by browser code are treated as build-time values.

Example:

```text
RANU_PUBLIC_API_ORIGIN=https://api.example.com
```

during:

```bash
Ranu.js build
```

may become embedded into generated browser JavaScript.

Changing the runtime server environment afterward does not change that browser value.

A rebuild is required.

---

# 20. Runtime Server Variables

Private server variables may remain unresolved until production runtime.

Example:

```ts
const databaseUrl = process.env.DATABASE_URL;
```

in SSR/API/server code may read the value supplied when:

```bash
Ranu.js start
```

runs.

---

# 21. Build-Time Private Variables

Private build-time variables may be used by:

```text
ranu.config.ts
build plugins
generateStaticParams()
static rendering
generateMetadata() during SSG
build-time application code
```

They remain private unless the application explicitly renders/exposes them.

---

# 22. Static Generation

Static generation runs during:

```bash
Ranu.js build
```

Therefore:

```text
SSG environment = build environment
```

Example:

```ts
export const render = "static";
```

may read a build-time private API token to fetch CMS data.

The token must not automatically appear in generated HTML or browser bundles.

---

# 23. Static HTML Caveat

If application code explicitly renders a secret:

```tsx
return <div>{process.env.SECRET}</div>;
```

during SSG, the secret will become part of generated HTML.

Ranu.js cannot infer all semantic leaks.

The framework protects environment boundaries; application code remains responsible for what it renders.

---

# 24. SSR Environment

Server-rendered requests may access runtime private variables.

Conceptual:

```ts
export default async function Page() {
  const db = connect(process.env.DATABASE_URL);
  ...
}
```

The browser does not automatically receive `DATABASE_URL`.

---

# 25. API Route Environment

API route handlers may read runtime private variables:

```ts
export async function POST(request: Request) {
  const secret = process.env.API_SECRET;
  ...
}
```

These remain server-side unless explicitly included in the returned response.

---

# 26. Middleware Environment

Node-based Ranu.js V1 middleware may access server environment values according to the Node runtime.

If future middleware is moved to a non-Node runtime, capability validation must ensure environment and runtime compatibility.

---

# 27. Config Environment

`ranu.config.ts` executes after environment resolution for the selected command/mode.

Conceptual:

```ts
export default defineConfig({
  deployment: {
    // may use process.env during build/deploy setup
  }
});
```

Config remains trusted build-side code.

---

# 28. Plugin Environment

Build/dev plugins execute as trusted Node.js code and may read environment values.

Plugins must not automatically publish private values into client assets.

Ranu.js plugin/build boundary validation remains applicable.

---

# 29. Deployment Adapter Environment

Deployment adapters may read deployment-time provider credentials and configuration.

Provider credentials are deployment secrets and must not enter the generic Ranu.js public build artifact.

---

# 30. Provider Mapping

Deployment platforms may expose environment variables through provider-specific settings.

Adapters map those into the Ranu.js runtime/build model.

Examples:

```text
Vercel runtime env
container ENV
systemd environment
Docker/Kubernetes secrets
CI environment
```

The Ranu.js public/private classification remains unchanged.

---

# 31. Preview Environments

Preview deployments may use different environment values from production.

Example:

```text
Preview:
  DATABASE_URL=preview-db

Production:
  DATABASE_URL=production-db
```

This is deployment configuration.

Ranu.js does not hard-code environment names such as `preview` into core rendering semantics.

---

# 32. Build-Time Preview Public Values

If preview deployment requires a different:

```text
RANU_PUBLIC_API_ORIGIN
```

the preview build must use that value during build.

Because public environment values are build-time, preview/public values must be known before browser assets are finalized.

---

# 33. Required Variables

Ranu.js V1 may support application-level validation of required environment variables.

Recommended initial approach:

Application config/module validates them explicitly.

Example:

```ts
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}
```

A framework-native required-env schema is optional and not required for core V1.

---

# 34. Future Typed Environment Schema

Future Ranu.js may support:

```ts
env: {
  server: {
    DATABASE_URL: string()
  },
  public: {
    RANU_PUBLIC_API_ORIGIN: url()
  }
}
```

This is deferred unless separately approved.

V1 does not require a built-in environment-schema DSL.

---

# 35. TypeScript Environment Typing

Ranu.js may generate declarations for known framework-public variables.

Conceptual:

```ts
interface ImportMetaEnv {
  readonly RANU_PUBLIC_API_ORIGIN?: string;
}
```

Automatic application-specific variable type inference is optional.

---

# 36. Generated Environment Types

If generated types are implemented, they belong under:

```text
.ranu/types/
```

They are generated artifacts, not source-of-truth files.

---

# 37. Environment Values Are Strings

At the process/dotenv boundary, environment values are strings or absent.

Ranu.js must not silently coerce:

```text
"false" → false
"3000" → 3000
```

except for explicitly typed framework configuration values parsed through a documented API.

Application code owns semantic parsing.

---

# 38. Boolean Parsing Example

Application should use an explicit parser:

```ts
const featureEnabled =
  process.env.FEATURE_ENABLED === "true";
```

Ranu.js does not invent implicit boolean conversion for arbitrary application env values.

---

# 39. Number Parsing Example

Application should explicitly parse:

```ts
const timeout = Number(process.env.API_TIMEOUT ?? "5000");
```

Validation remains application-owned unless a future typed-env subsystem exists.

---

# 40. Environment File Syntax

Ranu.js dotenv parsing should support conventional simple:

```text
KEY=value
```

syntax.

Support for advanced shell syntax must not be assumed.

The implementation may use a well-tested dotenv parser.

---

# 41. Comments

Environment files should support conventional comment syntax where the selected dotenv parser supports it.

Example:

```text
# Database
DATABASE_URL=...
```

---

# 42. Quoted Values

Quoted dotenv values may be supported according to the selected parser.

Ranu.js should not implement a second incompatible parser if an established parser is used.

---

# 43. Variable Expansion

Automatic expansion such as:

```text
API_URL=${BASE_URL}/api
```

is not required in V1.

If added later, it requires one documented expansion order and cycle behavior.

---

# 44. Empty Values

Example:

```text
API_KEY=
```

means the variable exists with an empty string.

It is different from being absent.

Ranu.js should preserve this distinction.

---

# 45. Missing Values

A missing variable resolves as:

```ts
undefined
```

through normal Node environment access.

Ranu.js should not replace missing arbitrary private values with empty strings.

---

# 46. `.env` Files and Git

Project templates/documentation should recommend ignoring secret-bearing local files.

Recommended `.gitignore` baseline may include:

```text
.env.local
.env.*.local
```

Whether `.env` itself is committed depends on project policy; secret values should never be committed.

---

# 47. Example Environment File

Projects may include:

```text
.env.example
```

with variable names and safe placeholder values.

Ranu.js should encourage this pattern for open-source projects.

---

# 48. `.env.example`

Example:

```text
DATABASE_URL=
SESSION_SECRET=
RANU_PUBLIC_API_ORIGIN=http://localhost:3000
```

It must not contain real secrets.

---

# 49. Public Repository Rule

The Ranu.js framework repository itself must never commit real:

```text
tokens
API keys
deployment credentials
signing keys
registry secrets
```

Example/test secrets should be clearly fake.

---

# 50. Diagnostics

Required conceptual environment diagnostic codes include:

```text
RANU_ENV_INVALID_FILE
RANU_ENV_PUBLIC_PRIVATE_VIOLATION
RANU_ENV_PRIVATE_CLIENT_ACCESS
RANU_ENV_INVALID_PUBLIC_NAME
RANU_ENV_REQUIRED_MISSING
RANU_ENV_LOAD_FAILED
```

Some errors may remain under build/config diagnostic namespaces where those subsystems own enforcement.

---

# 51. Private Client Access Diagnostic

Example:

```text
RANU_ENV_PRIVATE_CLIENT_ACCESS

Client module attempted to access a private environment variable.

Module:
  app/dashboard/Client.tsx

Variable:
  DATABASE_URL

Only RANU_PUBLIC_* variables are browser-public.
```

---

# 52. Missing Required Variable Diagnostic

If Ranu.js later provides required-env validation:

```text
RANU_ENV_REQUIRED_MISSING

Required environment variable is missing:

  DATABASE_URL

Context:
  production server
```

V1 may rely on application validation instead.

---

# 53. Invalid Public Name

A public variable must begin exactly with:

```text
RANU_PUBLIC_
```

The prefix alone without a meaningful suffix should be rejected or discouraged.

Example invalid:

```text
RANU_PUBLIC_
```

---

# 54. Environment Debug Output

Debug mode may show variable names/sources:

```text
DATABASE_URL → process
RANU_PUBLIC_API_ORIGIN → .env.production
```

but should not show secret values.

---

# 55. Redaction

Diagnostics/logging should redact likely sensitive values.

Example:

```text
DATABASE_URL=[REDACTED]
```

Even public environment values should not be dumped unnecessarily.

---

# 56. Development Reload

Changes to environment files during:

```bash
Ranu.js dev
```

may require a controlled restart/rebuild.

Ranu.js must not assume all environment changes can be hot-reloaded safely.

---

# 57. Public Env Development Change

Changing:

```text
RANU_PUBLIC_*
```

during development requires invalidating/rebuilding affected client modules.

A controlled dev restart or full client reload is acceptable.

---

# 58. Private Server Env Development Change

Changing a private environment value may require server-module invalidation or dev server restart.

Correctness is more important than preserving process state.

---

# 59. Production Runtime Env Change

Changing process environment variables of a running Node process does not automatically update the process.

Operators generally restart/redeploy the server with new environment values.

Ranu.js does not promise live secret mutation.

---

# 60. Build Cache Invalidation

Build cache keys must account for public environment values that affect browser output.

Build-time private values that affect static generation or config must also invalidate relevant cached output where Ranu.js can identify them.

A conservative invalidation policy is acceptable.

---

# 61. Secret Values in Cache

Build caches must not intentionally expose secret values through human-readable metadata.

If hashes are used for invalidation, they should not be logged as raw secret substitutes without analysis.

---

# 62. Environment and Source Maps

Environment values must not be inserted into source maps except where they are part of generated source/client output.

Server source maps remain private by default.

---

# 63. Environment and Manifests

Public manifests must not contain private environment values.

Internal manifests should contain environment values only if absolutely required; prefer runtime environment lookup instead.

---

# 64. Build Descriptor

The generic build descriptor may record:

```text
which public variables affected browser build
required runtime variable names if future validation exists
```

but not secret values.

---

# 65. Static Output Secret Scan

Security tests should seed a fake secret:

```text
RANU_TEST_PRIVATE_SECRET_12345
```

and ensure it does not appear unexpectedly in:

```text
client JS
CSS
browser manifests
public static assets
source maps
```

---

# 66. Public Value Scan

A seeded:

```text
RANU_PUBLIC_TEST_VALUE
```

may legitimately appear in client output when referenced by client code.

This verifies the intended public path.

---

# 67. Unreferenced Public Variables

Ranu.js should not necessarily inject every `RANU_PUBLIC_*` value into every bundle.

Preferred behavior:

```text
only referenced public variables become client output
```

where the build tool permits it.

---

# 68. Server Runtime Security

Private environment variables remain accessible only to trusted server application code.

Ranu.js cannot prevent server application code from intentionally returning them in a response.

Framework security protects boundaries, not malicious application logic.

---

# 69. Plugin Security

Plugins execute trusted Node code.

A malicious plugin can read process environment values.

The Ranu.js plugin system is not a secret sandbox.

Users must treat plugin installation as a code-trust decision.

---

# 70. Build Dependency Security

Build tools and config packages may also read environment variables because they execute with build-process privileges.

Open-source projects should minimize unnecessary build dependencies.

---

# 71. Deployment Credentials

Credentials used to publish Ranu.js to providers or npm are not application runtime variables by default.

Examples:

```text
VERCEL_TOKEN
NPM_TOKEN
GITHUB_TOKEN
```

They belong to CI/deployment processes and must not become application browser data.

---

# 72. CI Environment

CI should inject secrets through its secret-management system.

Do not generate permanent secret files inside the repository unless the CI system explicitly requires temporary files and cleans them safely.

---

# 73. Container Environment

Container runtime variables may be supplied through:

```text
docker run -e
Docker Compose environment
Kubernetes Secret/ConfigMap
orchestrator environment
```

Ranu.js reads them through Node `process.env`.

---

# 74. Vercel Environment

The Vercel adapter maps Vercel build/runtime environment configuration into the Ranu.js environment model.

Public variables needed by client code must exist at build time.

Private runtime variables must remain server-side.

---

# 75. Static Hosting Environment

A static-only Ranu.js deployment has no server runtime environment after deployment.

All required dynamic browser configuration must therefore be available at build time or through an application-defined external runtime config service.

Ranu.js V1 does not provide mutable runtime browser env automatically.

---

# 76. Runtime Public Config Deferred

Ranu.js V1 does not automatically generate:

```text
/window.__RANU_ENV__/
runtime-config.json
```

for mutable public config.

If this capability is added later, it requires a separate security/cache contract.

---

# 77. Test Environment

Ranu.js core does not require a special framework mode named:

```text
test
```

Test runners may set:

```text
NODE_ENV=test
```

or application variables independently.

Framework lifecycle mode remains development or production unless a future testing mode is explicitly specified.

---

# 78. `NODE_ENV`

Ranu.js may set or expect:

```text
NODE_ENV=development
```

for dev and:

```text
NODE_ENV=production
```

for production build/start where compatible.

Applications should not use `NODE_ENV` as a substitute for all deployment environment distinctions.

---

# 79. Staging

Staging is not a framework rendering mode.

Example:

```text
APP_ENV=staging
```

may be an application/deployment value while Ranu.js still runs a production build/runtime.

---

# 80. Environment Validation Timing

Validation should occur at the earliest meaningful stage.

Examples:

```text
public/private browser violation → build/dev compile time
config-required variable → config load
runtime-required database secret → server startup or first use
SSG-required variable → build/static generation
```

---

# 81. No Universal Required-Env Check

Ranu.js cannot know every environment variable an arbitrary dependency may read.

A future explicit environment schema can improve this, but V1 should not pretend it can discover every requirement automatically.

---

# 82. Environment API Surface

Ranu.js V1 does not require a new public import such as:

```ts
import { env } from "hfx/env";
```

Server code uses:

```ts
process.env
```

Client code uses the build-supported `RANU_PUBLIC_*` access contract.

This avoids unnecessary abstraction.

---

# 83. No `hfx/env` Package in V1

A dedicated stable:

```text
hfx/env
```

subpath is not required for V1.

If future typed/validated environment functionality is introduced, public API review is required.

---

# 84. Environment File Parsing Dependency

Ranu.js should use an established dotenv parser rather than inventing an incompatible parser.

The parser is an implementation detail.

Public behavior must remain consistent with this specification.

---

# 85. Error Handling

Invalid environment files should fail clearly.

Ranu.js should identify:

```text
file
line where available
parse problem
```

without printing neighboring secret values unnecessarily.

---

# 86. Environment File Encoding

UTF-8 should be the expected environment-file encoding.

Invalid encoding should produce a clear load/parse diagnostic.

---

# 87. Duplicate Keys in One File

If the chosen dotenv parser permits duplicate keys, Ranu.js should define deterministic behavior.

Recommended:

```text
last declaration in the same file wins
```

before cross-file precedence is applied.

This must be covered by tests.

---

# 88. Case Sensitivity

Environment variable names are treated according to Node/platform behavior.

Ranu.js should avoid defining two framework variables differing only by case.

Official Ranu.js environment names are uppercase.

---

# 89. Framework-Owned Environment Names

Potential Ranu.js-owned names include only values explicitly documented by Ranu.js.

The public prefix:

```text
RANU_PUBLIC_
```

is reserved for browser-public application values.

Other `RANU_*` names used internally must be documented before becoming user-facing.

---

# 90. `PORT` and `HOST`

Runtime operational variables:

```text
PORT
HOST
```

may affect:

```bash
Ranu.js start
```

according to `09_CLI_SPECIFICATION.md`.

They are not browser-public merely because they affect the server.

---

# 91. Host/Port Precedence

For runtime host/port:

```text
CLI flag
→ process environment
→ Ranu.js config
→ framework default
```

The exact precedence remains authoritative in CLI/config specifications.

---

# 92. Environment and Build ID

Environment values that materially alter browser/static output may change build output and build ID behavior.

The exact build ID algorithm is implementation-specific.

Build IDs must never contain raw environment values.

---

# 93. Environment and Reproducibility

Equivalent source/dependencies/config/environment inputs should produce functionally equivalent output.

Different environment inputs are valid reasons for different output.

---

# 94. Environment Example — Local Development

`.env.local`:

```text
DATABASE_URL=postgres://localhost/hfxapp
SESSION_SECRET=local-dev-secret
RANU_PUBLIC_API_ORIGIN=http://localhost:3000
```

Server:

```ts
process.env.DATABASE_URL
```

Client:

```ts
import.meta.env.RANU_PUBLIC_API_ORIGIN
```

---

# 95. Environment Example — Production

Build environment:

```text
RANU_PUBLIC_API_ORIGIN=https://api.example.com
CMS_BUILD_TOKEN=...
```

Runtime environment:

```text
DATABASE_URL=...
SESSION_SECRET=...
```

The browser receives only public values intentionally referenced in client code.

---

# 96. Environment Example — SSG

```ts
export const render = "static";

export default async function Page() {
  const token = process.env.CMS_BUILD_TOKEN;

  const data = await loadCmsData(token);

  return <Article title={data.title} />;
}
```

`CMS_BUILD_TOKEN` is used during build but must not appear in browser output unless explicitly rendered.

---

# 97. Environment Example — SSR

```ts
export const render = "server";

export default async function Page() {
  const databaseUrl = process.env.DATABASE_URL;

  const userCount = await getUserCount(databaseUrl);

  return <p>{userCount}</p>;
}
```

Only the resulting `userCount` reaches HTML.

---

# 98. Environment Example — Client

```tsx
"use client";

export function ApiInfo() {
  return (
    <span>
      {import.meta.env.RANU_PUBLIC_API_ORIGIN}
    </span>
  );
}
```

Using `DATABASE_URL` in this module must not expose the private value.

---

# 99. Environment Test Strategy

Required layers:

```text
dotenv parser integration
precedence tests
config environment tests
build environment tests
client boundary tests
SSG tests
runtime server tests
deployment adapter tests
secret leakage scans
cross-platform tests
```

---

# 100. Precedence Test Matrix

At minimum:

- only `.env`;
- `.env.local` override;
- `.env.development` override;
- `.env.development.local` override;
- `.env.production` override;
- `.env.production.local` override;
- process env override;
- empty string override;
- missing value.

---

# 101. Client Security Test Matrix

At minimum:

- public variable in client succeeds;
- private variable direct access does not expose value;
- private variable dynamic access does not expose value;
- `process.env` object is not serialized;
- server-only env stays out of client bundle;
- seeded secret absent from public build;
- plugin-generated client module follows same rules.

---

# 102. Static Generation Test Matrix

At minimum:

- build-time private env available;
- public env available;
- request-only runtime env assumptions rejected where applicable;
- static HTML secret scan;
- public variable only appears if explicitly rendered/referenced;
- changed build env invalidates output.

---

# 103. Runtime Test Matrix

At minimum:

- runtime `DATABASE_URL` visible to server code;
- changed runtime env after rebuild works for SSR/API without rebuilding when the value is runtime-only;
- public browser env does not change without rebuild;
- missing runtime secret handled by application/startup validation;
- env unavailable to client.

---

# 104. Dev Reload Test Matrix

At minimum:

- `.env` edit;
- `.env.local` edit;
- public env edit;
- private env edit;
- controlled restart/rebuild;
- no duplicate watchers;
- corrected env recovers.

---

# 105. Deployment Test Matrix

At minimum:

- standalone Node process env;
- Docker env;
- Vercel build env;
- Vercel runtime env;
- preview/public env;
- production/private env;
- no provider credential in public artifact.

---

# 106. Cross-Platform Tests

At minimum:

```text
Linux
Windows
```

Validate:

- environment file discovery;
- process environment precedence;
- case behavior where relevant;
- path handling;
- dotenv loading.

---

# 107. Environment Acceptance Criteria

This supporting specification is complete when:

1. `.env` files are project-root scoped.
2. development and production file sets are defined.
3. precedence is deterministic.
4. process environment wins.
5. `RANU_PUBLIC_*` is the only core browser-public prefix.
6. the prefix is not configurable.
7. other environment variables are private by default.
8. client builds never receive the entire `process.env`.
9. private client access never exposes the real value.
10. browser-public values are build-time.
11. runtime private server values may change without rebuilding when not used in build/static output.
12. SSG uses build-time environment.
13. SSR/API/middleware use server environment according to runtime.
14. raw secret values are not printed in normal diagnostics.
15. public manifests do not contain private env values.
16. static/client output passes seeded-secret scans.
17. `.env*` files are never copied to public output automatically.
18. config/plugins/adapters remain trusted Node code.
19. Ranu.js does not claim plugin secret sandboxing.
20. environment edits during dev trigger safe invalidation/restart.
21. deployment adapters preserve the same public/private model.
22. static-only deployments do not pretend to have runtime server env.
23. V1 does not require a new `hfx/env` public package.
24. no built-in typed environment DSL is required for V1.
25. required environment security tests pass.

---

# 108. Locked V1 Environment Decisions

The following are locked:

1. Ranu.js environment variables are private by default.
2. Browser-public variables use the fixed `RANU_PUBLIC_` prefix.
3. The public prefix is not configurable in V1.
4. Existing process environment overrides dotenv files.
5. Supported core files include `.env`, `.env.local`, `.env.development`, `.env.development.local`, `.env.production`, and `.env.production.local`.
6. Environment files resolve from the Ranu.js application root.
7. Development and production use mode-specific files.
8. Public environment values used in browser code are build-time.
9. Private runtime server values may remain runtime-resolved.
10. SSG runs with build-time server environment.
11. SSR/API/middleware may access runtime server environment.
12. Ranu.js never injects all of `process.env` into browser code.
13. Private environment access from client-reachable code must not expose the secret.
14. Environment values are strings or absent at the raw boundary.
15. Ranu.js does not silently coerce arbitrary application env values into booleans/numbers.
16. Variable expansion is not required in V1.
17. `.env*` files are not public assets.
18. Production build/public manifests must not contain private env values by default.
19. Provider credentials are deployment secrets, not application public env.
20. Plugins/build tools execute trusted Node code and can read process env; they are not sandboxed.
21. V1 does not require a dedicated `hfx/env` public API.
22. V1 does not require a built-in environment schema DSL.
23. Dev environment changes may require controlled restart.
24. Production runtime environment changes normally require process restart/redeploy.
25. Environment behavior remains subordinate to the owning build/runtime/config/CLI specifications if a conflict is discovered.

---

# 109. Deferred Environment Features

Deferred unless separately approved:

- custom public prefixes;
- `hfx/env` public package;
- typed environment schema DSL;
- automatic environment type inference;
- runtime mutable browser config;
- remote config service;
- built-in secret vault;
- automatic provider secret synchronization;
- dotenv variable expansion;
- encrypted `.env` format;
- live runtime secret reload;
- per-route environment declarations;
- Edge-runtime environment abstraction;
- automatic required-variable discovery.

---

# 110. Relationship to Build System

`06_BUILD_SYSTEM.md` remains authoritative for:

```text
client substitution
server/client graph safety
build-time public values
private client access diagnostics
secret leak prevention
```

This document consolidates those rules.

---

# 111. Relationship to Server Runtime

`05_SERVER_RUNTIME_SPEC.md` remains authoritative for runtime server execution.

Node server code uses normal server environment access.

---

# 112. Relationship to CLI

`09_CLI_SPECIFICATION.md` remains authoritative for command mode, process environment, host/port precedence, and dev restart behavior.

---

# 113. Relationship to Configuration System

`10_CONFIGURATION_SYSTEM.md` remains authoritative for environment loading during config resolution and for the fixed public prefix decision.

---

# 114. Relationship to Deployment Adapters

`08_DEPLOYMENT_ADAPTERS.md` remains authoritative for mapping provider build/runtime environment systems to Ranu.js deployments.

---

# 115. Numbering Note

This file is a **supporting environment specification**, not the numbered core successor to `10_CONFIGURATION_SYSTEM.md`.

Because `11_PUBLIC_API_SPECIFICATION.md` already exists as part of the audited core document sequence, this environment file should not replace or renumber that document.

For repository organization, one of the following should be used:

```text
11_ENVIRONMENT_VARIABLES.md
```

as a supplementary file by explicit project choice, or later rename it to a non-conflicting supporting-doc namespace.

The authoritative core document sequence remains controlled by the project audit/development plan.

---

# 116. Final Environment Baseline

Ranu.js V1 uses a simple environment model.

Private is the default.

Only:

```text
RANU_PUBLIC_*
```

values are browser-public through Ranu.js's environment system.

Public browser values are build-time.

Private server variables may remain runtime-resolved under Node.js.

Static generation uses build-time server environment.

Existing process environment values override dotenv files.

Environment files are project-root scoped and mode-aware.

Ranu.js never injects the complete process environment into browser bundles and never treats provider secret systems as a reason to weaken its server/client boundary.

This document consolidates the Ranu.js V1 environment and secret-handling rules without changing the authoritative behavior defined by the build, runtime, CLI, and configuration specifications.

---

**End of 11_ENVIRONMENT_VARIABLES.md**
