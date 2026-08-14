# 17_DOCUMENTATION_AND_EXAMPLES_PLAN.md

**Project:** Ranu.js — JavaScript/TypeScript Full-Stack Web Framework  
**Document Type:** Documentation, Learning & Examples Specification  
**Status:** Implementation Baseline  
**Date:** 2026-08-10  
**Depends On:** `00_FRAMEWORK_VISION.md` through `16_OPEN_SOURCE_GOVERNANCE_AND_RELEASES.md`  
**Primary Audience:** Application developers, framework adopters, plugin authors, deployment adapter authors, contributors  
**Documentation Language:** English  
**Primary V1 Runtime:** Node.js  
**Primary V1 Renderer:** React

---

# 1. Purpose

This document defines the documentation and examples system required to make Ranu.js usable as a public open-source full-stack JavaScript/TypeScript framework.

It specifies:

- documentation goals;
- audience groups;
- information architecture;
- Getting Started flow;
- installation documentation;
- project structure documentation;
- routing documentation;
- rendering documentation;
- server runtime documentation;
- configuration and environment documentation;
- plugin documentation;
- deployment documentation;
- CLI documentation;
- public API reference;
- examples;
- tutorials;
- troubleshooting;
- migration documentation;
- versioned documentation;
- documentation testing;
- documentation release gates;
- documentation contribution rules;
- framework dogfooding strategy.

Documentation is part of the Ranu.js product, not an optional post-release task.

---

# 2. Documentation Objective

A developer discovering Ranu.js should be able to move through:

```text
Discover Ranu.js
→ Understand what it is
→ Install it
→ Create an application
→ Understand the project structure
→ Add routes
→ Render pages
→ Build server APIs
→ Use configuration/environment variables
→ Build for production
→ Deploy
→ Extend with plugins/adapters
→ Debug problems
→ Upgrade versions
```

without needing to inspect framework source code.

---

# 3. Documentation Principles

## DOC-P01 — Documentation Is Product Surface

A stable feature is incomplete without documentation.

## DOC-P02 — Task First

Developers should be able to solve common tasks before reading implementation theory.

## DOC-P03 — Progressive Disclosure

Start simple, then expose advanced behavior.

## DOC-P04 — One Canonical Answer

Avoid multiple contradictory pages describing the same behavior.

## DOC-P05 — Specification Alignment

Documentation must reflect the locked framework specifications and actual implementation.

## DOC-P06 — Tested Examples

Important documentation code must compile or run in CI.

## DOC-P07 — Public API Only

User documentation must not teach unsupported internal imports.

## DOC-P08 — Version Awareness

Documentation must make version-specific behavior clear.

## DOC-P09 — Error-Oriented Help

Common framework errors should lead developers toward actionable documentation.

## DOC-P10 — Documentation Evolves With Releases

Breaking changes require documentation and migration updates before release.

---

# 4. Documentation Audiences

Ranu.js documentation serves five primary audiences:

```text
A1 — New Ranu.js application developer
A2 — Experienced JavaScript/TypeScript framework developer
A3 — Plugin author
A4 — Deployment adapter/platform author
A5 — Ranu.js framework contributor
```

---

# 5. New Application Developer

Needs:

```text
installation
starter project
routing
layouts
data/server access
API routes
environment variables
build
deployment
troubleshooting
```

This is the highest-priority documentation audience.

---

# 6. Experienced Framework Developer

Needs quick mapping from familiar concepts to Ranu.js:

```text
filesystem routing
SSR
SSG
client rendering
middleware
config
plugins
adapters
CLI
```

Documentation should avoid assuming Next.js-specific knowledge, but conceptual comparison may be used carefully where helpful.

---

# 7. Plugin Author

Needs:

```text
plugin lifecycle
definePlugin
hooks
compatibility
ordering
artifact ownership
testing
publishing
```

---

# 8. Adapter Author

Needs:

```text
deployment contract
capability model
build manifests
runtime packaging
static/server separation
environment mapping
target testing
```

---

# 9. Framework Contributor

Needs:

```text
repository setup
package architecture
testing
RFC process
Changesets
release rules
security rules
```

Contributor documentation belongs primarily in repository governance/development docs rather than application-user guides.

---

# 10. Documentation Surfaces

Ranu.js V1 uses:

```text
1. Documentation website
2. Repository README
3. Package READMEs
4. CLI --help
5. API/type declarations
6. Example applications
7. Migration guides
8. CONTRIBUTING.md
9. SECURITY.md
10. RFC/specification repository content
```

These surfaces must agree.

---

# 11. Canonical Documentation Website

The main user documentation should eventually live on a dedicated Ranu.js documentation website.

Until the docs website is production-ready, repository Markdown may serve as the canonical source.

The source must remain version-controlled.

---

# 12. Documentation Source Location

Recommended repository structure:

```text
docs/
├── getting-started/
├── guides/
├── concepts/
├── api/
├── deployment/
├── plugins/
├── adapters/
├── examples/
├── migration/
├── troubleshooting/
└── contributing/
```

---

# 13. Documentation Website Structure

Recommended primary navigation:

```text
Getting Started
Guides
Core Concepts
API Reference
Deployment
Plugins
Examples
Migration
Troubleshooting
```

Contributor-specific links may appear separately.

---

# 14. Documentation Hierarchy

Use four documentation modes:

```text
Tutorial
How-to Guide
Concept
Reference
```

Do not mix them unnecessarily.

---

# 15. Tutorials

Tutorials teach through a complete path.

Examples:

