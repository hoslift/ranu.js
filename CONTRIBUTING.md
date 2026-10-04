# Contributing to Ranu.js

<p align="center">
  <a href="https://github.com/hoslift/ranu.js/blob/main/CONTRIBUTING.md">
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat" alt="PRs Welcome">
  </a>
  <a href="./CODE_OF_CONDUCT.md">
    <img src="https://img.shields.io/badge/Contributor%20Covenant-v2.1-4baaaa.svg?style=flat" alt="Code of Conduct">
  </a>
  <a href="./SECURITY.md">
    <img src="https://img.shields.io/badge/Security-Policy-blue.svg?style=flat" alt="Security Policy">
  </a>
  <a href="https://conventionalcommits.org">
    <img src="https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg?style=flat" alt="Conventional Commits">
  </a>
</p>

---

Thank you for your interest in contributing to **Ranu.js**!

Ranu.js is an open-source project, and contributions from the community are warmly welcomed. Whether you are fixing typos, improving documentation, submitting bug fixes, or proposing new framework features, this guide will help you get started smoothly.

> [!NOTE]
> **Public Alpha Stage**  
> Ranu.js is currently in **Public Alpha development**. Architecture, APIs, package boundaries, and internal workflows are actively evolving as the project progresses toward the stable V1 milestone.

---

## Quick Contribution Decision Matrix

To save your time and keep contributions streamlined, refer to this quick guide:

| Type of Contribution | Issue Required First? | Changeset Required? | Example Commit Prefix |
| :--- | :---: | :---: | :--- |
| **Documentation / Typo Fixes** | ❌ No (Direct PR) | ❌ No | `docs: fix routing example typo` |
| **Small Bug Fix (Clear & scoped)** | ❌ No (Direct PR) | ✅ Yes (if in published package) | `fix(router): resolve dynamic segment matching` |
| **New Feature / API Change** | ✅ Yes (Open Issue/RFC first) | ✅ Yes | `feat(runtime): add response streaming support` |
| **Tests & Internal Tooling** | ❌ No (Direct PR) | ❌ No | `test: add unit tests for cookie parsing` |
| **Refactoring (No external API change)** | Optional | ❌ No | `refactor(build): simplify module graph traversal` |

---

## Development Setup

Ranu.js is developed as a `pnpm` monorepo.

### Prerequisites

* **Node.js** >= 22.0.0
* **pnpm** >= 11.0.0

To enable or install `pnpm`:

```bash
# Option 1: Using Corepack (recommended)
corepack enable

# Option 2: Using npm globally
npm install -g pnpm
```

### Clone and Bootstrap

```bash
# 1. Clone the repository
git clone https://github.com/hoslift/ranu.js.git
cd ranu.js

# 2. Install dependencies across all packages
pnpm install

# 3. Build all workspace packages
pnpm build
```

---

## Repository Structure

The monorepo is organized cleanly into modular packages and directories:

| Directory | Purpose |
| :--- | :--- |
| `packages/` | Core framework packages (`router`, `react`, `runtime`, `build`, `server`, etc.) |
| `adapters/` | Deployment adapters (e.g., `@ranujs/adapter-vercel`) |
| `create-ranu/` | The official CLI scaffolder (`create-ranujs`) |
| `examples/` | Standalone, canonical reference applications using public APIs |
| `fixtures/` | Internal test applications used by test harnesses |
| `tests/` | End-to-end, API contract, security, and performance test suites |
| `docs/` | Specifications and public documentation |
| `rfcs/` | Architectural proposals and Request for Comments |
| `tooling/` | Internal repository configs and build tools |

---

## Development Workflow

### 1. Create a Branch

Always create a dedicated feature or fix branch from `main`:

```bash
git checkout -b <type>/<short-description>
```

Branch naming conventions:
* `feat/<feature-name>` (e.g., `feat/edge-adapter`)
* `fix/<bug-name>` (e.g., `fix/cookie-parsing`)
* `docs/<topic>` (e.g., `docs/quickstart-guide`)
* `test/<component>` (e.g., `test/ssr-streaming`)
* `chore/<task>` (e.g., `chore/bump-deps`)

---

### 2. Commit Message Guidelines

Ranu.js follows the **Conventional Commits** standard. Please use structured commit messages:

```text
<type>(<scope>): <short description>
```

