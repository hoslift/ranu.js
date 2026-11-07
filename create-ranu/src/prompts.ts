import readline from 'node:readline/promises';
import { stdin as defaultInput, stdout as defaultOutput } from 'node:process';
import type { Readable, Writable } from 'node:stream';
import path from 'node:path';
import * as p from '@clack/prompts';
import { validateProjectName, validateTargetDirectory } from './validator.js';
import { detectPackageManager } from './package-manager.js';
import type { AIEngineName, PackageManager, TemplateName } from './types.js';

export interface InteractivePromptOptions {
  initialTargetDir?: string | undefined;
  cwd?: string | undefined;
}

export interface PromptResult {
  targetPath: string;
  template: TemplateName;
  adapter?: string | undefined;
  packageManager: PackageManager;
  force?: boolean | undefined;
}

/**
 * Runs interactive prompt workflow using @clack/prompts.
 * Returns null if the user cancelled any prompt step.
 */
export async function runInteractivePrompts(
  options: InteractivePromptOptions = {}
): Promise<PromptResult | null> {
  p.intro('\x1b[36m>\x1b[0m create-ranu \x1b[90m- Ranu.js Project Scaffolder\x1b[0m');

  let targetPath = options.initialTargetDir;

  // 1. Project name / directory prompt (if not pre-supplied via positional argument)
  if (!targetPath) {
    const response = await p.text({
      message: 'Where should your new project be created?',
      placeholder: 'my-ranu-app',
      defaultValue: 'my-ranu-app',
      validate(input) {
        const val = (input ?? '').trim() || 'my-ranu-app';
        const result = validateProjectName(path.basename(val));
        if (!result.valid) {
          return result.errors[0] ?? 'Invalid project name';
        }
        return undefined;
      },
    });

    if (p.isCancel(response)) {
      p.cancel('Scaffolding cancelled.');
      return null;
    }

    targetPath = response.trim() || 'my-ranu-app';
  }

  // 2. Directory collision check
  let force = false;
  const dirCheck = validateTargetDirectory(targetPath, { cwd: options.cwd });
  if (!dirCheck.valid) {
    // If target exists and is not empty, prompt user for overwrite confirmation
    if (dirCheck.error && dirCheck.error.includes('is not empty')) {
      const confirmOverwrite = await p.confirm({
        message: `Target directory "${targetPath}" is not empty. Overwrite existing files?`,
        initialValue: false,
      });

      if (p.isCancel(confirmOverwrite) || !confirmOverwrite) {
        p.cancel('Scaffolding cancelled. Directory was not empty.');
        return null;
      }
      force = true;
    } else {
      p.cancel(`Invalid directory: ${dirCheck.error}`);
      return null;
    }
  }

  // 3. Starter template selection
  const templateResponse = await p.select({
    message: 'Select a starter template:',
    options: [
      { value: 'default', label: 'Default', hint: 'React 19 Streaming SSR full-stack baseline' },
      { value: 'saas', label: 'SaaS Starter', hint: 'Tailwind v4, Drizzle ORM, SQLite & Auth routes' },
      { value: 'minimal', label: 'Minimal', hint: 'Lightweight zero-dependency baseline' },
      { value: 'api-routes', label: 'API Routes', hint: 'Web Request/Response handlers co-located with pages' },
      { value: 'cloudflare', label: 'Cloudflare Workers', hint: 'Low-latency edge SSR on Cloudflare' },
      { value: 'node-docker', label: 'Node.js Docker', hint: 'Containerized standalone Node.js server' },
    ],
    initialValue: 'default',
  });

  if (p.isCancel(templateResponse)) {
    p.cancel('Scaffolding cancelled.');
    return null;
  }
  const template = templateResponse as TemplateName;

  // 4. Deployment adapter selection
  let adapter: string | undefined;
  if (template === 'cloudflare') {
    adapter = 'cloudflare';
  } else if (template === 'node-docker') {
    adapter = 'node';
  } else {
    const adapterResponse = await p.select({
      message: 'Select a deployment adapter:',
      options: [
        { value: 'node', label: 'Node.js Standalone', hint: 'Built-in Node.js server (recommended default)' },
        { value: 'cloudflare', label: 'Cloudflare Pages / Workers', hint: 'Edge serverless deployment' },
        { value: 'vercel', label: 'Vercel', hint: 'Vercel Serverless Functions' },
        { value: 'static', label: 'Static HTML / SSG', hint: 'Zero-runtime static compilation (@ranujs/adapter-static)' },
        { value: 'netlify', label: 'Netlify', hint: 'Netlify Edge & Functions' },
        { value: 'bun', label: 'Bun', hint: 'Native Bun.serve runtime' },
        { value: 'deno', label: 'Deno', hint: 'Native Deno.serve runtime' },
      ],
      initialValue: 'node',
    });

    if (p.isCancel(adapterResponse)) {
      p.cancel('Scaffolding cancelled.');
      return null;
    }
    adapter = adapterResponse as string;
  }

  // 5. Package manager selection
  const detectedPm = detectPackageManager();
  const pmResponse = await p.select({
    message: 'Select your package manager:',
    options: [
      { value: 'pnpm', label: 'pnpm', hint: 'Fast, disk-space efficient' },
      { value: 'npm', label: 'npm', hint: 'Standard Node.js package manager' },
      { value: 'yarn', label: 'yarn', hint: 'Classic or Modern Yarn' },
      { value: 'bun', label: 'bun', hint: 'Fast all-in-one JavaScript toolkit' },
    ],
    initialValue: detectedPm,
  });

  if (p.isCancel(pmResponse)) {
    p.cancel('Scaffolding cancelled.');
    return null;
  }
  const packageManager = pmResponse as PackageManager;

  return {
    targetPath,
    template,
    adapter,
    packageManager,
    force,
  };
}