```text
Build your first Ranu.js app
Build a small full-stack app
Create a static site
Create an API-backed app
Deploy an Ranu.js app
```

---

# 16. How-To Guides

How-to pages solve a specific task.

Examples:

```text
Add a dynamic route
Read cookies
Redirect a request
Use environment variables
Create a plugin
Deploy to Vercel
```

---

# 17. Concept Pages

Concept pages explain framework mental models.

Examples:

```text
Routing model
Rendering modes
Client/server boundaries
Build pipeline
Plugin lifecycle
Deployment adapters
```

---

# 18. Reference Pages

Reference pages document exact interfaces.

Examples:

```text
Ranu.js
Ranu.js/config
Ranu.js/react
Ranu.js/server
Ranu.js/plugin
CLI commands
configuration fields
```

---

# 19. Root README

Repository `README.md` is the project landing page.

It should contain:

```text
Ranu.js identity
short value proposition
current maturity/status
key features
quick start
minimal example
documentation link
contribution link
security link
license
```

---

# 20. README Scope

The root README must not become the full documentation manual.

It should get a developer from discovery to first run quickly.

---

# 21. Project Positioning

README/docs should describe Ranu.js as a JavaScript/TypeScript full-stack web framework.

Avoid misleading claims such as:

```text
production proven
enterprise proven
faster than every framework
drop-in Next.js replacement
```

unless evidence exists.

---

# 22. Project Maturity Label

Pre-1.0 documentation must clearly identify release maturity:

```text
Alpha
Beta
Release Candidate
```

when applicable.

---

# 23. Quick Start

The primary Quick Start should be minimal.

Target flow:

```bash
npx create-ranu@latest my-app
cd my-app
npm run dev
```

or the final package-manager-neutral equivalent defined by implementation.

The command must match the actual released package.

---

# 24. Quick Start Validation

Quick Start is release-critical.

CI must test the documented commands against packed/released packages.

---

# 25. Package Manager Variants

Docs should support common package managers where Ranu.js supports them:

```text
npm
pnpm
yarn
```

Additional managers may be documented only when tested.

---

# 26. Getting Started Section

Required pages:

```text
Introduction
Installation
Create a Project
Project Structure
Development Server
Your First Route
Layouts
Server and Client Code
Build for Production
Run in Production
Deploy
Next Steps
```

---

# 27. Introduction

Explain:

- what Ranu.js is;
- what problems it solves;
- full-stack model;
- TypeScript/JavaScript support;
- React V1 renderer;
- Node V1 runtime;
- filesystem routing;
- supported rendering modes;
- plugin/adapter model.

---

# 28. Installation

Document:

```text
Node requirements
package manager requirements
create-ranu
manual installation if supported
supported React version
TypeScript support
```

---

# 29. Project Structure

Document the default application layout.

Example conceptual structure:

```text
app/
public/
ranu.config.ts
package.json
tsconfig.json
```

Then explain route/layout/server/client conventions.

The exact tree must match the final starter.

---

# 30. First Route

Show the smallest valid route.

Example only if consistent with final routing specification:

```tsx
export default function Page() {
  return <h1>Hello Ranu.js</h1>;
}
```

Do not invent alternate route conventions.

---

# 31. Development Server

Document:

```text
Ranu.js dev
default host
default port
custom host/port
HMR
Fast Refresh
error overlay
route watching
config restart behavior
```

---

# 32. Production Build

Document:

```text
Ranu.js build
output
build failures
static generation
manifests at conceptual level
```

Users should not need internal manifest knowledge for normal usage.

---

# 33. Production Start

Document:

```text
Ranu.js start
build prerequisite
runtime env
host/port
Node runtime
graceful shutdown expectations
```

---

# 34. Routing Documentation

Routing requires a dedicated major section.

Required pages:

```text
Routing Overview
Pages
Nested Routes
Dynamic Segments
Catch-All Segments
Optional Catch-All Segments
Route Groups
Layouts
API Routes
Middleware
Not Found
Errors
Loading
Route Precedence
Reserved Paths
```

---

# 35. Routing Examples

Every route syntax should show:

```text
filesystem
URL
params
behavior
```

Example format:

```text
app/blog/[slug]/page.tsx
→ /blog/hello
→ params.slug === "hello"
```

---

# 36. Route Precedence

Document precedence clearly.

Developers must understand conflicts between:

```text
literal
dynamic
catch-all
optional catch-all
```

without reading router source.

---

# 37. Route Conflict Diagnostics

Troubleshooting docs should explain common collision errors and how to resolve them.

---

# 38. Rendering Documentation

Required pages:

```text
Rendering Overview
Server Rendering
Static Generation
Client Rendering
Client Components
Server/Client Boundaries
Hydration
Metadata
Redirects
Not Found
Errors
```

---

# 39. Rendering Decision Guide

Provide a decision guide:

```text
Need request-time server data? → SSR
Known at build time? → SSG
Browser-only application? → client rendering
Need interactivity inside SSR/SSG? → client component boundary
```

Keep the guide aligned with actual Ranu.js behavior.

---

# 40. SSR Documentation

Explain:

```text
request-time execution
server-only access
headers/cookies
dynamic params
HTML response
hydration when client components exist
```

---

# 41. SSG Documentation

Explain:

```text
build-time execution
generateStaticParams
public output
build-time env
dynamic static paths
limitations
```

Clearly state that generated HTML is public.

---

# 42. Client Rendering Documentation

Explain:

```text
browser execution
browser APIs
deep-link behavior
server-only import restrictions
metadata limitations if any
```

