<p align="center">
  <a href="https://ranu.js.org">
    <img src="logo.svg" alt="Ranu.js Logo" width="80" height="80" style="border-radius: 50%; border: 2px solid #ffffff; padding: 8px;">
  </a>
</p>
<h1 align="center">ranu.js</h1>

<p align="center">
<a href="https://hoslift.com">
  <img src="https://img.shields.io/badge/MADE%20BY%20HOSLIFT-228be6?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMjAuMzQxIDYuNDg0QTEwIDEwIDAgMCAxIDEwLjI2NiAyMS44NSIvPjxwYXRoIGQ9Ik0zLjY1OSAxNy41MTZBMTAgMTAgMCAwIDEgMTMuNzQgMi4xNTIiLz48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIzIi8+PGNpcmNsZSBjeD0iMTkiIGN5PSI1IiByPSIyIi8+PGNpcmNsZSBjeD0iNSIgY3k9IjE5IiByPSIyIi8+PC9zdmc+" alt="Made by Hoslift">
</a>
</p>

<p align="center">
  <strong>Rethinking the Full-Stack Web.</strong><br>
  A lightweight, portable, and type-safe framework engineered for extreme speed and modern edge runtimes.
</p>

<p align="center">

  <a href="https://www.npmjs.com/">
  <img src="https://img.shields.io/badge/NPM-V%201.0.0-ffffff?style=for-the-badge&labelColor=000000&logo=npm&logoColor=fe4d4d" alt="NPM Version">
</a>
<a href="https://github.com/hoslift/ranu.js/blob/main/LICENSE">
  <img src="https://img.shields.io/badge/LICENSE-MIT-40c057?style=for-the-badge&labelColor=000000&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTEyIDN2MTgiLz48cGF0aCBkPSJtMTkgOCAzIDhhNSA1IDAgMCAxLTYgMHpWNyIvPjxwYXRoIGQ9Ik0zIDdoMWExNyAxNyAwIDAgMCA4LTIgMTcgMTcgMCAwIDAgOCAyaDEiLz48cGF0aCBkPSJtNSA4IDMgOGE1IDUgMCAwIDEtNiAwelY3Ii8+PHBhdGggZD0iTTcgMjFoMTAiLz48L3N2Zz4=&logoColor=white" alt="MIT License">
</a>
<a href="https://github.com/hoslift/ranu.js/issues">
  <img src="https://img.shields.io/github/issues/hoslift/ranu.js?style=for-the-badge&color=ffd43b&labelColor=000000&logo=github&logoColor=white" alt="Issues">
</a>
  <a href="https://github.com/hoslift/ranu.js">
  <img src="https://img.shields.io/badge/STATUS-UNDER%20DEVELOPMENT-ff9100?style=for-the-badge&labelColor=000000&logo=git&logoColor=white" alt="Status Under Development">
</a>
</p>



---

> 🌐 **100% Open Source. Built by Developers, Owned by the Community.**  
> We believe the future of the web belongs to open ecosystems, not proprietary silos. Ranu.js is fully open-source to guarantee total transparency, vendor neutrality, and long-term architectural independence.

## Overview

**Ranu.js** is an ultra-fast, TypeScript-first full-stack web framework engineered to deliver a single, unified ecosystem for modern web applications. It seamlessly bridges frontend interfaces, backend APIs, server-side rendering (SSR), and static site generation (SSG) without performance compromises.

Architected as **React-first, but core-neutral** — Ranu.js strictly decouples routing, HTTP execution, asset manifests, and deployment adapters from UI internals, granting complete freedom over your rendering stack and execution environment.

* **Unified Full-Stack Engine:** Build APIs, SSR, SSG, and client UI within a single, highly coherent developer experience.
* **Core-Neutral Architecture:** UI-agnostic foundation that isolates runtime execution from frontend framework code.
* **Deploy Anywhere:** True adapter-driven design built for Edge, Serverless, and Node.js runtimes.

*Created and maintained by [@hoslift](https://github.com/hoslift).*

##  Key Features

* **Pure TypeScript-First:** End-to-end type safety out of the box with zero setup overhead.
* **Core-Neutral Architecture:** Decoupled UI execution—start with React today, adapt to any engine tomorrow.
* **Universal Deployment Adapters:** Deploy seamlessly to Node.js, Cloudflare Workers, Bun, or AWS Lambda without rewriting application code.
* **Ultra-Fast HTTP Router:** High-throughput, memory-efficient routing engine designed for minimal latency.
* **Zero Vendor Lock-In:** Complete infrastructure sovereignty—your code, your deployment, your control.

---

##  Architecture

Ranu.js isolates core web execution mechanics from the underlying runtime and UI rendering layer:
```text
┌──────────────────────────────────────────────────────────┐
│                      Ranu.js App                         │
├──────────────────────────────────────────────────────────┤
│           UI Layer (React / Core-Neutral)                │
├──────────────────────────────────────────────────────────┤
│            Ranu Core Engine & Router                     │
├──────────────────────────────────────────────────────────┤
│   Adapters (Node.js / Bun / Edge / Cloudflare / AWS)     │
└──────────────────────────────────────────────────────────┘
```

---

##  Quick Start

### Installation

Install Ranu.js into your existing TypeScript project using your preferred package manager:

```bash
# Using npm
npm install ranu

# Using pnpm
pnpm add ranu

# Using bun
bun add ranu
```

### Basic Application Setup
Create a simple entry point in `src/index.ts`:

```typescript
import { createServer } from 'ranu';

const app = createServer();

app.get('/', (c) => {
  return c.json({ message: 'Hello from Ranu.js!' });
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
```
## Project Structure
A typical Ranu.js application structure is kept clean, intuitive, and highly predictable:

```text
my-ranu-app/
├── src/
│   ├── api/             # Backend API routes
│   ├── components/      # Shared UI components
│   ├── pages/           # Application views & pages
│   └── index.ts         # Main entry point
├── public/              # Static assets (images, fonts)
├── ranu.config.ts       # Ranu framework configuration
├── tsconfig.json        # TypeScript configuration
└── package.json
```

## CLI Commands
Ranu.js comes with a built-in CLI for high-speed local development, production builds, and adapter packaging:

| Command | Description |
| :--- | :--- |
| `ranu dev` | Starts the local development server with instant HMR. |
| `ranu build` | Compiles application code and generates production bundles. |
| `ranu start` | Runs the compiled production build locally. |
| `ranu preview` | Previews the production build with specified adapters. |

## Deployment & Adapters

Deploy your Ranu.js application to any provider without changing core application logic. Simply switch or configure your target adapter in `ranu.config.ts`:

* **Node.js / Express Runtime**
* **Bun Runtime**
* **Cloudflare Workers / Pages**
* **AWS Lambda (Serverless)**

---

## Contributing

Contributions, issues, and feature requests are welcome!  
Feel free to check out the [issues page](https://github.com/hoslift/ranu.js/issues) to report bugs or propose new framework capabilities.

1. Fork the Repository
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## License

Distributed under the MIT License. See [`LICENSE`](LICENSE) for more information.
