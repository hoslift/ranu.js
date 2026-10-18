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

export interface BoundedStreamOptions {
  /**
   * High water mark (in bytes) defining maximum buffered chunk queue size before backpressure is asserted.
   * Defaults to 64 KB (65,536 bytes).
   */
  readonly highWaterMark?: number | undefined;

  /**
   * Optional AbortSignal from client or request context to cancel streaming immediately.
   */
  readonly signal?: AbortSignal | undefined;

  /**
   * Maximum total bytes allowed through the stream before aborting with an error limit.
   */
  readonly maxBytes?: number | undefined;

  /**
   * Callback fired on each enqueued chunk with chunk byte size and total accumulated bytes.
   */
  readonly onChunk?: ((chunkSize: number, totalBytes: number) => void) | undefined;
}

export interface StreamingDrainMetrics {
  readonly totalBytes: number;
  readonly chunkCount: number;
  readonly backpressurePauses: number;
  readonly startTime: number;
  readonly elapsedMs: number;
}

export type AIHeadersInit = Headers | [string, string][] | Record<string, string>;

export interface StreamAIOptions<_T = unknown> {
  readonly model: AIModelInstance;
  readonly prompt?: string | undefined;
  readonly messages?: readonly AIMessage[] | undefined;
  readonly temperature?: number | undefined;
  readonly maxTokens?: number | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly schema?: unknown;
  readonly tools?: readonly unknown[] | undefined;
  readonly toolChoice?: unknown;
  readonly headers?: AIHeadersInit | undefined;
  readonly status?: number | undefined;
  readonly statusText?: string | undefined;
  readonly highWaterMark?: number | undefined;
  readonly maxBytes?: number | undefined;
  readonly onChunk?: ((chunkSize: number, totalBytes: number) => void) | undefined;
  readonly [key: string]: unknown;
}