---

# 43. Client Components

Document:

```ts
"use client";
```

including:

- what makes a module client-reachable;
- transitive dependency behavior;
- serialization rules;
- server-only restrictions;
- bundle implications.

---

# 44. Server/Client Security Warning

Documentation must clearly state:

```text
data sent to client components/browser output is public
```

and explain `RANU_PUBLIC_*`.

---

# 45. Hydration

Explain hydration at user level:

```text
server HTML
client bundle
serialized props/state
interactive activation
```

Avoid exposing unnecessary internal implementation.

---

# 46. Server Runtime Documentation

Required pages:

```text
Server Runtime Overview
Request and Response
API Routes
Headers
Cookies
Redirects
Streaming
Middleware
Request Context
Runtime Environment
Production Server
```

---

# 47. Web Standard APIs

Where Ranu.js uses:

```text
Request
Response
Headers
URL
```

documentation should emphasize web-standard semantics.

---

# 48. API Routes

Show:

```text
GET
POST
other supported methods
JSON response
status codes
headers
cookies
```

Examples must use public APIs only.

---

# 49. Request Bodies

Document body handling and limits once final implementation is selected.

Do not imply unlimited buffering is safe.

---

# 50. Streaming

If V1 exposes streaming publicly, provide a minimal example and deployment caveats.

Only claim provider streaming where adapter testing confirms it.

---

# 51. Cookies

Document:

```text
read
set
delete
attributes
security considerations
```

Include guidance for:

```text
HttpOnly
Secure
SameSite
```

without pretending Ranu.js automatically defines application session policy.

---

# 52. Proxy Trust

If users can configure trusted proxy behavior, provide a dedicated advanced guide.

Warn that forwarded headers are untrusted unless deployment/runtime policy establishes trust.

---

# 53. Configuration Documentation

Required pages:

```text
Configuration Overview
ranu.config.ts
Server Options
Build Options
Plugins
Deployment Adapter
Environment Configuration
```

Only document actual supported fields.

---

# 54. Configuration Reference

Every public config field should include:

```text
type
default
allowed values
environment
example
stability
```

---

# 55. Environment Variables

Required documentation:

```text
Environment Overview
.env Files
Runtime vs Build-Time Variables
Public Browser Variables
RANU_PUBLIC_ Prefix
Deployment Environment
Security
```

---

# 56. Environment Security

Include a prominent rule:

```text
Never place secrets in RANU_PUBLIC_* variables.
```

Explain that browser-public variables can be inspected by users.

---

# 57. Environment Precedence

Document `.env` precedence exactly as implemented.

Do not copy another framework's precedence unless Ranu.js actually implements it.

---

# 58. CLI Documentation

Required command pages:

```text
Ranu.js dev
Ranu.js build
Ranu.js start
Ranu.js create
Ranu.js deploy
Ranu.js --help
Ranu.js --version
```

Only include commands present in `09_CLI_SPECIFICATION.md` and implementation.

---

# 59. CLI Reference Format

Each command page should include:

```text
purpose
usage
arguments
options
examples
exit behavior
CI behavior
related configuration
```

---

# 60. CLI Help Synchronization

Where practical, CLI reference should be generated from or validated against the same command definitions used by the CLI.

Avoid manually drifting option lists.

---

# 61. Machine Output

Document:

```text
--json
```

or equivalent machine-readable output only if implemented.

State exact format/stability.

---

# 62. Plugin Documentation

Required pages:

```text
Plugin Overview
Creating a Plugin
Plugin Lifecycle
Hooks
Configuration
Ordering
Compatibility
Artifacts
Testing Plugins
Publishing Plugins
```

---

# 63. Plugin Quick Example

Provide a minimal plugin using only:

```text
Ranu.js/plugin
```

No internal package imports.

---

# 64. Plugin Trust Warning

Clearly state that plugins are trusted Node.js code and are not sandboxed.

Installing a plugin is equivalent to trusting a development/build dependency with process permissions.

---

# 65. Plugin API Reference

Document:

```text
definePlugin
plugin metadata
supported hooks
hook context
return values
error behavior
compatibility fields
```

---

# 66. Plugin Version Compatibility

Plugin authors need guidance on declaring supported Ranu.js versions/API versions.

Examples must match the plugin specification.

---

# 67. Deployment Documentation

Required top-level pages:

```text
Deployment Overview
Node.js
Container
Static
Vercel
Writing an Adapter
Environment Variables in Production
Troubleshooting Deployment
```

Only adapters that actually exist should be presented as available.

---

# 68. Node Deployment

Document generic Node deployment first.

Include:

```text
build
runtime files
Ranu.js start
host/port
runtime env
process manager/container considerations
graceful shutdown
```

---

# 69. Container Deployment

Provide a tested production container example.

Guidance should prefer:

```text
multi-stage build
minimal runtime files
non-root runtime
runtime env
SIGTERM handling
```

---

# 70. Vercel Deployment

Document:

```text
adapter installation
configuration
build/deploy command
environment variables
supported capabilities
known limitations
```

against current tested provider behavior.

---

# 71. Static Deployment

Static adapter docs must clearly state unsupported features such as:

```text
SSR
runtime API routes
runtime middleware
```

if those are unsupported.

---

# 72. Deployment Capability Table

Maintain a table such as:

