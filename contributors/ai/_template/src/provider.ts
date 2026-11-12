/**
 * Custom AI Model Driver Template for Ranu.js.
 */

import type { AIChunk, StreamExecutionOptions } from '@ranu/ai';
import type {
  ProviderDriverConfig,
  ProviderFactory,
  ProviderModelId,
  ProviderModelInstance,
  ProviderModelSettings,
} from './types.js';

const PROVIDER_NAME = 'custom-provider';

/**
 * Creates a configured AI provider factory adhering to @ranu/ai driver contracts.
 */
export function createProvider(config: ProviderDriverConfig = {}): ProviderFactory {
  const provider = (
    modelId: ProviderModelId,
    settings?: ProviderModelSettings,
  ): ProviderModelInstance => {
    return {
      provider: PROVIDER_NAME,
      modelId,
      config,
      settings,
      async doStream(_options: StreamExecutionOptions): Promise<ReadableStream<AIChunk>> {
        await Promise.resolve();
        // Replace with live fetch/SSE streaming against your model provider endpoint.
        return new ReadableStream<AIChunk>({
          start(controller) {
            controller.enqueue({
              type: 'finish',
              finishReason: 'stop',
            });
            controller.close();
          },
        });
      },
    };
  };

  Object.defineProperty(provider, 'name', {
    value: PROVIDER_NAME,
    writable: false,
    configurable: true,
  });
  Object.defineProperty(provider, 'config', {
    value: config,
    writable: false,
    configurable: true,
  });
  Object.defineProperty(provider, 'model', {
    value: (modelId: ProviderModelId, settings?: ProviderModelSettings) =>
      provider(modelId, settings),
    writable: false,
    configurable: true,
  });

  return provider as ProviderFactory;
}

/**
 * Default model factory instance using environment/default configuration.
 */
export const customProvider = (
  modelId: ProviderModelId,
  settings?: ProviderModelSettings,
): ProviderModelInstance => createProvider()(modelId, settings);
