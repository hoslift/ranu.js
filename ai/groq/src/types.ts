/**
 * Ranu.js Groq Model Driver Types.
 */

import type { AIModelInstance, AIChunk, StreamExecutionOptions } from '@ranu/ai';

export type GroqModelId =
  | 'llama-3.3-70b-versatile'
  | 'llama-3.1-8b-instant'
  | 'mixtral-8x7b-32768'
  | (string & {});

export interface GroqMetrics {
  readonly latencyMs: number;
  readonly ttft: number; // Time to First Token in milliseconds
  readonly tps: number;  // Tokens Per Second
  readonly totalTokens?: number | undefined;
  readonly promptTokens?: number | undefined;
  readonly completionTokens?: number | undefined;
}

export interface GroqConfig {
  readonly apiKey?: string | (() => string | Promise<string>) | undefined;
  readonly baseURL?: string | undefined;
  readonly headers?:
    | Record<string, string>
    | (() => Record<string, string> | Promise<Record<string, string>>)
    | undefined;
  readonly fetch?: typeof fetch | undefined;
}

export interface GroqSettings {
  readonly temperature?: number | undefined;
  readonly maxTokens?: number | undefined;
  readonly topP?: number | undefined;
  readonly jsonMode?: boolean | undefined;
  readonly responseFormat?: { readonly type: 'json_object' | 'text' } | undefined;
  readonly tools?: readonly unknown[] | undefined;
  readonly toolChoice?: unknown;
  readonly onMetrics?: ((metrics: GroqMetrics) => void) | undefined;
}

export interface GroqModelInstance extends AIModelInstance {
  readonly provider: 'groq';
  readonly modelId: string;
  readonly config: GroqConfig;
  readonly settings?: GroqSettings | undefined;
  doStream(options: StreamExecutionOptions): Promise<ReadableStream<AIChunk>>;
  getLastMetrics(): GroqMetrics | undefined;
}

export interface GroqProvider {
  (modelId: GroqModelId, settings?: GroqSettings): GroqModelInstance;
  readonly name: 'groq';
  readonly config: GroqConfig;
  model(modelId: GroqModelId, settings?: GroqSettings): GroqModelInstance;
}
