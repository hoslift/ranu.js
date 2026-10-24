#!/usr/bin/env node
/* eslint-disable no-console */
import path from 'node:path';
import readline from 'node:readline/promises';
import type { Readable, Writable } from 'node:stream';
import { scaffoldProject } from '../scaffold.js';
import { getRunCommand, detectPackageManager } from '../package-manager.js';
import type { PackageManager, TemplateName, AIEngineName } from '../types.js';
import { SUPPORTED_AI_ENGINES } from '../types.js';
import { promptSelect, promptInput, AI_ENGINE_CHOICES } from '../prompts.js';
import { SCAFFOLDER_VERSION } from '../index.js';

/**
 * Parsed command line arguments for the create-ranu CLI.
 */
export interface ParsedArgs {
  /** Target directory path for project scaffolding. */
  targetPath?: string | undefined;
  /** Package manager to configure in scripts and run commands. */
  packageManager?: PackageManager | undefined;
  /** Starter template choice. */
  template?: TemplateName | undefined;
  /** Deployment adapter to configure. */
  adapter?: string | undefined;
  /** Whether to configure automated tests. */
  tests?: boolean | undefined;
  /** AI engine integration choice. */
  ai?: AIEngineName | undefined;
  /** API key or session token for selected AI engine. */
  apiKey?: string | undefined;
  /** Custom or local endpoint URL for selected AI engine. */
  endpoint?: string | undefined;
  /** Whether to install dependencies after scaffolding. */
  install?: boolean | undefined;
  /** Whether to initialize a Git repository. */
  git?: boolean | undefined;
  /** Whether to force scaffolding into an existing non-empty directory. */
  force?: boolean | undefined;
  /** Whether to suppress non-error console output. */
  quiet?: boolean | undefined;
  /** Whether to format command output as JSON. */
  json?: boolean | undefined;
  /** Whether help message was requested. */
  help?: boolean | undefined;
  /** Whether version information was requested. */
  version?: boolean | undefined;
}

/**
 * Normalizes input string to supported AIEngineName, resolving known aliases.
 * Throws descriptive error if input is unrecognized.
 */
export function normalizeAIEngine(val: string): AIEngineName {
  const normalized = val.trim().toLowerCase();
  if (['none', 'false', 'zero'].includes(normalized)) return 'none';
  if (['gemini', 'google', 'ai-gemini'].includes(normalized)) return 'gemini';
  if (['groq', 'ai-groq'].includes(normalized)) return 'groq';
  if (['claude', 'anthropic', 'ai-claude'].includes(normalized)) return 'claude';
  if (['openai', 'gpt', 'ai-openai'].includes(normalized)) return 'openai';
  if (['custom', 'ollama', 'ai-custom'].includes(normalized)) return 'custom';

  throw new Error(
    `Invalid AI engine "${val}". Supported: ${SUPPORTED_AI_ENGINES.join(', ')}.`
  );
}

