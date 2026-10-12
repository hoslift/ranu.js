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
## 5. Shell Autocompletion

The CLI ships no completion files, but both shells can complete `ranu` and its `ranujs` alias with a ~40-line script and no external packages.

> [!TIP]
> Both scripts below are verified against the CLI source (`packages/cli/src/args.ts` and `packages/cli/src/commands/help.ts`), so every flag they offer is a flag the CLI actually parses.

### 5.1 Bash

Save the following as `~/.local/share/bash-completion/completions/ranu`:

```bash
# ranu — bash completion for `ranu` and `ranujs`
_ranu() {
  local cur prev i subcmd
  COMPREPLY=()
  cur="${COMP_WORDS[COMP_CWORD]}"
  prev="${COMP_WORDS[COMP_CWORD-1]}"

  # Locate the subcommand: first non-flag word after the program name.
  subcmd=""
  for (( i = 1; i < COMP_CWORD; i++ )); do
    case "${COMP_WORDS[i]}" in
      -*) ;;
      *) subcmd="${COMP_WORDS[i]}"; break ;;
    esac
  done

  # Options that take a value: complete the value, never a flag.
  case "$prev" in
    -r|--root)
      COMPREPLY=( $(compgen -d -- "$cur") )
      return 0
      ;;
    --adapter)
      COMPREPLY=( $(compgen -W "vercel @ranujs/adapter-vercel" -- "$cur") )
      return 0
      ;;
    -p|--port|-h|--host)
      return 0
      ;;
  esac

  if [[ "$cur" == -* ]]; then
    # A bare "-" should only offer short flags, not every long flag too.
    local short="-r -p -h -q -v"
    if [[ "$cur" == "-" ]]; then
      COMPREPLY=( $(compgen -W "$short" -- "$cur") )
      return 0
    fi

    case "$subcmd" in
      dev)    COMPREPLY=( $(compgen -W "-r --root -p --port -h --host --clean --open --verbose --debug -q --quiet --json --help -v --version" -- "$cur") ) ;;
      build)  COMPREPLY=( $(compgen -W "-r --root --clean --verbose --debug -q --quiet --json --help -v --version" -- "$cur") ) ;;
      start)  COMPREPLY=( $(compgen -W "-r --root -p --port -h --host --verbose --debug -q --quiet --json --help -v --version" -- "$cur") ) ;;
      create) COMPREPLY=( $(compgen -W "-r --root --verbose --debug -q --quiet --json --help -v --version" -- "$cur") ) ;;
      deploy) COMPREPLY=( $(compgen -W "-r --root --adapter --verbose --debug -q --quiet --json --help -v --version" -- "$cur") ) ;;
      help)   COMPREPLY=( $(compgen -W "--json --help" -- "$cur") ) ;;
      version) COMPREPLY=( $(compgen -W "--json --help" -- "$cur") ) ;;
      *)      COMPREPLY=( $(compgen -W "--help -v --version" -- "$cur") ) ;;
    esac
    return 0
  fi

  if [[ -z "$subcmd" ]]; then
    COMPREPLY=( $(compgen -W "dev build start create deploy help version" -- "$cur") )
    return 0
  fi

  case "$subcmd" in
    help) COMPREPLY=( $(compgen -W "dev build start create deploy help version" -- "$cur") ) ;;
    create) COMPREPLY=( $(compgen -d -- "$cur") ) ;;
  esac
  return 0
}

complete -F _ranu ranu
complete -F _ranu ranujs
```

Make the directory first if it does not exist:

```bash
mkdir -p ~/.local/share/bash-completion/completions
```

**Linux** — if you use the `bash-completion` package, the file above is picked up automatically on your next shell. Otherwise source it from your profile:

```bash
# ~/.bashrc
[ -f ~/.local/share/bash-completion/completions/ranu ] && \
  source ~/.local/share/bash-completion/completions/ranu
```

**macOS** — the system `bash` is 3.2 and ships no `bash-completion` loader, so source it explicitly from `~/.bash_profile`:

```bash
# ~/.bash_profile
[ -f ~/.local/share/bash-completion/completions/ranu ] && \
  source ~/.local/share/bash-completion/completions/ranu
```

If you run bash via Homebrew (`brew install bash bash-completion@2`), add the Homebrew completion directory instead:

```bash
# ~/.bash_profile
[[ -r "$(brew --prefix)/etc/profile.d/bash_completion.sh" ]] && \
  source "$(brew --prefix)/etc/profile.d/bash_completion.sh"
```

