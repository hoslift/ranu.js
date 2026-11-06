import { describe, it, expect } from 'vitest';
import {
  createAIProvider,
  streamAI,
  generateObject,
  AIValidationError,
  isStandardSchema,
  formatAIChunkToSSE,
  createBoundedStream,
  pipeWithBackpressure,
  createStreamingDrainTracker,
  extractJsonFromText,
  validateWithSchema,
} from '../src/ai.js';
import { createGemini, gemini } from '../src/ai/gemini.js';
import { createGroq, groq } from '../src/ai/groq.js';
import { createClaude, claude } from '../src/ai/claude.js';
import { createOpenAI, openai, isReasoningModel } from '../src/ai/openai.js';
import {
  createCustomAI,
  custom,
  isDeepSeekR1,
  resolveBaseURL,
} from '../src/ai/custom.js';

describe('Ranu.js AI Subpath Exports', () => {
  describe('Universal AI Core Entry ("ranu/ai")', () => {
    it('exports all core streaming kernel functions and helpers', () => {
      expect(createAIProvider).toBeTypeOf('function');
      expect(streamAI).toBeTypeOf('function');
      expect(generateObject).toBeTypeOf('function');
      expect(isStandardSchema).toBeTypeOf('function');
      expect(formatAIChunkToSSE).toBeTypeOf('function');
      expect(createBoundedStream).toBeTypeOf('function');
      expect(pipeWithBackpressure).toBeTypeOf('function');
      expect(createStreamingDrainTracker).toBeTypeOf('function');
      expect(extractJsonFromText).toBeTypeOf('function');
      expect(validateWithSchema).toBeTypeOf('function');
    });

    it('exports AIValidationError class with issue tracking', () => {
      expect(AIValidationError).toBeDefined();
      const err = new AIValidationError(
        'Validation failed',
        [{ path: ['field'], message: 'Required' }],
        {},
        '{"field": null}',
      );
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(AIValidationError);
      expect(err.name).toBe('AIValidationError');
      expect(err.issues).toHaveLength(1);
      expect(err.issues[0]?.message).toBe('Required');
      expect(err.rawText).toBe('{"field": null}');
    });

    it('can dynamically import the built dist/ai.js bundle', async () => {
      const builtAI = await import('../dist/ai.js');
      expect(builtAI.streamAI).toBeTypeOf('function');
      expect(builtAI.generateObject).toBeTypeOf('function');
      expect(builtAI.AIValidationError).toBeDefined();
    });
  });

  describe('Gemini Model Driver Entry ("ranu/ai/gemini")', () => {
    it('exports factory functions and instantiates valid provider and models', () => {
      expect(createGemini).toBeTypeOf('function');
      expect(gemini).toBeTypeOf('function');

      const provider = createGemini({ apiKey: 'test-gemini-key' });
      expect(provider.name).toBe('gemini');

      const flashModel = provider('gemini-1.5-flash');
      expect(flashModel.provider).toBe('gemini');
      expect(flashModel.modelId).toBe('gemini-1.5-flash');
      expect(typeof flashModel.doStream).toBe('function');

      const proModel = provider.model('gemini-1.5-pro');
      expect(proModel.provider).toBe('gemini');
      expect(proModel.modelId).toBe('gemini-1.5-pro');

      const directModel = gemini('gemini-2.0-flash', { apiKey: 'test-gemini-key' });
      expect(directModel.provider).toBe('gemini');
      expect(directModel.modelId).toBe('gemini-2.0-flash');
    });

    it('can dynamically import the built dist/ai/gemini.js bundle', async () => {
      const builtGemini = await import('../dist/ai/gemini.js');
      expect(builtGemini.createGemini).toBeTypeOf('function');
      expect(builtGemini.gemini).toBeTypeOf('function');
    });
  });

  describe('Groq Model Driver Entry ("ranu/ai/groq")', () => {
    it('exports factory functions and instantiates valid provider and models', () => {
      expect(createGroq).toBeTypeOf('function');
      expect(groq).toBeTypeOf('function');

      const provider = createGroq({ apiKey: 'test-groq-key' });
      expect(provider.name).toBe('groq');

      const llamaModel = provider('llama-3.3-70b-versatile');
      expect(llamaModel.provider).toBe('groq');
      expect(llamaModel.modelId).toBe('llama-3.3-70b-versatile');
      expect(typeof llamaModel.doStream).toBe('function');

      const directModel = groq('mixtral-8x7b-32768', { apiKey: 'test-groq-key' });
      expect(directModel.provider).toBe('groq');
      expect(directModel.modelId).toBe('mixtral-8x7b-32768');
    });

    it('can dynamically import the built dist/ai/groq.js bundle', async () => {
      const builtGroq = await import('../dist/ai/groq.js');
      expect(builtGroq.createGroq).toBeTypeOf('function');
      expect(builtGroq.groq).toBeTypeOf('function');
    });
  });

  describe('Claude Model Driver Entry ("ranu/ai/claude")', () => {
    it('exports factory functions and instantiates valid provider and models', () => {
      expect(createClaude).toBeTypeOf('function');
      expect(claude).toBeTypeOf('function');

      const provider = createClaude({ apiKey: 'test-claude-key' });
      expect(provider.name).toBe('claude');

      const sonnetModel = provider('claude-3-5-sonnet-20241022');
      expect(sonnetModel.provider).toBe('claude');
      expect(sonnetModel.modelId).toBe('claude-3-5-sonnet-20241022');
      expect(typeof sonnetModel.doStream).toBe('function');

      const directModel = claude('claude-3-5-haiku-20241022', { apiKey: 'test-claude-key' });
      expect(directModel.provider).toBe('claude');
      expect(directModel.modelId).toBe('claude-3-5-haiku-20241022');
    });

    it('can dynamically import the built dist/ai/claude.js bundle', async () => {
      const builtClaude = await import('../dist/ai/claude.js');
      expect(builtClaude.createClaude).toBeTypeOf('function');
      expect(builtClaude.claude).toBeTypeOf('function');
    });
  });

  describe('OpenAI Model Driver Entry ("ranu/ai/openai")', () => {
    it('exports factory functions, reasoning model detector, and instantiates valid provider', () => {
      expect(createOpenAI).toBeTypeOf('function');
      expect(openai).toBeTypeOf('function');
      expect(isReasoningModel).toBeTypeOf('function');

      expect(isReasoningModel('o1-mini')).toBe(true);
      expect(isReasoningModel('o3-mini')).toBe(true);
      expect(isReasoningModel('gpt-4o')).toBe(false);

      const provider = createOpenAI({ apiKey: 'test-openai-key' });
      expect(provider.name).toBe('openai');

      const gpt4o = provider('gpt-4o');
      expect(gpt4o.provider).toBe('openai');
      expect(gpt4o.modelId).toBe('gpt-4o');
      expect(typeof gpt4o.doStream).toBe('function');

      const directModel = openai('gpt-4o-mini', { apiKey: 'test-openai-key' });
      expect(directModel.provider).toBe('openai');
      expect(directModel.modelId).toBe('gpt-4o-mini');
    });

    it('can dynamically import the built dist/ai/openai.js bundle', async () => {
      const builtOpenAI = await import('../dist/ai/openai.js');
      expect(builtOpenAI.createOpenAI).toBeTypeOf('function');
      expect(builtOpenAI.openai).toBeTypeOf('function');
      expect(builtOpenAI.isReasoningModel).toBeTypeOf('function');
    });
  });

  describe('Custom & Ollama Model Driver Entry ("ranu/ai/custom")', () => {
    it('exports factory functions, deepseek detector, and instantiates valid provider with Ollama defaults', () => {
      expect(createCustomAI).toBeTypeOf('function');
      expect(custom).toBeTypeOf('function');
      expect(isDeepSeekR1).toBeTypeOf('function');
      expect(resolveBaseURL).toBeTypeOf('function');

      expect(isDeepSeekR1('deepseek-r1:8b')).toBe(true);
      expect(isDeepSeekR1('llama3.2')).toBe(false);

      const provider = createCustomAI();
      expect(provider.name).toBe('custom');
      expect(resolveBaseURL(provider.config)).toBe('http://localhost:11434/v1');

      const llama = provider('llama3');
      expect(llama.provider).toBe('custom');
      expect(llama.modelId).toBe('llama3');
      expect(typeof llama.doStream).toBe('function');

      const directModel = custom('llama3.2', { temperature: 0.7 });
      expect(directModel.provider).toBe('custom');
      expect(directModel.modelId).toBe('llama3.2');
    });

    it('can dynamically import the built dist/ai/custom.js bundle', async () => {
      const builtCustom = await import('../dist/ai/custom.js');
      expect(builtCustom.createCustomAI).toBeTypeOf('function');
      expect(builtCustom.custom).toBeTypeOf('function');
      expect(builtCustom.isDeepSeekR1).toBeTypeOf('function');
      expect(builtCustom.resolveBaseURL).toBeTypeOf('function');
    });
  });
});
