/**
 * Ranu.js Universal AI Architecture Contracts & Types.
 */

export type AIMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export type AIMessageContentPart =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image'; readonly image: string | Uint8Array | URL; readonly mimeType?: string | undefined }
  | { readonly type: 'reasoning'; readonly text: string };

export interface AIMessage {
  readonly role: AIMessageRole;
  readonly content: string | readonly AIMessageContentPart[];
  readonly name?: string | undefined;
  readonly toolCallId?: string | undefined;
}

export interface AIToolCallChunk {
  readonly id?: string | undefined;
  readonly name?: string | undefined;
  readonly arguments?: string | undefined;
}

export interface AIUsage {
  readonly promptTokens?: number | undefined;
  readonly completionTokens?: number | undefined;
  readonly totalTokens?: number | undefined;
}

export type AIChunk =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'reasoning'; readonly reasoning: string }
  | { readonly type: 'tool-call'; readonly toolCall: AIToolCallChunk }
  | { readonly type: 'finish'; readonly finishReason?: string | undefined; readonly usage?: AIUsage | undefined }
  | { readonly type: 'error'; readonly error: unknown };

export interface StreamExecutionOptions {
  readonly prompt?: string | undefined;
  readonly messages?: readonly AIMessage[] | undefined;
  readonly temperature?: number | undefined;
  readonly maxTokens?: number | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly tools?: readonly unknown[] | undefined;
  readonly toolChoice?: unknown;
  readonly [key: string]: unknown;
}

export interface AIModelInstance {
  readonly provider: string;
  readonly modelId: string;
  doStream(options: StreamExecutionOptions): Promise<ReadableStream<AIChunk>>;
}

export interface AIProviderConfig {
  readonly name: string;
  readonly baseURL: string;
  readonly headers?:
    | Record<string, string>
    | (() => Record<string, string> | Promise<Record<string, string>>)
    | undefined;
  readonly fetch?: typeof fetch | undefined;
  readonly apiKey?: string | (() => string | Promise<string>) | undefined;
}

export interface AIProvider {
  (modelId: string): AIModelInstance;
  readonly name: string;
  readonly config: AIProviderConfig;
  model(modelId: string): AIModelInstance;
}

export interface StreamAIOptions<_T = unknown> {
  readonly model: AIModelInstance;
  readonly prompt?: string | undefined;
  readonly messages?: readonly AIMessage[] | undefined;
  readonly temperature?: number | undefined;
  readonly maxTokens?: number | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly schema?: unknown;
}
