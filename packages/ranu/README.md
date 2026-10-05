<p align="center">
  <a href="https://hoslift.com">
    <img src="https://raw.githubusercontent.com/hoslift/ranu.js/main/assets/banner.png" alt="Ranu.js Cover Banner" width="100%">
  </a>
</p>

<p align="center">
  <strong>The Core Engine of Ranu.js.</strong><br>
  JavaScript & TypeScript Full-Stack Web Application Framework.
</p>

<p align="center">
  <a href="https://hoslift.com">
    <img src="https://img.shields.io/badge/MADE%20BY%20HOSLIFT-228be6?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMjAuMzQxIDYuNDg0QTEwIDEwIDAgMCAxIDEwLjI2NiAyMS44NSIvPjxwYXRoIGQ9Ik0zLjY1OSAxNy41MTZBMTAgMTAgMCAwIDEgMTMuNzQgMi4xNTIiLz48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIzIi8+PGNpcmNsZSBjeD0iMTkiIGN5PSI1IiByPSIyIi8+PGNpcmNsZSBjeD0iNSIgY3k9IjE5IiByPSIyIi8+PC9zdmc+" alt="Made by Hoslift">
  </a>
  <img src="https://img.shields.io/badge/STATUS-PUBLIC--ALPHA-ff9100?style=for-the-badge&labelColor=000000" alt="Public Alpha">
  <a href="https://github.com/hoslift/ranu.js/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/LICENSE-MIT-40c057?style=for-the-badge&labelColor=000000" alt="MIT License">
  </a>
</p>

<p align="center">
  <!-- Package & Ecosystem -->
  <a href="https://www.npmjs.com/package/@ranujs/core"><img src="https://img.shields.io/npm/v/%40ranujs%2Fcore.svg?style=flat&label=npm" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@ranujs/core"><img src="https://img.shields.io/npm/dt/%40ranujs%2Fcore.svg?style=flat&label=downloads" alt="npm total downloads"></a>
  <a href="https://www.npmjs.com/package/@ranujs/core"><img src="https://img.shields.io/npm/unpacked-size/%40ranujs%2Fcore?style=flat" alt="npm package size"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-%3E%3D22.0.0-339933?style=flat&logo=node.js&logoColor=white" alt="Node Version"></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=black" alt="React 19"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript"></a>
  <a href="https://github.com/sponsors/draj256"><img src="https://img.shields.io/badge/Sponsor-draj256-ea4aaa?style=flat&logo=github-sponsors&logoColor=white" alt="Sponsor on GitHub"></a>
  <a href="https://www.paypal.com/donate/?hosted_button_id=G8MDMN2AGD5UJ"><img src="https://img.shields.io/badge/Donate-PayPal-00457C?style=flat&logo=paypal&logoColor=white" alt="Donate with PayPal"></a>
</p>

---

> [!NOTE]
> **Public Alpha Stage (v0.1.x)**
> `@ranujs/core` is under active community development. While stable for evaluation, prototypes, and testing, APIs and internal architectures may evolve toward v1.0.0.

---

## What is `@ranujs/core`?

`@ranujs/core` provides the foundational runtime, compiler orchestration, and streaming SSR pipeline for the **Ranu.js** framework:

- **Independent Server Runtime:** Direct, high-throughput HTTP server with zero unnecessary abstraction layers.
- **Built-in Bundler Orchestration:** Lightning-fast builds powered by Vite and esbuild.
- **React 19 Server Components & Streaming SSR:** Progressive HTML rendering with suspension and hydration support.
- **Security by Default:** Compile-time `server-only` boundary validation that guarantees secrets never leak to browser bundles.

---

## Quick Start

### 1. Automatic Scaffolding (Recommended)

The fastest and most reliable way to start a new application with `@ranujs/core` is using the official project initializer:

```bash
# Using npm (recommended — pre-installed with Node.js)
npm create ranujs my-app

# Or using alternative package managers
pnpm create ranujs my-app
yarn create ranujs my-app
bun create ranujs my-app
```

Then navigate to your project and start the development server:

```bash
cd my-app
npm run dev
```