#### Allowed Types:
* `feat`: A new feature or capability
* `fix`: A bug fix
* `docs`: Documentation changes only
* `test`: Adding or correcting tests
* `refactor`: Code change that neither fixes a bug nor adds a feature
* `perf`: Performance improvement
* `chore`: Maintenance tasks, dependency updates, tooling

#### Examples:
* `feat(react): support custom error boundaries in nested layouts`
* `fix(router): sanitize regex in dynamic path generation`
* `docs: update npm-first quick start instructions`
* `test(security): add test suite for server-only boundaries`

---

### 3. Adding or Updating Tests

Any code change that alters framework runtime behavior or fixes a bug **must include tests**.

```bash
# Run all tests
pnpm test

# Run unit tests only
pnpm test:unit

# Run API contract tests
pnpm test:api

# Run integration tests
pnpm test:integration
```

---

### 4. Validating Your Changes (Pre-PR Check)

Before opening a pull request, run the local validation pipeline to ensure all checks pass:

```bash
# Complete local validation (same as CI pipeline)
pnpm prepr
```

Alternatively, you can run individual checks:

```bash
pnpm typecheck       # TypeScript type checking
pnpm lint            # ESLint code analysis
pnpm format:check    # Prettier formatting check
pnpm ci:verify       # Verification suite without cleaning
```

---

### 5. Adding a Changeset

If your pull request introduces changes to packages that are published to npm (e.g., `@ranujs/core`, `create-ranujs`, or adapters), you must include a Changeset:

```bash
pnpm changeset
```

Follow the interactive prompts:
1. Select the packages affected by your change (use arrow keys and space).
2. Choose the version impact:
   * **patch:** Bug fixes and minor internal updates.
   * **minor:** New backward-compatible features.
   * **major:** Breaking changes (discuss with maintainers first).
3. Write a clear, concise summary of the change. This summary will be automatically added to `CHANGELOG.md` upon release.

> Changes affecting only `docs/`, `tests/`, `examples/`, or internal tooling **do not require a Changeset**.

---

### 6. Opening a Pull Request (PR)

1. Push your branch to your fork or repository:
   ```bash
   git push origin <branch-name>
   ```
2. Open a Pull Request targeting the `main` branch.
3. Complete the PR template with:
   * A clear explanation of what changed and why.
   * Links to relevant issues (e.g., `Closes #123`).
   * How the change was tested.

---

## Contributor Checklist

Before submitting your pull request, verify:

- [ ] Changes are focused and do not include unrelated code or formatting changes.
- [ ] Code follows project conventions and passes `pnpm lint`.
- [ ] TypeScript compiles cleanly with `pnpm typecheck`.
- [ ] Relevant unit or integration tests are added/updated and pass (`pnpm test`).
- [ ] Changeset is added via `pnpm changeset` (if published packages were modified).
- [ ] Local pre-PR validation passes (`pnpm prepr`).

---

## Frequently Asked Questions (FAQ)

### Q: Where can I find beginner-friendly tasks?
Check our [GitHub Issues](https://github.com/hoslift/ranu.js/issues) and filter by labels:
* `good first issue` — Perfect for new contributors.
* `help wanted` — Community contributions welcome.
* `documentation` — Improvements to guides, docstrings, and examples.

### Q: What should I do if CI fails on my PR?
Don't worry! Click **Details** on the failing GitHub Actions job to view the error log. You can reproduce the exact check locally by running:
```bash
pnpm prepr
```
Fix the reported error, commit, and push to your PR branch.

### Q: Do I need to create a Changeset for documentation or test updates?
**No.** Changesets are only required when modifying code inside published packages (`packages/` or `adapters/`).

### Q: Can I submit a large new feature directly as a PR?
For substantial features, architectural modifications, or breaking API changes, please **open an issue or RFC first**. This ensures community and maintainer alignment before you invest time writing code.

---

## Code of Conduct

All contributors are expected to uphold our standards of a welcoming, inclusive, and harassment-free community. Please review [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) before participating.

---

## Security

Please do not report security vulnerabilities through public GitHub Issues. Review our [`SECURITY.md`](./SECURITY.md) policy for responsible private disclosure.

---

## License

By contributing to Ranu.js, you agree that your contributions will be licensed under the [MIT License](./LICENSE).

---

<p align="center">
  <strong>Ranu.js</strong> — Rethinking the Full-Stack Web.<br>
  Maintained by <a href="https://hoslift.com">Hoslift</a>.
</p>