| Capability | Node | Container | Static | Vercel |
|---|---|---|---|---|
| SSR | Yes | Yes | No | Tested/Supported |
| SSG | Yes | Yes | Yes | Tested/Supported |
| API Routes | Yes | Yes | No | Tested/Supported |
| Middleware | ... | ... | ... | ... |
| Streaming | ... | ... | ... | ... |

Values must come from adapter capabilities/tests, not assumptions.

---

# 73. Adapter Author Documentation

Advanced section should explain:

```text
adapter contract
capabilities
build artifacts
runtime packaging
environment separation
static assets
server functions
validation
testing
```

---

# 74. Public API Reference

Reference must mirror:

```text
11_PUBLIC_API_SPECIFICATION.md
```

Primary entry points:

```text
Ranu.js
Ranu.js/config
Ranu.js/react
Ranu.js/server
Ranu.js/plugin
```

---

# 75. API Reference Requirements

Every public symbol should include:

```text
signature
purpose
parameters
return type
runtime domain
example
errors
stability
version introduced
```

where relevant.

---

# 76. Runtime Domain Labels

API docs should visibly label symbols:

```text
Universal
Server Only
Client Only
Build/Config Only
Plugin Only
```

This helps prevent security/runtime misuse.

---

# 77. TypeScript Signatures

API signatures should come from real declarations where possible.

Avoid manually maintaining duplicate types that drift.

---

# 78. Internal APIs

Do not document internal package paths in public API reference.

Internal implementation docs may exist separately for contributors.

---

# 79. Examples Strategy

Examples are executable documentation.

Repository location:

```text
examples/
```

---

# 80. Required V1 Examples

Recommended official examples:

```text
hello-world
basic-routing
dynamic-routing
layouts
api-routes
middleware
ssr
ssg
client-components
environment-variables
plugin-basic
deployment-node
deployment-vercel
```

---

# 81. Example Scope

Each example should demonstrate one primary concept.

Avoid giant examples that obscure the feature being taught.

---

# 82. Full-Stack Example

In addition to focused examples, maintain one small complete application demonstrating:

```text
pages
layouts
SSR
client interaction
API route
environment variable
production build
```

This can serve as an integration/dogfooding project.

---

# 83. Example README

Every example should contain a concise README with:

```text
purpose
run commands
relevant files
expected behavior
related docs
```

---

# 84. Example Package Isolation

Examples must consume Ranu.js through supported package entry points.

No internal monorepo imports.

---

# 85. Example CI

Every official example must:

```text
install/link supported package artifact
typecheck
build
```

Browser/runtime examples receive additional smoke tests.

---

# 86. Packed Package Example Tests

Before RC/stable, important examples should be tested against packed Ranu.js tarballs.

This catches missing package files/export errors.

---

# 87. Tutorials

Required V1 tutorials:

```text
Build Your First Ranu.js Application
Build a Full-Stack Ranu.js Application
Build a Static Ranu.js Site
Create an Ranu.js Plugin
Deploy Ranu.js to Production
```

The exact number may be reduced before alpha, but Getting Started is mandatory.

---

# 88. First Application Tutorial

Should cover:

```text
create project
run dev server
create page
create nested route
add layout
add client interaction
add API route
build
start
```

---

# 89. Full-Stack Tutorial

Should demonstrate a realistic but small application.

Avoid requiring external paid services.

Use deterministic/local data where possible.

---

# 90. Static Site Tutorial

Should demonstrate:

```text
SSG
generateStaticParams
static assets
build
static deployment
```

---

# 91. Plugin Tutorial

Should demonstrate:

```text
definePlugin
one safe hook
configuration
testing
package structure
```

---

# 92. Deployment Tutorial

Should teach generic Node deployment before provider-specific deployment.

Provider-specific tutorials follow.

---

# 93. Troubleshooting Section

Required categories:

```text
Installation
Development Server
Routing
Rendering/Hydration
Build
Environment Variables
Plugins
Deployment
CLI
Windows
```

---

# 94. Error Code Documentation

If Ranu.js diagnostics have stable error codes, docs should provide searchable pages for important codes.

Example:

```text
RANU_ROUTE_CONFLICT
RANU_CLIENT_SERVER_IMPORT
```

Exact codes depend on implementation.

---

# 95. Diagnostic Links

Development/build diagnostics may include documentation URLs when stable docs routes exist.

Example concept:

```text
Learn more: /errors/RANU_CLIENT_SERVER_IMPORT
```

Do not hard-code unavailable URLs before docs infrastructure exists.

---

# 96. Windows Troubleshooting

Because Windows is a mandatory Ranu.js platform, documentation must cover common Windows-specific issues where they exist:

```text
paths
ports
process termination
file locks
package manager
watching
```

---

# 97. Migration Documentation

Repository/docs location:

```text
docs/migration/
```

Required for:

```text
major stable releases
significant pre-1.0 breaking releases where practical
```

---

# 98. Migration Guide Format

Each guide should include:

```text
affected versions
breaking change
before
after
migration steps
automated codemod if available
known caveats
```

---

# 99. Deprecation Documentation

Deprecated APIs should be marked in:

```text
API reference
release notes
migration guidance
TypeScript declarations where practical
```

---

# 100. Versioned Documentation

Stable docs must make it possible to identify which Ranu.js version they describe.

At minimum:

```text
current stable docs
version label
older migration/reference access
```

---

# 101. Pre-1.0 Documentation

During alpha/beta, docs may primarily track the current release line.

However, breaking release notes/migration notes must remain accessible.

---

# 102. Stable Version Strategy

After `1.0.0`, documentation versioning should preserve at least supported release lines.

Do not maintain unlimited historical docs if support capacity does not justify it.

