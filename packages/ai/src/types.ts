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

/**
 * Standard Schema v1 specification issue format.
 */
export interface StandardSchemaV1Issue {
  readonly message: string;
  readonly path?: readonly (string | number | symbol | { readonly key: string | number | symbol })[] | undefined;
}

/**
 * Standard Schema v1 validation success result.
 */
export interface StandardSchemaV1Success<Output> {
  readonly value: Output;
  readonly issues?: undefined;
}

/**
 * Standard Schema v1 validation failure result.
 */
export interface StandardSchemaV1Failure {
  readonly issues: readonly StandardSchemaV1Issue[];
  readonly value?: undefined;
}

/**
 * Standard Schema v1 validation result union.
 */
export type StandardSchemaV1Result<Output> =
  | StandardSchemaV1Success<Output>
  | StandardSchemaV1Failure;

/**
 * Standard Schema v1 metadata and validation specification.
 */
export interface StandardSchemaV1Props<Input = unknown, Output = Input> {
  readonly version: 1;
  readonly vendor: string;
  readonly validate: (
    value: unknown,
  ) => StandardSchemaV1Result<Output> | Promise<StandardSchemaV1Result<Output>>;
  readonly types?: {
    readonly input: Input;
    readonly output: Output;
  };
}

/**
 * Standard Schema v1 interface (~standard specification).
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': StandardSchemaV1Props<Input, Output>;
}

/**
 * Normalized validation issue for AIValidationError.
 */
export interface AIValidationIssue {
  readonly message: string;
  readonly path?: readonly (string | number | symbol)[] | undefined;
}

/**
 * Zod/Valibot-style safeParse contract.
 */
export interface SafeParseSchema<T> {
  safeParse(data: unknown):
    | { readonly success: true; readonly data: T }
    | {
        readonly success: false;
        readonly error?: {
          readonly issues?: readonly {
            readonly message: string;
            readonly path?: readonly (string | number | symbol | { readonly key: string | number | symbol })[];
          }[];
        };
      }
    | Promise<
        | { readonly success: true; readonly data: T }
        | {
            readonly success: false;
            readonly error?: {
              readonly issues?: readonly {
                readonly message: string;
                readonly path?: readonly (string | number | symbol | { readonly key: string | number | symbol })[];
              }[];
            };
          }
      >;
}

/**
 * Zod/ArkType-style parse contract.
 */
export interface ParseSchema<T> {
  parse(data: unknown): T | Promise<T>;
}

/**
 * Custom validator function contract.
 */
export type ValidatorFunction<T> = (value: unknown) => Promise<T> | T;

/**
 * Union of supported schema definitions for generateObject.
 */
export type SupportedSchema<T = unknown> =
  | StandardSchemaV1<unknown, T>
  | SafeParseSchema<T>
  | ParseSchema<T>
  | ValidatorFunction<T>;

/**
 * Configuration options for generateObject.
 */
export interface GenerateObjectOptions<T = unknown> {
  /**
   * The AI model instance to execute the generation request against.
   */
  readonly model: AIModelInstance;

  /**
   * Schema to validate the extracted JSON against (Standard Schema v1, safeParse, parse, or validator function).
   */
  readonly schema: SupportedSchema<T>;

  /**
   * Optional name or identifier for the target schema.
   */
  readonly schemaName?: string | undefined;

  /**
   * Optional description or constraint specification of the schema for model prompting.
   */
  readonly schemaDescription?: string | undefined;

  /**
   * Optional user prompt.
   */
  readonly prompt?: string | undefined;

  /**
   * Optional list of conversational messages.
   */
  readonly messages?: readonly AIMessage[] | undefined;

  /**
   * Sampling temperature.
   */
  readonly temperature?: number | undefined;

  /**
   * Maximum tokens to generate.
   */
  readonly maxTokens?: number | undefined;

  /**
   * Optional AbortSignal for cancellation.
   */
  readonly signal?: AbortSignal | undefined;

  /**
   * Optional custom HTTP headers for provider requests.
   */
  readonly headers?: AIHeadersInit | undefined;

  /**
   * Additional provider-specific options.
   */
  readonly [key: string]: unknown;
}

/**
 * Result returned by generateObject upon successful schema validation.
 */
export interface GenerateObjectResult<T> {
  /**
   * Strongly-typed object validated against the target schema.
   */
  readonly object: T;

  /**
   * Raw text response received from the model.
   */
  readonly rawText: string;

  /**
   * Token usage metadata if provided by the model.
   */
  readonly usage?: AIUsage | undefined;

  /**
   * Finish reason reported by the model.
   */
  readonly finishReason?: string | undefined;
}
