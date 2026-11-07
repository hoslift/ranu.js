---
'@ranu/cli': minor
---

Self-healing auto-fixer (`ranu fix`) and compact route introspection (`ranu describe --format compact`):

- **Self-Healing Auto-Fixer (`ranu fix`)**:
  - Automatically analyzes invariant errors and synthesizes safe code patches for common failure modes (missing `'use client'` directives, client secret leaks, missing API route handler exports, and missing default page exports).
  - Supports `--dry-run` to preview unified diffs before applying changes.
  - Supports `--format json` for AI coding agents to retrieve structured patch representations (`{ fixedCount, unfixedCount, patches, diagnosticsRemaining }`).
  - Automatically re-validates the workspace post-patch to confirm resolution.
- **Compact Route Introspection (`ranu describe --format compact`)**:
  - Supports `--format compact` outputting a minified array of route records (`[methods, pathname, kind, renderMode, sourceFile]`), reducing LLM token consumption by over 80% (<200 tokens for 15+ routes).