---

# 103. Documentation URLs

Prefer stable semantic URLs:

```text
/docs/getting-started/installation
/docs/routing/dynamic-routes
/docs/api/server/cookies
```

Avoid implementation-specific file names in public URLs.

---

# 104. Search

Documentation website should provide search before or around public beta if practical.

Search must index:

```text
guides
concepts
API
errors
deployment
migration
```

---

# 105. Navigation

Every docs page should make clear:

```text
section
previous/next context
related pages
version
```

Avoid deep pages with no navigational context.

---

# 106. On-Page Navigation

Long reference/concept pages should have generated heading navigation.

---

# 107. Code Blocks

Code examples should:

- be copyable;
- specify language;
- be minimal;
- include required imports;
- avoid unexplained placeholders.

---

# 108. Complete vs Partial Examples

Clearly distinguish:

```text
complete file
```

from:

```text
partial snippet
```

to reduce copy/paste confusion.

---

# 109. TypeScript First

Primary documentation examples use TypeScript.

JavaScript variants may be provided where useful.

Ranu.js itself supports both according to product requirements.

---

# 110. React V1

Rendering examples use React because React is the V1 renderer.

Docs should avoid implying the architecture permanently requires React if the framework vision keeps renderer extensibility open.

---

# 111. Accessibility

Documentation website should target accessible semantic HTML, keyboard navigation, readable contrast, and properly labeled interactive controls.

---

# 112. Mobile Documentation

Docs should remain usable on mobile, even though framework development is primarily desktop-oriented.

---

# 113. Documentation Performance

Avoid making documentation depend on excessive client-side JavaScript.

Static generation should be preferred where practical.

---

# 114. SEO

Public docs should provide:

```text
descriptive titles
meta descriptions
canonical URLs
sitemap
structured headings
```

to make framework answers discoverable.

---

# 115. Documentation Source Format

Markdown/MDX may be used.

The exact docs engine is an implementation choice and not part of Ranu.js public API.

---

# 116. Documentation Framework

The initial documentation site may use an established docs stack.

Ranu.js should not delay framework development solely to build a custom documentation engine.

---

# 117. Dogfooding Goal

Once Ranu.js is sufficiently stable, the Ranu.js documentation website should become a candidate for running on Ranu.js itself.

This is a goal, not an alpha blocker.

---

# 118. Dogfooding Preconditions

Do not migrate docs to Ranu.js until Ranu.js can reliably support required docs capabilities:

```text
SSG
dynamic content routes
assets
metadata
navigation
production deployment
```

---

# 119. Dogfooding Value

Running docs on Ranu.js can validate:

```text
real application usage
SSG
routing
metadata
build performance
deployment
upgrade behavior
```

---

# 120. Documentation Testing Strategy

Documentation tests include:

```text
code compilation
example builds
link checking
API symbol checking
CLI option synchronization
spelling/style where useful
```

---

# 121. Snippet Testing

Important code snippets should be extracted/compiled or backed by tested source files.

Avoid hundreds of unverified copy/paste snippets.

---

# 122. API Symbol Validation

Docs CI should fail if documentation references removed/nonexistent stable public symbols.

---

# 123. Link Checking

CI should detect broken internal documentation links.

External link checking may run scheduled due to network variability.

---

# 124. CLI Docs Validation

CLI command/options documentation should be checked against implementation where practical.

---

# 125. Config Docs Validation

Configuration reference may be generated from a schema/type source or tested against it.

Do not maintain an unrelated manual field list indefinitely.

---

# 126. Example Testing

`14_TESTING_AND_QUALITY_STRATEGY.md` remains authoritative for example CI.

All official examples must at least typecheck/build.

---

# 127. Documentation Linting

A lightweight Markdown/MDX linting system may enforce:

```text
valid headings
code fence syntax
broken local links
basic formatting
```

Avoid style rules that make contribution unnecessarily difficult.

---

# 128. Terminology

Maintain consistent canonical terms:

```text
Ranu.js
route
page
layout
API route
middleware
client component
server code
static generation
deployment adapter
plugin
```

---

# 129. Terminology File

A small documentation style/terminology guide may live under:

```text
docs/contributing/style-guide.md
```

before beta if documentation contribution grows.

---

# 130. Avoid Internal Jargon

User documentation should not require understanding internal terms such as private compiler passes unless necessary.

---

# 131. Framework Comparisons

Comparisons to Next.js, Remix, Nuxt, etc. may be used to orient developers but must not define Ranu.js behavior.

Ranu.js documentation remains authoritative on Ranu.js semantics.

---

# 132. No False Compatibility Claims

Do not state:

```text
Next.js compatible
drop-in replacement
supports every React ecosystem integration
```

unless specifically implemented and tested.

---

# 133. Security Documentation

Security-relevant docs must align with `15_SECURITY_MODEL.md`.

Required user guidance includes:

```text
public env exposure
server/client boundaries
raw HTML
cookies
proxy trust
plugins as trusted code
dev server exposure
```

---

# 134. Security Callouts

Use concise warning/admonition blocks for actions that can expose secrets or weaken security.

Do not overload every page with warnings.

---

# 135. Deployment Security Documentation

Deployment guides should distinguish:

```text
build-time private env
runtime private env
browser-public env
provider credentials
```

---

# 136. Plugin Security Documentation

Plugin docs must state:

```text
plugins execute trusted Node.js code
```

before installation/publishing guidance.

---

# 137. Development Server Warning

Document that `Ranu.js dev` is intended for trusted development and should not be used as the production server.

