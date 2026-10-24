import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import readline from 'node:readline/promises';
import { promptSelect, promptInput, AI_ENGINE_CHOICES } from '../src/prompts.js';

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

  describe('promptInput', () => {
    it('returns entered string when user types text and presses Enter', async () => {
      const inStream = new PassThrough();
      const outStream = new PassThrough();

      const promptPromise = promptInput('Enter API Key', {
        input: inStream,
        output: outStream,
      });

      inStream.write('AIzaSy123456789\n');
      const result = await promptPromise;
      expect(result).toBe('AIzaSy123456789');
    });

    it('trims whitespace around entered input', async () => {
      const inStream = new PassThrough();
      const outStream = new PassThrough();

      const promptPromise = promptInput('Enter API Key', {
        input: inStream,
        output: outStream,
      });

      inStream.write('   my-secret-key   \n');
      const result = await promptPromise;
      expect(result).toBe('my-secret-key');
    });

    it('returns empty string when user presses Enter without input (skip)', async () => {
      const inStream = new PassThrough();
      const outStream = new PassThrough();

      const promptPromise = promptInput('Enter API Key', {
        input: inStream,
        output: outStream,
      });

      inStream.write('\n');
      const result = await promptPromise;
      expect(result).toBe('');
    });

    it('returns defaultValue when user presses Enter on prompt with default value', async () => {
      const inStream = new PassThrough();
      const outStream = new PassThrough();

      const promptPromise = promptInput('Endpoint URL', {
        input: inStream,
        output: outStream,
        defaultValue: 'http://localhost:11434',
      });

      inStream.write('\n');
      const result = await promptPromise;
      expect(result).toBe('http://localhost:11434');
    });

    it('overrides defaultValue when user types custom value', async () => {
      const inStream = new PassThrough();
      const outStream = new PassThrough();

      const promptPromise = promptInput('Endpoint URL', {
        input: inStream,
        output: outStream,
        defaultValue: 'http://localhost:11434',
      });

      inStream.write('http://192.168.1.50:8000\n');
      const result = await promptPromise;
      expect(result).toBe('http://192.168.1.50:8000');
    });

    it('returns empty string or defaultValue immediately in non-interactive environment', async () => {
      const res1 = await promptInput('API Key', { quiet: true });
      expect(res1).toBe('');

      const res2 = await promptInput('Endpoint', {
        quiet: true,
        defaultValue: 'http://localhost:11434',
      });
      expect(res2).toBe('http://localhost:11434');

      const res3 = await promptInput('API Key', { json: true });
      expect(res3).toBe('');
    });
  });

  describe('stream EOF and piped chunked inputs', () => {
    it('handles immediate EOF on promptInput stream gracefully (resolves fallback or empty string)', async () => {
      const inStream = new PassThrough();
      const outStream = new PassThrough();

      const promptPromise = promptInput('Enter API Key', {
        input: inStream,
        output: outStream,
        defaultValue: 'default-fallback-key',
      });

      inStream.end();
      const result = await promptPromise;
      expect(result).toBe('default-fallback-key');
    });

    it('handles immediate EOF on promptInput stream without default value (resolves empty string)', async () => {
      const inStream = new PassThrough();
      const outStream = new PassThrough();

      const promptPromise = promptInput('Enter API Key', {
        input: inStream,
        output: outStream,
      });

      inStream.end();
      const result = await promptPromise;
      expect(result).toBe('');
    });

    it('handles immediate EOF on promptSelect stream gracefully (resolves default choice)', async () => {
      const inStream = new PassThrough();
      const outStream = new PassThrough();

      const promptPromise = promptSelect('Select Engine:', AI_ENGINE_CHOICES, 0, {
        input: inStream,
        output: outStream,
      });

      inStream.end();
      const result = await promptPromise;
      expect(result).toBe('none');
    });

    it('handles piped input stream with sequential choices: 2 (gemini) then Enter (skip)', async () => {
      const inStream = new PassThrough();
      const outStream = new PassThrough();
      const rl = readline.createInterface({ input: inStream, output: outStream });

      try {
        const choicePromise = promptSelect('Select AI Engine:', AI_ENGINE_CHOICES, 0, {
          input: inStream,
          output: outStream,
          rl,
        });

        // Write chunk containing engine choice and newline for api key skip
        inStream.write('2\n\n');

        const choice = await choicePromise;
        expect(choice).toBe('gemini');

        const key = await promptInput('Enter Google Gemini API Key', {
          input: inStream,
          output: outStream,
          rl,
        });
        expect(key).toBe('');
      } finally {
        rl.close();
      }
    });

    it('handles piped input stream for custom AI: 6 (custom), Enter (default endpoint), Enter (skip key)', async () => {
      const inStream = new PassThrough();
      const outStream = new PassThrough();
      const rl = readline.createInterface({ input: inStream, output: outStream });

      try {
        const choicePromise = promptSelect('Select AI Engine:', AI_ENGINE_CHOICES, 0, {
          input: inStream,
          output: outStream,
          rl,
        });

        // Pipe 6 (custom), Enter (default endpoint), Enter (skip key)
        inStream.write('6\n\n\n');

        const choice = await choicePromise;
        expect(choice).toBe('custom');

        const endpoint = await promptInput('Local / Custom AI Endpoint URL', {
          input: inStream,
          output: outStream,
          rl,
          defaultValue: 'http://localhost:11434',
        });
        expect(endpoint).toBe('http://localhost:11434');

        const key = await promptInput('Custom AI API Key or Session Token (optional)', {
          input: inStream,
          output: outStream,
          rl,
        });
        expect(key).toBe('');
      } finally {
        rl.close();
      }
    });

    it('handles already closed stream gracefully on promptInput and promptSelect', async () => {
      const inStream = new PassThrough();
      const outStream = new PassThrough();
      inStream.end();

      const choice = await promptSelect('Select AI Engine:', AI_ENGINE_CHOICES, 0, {
        input: inStream,
        output: outStream,
      });
      expect(choice).toBe('none');

      const input = await promptInput('Enter API Key', {
        input: inStream,
        output: outStream,
        defaultValue: 'fallback',
      });
      expect(input).toBe('fallback');
    });
  });
});
