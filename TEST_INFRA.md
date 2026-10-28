# E2E Test Infra: Ranu.js AI Ecosystem & DevTools Integration

## Test Philosophy
- Opaque-box, requirement-driven, derived directly from `ORIGINAL_REQUEST.md`.
- Methodology: 4-Tier verification (Category-Partition, Boundary Value Analysis, Pairwise Combinations, Real-World Scenarios) + Tier 5 Adversarial Coverage Hardening.

## Feature Inventory & Test Coverage
| # | Feature | Source (Requirement) | Tier 1 (Coverage) | Tier 2 (Boundary) | Tier 3 (Cross-Feature) | Tier 4 (Real-World) |
|---|---------|----------------------|:-----------------:|:-----------------:|:---------------------:|:-------------------:|
| 1 | Interactive Credential Setup | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 2 | Graceful Enter Skip | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 3 | .env & .env.example Generation | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 4 | .gitignore Credential Shielding | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 5 | Non-interactive Flags (--api-key, --endpoint) | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 6 | Terminal Guidance & Curl Instructions | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 7 | React 19 SSR No-Throw Mount | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 8 | Floating Pill Launcher Dock | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 9 | Keyboard Shortcuts (Alt+D, Ctrl+Shift+D) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 10 | AI Studio Tab & Visual Diff Review | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 11 | Production 0-Byte Tree-Shaking | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 12 | 10/10 Monorepo Quality Gates Sweep | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 13 | PR Branches Merge Certification (#248-#263) | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |

## Test Architecture
- Test Runner: `vitest` / node test harness
- E2E Test Suite Path: `tests/e2e/ai-ecosystem.e2e.test.ts`
- Pass/Fail Semantics: Exit code 0, 100% assertions green

## Coverage Goals
- Tier 1: Feature Coverage (≥5 test cases per feature = ≥65 tests)
- Tier 2: Boundary & Corner Cases (empty keys, URLs with trailing slashes, whitespace input, non-TTY pipes, production mode SSR)
- Tier 3: Cross-Feature Interactions (scaffolding with flags + SSR build + DevTools mount + production tree-shaking)
- Tier 4: Real-World Scenarios (full project creation -> dev SSR start -> DevTools dock inspection -> production build -> zero-footprint bundle scan)
