import readline from 'node:readline/promises';
import { stdin as defaultInput, stdout as defaultOutput } from 'node:process';
import type { Readable, Writable } from 'node:stream';
import type { AIEngineName } from './types.js';

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
  readonly quiet?: boolean | undefined;
  readonly json?: boolean | undefined;
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

  const isTTY = Boolean((inStream as { isTTY?: boolean }).isTTY);
  const isNonInteractive = !isTTY || Boolean(process.env.CI) || Boolean(options.quiet) || Boolean(options.json);

  const defaultChoice = choices[defaultIndex] ?? choices[0];
  if (!defaultChoice) {
    throw new Error('promptSelect requires at least one choice');
  }
  const fallbackValue = defaultChoice.value;

  if (isNonInteractive && !options.input) {
    return fallbackValue;
  }

  const rl = readline.createInterface({ input: inStream, output: outStream });

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

    const answer = await rl.question(
      `\n  Enter choice [1-${choices.length}] (default: ${defaultIndex + 1}): `
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
    rl.close();
  }
}