export interface Choice<T> {
  readonly label: string;
  readonly value: T;
  readonly hint?: string;
}

export const AI_ENGINE_CHOICES: ReadonlyArray<Choice<AIEngineName>> = [
  {
    label: 'None / Traditional Web App (Zero AI)',
    value: 'none',
    hint: 'Pure full-stack web app with zero AI dependencies or API keys',
  },
  {
    label: 'Google Gemini (@ranu/ai-gemini)',
    value: 'gemini',
    hint: 'Multimodal streaming with Gemini 1.5 Pro & Flash',
  },
  {
    label: 'Groq (@ranu/ai-groq)',
    value: 'groq',
    hint: 'Sub-10ms ultra-fast LPU inference (Llama 3.3 70B)',
  },
  {
    label: 'Anthropic Claude (@ranu/ai-claude)',
    value: 'claude',
    hint: 'Advanced tool-use & coding with Claude 3.5 Sonnet',
  },
  {
    label: 'Codex (@ranu/ai-codex)',
    value: 'codex',
    hint: 'Codex & OpenAI GPT-4o reasoning models',
  },
  {
    label: 'OpenAI (@ranu/ai-openai)',
    value: 'openai',
    hint: 'GPT-4o & o1 reasoning models',
  },
  {
    label: 'Custom / Local Ollama (@ranu/ai-custom)',
    value: 'custom',
    hint: 'Self-hosted Ollama, vLLM, or enterprise OpenAI-compatible proxy',
  },
];

export interface PromptSelectOptions {
  readonly input?: Readable | undefined;
  readonly output?: Writable | undefined;
  readonly rl?: readline.Interface | undefined;
  readonly quiet?: boolean | undefined;
  readonly json?: boolean | undefined;
}

interface PromptInterfaceState {
  readonly queue: string[];
  readonly waiters: Array<(line: string) => void>;
  closed: boolean;
}

const promptStateMap = new WeakMap<readline.Interface, PromptInterfaceState>();

function getOrCreatePromptState(rl: readline.Interface): PromptInterfaceState {
  let state = promptStateMap.get(rl);
  if (!state) {
    const input = (rl as unknown as { input?: Readable }).input;
    const isAlreadyClosed = Boolean(
      (rl as { closed?: boolean }).closed ||
      input?.readableEnded ||
      input?.destroyed
    );

    state = {
      queue: [],
      waiters: [],
      closed: isAlreadyClosed,
    };
    promptStateMap.set(rl, state);

    rl.on('line', (line: string) => {
      if (state!.waiters.length > 0) {
        const resolve = state!.waiters.shift()!;
        resolve(line);
      } else {
        state!.queue.push(line);
      }
    });

    rl.on('close', () => {
      state!.closed = true;
      while (state!.waiters.length > 0) {
        const resolve = state!.waiters.shift()!;
        resolve('');
      }
    });

    rl.on('error', () => {
      state!.closed = true;
      while (state!.waiters.length > 0) {
        const resolve = state!.waiters.shift()!;
        resolve('');
      }
    });
  }
  return state;
}

function askPromptQuestion(
  rl: readline.Interface,
  promptMessage: string,
  outStream: Writable
): Promise<string> {
  const state = getOrCreatePromptState(rl);

  if (outStream && promptMessage) {
    try {
      outStream.write(promptMessage);
    } catch {
      // Ignore write failures on closed streams
    }
  }

  // 1. If queued lines exist from piped chunk, return immediately from buffer
  if (state.queue.length > 0) {
    return Promise.resolve(state.queue.shift()!);
  }

  // 2. If readline or stream is already closed/ended (EOF reached), return empty string immediately
  const input = (rl as unknown as { input?: Readable }).input;
  if (state.closed || Boolean((rl as { closed?: boolean }).closed) || input?.readableEnded || input?.destroyed) {
    return Promise.resolve('');
  }

  // 3. Await next line or close/EOF event
  return new Promise<string>((resolve) => {
    state.waiters.push(resolve);
  });
}

/**
 * Interactively prompts user to select from a list of choices using node:readline/promises.
 * If running non-interactively (!isTTY, CI, quiet, or json), returns the default choice immediately.
 */
