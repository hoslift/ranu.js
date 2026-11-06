# @ranu/cli

## 0.2.0

### Minor Changes

- 3f9084f: Introduce AI-agent DX tooling: `ranu describe` route introspection, `ranu check` sub-second dry-run validation, and machine-readable JSON diagnostics.
- bed9282: Introduce `ranu add` command supporting turnkey configuration and boilerplate generation for official add-ons (`tailwind`, `drizzle`, `auth`) with `--dry-run` and `--json` support.
- 36efd5d: Self-healing auto-fixer (`ranu fix`) and compact route introspection (`ranu describe --format compact`):

  - **Self-Healing Auto-Fixer (`ranu fix`)**:
    - Automatically analyzes invariant errors and synthesizes safe code patches for common failure modes (missing `'use client'` directives, client secret leaks, missing API route handler exports, and missing default page exports).
    - Supports `--dry-run` to preview unified diffs before applying changes.
    - Supports `--format json` for AI coding agents to retrieve structured patch representations (`{ fixedCount, unfixedCount, patches, diagnosticsRemaining }`).
    - Automatically re-validates the workspace post-patch to confirm resolution.
  - **Compact Route Introspection (`ranu describe --format compact`)**:
    - Supports `--format compact` outputting a minified array of route records (`[methods, pathname, kind, renderMode, sourceFile]`), reducing LLM token consumption by over 80% (<200 tokens for 15+ routes).

### Patch Changes

- Updated dependencies [8b7d3b2]
- Updated dependencies [83b7784]
- Updated dependencies [bed9282]
- Updated dependencies [bac30c1]
- Updated dependencies [b76c163]
- Updated dependencies [7798187]
- Updated dependencies [da2ef84]
  - @ranu/build@0.2.0
  - @ranu/dev@0.2.0
  - @ranu/core@0.1.0
  - @ranu/config@0.1.0
  - @ranu/diagnostics@0.0.1
  - @ranujs/adapter-bun@0.1.6
  - @ranujs/adapter-deno@0.1.6
  - @ranujs/adapter-node@0.1.6
  - @ranujs/adapter-cloudflare@0.1.6
  - @ranujs/adapter-netlify@0.1.6
  - @ranujs/adapter-vercel@0.1.6
  - @ranu/manifests@0.0.1
  - @ranu/router@0.0.1
  - @ranu/runtime-node@0.0.1

## 0.1.0

### Minor Changes

- bf2e58a: Initial Public Alpha release (v0.1.0) of Ranu.js full-stack framework and project scaffolder.

### Patch Changes

- Updated dependencies [108909c]
- Updated dependencies [bf2e58a]
  - @ranu/build@0.1.0
  - @ranu/adapter-vercel@0.1.0
  - @ranu/dev@0.1.0
