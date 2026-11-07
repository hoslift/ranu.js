---
'@ranu/core': minor
'@ranu/plugin': minor
'@ranu/config': minor
'@ranu/server': minor
---

Layer 0 decoupled generic typing and server request header immutability:

- **Layer 0 Decoupled Generic Typing**: Decouple `@ranu/core` and `@ranu/plugin` from `@ranu/config` and `@ranu/manifests` via parameterized generic typing (`DeploymentAdapterContext<TConfig = unknown, TManifest = unknown>` and `RanuDeploymentAdapter<TConfig = unknown, TManifest = unknown>`), guaranteeing strict Layer 0 independence with 0 cyclic dependencies.
- **Server Request Header Immutability**: Enforce immutable request headers in `@ranu/server` via `ReadonlyHeaders` interface and defensive Proxy traps intercepting mutation, deletion, descriptor definition, and prototype tampering.
