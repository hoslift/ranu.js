/**
 * Ranu.js AI Provider Driver Types.
 */

import type { AIChunk, AIModelInstance, StreamExecutionOptions } from '@ranu/ai';

export type ProviderModelId = 'default-model' | (string & {});

export interface ProviderDriverConfig {
  readonly apiKey?: string | (() => string | Promise<string>) | undefined;
  readonly baseURL?: string | undefined;
  readonly headers?:
    | Record<string, string>
    | (() => Record<string, string> | Promise<Record<string, string>>)
    | undefined;
  readonly fetch?: typeof fetch | undefined;
}

export interface ProviderModelSettings {
  readonly temperature?: number | undefined;
  readonly maxTokens?: number | undefined;
  readonly topP?: number | undefined;
  readonly tools?: readonly unknown[] | undefined;
  readonly toolChoice?: unknown;
  readonly [key: string]: unknown;
}

export interface ProviderModelInstance extends AIModelInstance {
  readonly provider: string;
  readonly modelId: string;
  readonly config: ProviderDriverConfig;
  readonly settings?: ProviderModelSettings | undefined;
  doStream(options: StreamExecutionOptions): Promise<ReadableStream<AIChunk>>;
}

export interface ProviderFactory {
  (modelId: ProviderModelId, settings?: ProviderModelSettings): ProviderModelInstance;
  readonly name: string;
  readonly config: ProviderDriverConfig;
  model(modelId: ProviderModelId, settings?: ProviderModelSettings): ProviderModelInstance;
}
