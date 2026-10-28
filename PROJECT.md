# Project: Ranu.js AI Ecosystem Scaffolding, DevTools SSR Dock & PR Merge Certification

## Architecture
Ranu.js is a high-performance full-stack web framework built on Node.js 22+, React 19, and ESM. The monorepo architecture comprises:
- `create-ranu/`: Zero-dependency turnkey CLI scaffolder (`create-ranujs`).
- `packages/devtools/`: In-browser developer tools (`@ranu/devtools`) providing visual dock, streaming waterfall, route inspector, hydration diagnostics, and AI Studio with LCS visual diff review.
- `packages/ranu/`: Framework core re-exports and subpath interfaces (`@ranujs/core`).
- `packages/build/`: Bundling and build pipeline (`@ranu/build`) including esbuild zero-footprint devtools tree-shaking stub.
- `packages/ai/` & `ai-models/`: Universal AI model abstraction (`@ranu/ai`) with 5 model drivers (`claude`, `custom`, `gemini`, `groq`, `openai`).
- `templates/` & `examples/`: Application presets including `templates/ai-studio`.

```
                    ┌─────────────────────────┐
                    │      create-ranu        │
                    │ (CLI Prompts, Scaffolding)
                    └────────────┬────────────┘
                                 │ generates
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    User Application / Template                  │
│                                                                 │
│  app/layout.tsx ── mounts ──> <RanuDevTools /> ('use client')   │
│                                   │                             │
│                  ┌────────────────┴───────────────┐             │
│                  ▼                                ▼             │
│          [Development Mode]             [Production Mode]       │
│     Floating ⚡ Pill & Dock Panel       Zero-Footprint Stub      │
│     Alt+D / Ctrl+Shift+D Toggle         0 bytes client bundle   │
│     LCS Visual Diff Review              Tree-shaken by esbuild  │
│     Fast Refresh Integration                                    │
└─────────────────────────────────────────────────────────────────┘
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Interactive Credential Prompts | Prompt for API Key, session token, or local endpoint URL when AI engine is selected interactively | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Graceful Credential Skip | Allow pressing Enter to skip / configure later without blocking scaffolding | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Automatic `.env` & `.env.example` | Generate `.env` populated with provided key/endpoint; keep `.env.example` intact | M1 | ORIGINAL_REQUEST §R1 |
| 4 | `.gitignore` Security Shielding | Ensure `.gitignore` explicitly ignores `.env` and `.env*.local` while allowing `!.env.example` | M1 | ORIGINAL_REQUEST §R1 & Survey 1 |
| 5 | Non-Interactive CLI Flags | Support `--api-key <key>` and `--endpoint <url>` flags for automated CI/scripts | M1 | ORIGINAL_REQUEST §R1 |
| 6 | Terminal Feedback & Guidance | Display clear instructions on credential location and ready-to-run curl test commands for `/api/ai` | M1 | ORIGINAL_REQUEST §R1 |
| 7 | React 19 SSR Client Boundary | Fix `Cannot read properties of null (reading 'useState')` by adding `'use client';` prologue and tsup build banner | M2 | ORIGINAL_REQUEST §R2 & Survey 2 |
| 8 | SSR-Safe Store Subscription | Guard hook execution before production check and adopt SSR-safe external store state snapshot | M2 | ORIGINAL_REQUEST §R2 & Survey 2 |
| 9 | Production Virtual Stub Export | Update `esbuild-plugin-ranu.ts` virtual stub to export `RanuDevTools` and public stubs | M2 | ORIGINAL_REQUEST §R2 & Survey 2 |
| 10 | DevTools Scaffolding Out-of-the-box | Add `@ranu/devtools` dependency and `<RanuDevTools />` mount to `create-ranu` templates and showcase apps | M2 | ORIGINAL_REQUEST §R2 |
| 11 | Floating Pill & Keyboard Shortcuts | Verify fixed-dock pill (⚡ badge, streaming counter) and `Alt+D` / `Ctrl+Shift+D` toggle reliability | M2 | ORIGINAL_REQUEST §R2 |
| 12 | Zero-Footprint Production Audit | Enforce 0 leaked bytes and 0 sensitive devtools symbols in production client bundles | M2 | ORIGINAL_REQUEST §R2 |
| 13 | Monorepo Quality Gate Sweep | Execute 10/10 quality gates across all 35 packages (build, typecheck, cycles, exports, tests, UTF-8) | M3 | ORIGINAL_REQUEST §R3 |
| 14 | Public Surface Export Map Fix | Align `tests/api/public-surface.test.ts` with PR #256's 6 AI subpath exports | M3 | Survey 3 |
| 15 | AI Stream Test Timer Hardening | Stabilize race condition in `packages/ai/test/structured-output-empirical.challenge.test.ts` | M3 | Survey 3 |
| 16 | PR Merge Certification (#248–#263) | Verify all 16 PR topic branches are cleanly synced with remote origin ready for Founder merge | M3 | ORIGINAL_REQUEST §R3 |
| 17 | Comprehensive E2E Test Suite | End-to-end multi-tier verification covering Tiers 1-4 and Tier 5 adversarial hardening | M4 | ORIGINAL_REQUEST §Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Turnkey AI Scaffolding (create-ranu) | Features 1–6: CLI flags, promptInput, .env/.env.example, .gitignore security, terminal guidance | none | DONE |
| M2 | DevTools React 19 SSR & In-Browser Dock | Features 7–12: 'use client' boundary, production stub, template layout mounting, floating pill & shortcuts, 0-byte audit | none | DONE |
| M3 | Monorepo Quality Gates & PR Certification | Features 13–16: Public surface test alignment, test stabilization, 10/10 quality gates pass, PR sync audit | M1, M2 | DONE |
| M4 | Final Milestone: E2E Test Pass & Certification | Feature 17: Pass 100% of E2E test suite (Tiers 1-4) and Tier 5 adversarial hardening | M3 | DONE |

## Interface Contracts
### `create-ranu` CLI ↔ Environment Generation
- Flags: `--api-key <key>`, `--endpoint <url>`
- Output files: `.env` (mode 0600, ignored by git), `.env.example` (tracked in git)
- Route: `app/routes/api.ai.ts` consuming configured environment variables

### DevTools Component ↔ React 19 Runtime
- Entrypoint: `@ranu/devtools` and `ranu/devtools`
- Export: `export function RanuDevTools(): React.ReactElement | null`
- Directive: `'use client';` prologue on distribution bundles
- Production fallback: `() => null` emitted by bundler virtual stub

## Code Layout
- `create-ranu/src/bin/create-ranu.ts`: CLI argument parsing, interactive prompt orchestrator, terminal guidance
- `create-ranu/src/prompts.ts`: `promptInput()` and `promptSelect()` with mockable streams
- `create-ranu/src/template.ts`: In-memory template generation, `.env`, `.env.example`, and `.gitignore`
- `create-ranu/src/types.ts`: `ScaffoldOptions` and `ScaffoldResult` definitions
- `packages/devtools/src/component.tsx`: `<RanuDevTools />` component, launcher pill, dock panel, shortcuts
- `packages/devtools/src/index.ts`: Barrel exports with `'use client';`
- `packages/devtools/tsup.config.ts`: DTS & ESM bundle configuration with `'use client';` banner
- `packages/ranu/tsup.config.ts`: Framework bundle with devtools `'use client';` banner
- `packages/build/src/bundler/esbuild-plugin-ranu.ts`: Zero-footprint virtual stub
- `templates/ai-studio/app/layout.tsx`: Showcase layout mounting `<RanuDevTools />`
- `test-app/app/layout.tsx`: Verification test-app mounting `<RanuDevTools />`
- `tests/api/public-surface.test.ts`: Canonical and technical export maps assertions
