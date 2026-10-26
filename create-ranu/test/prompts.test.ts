import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { promptSelect, AI_ENGINE_CHOICES } from '../src/prompts.js';

describe('create-ranu interactive prompter', () => {
  it('returns default choice when input is non-interactive / CI / quiet / json', async () => {
    const choice = await promptSelect('Select AI Engine:', AI_ENGINE_CHOICES, 0, {
      quiet: true,
    });
    expect(choice).toBe('none');
  });

  it('selects default choice on empty Enter', async () => {
    const inStream = new PassThrough();
    const outStream = new PassThrough();

    const promptPromise = promptSelect('Select AI Engine:', AI_ENGINE_CHOICES, 0, {
      input: inStream,
      output: outStream,
    });

    inStream.write('\n');
    const result = await promptPromise;
    expect(result).toBe('none');
  });

  it('selects choice by number input (e.g. 2 for Gemini)', async () => {
    const inStream = new PassThrough();
    const outStream = new PassThrough();

    const promptPromise = promptSelect('Select AI Engine:', AI_ENGINE_CHOICES, 0, {
      input: inStream,
      output: outStream,
    });

    inStream.write('2\n');
    const result = await promptPromise;
    expect(result).toBe('gemini');
  });

  it('selects choice by value name (e.g. groq)', async () => {
    const inStream = new PassThrough();
    const outStream = new PassThrough();

    const promptPromise = promptSelect('Select AI Engine:', AI_ENGINE_CHOICES, 0, {
      input: inStream,
      output: outStream,
    });

    inStream.write('groq\n');
    const result = await promptPromise;
    expect(result).toBe('groq');
  });

  it('falls back to default on invalid number or unrecognized string', async () => {
    const inStream = new PassThrough();
    const outStream = new PassThrough();

    const promptPromise = promptSelect('Select AI Engine:', AI_ENGINE_CHOICES, 0, {
      input: inStream,
      output: outStream,
    });

    inStream.write('99\n');
    const result = await promptPromise;
    expect(result).toBe('none');
  });
});