### 5.2 Zsh

Save the following as `~/.zsh/completions/_ranu` (create the directory first: `mkdir -p ~/.zsh/completions`):

```zsh
# ranu — zsh completion for `ranu` and `ranujs`
#
# Requires the zsh completion system to be initialised first:
#     autoload -Uz compinit && compinit
# Then source this file (or drop it in a directory on your `$fpath`).
#
# Flag sets mirror `ranu help <command>` output exactly.

_ranu() {
  local -a _ranu_commands
  local -a _ranu_opts
  local -a _ranu_dev_opts
  local -a _ranu_start_opts
  local -a _ranu_deploy_opts
  local -a _ranu_meta_opts
  local curcontext="$curcontext" state line
  typeset -A opt_args

  _ranu_commands=(
    'dev:Start the development server with HMR and Fast Refresh'
    'build:Create an optimized production build'
    'start:Start the production HTTP server'
    'create:Scaffold a new Ranu.js application'
    'deploy:Prepare deployment artifacts for a hosting adapter'
    'help:Show help information for a command'
    'version:Show the Ranu.js framework and CLI version'
  )

  # Flags accepted by every subcommand (see `ranu help`).
  _ranu_opts=(
    '(-r --root)'{-r,--root}'[Project root directory]:directory:_files -/'
    '--verbose[Display verbose output]'
    '--debug[Enable debug diagnostics and stack traces]'
    '(-q --quiet)'{-q,--quiet}'[Suppress non-essential console output]'
    '--json[Output results in machine-readable JSON]'
    '(- *)--help[Show help for the command]'
    '(- *)'{-v,--version}'[Show the Ranu.js version]'
  )

  _ranu_dev_opts=(
    '(-p --port)'{-p,--port}'[Port number to listen on]:port:'
    '(-h --host)'{-h,--host}'[Host address to bind]:host:'
    '--clean[Clean development caches before starting]'
    '--open[Open the browser after the server starts]'
  )

  _ranu_start_opts=(
    '(-p --port)'{-p,--port}'[Port number to listen on]:port:'
    '(-h --host)'{-h,--host}'[Host address to bind]:host:'
  )

  _ranu_deploy_opts=(
    '--adapter=[Deployment adapter to execute]:adapter:(vercel @ranujs/adapter-vercel)'
  )

  # `ranu help` and `ranu version` only honour the machine-readable and help flags.
  _ranu_meta_opts=(
    '--json[Output results in machine-readable JSON]'
    '(- *)--help[Show help for the command]'
  )

  _arguments -C \
    '(- *)--help[Show help for the command]' \
    '(- *)'{-v,--version}'[Show the Ranu.js version]' \
    '1: :->command' \
    '*:: :->args'

  case $state in
    command)
      _describe -t commands 'ranu command' _ranu_commands
      ;;
    args)
      case $words[1] in
        dev)
          _arguments "${_ranu_opts[@]}" "${_ranu_dev_opts[@]}"
          ;;
        build)
          _arguments "${_ranu_opts[@]}" \
            '--clean[Clean previous build artifacts before building]'
          ;;
        start)
          _arguments "${_ranu_opts[@]}" "${_ranu_start_opts[@]}"
          ;;
        create)
          _arguments "${_ranu_opts[@]}"
          _files -/
          ;;
        deploy)
          _arguments "${_ranu_opts[@]}" "${_ranu_deploy_opts[@]}"
          ;;
        help)
          _arguments "${_ranu_meta_opts[@]}"
          _describe -t commands 'ranu command' _ranu_commands
          ;;
        version)
          _arguments "${_ranu_meta_opts[@]}"
          ;;
      esac
      ;;
  esac
}

compdef _ranu ranu ranujs
```

`compinit` must run **before** this file is sourced, so it cannot live in `~/.oh-my-zsh/completions` — use your own directory and add it to `~/.zshrc`:

```zsh
# ~/.zshrc
autoload -Uz compinit && compinit
fpath=(~/.zsh/completions $fpath)
source ~/.zsh/completions/_ranu
```

### 5.3 Verification

Open a new shell and confirm the script loaded without errors:

```bash
# bash
complete -p ranu
# → complete -F _ranu ranu

# zsh
whence -w _ranu
# → _ranu: function
```

Then exercise it: type `ranu `, press <kbd>Tab</kbd>, and expect `build create deploy dev help start version`. Type `ranu dev --` and <kbd>Tab</kbd> to get `--clean --debug --help --host --json --open --port --quiet --root --verbose --version`.