---

# 138. Public Environment Warning

Every page teaching `RANU_PUBLIC_*` should explain that those values are visible to browser users.

---

# 139. Error Documentation

Error pages should explain:

```text
what happened
why Ranu.js rejects it
how to fix it
related concept
```

not only repeat the diagnostic text.

---

# 140. Documentation Contribution

Documentation PRs use the normal contribution workflow.

Small typo/docs fixes do not require RFCs or Changesets unless package behavior changes.

---

# 141. Documentation Review

Technical documentation touching public behavior should be reviewed by someone familiar with the owning subsystem.

---

# 142. Documentation Ownership

Initial ownership may remain with the lead maintainer.

As the project grows, maintainers may own sections:

```text
routing
runtime
build
plugins
deployment
```

---

# 143. Documentation Issue Labels

Recommended:

```text
documentation
docs-bug
docs-needed
good first issue
```

---

# 144. Docs Needed Gate

A PR adding a public feature should be labeled/blocked until required documentation is included or linked to a release-blocking docs task.

Stable release cannot ship the feature undocumented.

---

# 145. Release Notes vs Documentation

Release notes explain what changed.

Documentation explains how to use the current behavior.

Both are required for meaningful public changes.

---

# 146. Documentation Release Gate — Alpha

Before public alpha:

```text
README
Quick Start
installation
project structure
routing basics
SSR/client basics
API route basics
build/start
known limitations
```

must exist.

---

# 147. Documentation Release Gate — Beta

Before public beta:

```text
complete Getting Started
routing guide
rendering guide
runtime guide
config/env guide
CLI reference
plugin guide
Node deployment
Vercel deployment if adapter beta
troubleshooting baseline
public API reference
CONTRIBUTING
SECURITY
```

must exist.

---

# 148. Documentation Release Gate — RC

Before RC:

```text
public API reference complete
deployment capability table verified
migration notes complete
all official examples build
broken internal links = 0
starter/Quick Start tested from packed packages
```

---

# 149. Documentation Release Gate — 1.0

Before `1.0.0`:

```text
all stable public APIs documented
all stable config fields documented
all stable CLI commands documented
supported deployment adapters documented
security warnings aligned
version label/support policy visible
migration/deprecation guidance current
official examples passing
Quick Start verified from registry candidate
```

---

# 150. Documentation Metrics

Post-beta, useful signals may include:

```text
search queries with no result
most visited pages
common error pages
broken links
docs issue volume
Quick Start failures
```

Analytics must follow an explicit privacy policy if introduced.

---

# 151. Feedback

Docs website may later provide:

```text
Was this helpful?
Edit this page
Report documentation issue
```

These are optional before stable.

---

# 152. Example Versioning

Examples in `main` target the current development version.

Release tags preserve historical example state.

Stable docs may link to version-specific source tags.

---

# 153. External Examples

Community examples may be linked separately but are not official compatibility guarantees.

Official examples are those maintained/tested in the Ranu.js repository.

---

# 154. Template Relationship

The default `create-ranu` starter is itself a primary documentation artifact.

Its structure should remain simple enough to teach Ranu.js conventions.

---

# 155. Starter Comments

Avoid excessive comments in generated starter files.

Use documentation for explanation; keep starter code clean.

---

# 156. Starter README

Generated starter may include a short README with:

```text
dev
build
start
project structure
docs link
```

---

# 157. Documentation Build Reproducibility

Docs site build should run in CI from a clean checkout with locked dependencies.

---

# 158. Documentation Preview

Documentation PRs should ideally receive preview builds once infrastructure exists.

Not required for the earliest alpha.

---

# 159. Broken Docs Build

A broken canonical documentation build blocks stable release.

---

# 160. API Reference Generation

Ranu.js may generate parts of API reference from TypeScript declarations.

Generated output must remain readable and may be augmented with manually authored explanations.

---

# 161. Reference Generation Boundary

Do not rely on auto-generated signatures alone.

Developers need:

```text
behavior
constraints
examples
runtime domain
```

---

# 162. Configuration Reference Generation

If config types are authoritative, generation/validation should use them to prevent drift.

---

# 163. Error Reference Generation

Stable diagnostic codes may be mapped to documentation metadata and generated into searchable error pages.

This is recommended after diagnostics stabilize.

---

# 164. Documentation Version Banner

When viewing older docs, show a visible version/outdated banner.

Do not let users unknowingly follow unsupported old instructions.

---

# 165. Canonical Current Docs

Search engines should prefer current stable docs via canonical metadata where appropriate.

---

# 166. Pre-Release Docs

Alpha/beta docs should be visibly labeled as pre-release.

Avoid presenting unstable APIs as stable.

---

# 167. Experimental Docs

Experimental APIs should use explicit badges/callouts:

```text
Experimental
May change without stable SemVer guarantees
```

---

# 168. Removed API Docs

Removed stable APIs should remain discoverable through migration/version history rather than silently disappearing from all documentation.

---

# 169. Documentation Backports

Docs fixes may be backported to supported release docs when they correct materially misleading behavior.

Not every typo requires historical backport.

---

# 170. Localization

Ranu.js V1 canonical documentation is English.

Localization is deferred.

Community translations may be accepted later under a separate maintenance policy.

---

# 171. Documentation Accessibility Acceptance

Before stable, the docs site should pass basic accessibility checks for:

```text
keyboard navigation
semantic headings
link names
contrast
code block usability
focus states
```

---

# 172. Documentation Browser Support

