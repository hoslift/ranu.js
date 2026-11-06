import type { AIModelInstance } from '@ranu/ai';

export interface ResolveAIModelOptions {
  provider?: string | undefined;
  model?: string | undefined;
  importer?: ((specifier: string) => Promise<unknown>) | undefined;
}

export interface ResolvedAIModel {
  provider: string;
  modelId: string;
  instance: AIModelInstance;
}

export const DEFAULT_MODELS: Record<string, string> = {
  gemini: 'gemini-1.5-pro',
  groq: 'llama-3.3-70b-versatile',
  claude: 'claude-3-5-sonnet-20241022',
  openai: 'gpt-4o',
  custom: 'default',
};

/**
 * Infers the AI provider based on model identifier patterns.
 */
export function detectProviderFromModel(model: string): string | undefined {
  const m = model.toLowerCase().trim();
  if (m.startsWith('gemini')) return 'gemini';
  if (m.startsWith('llama') || m.startsWith('mixtral') || m.startsWith('gemma')) return 'groq';
  if (m.startsWith('claude')) return 'claude';
  if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('chatgpt')) return 'openai';
  if (m.startsWith('custom') || m.startsWith('ollama') || m.startsWith('deepseek')) return 'custom';
  return undefined;
}

/**
 * Detects available AI provider from active environment variables.
 */
export function detectProviderFromEnv(): string | undefined {
  if (process.env.GROQ_API_KEY) return 'groq';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'claude';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.CUSTOM_AI_KEY || process.env.CUSTOM_AI_ENDPOINT) return 'custom';
  return undefined;
}

/**
 * Dynamically loads and resolves an AI model instance based on provider/model options or environment.
 */
export async function loadAIModel(options: ResolveAIModelOptions = {}): Promise<ResolvedAIModel> {
  let provider = options.provider?.toLowerCase().trim();
  let modelId = options.model?.trim();

  if (!provider && modelId) {
    provider = detectProviderFromModel(modelId);
  }

  if (!provider) {
    provider = detectProviderFromEnv();
  }

  if (!provider) {
    throw new Error(
      'No AI provider configured. Set GROQ_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY in your environment, or pass --provider <gemini|groq|claude|openai|custom>.'
    );
  }

  if (!modelId) {
    modelId = DEFAULT_MODELS[provider] ?? 'default';
  }

  const importer = options.importer ?? ((id: string) => import(id));

  let instance: AIModelInstance;
  switch (provider) {
    case 'gemini': {
      const mod = (await importer('@ranu/ai-gemini')) as { gemini: (id: string) => AIModelInstance };
      if (typeof mod?.gemini !== 'function') {
        throw new Error('Failed to resolve gemini model factory from @ranu/ai-gemini.');
      }
      instance = mod.gemini(modelId);
      break;
    }
    case 'groq': {
      const mod = (await importer('@ranu/ai-groq')) as { groq: (id: string) => AIModelInstance };
      if (typeof mod?.groq !== 'function') {
        throw new Error('Failed to resolve groq model factory from @ranu/ai-groq.');
      }
      instance = mod.groq(modelId);
      break;
    }
    case 'claude': {
      const mod = (await importer('@ranu/ai-claude')) as { claude: (id: string) => AIModelInstance };
      if (typeof mod?.claude !== 'function') {
        throw new Error('Failed to resolve claude model factory from @ranu/ai-claude.');
      }
      instance = mod.claude(modelId);
      break;
    }
    case 'openai': {
      const mod = (await importer('@ranu/ai-openai')) as { openai: (id: string) => AIModelInstance };
      if (typeof mod?.openai !== 'function') {
        throw new Error('Failed to resolve openai model factory from @ranu/ai-openai.');
      }
      instance = mod.openai(modelId);
      break;
    }
    case 'custom': {
      const mod = (await importer('@ranu/ai-custom')) as {
        custom?: (id: string) => AIModelInstance;
        customAI?: (id: string) => AIModelInstance;
        createCustomAI?: () => (id: string) => AIModelInstance;
      };
      const factory = mod?.custom ?? mod?.customAI ?? mod?.createCustomAI?.();
      if (typeof factory !== 'function') {
        throw new Error('Failed to resolve custom model factory from @ranu/ai-custom.');
      }
      instance = factory(modelId);
      break;
    }
    default:
      throw new Error(`Unsupported AI provider "${provider}". Supported providers: gemini, groq, claude, openai, custom.`);
  }

  return { provider, modelId, instance };
}
