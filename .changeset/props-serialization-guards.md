---
'@ranu/build': minor
'@ranu/react': minor
'@ranu/diagnostics': patch
---

Dual-tier JSX props serialization guards and dev streaming overlay:

- **Dual-Tier JSX Props Serialization Guards**:
  - *Tier 1 Static Guard (`@ranu/build`)*: Deep recursive AST analysis detecting non-serializable props (functions, class instances, symbols, cyclical patterns) passed across JSX client boundaries at compile time.
  - *Tier 2 Runtime Guard (`@ranu/react`)*: React 19 Flight serialization assertions during development SSR streaming, emitting structured diagnostics and browser visual diff overlays for boundary serialization leaks.
- **Diagnostics Serialization Overlay**: Patch `@ranu/diagnostics` with error codes and interactive visual overlay rendering for boundary serialization diagnostics.