export async function promptSelect<T extends string>(
  question: string,
  choices: ReadonlyArray<Choice<T>>,
  defaultIndex = 0,
  options: PromptSelectOptions = {}
): Promise<T> {
  const inStream = options.input ?? defaultInput;
  const outStream = options.output ?? defaultOutput;

  const defaultChoice = choices[defaultIndex] ?? choices[0];
  if (!defaultChoice) {
    throw new Error('promptSelect requires at least one choice');
  }
  const fallbackValue = defaultChoice.value;

  const isStreamEnded = Boolean(
    (inStream as { readableEnded?: boolean }).readableEnded ||
    (inStream as { destroyed?: boolean }).destroyed
  );
  if (isStreamEnded) {
    return fallbackValue;
  }

  const isTTY = Boolean((inStream as { isTTY?: boolean }).isTTY);
  const isNonInteractive = !isTTY || Boolean(process.env.CI) || Boolean(options.quiet) || Boolean(options.json);

  if (isNonInteractive && !options.input && !options.rl) {
    return fallbackValue;
  }

  const ownRl = !options.rl;
  const rl = options.rl ?? readline.createInterface({ input: inStream, output: outStream });
  getOrCreatePromptState(rl);

  try {
    outStream.write(`\n\x1b[1m? \x1b[36m${question}\x1b[0m\n`);
    choices.forEach((choice, idx) => {
      const isDefault = idx === defaultIndex;
      const marker = isDefault ? '\x1b[32m>\x1b[0m' : ' ';
      const num = `\x1b[33m${idx + 1})\x1b[0m`;
      const defTag = isDefault ? ' \x1b[2m(default)\x1b[0m' : '';
      const hint = choice.hint ? `\n     \x1b[2m${choice.hint}\x1b[0m` : '';
      outStream.write(`  ${marker} ${num} \x1b[1m${choice.label}\x1b[0m${defTag}${hint}\n`);
    });

    const answer = await askPromptQuestion(
      rl,
      `\n  Enter choice [1-${choices.length}] (default: ${defaultIndex + 1}): `,
      outStream
    );
    const trimmed = answer.trim().toLowerCase();

    if (!trimmed) {
      return fallbackValue;
    }

    const numVal = parseInt(trimmed, 10);
    if (!isNaN(numVal) && numVal >= 1 && numVal <= choices.length) {
      const selected = choices[numVal - 1];
      if (selected) {
        return selected.value;
      }
    }

    const matched = choices.find(
      (c) => c.value.toLowerCase() === trimmed || c.label.toLowerCase().includes(trimmed)
    );
    if (matched) {
      return matched.value;
    }

    outStream.write(`\x1b[33mInvalid choice, selecting default: ${defaultChoice.label}\x1b[0m\n`);
    return fallbackValue;
  } finally {
    if (ownRl) {
      rl.close();
    }
  }
}

export interface PromptInputOptions {
  readonly input?: Readable | undefined;
  readonly output?: Writable | undefined;
  readonly rl?: readline.Interface | undefined;
  readonly quiet?: boolean | undefined;
  readonly json?: boolean | undefined;
  readonly defaultValue?: string | undefined;
}

/**
 * Interactively prompts user for text input using node:readline/promises.
 * If running non-interactively (!isTTY, CI, quiet, or json), returns the default value or empty string immediately.
 * Gracefully handles Enter key to skip or use default value.
 */
export async function promptInput(
  question: string,
  options: PromptInputOptions = {}
): Promise<string> {
  const inStream = options.input ?? defaultInput;
  const outStream = options.output ?? defaultOutput;

  const isStreamEnded = Boolean(
    (inStream as { readableEnded?: boolean }).readableEnded ||
    (inStream as { destroyed?: boolean }).destroyed
  );
  if (isStreamEnded) {
    return options.defaultValue ?? '';
  }

  const isTTY = Boolean((inStream as { isTTY?: boolean }).isTTY);
  const isNonInteractive =
    !isTTY || Boolean(process.env.CI) || Boolean(options.quiet) || Boolean(options.json);

  if (isNonInteractive && !options.input && !options.rl) {
    return options.defaultValue ?? '';
  }

  const ownRl = !options.rl;
  const rl = options.rl ?? readline.createInterface({ input: inStream, output: outStream });
  getOrCreatePromptState(rl);

  try {
    const defHint = options.defaultValue
      ? ` (default: ${options.defaultValue})`
      : ' (press Enter to skip / configure later)';
    const promptMessage = `\n\x1b[1m? \x1b[36m${question}\x1b[0m\x1b[2m${defHint}\x1b[0m: `;
    const answer = await askPromptQuestion(rl, promptMessage, outStream);
    const trimmed = answer.trim();

    if (!trimmed) {
      return options.defaultValue ?? '';
    }

    return trimmed;
  } finally {
    if (ownRl) {
      rl.close();
    }
  }
}
