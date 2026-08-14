<p align="center">
  <a href="https://ranu.js.org">
    <img src="logo.svg" alt="Ranu.js Logo" width="80" height="80">
  </a>
</p>

<h1 align="center">Ranu.js</h1>

<p align="center">
  <strong>Rethinking the Full-Stack Web.</strong><br>
  A JavaScript/TypeScript full-stack web framework for building modern web applications.
</p>

<p align="center">
  <a href="https://hoslift.com"> <img src="https://img.shields.io/badge/MADE%20BY%20HOSLIFT-228be6?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMjAuMzQxIDYuNDg0QTEwIDEwIDAgMCAxIDEwLjI2NiAyMS44NSIvPjxwYXRoIGQ9Ik0zLjY1OSAxNy41MTZBMTAgMTAgMCAwIDEgMTMuNzQgMi4xNTIiLz48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIzIi8+PGNpcmNsZSBjeD0iMTkiIGN5PSI1IiByPSIyIi8+PGNpcmNsZSBjeD0iNSIgY3k9IjE5IiByPSIyIi8+PC9zdmc+" alt="Made by Hoslift"> </a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/LICENSE-MIT-40c057?style=for-the-badge&labelColor=000000" alt="MIT License">
  </a>
  <a href="https://github.com/hoslift/ranu.js/issues">
    <img src="https://img.shields.io/github/issues/hoslift/ranu.js?style=for-the-badge&color=ffd43b&labelColor=000000&logo=github&logoColor=white" alt="GitHub Issues">
  </a>
  <img src="https://img.shields.io/badge/STATUS-PRE--ALPHA-ff9100?style=for-the-badge&labelColor=000000" alt="Pre-Alpha">
</p>

---

> [!WARNING]
> **Early Development**
>
> Ranu.js is currently in **pre-alpha development**. APIs are not stable and may change as development progresses. Ranu.js is **not yet suitable for production use**.

## About Ranu.js

**Ranu.js** is an open-source JavaScript/TypeScript full-stack web framework being developed for modern web application development.

The V1 direction brings together routing, server-side rendering, static generation, client rendering, API routes, middleware, React integration, styling, plugins, and deployment support within a unified framework.

Ranu.js is currently being built and validated in public. Features documented as **V1 Target** describe the intended scope of the first major development milestone and should not be interpreted as stable production functionality.

---

## V1 Target Features

The current Ranu.js V1 target includes:

* **File-based routing**

  * Layouts
  * Dynamic routes
  * Catch-all routes
* **Server-side rendering (SSR)**
* **Static site generation (SSG)**
* **Client rendering**
* **TypeScript-first development**
* **API routes**
* **Middleware**
* **React integration with hydration**
* **CSS and CSS Modules**
* **Plugin system**
* **Deployment support**

  * Generic Node.js
  * Containers
  * Vercel

> These capabilities are development targets for V1. Individual features may be incomplete, experimental, or subject to change during pre-alpha development.

---

## Development

Ranu.js is developed as a **pnpm monorepo**.

### Requirements

* **Node.js** >= 22.0.0
* **pnpm** >= 11.0.0

### Local Development

Clone the repository:

```bash
git clone https://github.com/hoslift/ranu.js.git
cd ranu.js
```

Install dependencies:

```bash
pnpm install
```

Build all packages:

```bash
pnpm build
```

Run all tests:

```bash
pnpm test
```

Run TypeScript type checking:

```bash
pnpm typecheck
```

Run linting:

```bash
pnpm lint
```

Format the codebase:

```bash
pnpm format
```

---

## Getting Started

> [!NOTE]
> **Public installation is coming soon.**

Ranu.js has not yet reached a stable public release.

The intended project creation experience is:

```bash
npm create ranu@latest my-app
cd my-app
npm install
npm run dev
```

The package name, CLI behavior, and installation workflow may change before the first public release.

Official installation instructions will be published once the corresponding packages are ready for public use.

---

## Development Roadmap

Ranu.js is being developed incrementally toward its first stable release.

Development currently focuses on delivering and validating the V1 framework foundation before production stability is declared.

Major areas include:

1. Core framework foundation
2. File-based routing
3. Rendering infrastructure
4. API routes and middleware
5. React integration and hydration
6. CSS and CSS Modules
7. Development tooling
8. Plugin architecture
9. Node.js and container deployment
10. Vercel deployment
11. Testing and stabilization
12. Documentation and examples
13. Pre-release validation
14. Stable release preparation

A dedicated `ROADMAP.md` can track implementation progress, milestones, and release status as development continues.

---

## Documentation

Public documentation is planned for the official Ranu.js project website as the framework develops.

Detailed framework design, API specifications, and usage guides will be published alongside stable releases.

---

## Contributing

Ranu.js is open source, and contributions are welcome.

Before opening a pull request, please read:

[`CONTRIBUTING.md`](./CONTRIBUTING.md)

You can also use [GitHub Issues](https://github.com/hoslift/ranu.js/issues) to report problems, suggest improvements, or discuss proposed framework capabilities.

Because Ranu.js is currently pre-alpha, architecture and APIs may change significantly as development progresses.

---

## Security

Please read [`SECURITY.md`](./SECURITY.md) for the project's security policy and responsible disclosure process.

Please do not publicly disclose security vulnerabilities through regular GitHub issues.

---

## Supporting Ranu.js

Ranu.js is being developed as an open-source project and is intended to remain freely available under the MIT License.

Future sponsorships will help support areas such as:

* Core framework development
* Testing and quality assurance
* Documentation
* Development infrastructure
* Project maintenance
* Community resources

Official sponsorship options will be published when available.

---

## Project Status

| Area                 | Status             |
| -------------------- | ------------------ |
| Project              | Active development |
| Release stage        | Pre-alpha          |
| Production ready     | No                 |
| API stability        | Unstable           |
| V1 development       | In progress        |
| Public documentation | Coming soon        |
| Stable release       | Not yet available  |

---

## License

Ranu.js is open-source software distributed under the **MIT License**.

See [`LICENSE`](./LICENSE) for the full license text.

---

<p align="center">
  <strong>Ranu.js</strong><br>
  Rethinking the Full-Stack Web.
</p>

<p align="center">
  Open source under the MIT License.<br>
  Created and maintained by <a href="https://github.com/hoslift">Hoslift</a>.
</p>