/**
 * Parses raw command-line argument vector into structured CLI options.
 *
 * @param argv - Argument strings passed to CLI executable.
 * @returns Parsed arguments structure.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const result: ParsedArgs = {};
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i];
    if (!arg) {
      i++;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      result.help = true;
      i++;
      continue;
    }

    if (arg === '--version' || arg === '-v') {
      result.version = true;
      i++;
      continue;
    }

    if (arg === '--force') {
      result.force = true;
      i++;
      continue;
    }

    if (arg === '--quiet' || arg === '-q') {
      result.quiet = true;
      i++;
      continue;
    }

    if (arg === '--json') {
      result.json = true;
      i++;
      continue;
    }

    if (arg === '--install') {
      result.install = true;
      i++;
      continue;
    }

    if (arg === '--no-install') {
      result.install = false;
      i++;
      continue;
    }

    if (arg === '--git') {
      result.git = true;
      i++;
      continue;
    }

    if (arg === '--no-git') {
      result.git = false;
      i++;
      continue;
    }

    if (arg === '--template' || arg === '-t') {
      i++;
      const val = argv[i];
      const validTemplates: TemplateName[] = ['default', 'minimal', 'cloudflare', 'node-docker', 'api-routes', 'saas', 'ai-studio'];
      if (!val || val.startsWith('-') || !validTemplates.includes(val as TemplateName)) {
        throw new Error(`Invalid template "${val}". Supported: ${validTemplates.join(', ')}.`);
      }
      result.template = val as TemplateName;
      i++;
      continue;
    }

    if (arg === '--adapter' || arg === '-a') {
      i++;
      const val = argv[i];
      const validAdapters = ['cloudflare', 'node', 'netlify', 'bun', 'deno', 'vercel'];
      if (!val || val.startsWith('-') || !validAdapters.includes(val)) {
        throw new Error(`Invalid adapter "${val}". Supported: ${validAdapters.join(', ')}.`);
      }
      result.adapter = val;
      i++;
      continue;
    }

    if (arg === '--tests') {
      result.tests = true;
      i++;
      continue;
    }

    if (arg === '--no-tests') {
      result.tests = false;
      i++;
      continue;
    }

    if (arg === '--ai' || arg === '--ai-engine') {
      i++;
      const val = argv[i];
      if (!val || val.startsWith('-')) {
        throw new Error(`Flag "${arg}" requires a valid AI engine argument.`);
      }
      result.ai = normalizeAIEngine(val);
      i++;
      continue;
    }

    if (arg === '--api-key') {
      i++;
      const val = argv[i];
      if (!val || val.startsWith('-')) {
        throw new Error('Flag "--api-key" requires a valid API key argument.');
      }
      result.apiKey = val;
      i++;
      continue;
    }

    if (arg === '--endpoint') {
      i++;
      const val = argv[i];
      if (!val || val.startsWith('-')) {
        throw new Error('Flag "--endpoint" requires a valid URL endpoint argument.');
      }
      result.endpoint = val;
      i++;
      continue;
    }

    if (arg === '--package-manager' || arg === '-p') {
      i++;
      const val = argv[i];
      if (!val || val.startsWith('-')) {
        throw new Error('Flag "--package-manager" requires a valid package manager argument.');
      }
      if (val !== 'npm' && val !== 'pnpm' && val !== 'yarn' && val !== 'bun') {
        throw new Error(`Invalid package manager "${val}". Supported: npm, pnpm, yarn, bun.`);
      }
      result.packageManager = val;
      i++;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown flag "${arg}". Run "create-ranu --help" for available options.`);
    }

    if (!result.targetPath) {
      result.targetPath = arg;
    }
    i++;
  }

  return result;
}

/**
 * Prints user-friendly help text to standard output.
 */
export function printHelp(): void {
  console.log(`
create-ranujs — Canonical project scaffolder for Ranu.js

Usage:
  $ create-ranujs <project-directory> [options]
  $ npm create ranujs@latest <project-directory> [options]

Options:
  -t, --template <name>         Starter template (default, minimal, cloudflare, node-docker, api-routes, saas)
  -a, --adapter <name>          Deployment adapter (cloudflare, node, netlify, bun, deno, vercel)
  --ai, --ai-engine <name>      AI engine to configure (none, gemini, groq, claude, openai, custom) [default: none]
  --api-key <key>               API key or session token for configured AI engine
  --endpoint <url>              Custom or local endpoint URL for AI engine (e.g. http://localhost:11434)
  --tests                       Configure unit and component test suites (vitest)
  --no-tests                    Skip test configuration (default)
  -p, --package-manager <name>  Package manager to configure (npm, pnpm, yarn, bun)
  --install                     Install dependencies after scaffolding
  --no-install                  Skip dependency installation (default)
  --git                         Initialize a Git repository
  --no-git                      Skip Git initialization (default)
  --force                       Overwrite existing non-empty directory safely
  -q, --quiet                   Suppress non-error output
  --json                        Output structured JSON result
  -h, --help                    Show this help message
  -v, --version                 Show create-ranu version

Examples:
  $ npm create ranujs@latest my-app
  $ pnpm create ranujs my-app --ai gemini
  $ pnpm create ranujs my-app --ai gemini --api-key AIzaSy...
  $ pnpm create ranujs my-app --ai custom --endpoint http://localhost:11434
  $ pnpm create ranujs my-app --ai none
  $ pnpm create ranujs my-app --template minimal
  $ pnpm create ranujs my-app --template cloudflare
  $ pnpm create ranujs my-app --template node-docker
  $ pnpm create ranujs my-app --template api-routes --tests
`);
}

