<p align="center">
  <a href="https://hoslift.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/hoslift/ranu.js/main/logo-dark.svg">
      <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/hoslift/ranu.js/main/logo-light.svg">
      <img src="https://raw.githubusercontent.com/hoslift/ranu.js/main/logo-light.svg" alt="Ranu.js Logo" width="540">
    </picture>
  </a>
</p>

<p align="center">
  <strong>The Official Project Initializer for Ranu.js.</strong><br>
  Scaffold production-ready, TypeScript-first Ranu.js applications in seconds.
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
  <a href="https://www.npmjs.com/package/create-ranujs"><img src="https://img.shields.io/npm/v/create-ranujs.svg?style=flat&label=npm" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/create-ranujs"><img src="https://img.shields.io/npm/dt/create-ranujs.svg?style=flat&label=downloads" alt="npm total downloads"></a>
  <a href="https://www.npmjs.com/package/create-ranujs"><img src="https://img.shields.io/npm/unpacked-size/create-ranujs?style=flat" alt="npm package size"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-%3E%3D22.0.0-339933?style=flat&logo=node.js&logoColor=white" alt="Node Version"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript"></a>
  <a href="https://github.com/sponsors/draj256"><img src="https://img.shields.io/badge/Sponsor-draj256-ea4aaa?style=flat&logo=github-sponsors&logoColor=white" alt="Sponsor on GitHub"></a>
  <a href="https://www.paypal.com/donate/?hosted_button_id=G8MDMN2AGD5UJ"><img src="https://img.shields.io/badge/Donate-PayPal-00457C?style=flat&logo=paypal&logoColor=white" alt="Donate with PayPal"></a>
</p>

---

> [!NOTE]
> **Public Alpha Stage (v0.1.x)**
> `create-ranujs` provides the fastest path to start building with Ranu.js. Generated projects are pre-configured with React 19, TypeScript, and `@ranujs/core`.

---

## Quick Start

Create a new application with the interactive setup wizard:

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

Open `http://localhost:3000` in your browser.

---

## Command-Line Flags & Options

You can automate project scaffolding in CI/CD or scripts using command-line flags:

```bash
# Scaffold and automatically install dependencies using pnpm
npx create-ranujs my-app --package-manager pnpm --install

# Scaffold without initializing a Git repository
npx create-ranujs my-app --no-git
```

| Flag                | Shorthand | Description                                  | Supported Values             |
| :------------------ | :-------- | :------------------------------------------- | :--------------------------- |
| `--package-manager` | `-p`      | Choose explicit package manager              | `npm`, `pnpm`, `yarn`, `bun` |
| `--install`         |           | Automatically install dependencies           | `boolean`                    |
| `--no-install`      |           | Skip dependency installation                 | `boolean`                    |
| `--git`             |           | Initialize a Git repository (default)        | `boolean`                    |
| `--no-git`          |           | Skip Git repository initialization           | `boolean`                    |
| `--force`           |           | Force scaffolding into a non-empty directory | `boolean`                    |
| `--quiet`           | `-q`      | Suppress non-error console output            | `boolean`                    |
| `--json`            |           | Output result metadata as JSON               | `boolean`                    |
| `--help`            | `-h`      | Display available CLI options                |                              |
| `--version`         | `-v`      | Display CLI version                          |                              |

---

## What Gets Generated?

Every newly created Ranu.js project comes with a clean, production-ready structure:

```text
my-app/
├── app/
│   ├── layout.tsx         # Root HTML/Head layout shell
│   └── page.tsx           # Home page route component
├── ranu.config.ts         # Type-safe Ranu.js server configuration
├── tsconfig.json          # NodeNext strict TypeScript configuration
├── package.json           # Scripts (ranu dev, ranu build, ranu start)
└── .gitignore             # Standard ignore rules (.ranu, dist, node_modules)
```

---

## 💖 Sponsors & Backers

Ranu.js is an independent open-source framework created and maintained by [Hoslift](https://hoslift.com). Financial contributions support ongoing maintenance, developer tools, and ecosystem infrastructure.

<p align="center">
  <a href="https://github.com/sponsors/draj256">
    <img src="https://img.shields.io/badge/Sponsor_on_GitHub-EA4AAA?style=for-the-badge&logo=github-sponsors&logoColor=white" alt="Sponsor on GitHub">
  </a>
  &nbsp;&nbsp;
  <a href="https://www.paypal.com/donate/?hosted_button_id=G8MDMN2AGD5UJ">
    <img src="https://img.shields.io/badge/Donate_via_PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white" alt="Donate via PayPal">
  </a>
</p>

<!-- Future Sponsor Logos and Backers will be displayed here -->

---

## 👥 Contributors

Thank you to everyone contributing to the Ranu.js ecosystem!

<a href="https://github.com/hoslift/ranu.js/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=hoslift/ranu.js" alt="Ranu.js Contributors" />
</a>

---

## Ecosystem Links

- 🌐 **Repository:** [github.com/hoslift/ranu.js](https://github.com/hoslift/ranu.js)
- 📦 **Core Framework:** [`@ranujs/core`](https://www.npmjs.com/package/@ranujs/core)
- 🔒 **Security Policy:** [SECURITY.md](https://github.com/hoslift/ranu.js/blob/main/SECURITY.md)
- 🤝 **Contributing Guide:** [CONTRIBUTING.md](https://github.com/hoslift/ranu.js/blob/main/CONTRIBUTING.md)

---

## License

Licensed under the **[MIT License](https://github.com/hoslift/ranu.js/blob/main/LICENSE)**.  
Copyright &copy; 2026 [Hoslift](https://hoslift.com) and Ranu.js contributors.
