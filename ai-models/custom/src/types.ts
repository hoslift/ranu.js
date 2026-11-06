/**
 * Ranu.js Custom & Ollama Model Driver Types.
 */

import type { AIModelInstance, AIChunk, StreamExecutionOptions } from '@ranu/ai';

export type CustomModelId =
  | 'llama3'
  | 'llama3.1'
  | 'llama3.2'
  | 'mistral'
  | 'deepseek-r1'
  | 'qwen2.5'
  | 'phi3'
  | (string & {});

export interface CustomAIConfig {
  readonly baseURL?: string | undefined;
  readonly apiKey?: string | (() => string | Promise<string>) | undefined;
  readonly sessionToken?: string | (() => string | Promise<string>) | undefined;
  readonly authHeaderName?: string | undefined;
  readonly authHeaderPrefix?: string | undefined;
  readonly tenantId?: string | undefined;
  readonly organizationId?: string | undefined;
  readonly headers?:
    | Record<string, string>
    | (() => Record<string, string> | Promise<Record<string, string>>)
    | undefined;
  readonly fetch?: typeof fetch | undefined;
}

export interface CustomResponseFormat {
  readonly type: 'text' | 'json_object' | 'json_schema';
  readonly json_schema?: unknown;
}

export interface CustomAISettings {
  readonly temperature?: number | undefined;
  readonly maxTokens?: number | undefined;
  readonly topP?: number | undefined;
  readonly frequencyPenalty?: number | undefined;
  readonly presencePenalty?: number | undefined;
  readonly responseFormat?: CustomResponseFormat | undefined;
  readonly format?: 'json' | undefined;
  readonly tools?: readonly unknown[] | undefined;
  readonly toolChoice?: unknown;
  readonly structuredOutputs?: boolean | undefined;
  readonly [key: string]: unknown;
}

export interface CustomAIModelInstance extends AIModelInstance {
  readonly provider: 'custom';
  readonly modelId: string;
  readonly config: CustomAIConfig;
  readonly settings?: CustomAISettings | undefined;
  doStream(options: StreamExecutionOptions): Promise<ReadableStream<AIChunk>>;
}

export interface CustomAIProvider {
  (modelId: CustomModelId, settings?: CustomAISettings): CustomAIModelInstance;
  readonly name: 'custom';
  readonly config: CustomAIConfig;
  model(modelId: CustomModelId, settings?: CustomAISettings): CustomAIModelInstance;
}
