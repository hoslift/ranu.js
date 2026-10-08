# Compilation Pipeline & Hot Module Replacement (HMR)

The **Ranu.js** build system (`@ranu/build`) and development engine (`@ranu/dev`) employ a dual-pipeline compiler architecture optimized for sub-second development feedback and production bundle sizes.

This document describes the compilation graph, build manifest structure, and development HMR synchronization.

---

## 1. Dual-Pipeline Build Architecture

During compilation (`ranu build`), the source code is bifurcated into two isolated compilation pipelines:

```mermaid
flowchart TD
    Source[Project Source: app/, components/, lib/]
    
    Source --> ClientPipeline[Client Pipeline (Browser Target)]
    Source --> ServerPipeline[Server Pipeline (Node / Edge Target)]
    
    ClientPipeline --> ClientBundles[.ranu/build/client/assets/*.js]
    ClientPipeline --> CSSBundles[.ranu/build/client/assets/*.css]
    
    ServerPipeline --> ServerEntry[.ranu/build/server/entry.mjs]
    ServerPipeline --> RouteHandlers[.ranu/build/server/routes/*.mjs]
    
    ClientBundles --> Manifest[.ranu/build/build.json]
    ServerEntry --> Manifest
```

### 1. Client Pipeline
* Analyzes client components marked with `'use client'`.
* Bundles CSS files and hashes CSS Modules (`[name]_[class]__[hash]`).
* Emits minified browser chunks to `.ranu/build/client/`.

### 2. Server Pipeline
* Compiles route handlers (`route.ts`), Server Components, and layouts.
* Enforces `@ranujs/core/server-only` compiler boundaries (halting the build if client components import backend modules).
* Generates the production server entrypoint at `.ranu/build/server/entry.mjs`.

---

## 2. Build Manifest Manifest (`build.json`)

Upon completing compilation, Ranu.js outputs a deterministic manifest file describing the application topology:

```json
{
  "version": 1,
  "buildId": "bld_94f8a12e",
  "timestamp": 1728384000,
  "routes": [
    {
      "id": "app/page",
      "kind": "page",
      "pathname": "/",
      "assets": {
        "js": ["/_ranu/assets/page-a1b2c.js"],
        "css": ["/_ranu/assets/global-d3e4f.css"]
      }
    },
    {
      "id": "app/api/users/route",
      "kind": "api",
      "pathname": "/api/users",
      "methods": ["GET", "POST"]
    }
  ]
}
```

The production server uses `build.json` for routing lookups, pre-allocated asset injection, and dynamic route parameter extraction.

---

## 3. Development Server Architecture (`@ranu/dev`)

In development mode (`ranu dev`), the server coordinates filesystem changes, route updates, and in-memory module compilation:

```
[File System Watcher]
        │ File Modified
        ▼
[Dev Coordinator (coordinator.ts)]
        │
   ┌────┴───────────────────────────┐
   ▼                                ▼
[HMR WebSocket Channel]     [On-Demand SSR Invalidator]
   │ Push HMR Patch                 │ Flush Module Cache
   ▼                                ▼
[Browser Fast Refresh]       [Next SSR Request compiles fresh]
```

### Key Components:
* **`DevCoordinator`**: Central engine orchestrating route table discovery, module invalidation, and port bindings.
* **`FileSystemWatcher`**: Observes `app/`, `public/`, and `ranu.config.ts` using debounced filesystem events.
* **`HMRChannel`**: Dedicated WebSocket server maintaining real-time two-way communication with connected browser clients.

---

## 4. Sub-Second Hot Module Replacement (HMR)

1. **CSS Modules & Styles:** When a stylesheet is modified, the HMR channel pushes an update message containing the new CSS text. The client runtime replaces the `<style>` tag instantly with **zero component re-renders** or state loss.
2. **React Components:** Modifications to React components trigger React Fast Refresh, preserving local `useState` and form state across edits.
3. **Server Routes:** Edits to server-only files (`app/api/**/route.ts`) invalidate the server cache; subsequent requests evaluate the fresh code instantly without restarting the dev process.