/**
 * Main execution routine for the create-ranu command-line interface.
 *
 * @param argv - Argument strings without node binary and script path.
 * @returns Exit status code (0 for success, 1 for error).
 */
export async function runCreateRanu(
  argv: readonly string[] = process.argv.slice(2),
  io: { input?: Readable; output?: Writable } = {}
): Promise<number> {
  const wantsJson = argv.includes('--json');
  try {
    const parsed = parseArgs(argv);

    if (parsed.help) {
      if (parsed.json) {
        console.log(
          JSON.stringify({
            name: 'create-ranu',
            version: SCAFFOLDER_VERSION,
            usage: 'create-ranu <project-directory> [options]',
          })
        );
      } else {
        printHelp();
      }
      return 0;
    }

    if (parsed.version) {
      if (parsed.json) {
        console.log(JSON.stringify({ version: SCAFFOLDER_VERSION }));
      } else {
        console.log(`create-ranu v${SCAFFOLDER_VERSION}`);
      }
      return 0;
    }

    const isInteractive = Boolean(
      (io.input ? true : (process.stdin.isTTY && !process.env.CI)) && !parsed.quiet && !parsed.json
    );

    let selectedAI = parsed.ai;
    let apiKey = parsed.apiKey;
    let endpoint = parsed.endpoint;

    const aiSelectedInteractively = selectedAI === undefined && isInteractive;
    if (aiSelectedInteractively) {
      const inStream = io.input ?? process.stdin;
      const outStream = io.output ?? process.stdout;
      const rl = readline.createInterface({ input: inStream, output: outStream });
      try {
        selectedAI = await promptSelect('Select AI Engine:', AI_ENGINE_CHOICES, 0, { ...io, rl });
        selectedAI = selectedAI ?? 'none';

        if (selectedAI !== 'none') {
          if (selectedAI === 'custom') {
            if (!endpoint) {
              const inputEndpoint = await promptInput(
                'Local / Custom AI Endpoint URL',
                { ...io, rl, defaultValue: 'http://localhost:11434' }
              );
              endpoint = inputEndpoint || 'http://localhost:11434';
            }
            if (!apiKey) {
              const inputKey = await promptInput(
                'Custom AI API Key or Session Token (optional)',
                { ...io, rl }
              );
              apiKey = inputKey || undefined;
            }
          } else if (!apiKey) {
            const providerName =
              selectedAI === 'gemini'
                ? 'Google Gemini'
                : selectedAI === 'groq'
                  ? 'Groq'
                  : selectedAI === 'claude'
                    ? 'Anthropic Claude'
                    : 'OpenAI';
            const inputKey = await promptInput(`Enter ${providerName} API Key`, { ...io, rl });
            apiKey = inputKey || undefined;
          }
        }
      } finally {
        rl.close();
      }
    }
    selectedAI = selectedAI ?? 'none';

    const targetDir = parsed.targetPath ?? 'my-ranu-app';
    const pm = parsed.packageManager ?? detectPackageManager();

    if (!parsed.quiet && !parsed.json) {
      console.log(`\nCreating a new Ranu.js project in \x1b[36m${targetDir}\x1b[0m...\n`);
    }

    const result = scaffoldProject({
      projectPath: targetDir,
      packageManager: pm,
      template: parsed.template,
      adapter: parsed.adapter,
      tests: parsed.tests,
      ai: selectedAI,
      apiKey,
      endpoint,
      install: parsed.install,
      git: parsed.git,
      force: parsed.force,
      quiet: parsed.quiet,
    });

    if (!result.success) {
      if (parsed.json) {
        console.error(JSON.stringify({ success: false, error: result.error }));
      } else {
        console.error(`\x1b[31m✖ Error:\x1b[0m ${result.error}`);
      }
      return 1;
    }

    if (parsed.json) {
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    if (!parsed.quiet) {
      const relDir = path.relative(process.cwd(), result.projectPath) || '.';
      const devCmd = getRunCommand(result.packageManager, 'dev');

      console.log(`\x1b[32m✔ Success!\x1b[0m Created \x1b[1m${result.projectName}\x1b[0m at ${result.projectPath}`);
      if (result.ai && result.ai !== 'none') {
        console.log(`  AI Engine: \x1b[35m${result.ai}\x1b[0m`);
        if (result.hasCredentials) {
          console.log(`  Credentials: \x1b[32m✔ Configured in .env\x1b[0m \x1b[2m(shielded from git by .gitignore)\x1b[0m`);
        } else {
          const envVar =
            result.ai === 'gemini'
              ? 'GEMINI_API_KEY'
              : result.ai === 'groq'
                ? 'GROQ_API_KEY'
                : result.ai === 'claude'
                  ? 'ANTHROPIC_API_KEY'
                  : result.ai === 'openai'
                    ? 'OPENAI_API_KEY'
                    : 'CUSTOM_AI_KEY';
          console.log(`  Credentials: \x1b[33m⚠ Skipped\x1b[0m \x1b[2m(set ${envVar} in .env before invoking AI routes)\x1b[0m`);
        }

        console.log('\n  AI Streaming Route:');
        console.log('    Handler:  app/routes/api.ai.ts');
        console.log('    Endpoint: http://localhost:3000/api/ai');
        console.log('\n  To test your AI streaming endpoint after starting the server:');
        console.log('    \x1b[36mcurl http://localhost:3000/api/ai\x1b[0m');
        console.log('    \x1b[36mcurl -X POST http://localhost:3000/api/ai -H "Content-Type: application/json" -d "{\\"prompt\\":\\"Hello Ranu!\\"}"\x1b[0m');
      } else {
        console.log(`  AI Engine: \x1b[2mNone (Zero AI)\x1b[0m`);
      }
      console.log('\nInside that directory, you can run several commands:');
      console.log(`\n  \x1b[36m${devCmd}\x1b[0m`);
      console.log('    Starts the development server.\n');
      console.log(`  \x1b[36m${getRunCommand(result.packageManager, 'build')}\x1b[0m`);
      console.log('    Bundles the app for production.\n');
      console.log(`  \x1b[36m${getRunCommand(result.packageManager, 'start')}\x1b[0m`);
      console.log('    Starts the production server.\n');
      console.log('We suggest that you begin by typing:\n');
      if (relDir !== '.') {
        const formattedDir = relDir.includes(' ') ? `"${relDir}"` : relDir;
        console.log(`  \x1b[36mcd ${formattedDir}\x1b[0m`);
      }
      console.log(`  \x1b[36m${devCmd}\x1b[0m\n`);
    }

    return 0;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (wantsJson) {
      console.error(JSON.stringify({ success: false, error: msg }));
    } else {
      console.error(`\x1b[31m✖ Error:\x1b[0m ${msg}`);
    }
    return 1;
  }
}

/* v8 ignore start */
if (process.env.NODE_ENV !== 'test') {
  try {
    const code = await runCreateRanu();
    process.exit(code);
  } catch {
    process.exit(1);
  }
}
/* v8 ignore stop */


