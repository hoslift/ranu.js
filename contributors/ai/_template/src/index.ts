export interface CustomAIProviderOptions {
  readonly apiKey?: string | undefined;
  readonly baseURL?: string | undefined;
  readonly defaultModel?: string | undefined;
}

export interface CustomAIProvider {
  readonly name: string;
  readonly version: string;
  readonly defaultModel: string;
  configure(options?: CustomAIProviderOptions): CustomAIProvider;
}

export function createAIProvider(options: CustomAIProviderOptions = {}): CustomAIProvider {
  const defaultModel = options.defaultModel ?? 'custom-default';
  return {
    name: 'custom-ai-provider',
    version: '0.1.0',
    defaultModel,
    configure(nextOptions: CustomAIProviderOptions = {}) {
      return createAIProvider({ ...options, ...nextOptions });
    },
  };
}

export default createAIProvider;
