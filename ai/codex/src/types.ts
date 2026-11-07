/**
 * Ranu.js Codex & OpenAI Model Driver Types.
 */

import type { AIModelInstance, AIChunk, StreamExecutionOptions } from '@ranu/ai';

export type CodexModelId =
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'o1'
  | 'o1-mini'
  | 'o3-mini'
  | (string & {});

export type OpenAIModelId = CodexModelId;

export interface CodexConfig {
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

export type OpenAIConfig = CodexConfig;

export interface CodexResponseFormat {
  readonly type: 'text' | 'json_object' | 'json_schema';
  readonly json_schema?: unknown;
}

export type OpenAIResponseFormat = CodexResponseFormat;

export interface CodexSettings {
  readonly temperature?: number | undefined;
  readonly maxTokens?: number | undefined;
  readonly topP?: number | undefined;
  readonly frequencyPenalty?: number | undefined;
  readonly presencePenalty?: number | undefined;
  readonly responseFormat?: CodexResponseFormat | undefined;
  readonly tools?: readonly unknown[] | undefined;
  readonly toolChoice?: unknown;
  readonly reasoningEffort?: 'low' | 'medium' | 'high' | undefined;
  readonly structuredOutputs?: boolean | undefined;
}

export type OpenAISettings = CodexSettings;

export interface CodexModelInstance extends AIModelInstance {
  readonly provider: 'codex' | 'openai';
  readonly modelId: string;
  readonly config: CodexConfig;
  readonly settings?: CodexSettings | undefined;
  doStream(options: StreamExecutionOptions): Promise<ReadableStream<AIChunk>>;
}

export type OpenAIModelInstance = CodexModelInstance;

export interface CodexProvider {
  (modelId: CodexModelId, settings?: CodexSettings): CodexModelInstance;
  readonly name: 'codex' | 'openai';
  readonly config: CodexConfig;
  model(modelId: CodexModelId, settings?: CodexSettings): CodexModelInstance;
}

export type OpenAIProvider = CodexProvider;
