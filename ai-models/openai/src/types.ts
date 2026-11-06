/**
 * Ranu.js OpenAI Model Driver Types.
 */

import type { AIModelInstance, AIChunk, StreamExecutionOptions } from '@ranu/ai';

export type OpenAIModelId =
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'o1'
  | 'o1-mini'
  | 'o3-mini'
  | (string & {});

export interface OpenAIConfig {
  readonly apiKey?: string | (() => string | Promise<string>) | undefined;
  readonly baseURL?: string | undefined;
  readonly organization?: string | undefined;
  readonly project?: string | undefined;
  readonly headers?:
    | Record<string, string>
    | (() => Record<string, string> | Promise<Record<string, string>>)
    | undefined;
  readonly fetch?: typeof fetch | undefined;
}

export interface OpenAIResponseFormat {
  readonly type: 'text' | 'json_object' | 'json_schema';
  readonly json_schema?: unknown;
}

export interface OpenAISettings {
  readonly temperature?: number | undefined;
  readonly maxTokens?: number | undefined;
  readonly topP?: number | undefined;
  readonly frequencyPenalty?: number | undefined;
  readonly presencePenalty?: number | undefined;
  readonly responseFormat?: OpenAIResponseFormat | undefined;
  readonly tools?: readonly unknown[] | undefined;
  readonly toolChoice?: unknown;
  readonly reasoningEffort?: 'low' | 'medium' | 'high' | undefined;
  readonly structuredOutputs?: boolean | undefined;
}

export interface OpenAIModelInstance extends AIModelInstance {
  readonly provider: 'openai';
  readonly modelId: string;
  readonly config: OpenAIConfig;
  readonly settings?: OpenAISettings | undefined;
  doStream(options: StreamExecutionOptions): Promise<ReadableStream<AIChunk>>;
}

export interface OpenAIProvider {
  (modelId: OpenAIModelId, settings?: OpenAISettings): OpenAIModelInstance;
  readonly name: 'openai';
  readonly config: OpenAIConfig;
  model(modelId: OpenAIModelId, settings?: OpenAISettings): OpenAIModelInstance;
}