Docs website browser support should be at least as broad as reasonably required for reading documentation, independent of Ranu.js application browser support.

---

# 173. Documentation Hosting

Hosting provider is an implementation/operations choice.

Documentation architecture must not make the Ranu.js framework dependent on a specific commercial provider.

---

# 174. Documentation Domain

A canonical documentation URL/domain should be established before public beta if practical.

Do not publish fake/placeholder production URLs in package metadata.

---

# 175. Package Metadata Documentation URL

Published npm packages should point to the actual canonical documentation/homepage once operational.

---

# 176. GitHub Repository Links

Docs pages should provide relevant source/edit links where practical.

---

# 177. API Source Links

API reference may link to canonical source definitions for advanced users.

These links are supplemental, not a substitute for documentation.

---

# 178. Examples vs Fixtures

Distinguish:

```text
examples/ = user-facing learning applications
fixtures/ = test-only controlled applications
```

Fixtures are not user documentation.

---

# 179. Examples vs Templates

Distinguish:

```text
examples = focused demonstrations
templates = starting points
starter = default create-ranu project
```

---

# 180. Documentation Acceptance Criteria

This plan is complete when:

1. documentation audiences are defined;
2. canonical documentation surfaces are defined;
3. documentation IA is defined;
4. tutorial/how-to/concept/reference modes are defined;
5. root README scope is defined;
6. Quick Start is release-critical;
7. Getting Started pages are defined;
8. routing documentation is comprehensive;
9. rendering documentation is defined;
10. server runtime documentation is defined;
11. config/environment documentation is defined;
12. CLI documentation is defined;
13. plugin documentation is defined;
14. deployment documentation is defined;
15. adapter author documentation is defined;
16. public API reference requirements are defined;
17. runtime-domain labels are required;
18. official example strategy is defined;
19. full-stack dogfooding example is defined;
20. tutorial set is defined;
21. troubleshooting strategy is defined;
22. migration documentation is defined;
23. versioned docs strategy is defined;
24. documentation testing is defined;
25. example CI is required;
26. security documentation requirements are defined;
27. alpha/beta/RC/1.0 docs gates are defined;
28. Ranu.js docs dogfooding is planned but not an alpha blocker;
29. canonical docs language is English;
30. localization is deferred.

---

# 181. Locked V1 Documentation Decisions

The following are locked:

1. Documentation is part of the Ranu.js product.
2. Stable public features cannot ship undocumented.
3. Canonical Ranu.js V1 documentation is English.
4. The root README is a concise project landing/Quick Start surface, not the full manual.
5. Ranu.js documentation uses tutorial, how-to, concept, and reference modes.
6. Getting Started is the highest-priority documentation path.
7. Quick Start commands are tested in CI.
8. Project structure docs must match the actual starter.
9. Routing has a dedicated comprehensive documentation section.
10. Every route syntax shows filesystem-to-URL behavior.
11. Route precedence/conflicts are documented.
12. SSR, SSG, client rendering, hydration, and client components are documented separately.
13. Server/client boundaries are documented as security boundaries.
14. Browser-exposed data is explicitly described as public.
15. Server runtime docs use web-standard Request/Response concepts where implemented.
16. Cookie/security responsibilities are documented.
17. Configuration docs contain only real supported fields.
18. Environment precedence must match actual Ranu.js behavior.
19. `RANU_PUBLIC_*` documentation always warns that values are browser-public.
20. CLI docs must stay synchronized with implementation.
21. Plugin documentation uses only public plugin APIs.
22. Plugin docs state that plugins are trusted Node.js code.
23. Generic Node deployment is documented as a primary deployment target.
24. Provider documentation claims only tested capabilities.
25. Deployment docs maintain a capability matrix.
26. Public API reference mirrors `11_PUBLIC_API_SPECIFICATION.md`.
27. Public API docs identify runtime domains.
28. Internal deep imports are not taught.
29. Official examples live under `examples/`.
30. Test fixtures are not presented as official examples.
31. Official examples must build in CI.
32. Important examples are tested against packed artifacts before RC/stable.
33. The default starter is a documentation artifact.
34. Troubleshooting includes Windows-specific guidance where needed.
35. Significant breaking changes receive migration documentation.
36. Stable documentation identifies the Ranu.js version it describes.
37. Pre-release docs are visibly labeled.
38. Important code snippets must be tested or backed by tested source.
39. Broken internal docs links fail CI before RC/stable.
40. Security documentation aligns with `15_SECURITY_MODEL.md`.
41. `Ranu.js dev` is documented as a development server, not a production server.
42. Docs website should eventually be dogfooded on Ranu.js when the framework is mature enough.
43. Dogfooding the docs site does not block early alpha.
44. Documentation release gates become progressively stricter from alpha to 1.0.
45. `1.0.0` requires complete documentation for all stable public APIs/config/CLI behavior.

---

# 182. Deferred Documentation Features

Deferred unless needed before stable:

- full localization system;
- translated official docs;
- interactive browser playground;
- cloud code sandbox;
- AI documentation assistant;
- embedded terminal;
- video course;
- certification program;
- printed handbook;
- community wiki;
- full historical docs for every pre-1.0 release;
- automatic code-modification tutorials;
- API explorer application;
- live provider deployment playground;
- advanced analytics dashboard.

These are not required to make Ranu.js V1 professionally documented.

---

# 183. Relationship to Public API

`11_PUBLIC_API_SPECIFICATION.md` is the source of truth for stable application-facing API boundaries.

This document defines how those APIs are taught and referenced.

