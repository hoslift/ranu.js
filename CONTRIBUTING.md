# Contributing to Ranu.js

Thank you for your interest in contributing to **Ranu.js**!

Ranu.js is an open-source project, and contributions from the community are welcome.

> [!NOTE]
> **Early Development**
>
> Ranu.js is currently in **pre-alpha development**. APIs, architecture, package boundaries, and development workflows may change as the project matures.

## Before You Start

Because Ranu.js is still in early development, significant changes to core framework behavior should be discussed before implementation.

Before working on a large feature, architectural change, or breaking API change:

1. Check existing GitHub Issues and pull requests.
2. Open an issue describing the proposed change if one does not already exist.
3. Explain the problem, proposed approach, and expected impact.
4. Allow maintainers and contributors to discuss the proposal before beginning substantial implementation.

Small bug fixes, documentation improvements, tests, and other clearly scoped changes generally do not require a separate proposal.

---

## Development Setup

### Requirements

* **Node.js** >= 22.0.0
* **pnpm** >= 11.0.0

### Clone the Repository

Enable Corepack for consistent pnpm usage:

```bash id="ry7m19"
corepack enable
```

Clone Ranu.js:

```bash id="ap2k5b"
git clone https://github.com/hoslift/ranu.js.git
cd ranu.js
```

Install all workspace dependencies:

```bash id="s4d0qf"
pnpm install
```

Build all packages:

```bash id="q6v6tw"
pnpm build
```

Run the test suite:

```bash id="y8nh1w"
pnpm test
```

Run TypeScript type checking:

```bash id="f7l6e8"
pnpm typecheck
```

Run linting:

```bash id="rwj06h"
pnpm lint
```

Run the formatting check:

```bash id="08d3r3"
pnpm format:check
```

---

## Repository Structure

Ranu.js is developed as a monorepo.

The repository is organized around the following areas:

| Directory      | Purpose                                         |
| -------------- | ----------------------------------------------- |
| `packages/`    | Core framework packages                         |
| `adapters/`    | Deployment adapter packages                     |
| `create-ranu/` | Project scaffolder                              |
| `examples/`    | Official usage examples using public APIs       |
| `fixtures/`    | Internal test applications                      |
| `tests/`       | Cross-package integration and end-to-end tests  |
| `docs/`        | Public project and framework documentation      |
| `rfcs/`        | Public architectural proposals where applicable |
| `tooling/`     | Internal repository tooling                     |

The repository structure may evolve during pre-alpha development.

---

## Development Workflow

### 1. Create a Branch

Create a focused branch for your change.

Common branch prefixes include:

```text id="0utnm9"
feat/<name>
fix/<name>
docs/<name>
test/<name>
refactor/<name>
chore/<name>
```

Examples:

```text id="10md7h"
feat/router-middleware
fix/dynamic-route-matching
docs/contributing-guide
```

### 2. Make Your Changes

Keep changes focused on the issue, feature, or improvement being addressed.

Avoid unrelated refactoring or formatting changes in the same pull request unless they are required by the implementation.

### 3. Add or Update Tests

Changes that affect framework behavior should include appropriate tests.

Tests should cover:

* Expected behavior
* Relevant edge cases
* Regression scenarios where applicable

### 4. Validate Your Changes

Before opening a pull request, run:

```bash id="qk7sj9"
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
```

If your changes affect the build system or package output, also run:

```bash id="wrxyj5"
pnpm build
```

### 5. Add a Changeset

If your change affects a package intended for publication, add a Changeset:

```bash id="81r3p4"
pnpm changeset
```

Follow the prompts to describe the change and select the appropriate version impact.

Changes that do not affect published packages may not require a Changeset.

### 6. Open a Pull Request

Open a pull request against the appropriate development branch.

Your pull request should explain:

* What changed
* Why the change is needed
* How the change was implemented
* How it was tested
* Any known limitations or follow-up work

Keep pull requests focused and reasonably sized whenever possible.

---

## Architectural Changes

Changes that significantly affect Ranu.js architecture, public APIs, framework behavior, package boundaries, or compatibility should be discussed before substantial implementation begins.

Depending on the scope of the proposal, maintainers may request further discussion through:

* A GitHub Issue
* A dedicated RFC
* An existing architectural discussion

This helps prevent conflicting implementations and ensures major changes remain aligned with the direction of Ranu.js.

---

## Documentation

Changes that introduce or modify public behavior should update the relevant documentation where appropriate.

Examples and documentation should use **public Ranu.js APIs** rather than relying on internal implementation details.

Because the project is still pre-alpha, documentation may evolve alongside the implementation.

---

## Reporting Bugs

Before reporting a bug:

1. Search existing GitHub Issues to check whether it has already been reported.
2. Confirm that the issue occurs on the latest relevant development version.
3. Collect the smallest reproducible example possible.

A useful bug report should include:

* A clear description of the problem
* Steps to reproduce it
* Expected behavior
* Actual behavior
* Relevant environment information
* A minimal reproduction where practical

Use [GitHub Issues](https://github.com/hoslift/ranu.js/issues) for regular bug reports.

---

## Security

**Do not report security vulnerabilities through public GitHub Issues or Discussions.**

Please follow the responsible disclosure process documented in [`SECURITY.md`](./SECURITY.md).

---

## Code of Conduct

All contributors are expected to follow the project Code of Conduct.

Please read [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) before participating in the Ranu.js community.

---

## License

Ranu.js is distributed under the MIT License.

By contributing to Ranu.js, you agree that your contributions will be licensed under the **MIT License**.

See [`LICENSE`](./LICENSE) for the full license text.

---

## Thank You

Every contribution helps Ranu.js move forward.

Whether you contribute code, documentation, tests, bug reports, ideas, or technical feedback, thank you for helping build Ranu.js.

---

**Ranu.js — Rethinking the Full-Stack Web.**