---

### 2. Manual Setup (Existing Projects)

If you prefer to configure your application manually or integrate `@ranujs/core` into an existing repository:

```bash
# Install core runtime dependencies
npm install @ranujs/core react react-dom

# Install development toolchain
npm install -D typescript @types/node @types/react @types/react-dom
```

Configure development and build scripts in `package.json`:

```json
{
  "scripts": {
    "dev": "ranu dev",
    "build": "ranu build",
    "start": "ranu start"
  }
}
```

---

## CLI Commands

`@ranujs/core` registers the official `ranu` executable:

```bash
# Start local development server with Hot Module Replacement
npx ranu dev

# Compile and optimize for production
npx ranu build

# Launch the production server
npx ranu start
```

---

## Public API & Subpath Exports

`@ranujs/core` exposes specialized modular subpaths with first-class TypeScript definitions:

| Export Subpath                 | Purpose & Key APIs                                                                                 |
| :----------------------------- | :------------------------------------------------------------------------------------------------- |
| **`@ranujs/core`**             | Framework root entry point, version metadata, and runtime lifecycle hooks.                         |
| **`@ranujs/core/config`**      | Configuration helper: `defineConfig({ ... })` for type-safe `ranu.config.ts`.                      |
| **`@ranujs/core/react`**       | React 19 components and hooks: `<Link />`, `<Head />`, routing contexts, and hydration primitives. |
| **`@ranujs/core/server`**      | Server-side execution helpers: route handlers, request validation, response streaming utilities.   |
| **`@ranujs/core/server-only`** | Compile-time security boundary. Throw build errors if imported into client code.                   |
| **`@ranujs/core/plugin`**      | Extensibility system: `definePlugin({ ... })` to customize bundling, transforms, and middleware.   |

### Configuration Example (`ranu.config.ts`)

```typescript
import { defineConfig } from '@ranujs/core/config';

export default defineConfig({
  server: {
    port: 3000,
  },
});
```

---

## 💖 Sponsors & Backers

Ranu.js is an independent open-source framework created and maintained by [Hoslift](https://hoslift.com). Financial contributions support infrastructure, security audits, and continuous maintenance.

<p align="center">
  <a href="https://github.com/sponsors/draj256">
    <img src="https://img.shields.io/badge/Sponsor_on_GitHub-EA4AAA?style=for-the-badge&logo=github-sponsors&logoColor=white" alt="Sponsor on GitHub">
  </a>
  &nbsp;&nbsp;
  <a href="https://opencollective.com/ranujs">
    <img src="https://img.shields.io/badge/Donate_via_Open_Collective-7FADF2?style=for-the-badge&logo=open-collective&logoColor=white" alt="Donate via Open Collective">
  </a>
  &nbsp;&nbsp;
  <a href="https://www.paypal.com/donate/?hosted_button_id=G8MDMN2AGD5UJ">
    <img src="https://img.shields.io/badge/Donate_via_PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white" alt="Donate via PayPal">
  </a>
</p>

<!-- Future Sponsor Logos and Backers will be displayed here -->

---

## 👥 Contributors

Thank you to everyone helping shape Ranu.js into a world-class framework!

<a href="https://github.com/hoslift/ranu.js/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=hoslift/ranu.js" alt="Ranu.js Contributors" />
</a>

---

## Ecosystem Links

- 🌐 **Repository:** [github.com/hoslift/ranu.js](https://github.com/hoslift/ranu.js)
- 🚀 **Create New Project:** [`create-ranujs`](https://www.npmjs.com/package/create-ranujs)
- 🔒 **Security Policy:** [SECURITY.md](https://github.com/hoslift/ranu.js/blob/main/SECURITY.md)
- 🤝 **Contributing Guide:** [CONTRIBUTING.md](https://github.com/hoslift/ranu.js/blob/main/CONTRIBUTING.md)

---

## License

Licensed under the **[MIT License](https://github.com/hoslift/ranu.js/blob/main/LICENSE)**.  
Copyright &copy; 2026 [Hoslift](https://hoslift.com) and Ranu.js contributors.