---

# 184. Relationship to Repository Structure

`13_REPOSITORY_AND_PACKAGE_STRUCTURE.md` defines repository locations for:

```text
docs
examples
fixtures
rfcs
packages
```

This document defines the documentation purpose of those areas.

---

# 185. Relationship to Testing Strategy

`14_TESTING_AND_QUALITY_STRATEGY.md` requires official examples and documentation flows to be validated.

This document defines what user-facing documentation must be covered.

---

# 186. Relationship to Security Model

`15_SECURITY_MODEL.md` defines security boundaries.

This document requires those boundaries to be communicated clearly to application/plugin/adapter developers.

---

# 187. Relationship to Governance and Releases

`16_OPEN_SOURCE_GOVERNANCE_AND_RELEASES.md` requires documentation as a release gate.

This document defines the exact documentation baseline for alpha, beta, RC, and stable releases.

---

# 188. Implementation Order

Recommended documentation implementation order:

```text
Phase D1 — README + Quick Start
Phase D2 — Getting Started
Phase D3 — Routing + Rendering
Phase D4 — Runtime + Config + Env + CLI
Phase D5 — Deployment
Phase D6 — Plugins + Adapter Authors
Phase D7 — API Reference
Phase D8 — Examples + Tutorials
Phase D9 — Troubleshooting + Errors
Phase D10 — Versioning + Migration
Phase D11 — Docs website polish/search/accessibility
```

---

# 189. Phase D1 Acceptance

Must provide:

```text
README
project status
installation command
create app
run dev
minimal route
build/start
docs pointer
license/contribution/security pointers
```

---

# 190. Phase D2 Acceptance

A new developer can create and understand a basic Ranu.js project without reading framework source.

---

# 191. Phase D3 Acceptance

A developer can correctly choose and implement routing/rendering patterns from documentation alone.

---

# 192. Phase D4 Acceptance

A developer can build server functionality and configure an application without relying on undocumented APIs.

---

# 193. Phase D5 Acceptance

A developer can deploy to at least the official generic Node target using tested instructions.

---

# 194. Phase D6 Acceptance

A third-party developer can create a plugin/adapter using only documented public contracts.

---

# 195. Phase D7 Acceptance

Every stable public API symbol is searchable and documented with correct signature/runtime domain.

---

# 196. Phase D8 Acceptance

Official examples build successfully and tutorials reproduce the intended behavior.

---

# 197. Phase D9 Acceptance

Common errors have actionable troubleshooting paths.

---

# 198. Phase D10 Acceptance

Developers can understand release-specific breaking changes and migrate supported applications.

---

# 199. Phase D11 Acceptance

Documentation is navigable, searchable, accessible, version-aware, and production-ready.

---

# 200. Required Next Planning Step

After `17_DOCUMENTATION_AND_EXAMPLES_PLAN.md`, the core Ranu.js V1 planning/documentation set is sufficient to begin disciplined repository implementation.

Before implementation starts, perform one final cross-document consistency audit across:

```text
00_FRAMEWORK_VISION.md
01_PRODUCT_REQUIREMENTS.md
02_FRAMEWORK_ARCHITECTURE.md
03_ROUTING_SPECIFICATION.md
04_RENDERING_MODEL.md
05_SERVER_RUNTIME_SPEC.md
06_BUILD_SYSTEM.md
07_PLUGIN_SYSTEM.md
08_DEPLOYMENT_ADAPTERS.md
09_CLI_SPECIFICATION.md
10_CONFIGURATION_SYSTEM.md
11_ENVIRONMENT_VARIABLES.md
11_PUBLIC_API_SPECIFICATION.md
12_DEVELOPMENT_PLAN.md
13_REPOSITORY_AND_PACKAGE_STRUCTURE.md
14_TESTING_AND_QUALITY_STRATEGY.md
15_SECURITY_MODEL.md
16_OPEN_SOURCE_GOVERNANCE_AND_RELEASES.md
17_DOCUMENTATION_AND_EXAMPLES_PLAN.md
```

The audit must identify:

```text
contradictions
duplicate ownership
undefined terms
API mismatches
package-name mismatches
routing/rendering inconsistencies
build/runtime mismatches
CLI/config mismatches
security gaps
release-gate mismatches
missing implementation dependencies
```

Resolve those conflicts before large-scale coding begins.

---

# 201. Final Documentation Baseline

Ranu.js documentation is treated as a first-class product surface.

The documentation system begins with a concise repository README and a tested Quick Start, then expands into structured Getting Started, routing, rendering, server runtime, configuration, environment, CLI, plugin, deployment, API, migration, and troubleshooting documentation.

Official examples are executable and CI-tested.

Important code snippets are validated.

The public API reference mirrors the actual Ranu.js export surface and identifies runtime domains.

Security-sensitive behavior is documented clearly, especially server/client boundaries, browser-public environment variables, plugin trust, cookies, proxy trust, and development-server exposure.

Provider deployment documentation only claims capabilities proven by adapter testing.

Pre-release documentation is visibly labeled.

Stable documentation is version-aware.

Breaking changes receive migration guidance.

Before `1.0.0`, every stable public API, stable configuration field, stable CLI command, and officially supported deployment path must have complete current documentation.

Once Ranu.js itself is sufficiently mature, its own documentation website should become a real-world Ranu.js dogfooding application.

This document is the authoritative Ranu.js V1 documentation and examples baseline.

---

**End of 17_DOCUMENTATION_AND_EXAMPLES_PLAN.md**
