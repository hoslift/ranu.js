/**
 * Ranu.js Anthropic Claude Model Driver Types.
 */

import type { AIModelInstance, AIMessageContentPart, AIChunk, StreamExecutionOptions } from '@ranu/ai';

export type ClaudeModelId =
  | 'claude-3-5-sonnet-20241022'
  | 'claude-3-5-haiku-20241022'
  | 'claude-3-opus-20240229'
  | (string & {});

export interface ClaudeCacheControl {
  readonly type: 'ephemeral';
}

export interface ClaudeSystemBlock {
  readonly type: 'text';
  readonly text: string;
  readonly cache_control?: ClaudeCacheControl | undefined;
}

export interface ClaudeConfig {
  readonly apiKey?: string | (() => string | Promise<string>) | undefined;
  readonly baseURL?: string | undefined;
  readonly anthropicVersion?: string | undefined;
  readonly headers?:
    | Record<string, string>
    | (() => Record<string, string> | Promise<Record<string, string>>)
    | undefined;
  readonly fetch?: typeof fetch | undefined;
}

export interface ClaudeSettings {
  readonly temperature?: number | undefined;
  readonly maxTokens?: number | undefined;
  readonly topP?: number | undefined;
  readonly topK?: number | undefined;
  readonly system?: string | readonly ClaudeSystemBlock[] | readonly AIMessageContentPart[] | undefined;
  readonly promptCaching?: boolean | undefined;
  readonly tools?: readonly unknown[] | undefined;
  readonly toolChoice?: unknown;
}

export interface ClaudeModelInstance extends AIModelInstance {
  readonly provider: 'claude';
  readonly modelId: string;
  readonly config: ClaudeConfig;
  readonly settings?: ClaudeSettings | undefined;
  doStream(options: StreamExecutionOptions): Promise<ReadableStream<AIChunk>>;
}

export interface ClaudeProvider {
  (modelId: ClaudeModelId, settings?: ClaudeSettings): ClaudeModelInstance;
  readonly name: 'claude';
  readonly config: ClaudeConfig;
  model(modelId: ClaudeModelId, settings?: ClaudeSettings): ClaudeModelInstance;
}
