import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadAIModel,
  detectProviderFromModel,
  detectProviderFromEnv,
  DEFAULT_MODELS,
  type ResolveAIModelOptions,
} from '../src/ai-provider-loader.js';
import type { AIModelInstance } from '@ranu/ai';

describe('@ranu/cli AI provider loader', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.CUSTOM_AI_KEY;
    delete process.env.CUSTOM_AI_ENDPOINT;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('detectProviderFromModel', () => {
    it('infers gemini provider from model prefix', () => {
      expect(detectProviderFromModel('gemini-1.5-pro')).toBe('gemini');
      expect(detectProviderFromModel('GEMINI-2.0-FLASH')).toBe('gemini');
    });

    it('infers groq provider from llama, mixtral, and gemma', () => {
      expect(detectProviderFromModel('llama-3.3-70b-versatile')).toBe('groq');
      expect(detectProviderFromModel('mixtral-8x7b-32768')).toBe('groq');
      expect(detectProviderFromModel('gemma2-9b-it')).toBe('groq');
    });

    it('infers claude provider from claude prefix', () => {
      expect(detectProviderFromModel('claude-3-5-sonnet-20241022')).toBe('claude');
      expect(detectProviderFromModel('claude-3-haiku-20240307')).toBe('claude');
    });

    it('infers openai provider from gpt, o1, o3, chatgpt', () => {
      expect(detectProviderFromModel('gpt-4o')).toBe('openai');
      expect(detectProviderFromModel('gpt-4o-mini')).toBe('openai');
      expect(detectProviderFromModel('o1-preview')).toBe('openai');
      expect(detectProviderFromModel('o3-mini')).toBe('openai');
      expect(detectProviderFromModel('chatgpt-4o-latest')).toBe('openai');
    });

    it('infers custom provider from custom, ollama, deepseek', () => {
      expect(detectProviderFromModel('custom-model')).toBe('custom');
      expect(detectProviderFromModel('ollama/qwen2.5-coder')).toBe('custom');
      expect(detectProviderFromModel('deepseek-r1')).toBe('custom');
    });

    it('returns undefined for unrecognized model strings', () => {
      expect(detectProviderFromModel('unknown-model-xyz')).toBeUndefined();
    });
  });

  describe('detectProviderFromEnv', () => {
    it('detects groq when GROQ_API_KEY is set', () => {
      process.env.GROQ_API_KEY = 'gsk_test123';
      expect(detectProviderFromEnv()).toBe('groq');
    });

    it('detects gemini when GEMINI_API_KEY is set', () => {
      process.env.GEMINI_API_KEY = 'AIzaSy_test123';
      expect(detectProviderFromEnv()).toBe('gemini');
    });

    it('detects claude when ANTHROPIC_API_KEY is set', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test123';
      expect(detectProviderFromEnv()).toBe('claude');
    });

    it('detects openai when OPENAI_API_KEY is set', () => {
      process.env.OPENAI_API_KEY = 'sk-test123';
      expect(detectProviderFromEnv()).toBe('openai');
    });

    it('detects custom when CUSTOM_AI_KEY or CUSTOM_AI_ENDPOINT is set', () => {
      process.env.CUSTOM_AI_KEY = 'cust_test123';
      expect(detectProviderFromEnv()).toBe('custom');

      delete process.env.CUSTOM_AI_KEY;
      process.env.CUSTOM_AI_ENDPOINT = 'http://localhost:11434/v1';
      expect(detectProviderFromEnv()).toBe('custom');
    });

    it('returns undefined when no AI environment variables are set', () => {
      expect(detectProviderFromEnv()).toBeUndefined();
    });
  });

  describe('DEFAULT_MODELS', () => {
    it('defines expected default models for all 5 providers', () => {
      expect(DEFAULT_MODELS.gemini).toBe('gemini-1.5-pro');
      expect(DEFAULT_MODELS.groq).toBe('llama-3.3-70b-versatile');
      expect(DEFAULT_MODELS.claude).toBe('claude-3-5-sonnet-20241022');
      expect(DEFAULT_MODELS.openai).toBe('gpt-4o');
      expect(DEFAULT_MODELS.custom).toBe('default');
    });
  });

  describe('loadAIModel', () => {
    function createMockModel(provider: string, modelId: string): AIModelInstance {
      return {
        provider,
        modelId,
        doStream: vi.fn(),
      };
    }

    it('throws error when no provider is specified and none detected from env', async () => {
      await expect(loadAIModel()).rejects.toThrow(
        /No AI provider configured\. Set GROQ_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY/
      );
    });

    it('throws error for unsupported provider', async () => {
      await expect(loadAIModel({ provider: 'unsupported-provider' })).rejects.toThrow(
        /Unsupported AI provider "unsupported-provider"/
      );
    });

    it('loads gemini model using custom importer', async () => {
      const mockInstance = createMockModel('gemini', 'gemini-1.5-flash');
      const mockImporter = vi.fn().mockResolvedValue({
        gemini: vi.fn().mockReturnValue(mockInstance),
      });

      const result = await loadAIModel({
        provider: 'gemini',
        model: 'gemini-1.5-flash',
        importer: mockImporter,
      });

      expect(mockImporter).toHaveBeenCalledWith('@ranu/ai-gemini');
      expect(result.provider).toBe('gemini');
      expect(result.modelId).toBe('gemini-1.5-flash');
      expect(result.instance).toBe(mockInstance);
    });

    it('loads groq model with default model when model is omitted', async () => {
      const mockInstance = createMockModel('groq', 'llama-3.3-70b-versatile');
      const mockImporter = vi.fn().mockResolvedValue({
        groq: vi.fn().mockReturnValue(mockInstance),
      });

      const result = await loadAIModel({
        provider: 'groq',
        importer: mockImporter,
      });

      expect(result.provider).toBe('groq');
      expect(result.modelId).toBe('llama-3.3-70b-versatile');
      expect(result.instance).toBe(mockInstance);
    });

    it('auto-detects provider from model name when provider is omitted', async () => {
      const mockInstance = createMockModel('claude', 'claude-3-5-sonnet-20241022');
      const mockImporter = vi.fn().mockResolvedValue({
        claude: vi.fn().mockReturnValue(mockInstance),
      });

      const result = await loadAIModel({
        model: 'claude-3-5-sonnet-20241022',
        importer: mockImporter,
      });

      expect(mockImporter).toHaveBeenCalledWith('@ranu/ai-claude');
      expect(result.provider).toBe('claude');
      expect(result.modelId).toBe('claude-3-5-sonnet-20241022');
    });

    it('auto-detects provider from environment when provider and model are omitted', async () => {
      process.env.OPENAI_API_KEY = 'sk-mock-key';
      const mockInstance = createMockModel('openai', 'gpt-4o');
      const mockImporter = vi.fn().mockResolvedValue({
        openai: vi.fn().mockReturnValue(mockInstance),
      });

      const result = await loadAIModel({
        importer: mockImporter,
      });

      expect(mockImporter).toHaveBeenCalledWith('@ranu/ai-openai');
      expect(result.provider).toBe('openai');
      expect(result.modelId).toBe('gpt-4o');
    });

    it('loads custom provider with fallback factory methods', async () => {
      const mockInstance = createMockModel('custom', 'ollama/llama3');
      const mockImporter = vi.fn().mockResolvedValue({
        custom: vi.fn().mockReturnValue(mockInstance),
      });

      const result = await loadAIModel({
        provider: 'custom',
        model: 'ollama/llama3',
        importer: mockImporter,
      });

      expect(mockImporter).toHaveBeenCalledWith('@ranu/ai-custom');
      expect(result.provider).toBe('custom');
      expect(result.modelId).toBe('ollama/llama3');
    });

    it('throws when package import fails to provide model factory', async () => {
      const mockImporter = vi.fn().mockResolvedValue({});

      await expect(
        loadAIModel({
          provider: 'claude',
          importer: mockImporter,
        })
      ).rejects.toThrow(/Failed to resolve claude model factory/);
    });
  });
});
