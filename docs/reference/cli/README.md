# CLI Reference Manual (`ranu`)

The **Ranu.js Command-Line Interface (CLI)** provides development, compilation, scaffolding, and operational commands for managing full-stack applications.

The CLI is available as `ranu` (with `ranujs` alias) when `@ranujs/core` is installed in your project or executed via package runners (`pnpm exec ranu` / `npx ranu`).

---

## 1. Global Command Structure

```bash
ranu <command> [options]
```

### Global Options

These flags can be applied to any subcommand:

| Option | Shorthand | Type | Default | Description |
| :--- | :---: | :---: | :---: | :--- |
| `--root` | `-r` | `string` | `process.cwd()` | Specify the project root directory |
| `--port` | `-p` | `number` | `3000` | Port number to bind the server |
| `--host` | `-h` | `string` | `127.0.0.1` (dev)<br>`0.0.0.0` (start) | Host address to bind |
| `--clean` | — | `boolean` | `false` | Purge cache directories and `.ranu/` before execution |
| `--open` | — | `boolean` | `false` | Open default web browser upon server launch |
| `--verbose` | — | `boolean` | `false` | Enable verbose diagnostic logging |
| `--debug` | — | `boolean` | `false` | Enable internal debug diagnostics and error stack traces |
| `--quiet` | `-q` | `boolean` | `false` | Suppress banners and non-error console output |
| `--json` | — | `boolean` | `false` | Output command status and results in machine-readable JSON format |
| `--help` | — | `boolean` | `false` | Display command help and exit |
| `--version`| `-v` | `boolean` | `false` | Print installed Ranu.js framework version |

---

## 2. Command Index

### ⚡ `ranu dev`
Starts the local development server with Vite-powered Hot Module Replacement (HMR), Fast Refresh, filesystem routing watchers, and on-demand SSR compilation.

```bash
ranu dev [options]
```

#### Specific Flags:
* `--port <number>`: Override default development port (`3000`).
* `--host <string>`: Network interface binding (`127.0.0.1`).
* `--open`: Open application URL in browser upon readiness.
* `--clean`: Flush `.ranu/cache` prior to initialization.

#### Example:
```bash
ranu dev --port 4000 --open
```

---

### 📦 `ranu build`
Compiles, bundles, tree-shakes, and optimizes both client and server assets for production. Emits output to `.ranu/build/`.

```bash
ranu build [options]
```

#### Specific Flags:
* `--clean`: Delete existing `.ranu/build/` directory before building.
* `--json`: Emit structured build manifest summary in JSON format.
* `--debug`: Output verbose module resolution logs.

#### Example:
```bash
ranu build --clean
```

---

### 🚀 `ranu start`
Boots the production HTTP server using precompiled assets located in `.ranu/build/`.

```bash
ranu start [options]
```

#### Behavior & Defaults:
* Default host: `0.0.0.0` (accessible across network containers and VMs).
* Default port: `3000` (can be overridden via `PORT` environment variable or `--port`).
* Implements connection tracking with 5-second graceful shutdown draining on `SIGINT` and `SIGTERM`.

#### Example:
```bash
PORT=8080 ranu start
```

---

### 🛠️ `ranu create`
Interactive project scaffolding utility (equivalent to `npm create ranujs@latest`).

```bash
ranu create [project-name]
```

#### Behavior:
* Prompts for project name, TypeScript settings, styling preferences (Tailwind vs CSS Modules), and starter templates.

---

### 🌐 `ranu deploy`
Executes the configured deployment adapter to format production build artifacts for cloud hosting targets.

```bash
ranu deploy [options]
```

#### Specific Flags:
* `--adapter <name>`: Explicitly specify adapter to execute (e.g. `vercel` or `@ranujs/adapter-vercel`).

#### Example:
```bash
ranu deploy --adapter vercel
```

---

### ℹ️ `ranu help` & `ranu version`
* `ranu help [command]`: Displays targeted command usage and documentation.
* `ranu version`: Prints active framework version.

---

## 3. Machine-Readable JSON Mode (`--json`)

In CI/CD automation pipelines or agentic workflows, pass `--json` to receive structured outputs:

```bash
ranu build --clean --json
```

```json
{
  "status": "success",
  "command": "build",
  "clientAssets": 14,
  "serverRoutes": 6,
  "outputDir": ".ranu/build",
  "durationMs": 420
}
```

---

## 4. Exit Codes

| Code | Status | Meaning |
| :---: | :--- | :--- |
| **`0`** | `SUCCESS` | Command completed successfully or cleanly shut down |
| **`1`** | `ERROR` | Build error, unhandled exception, or missing configuration |
