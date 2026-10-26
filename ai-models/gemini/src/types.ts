/**
 * Ranu.js Google Gemini Model Driver Types.
 */

import type { AIModelInstance, AIMessageContentPart, AIChunk, StreamExecutionOptions } from '@ranu/ai';

export type GeminiModelId =
  | 'gemini-1.5-pro'
  | 'gemini-1.5-flash'
  | 'gemini-2.0-flash'
  | (string & {});

export type GeminiSafetyCategory =
  | 'HARM_CATEGORY_HARASSMENT'
  | 'HARM_CATEGORY_HATE_SPEECH'
  | 'HARM_CATEGORY_SEXUALLY_EXPLICIT'
  | 'HARM_CATEGORY_DANGEROUS_CONTENT'
  | 'HARM_CATEGORY_CIVIC_INTEGRITY'
  | (string & {});

export type GeminiSafetyThreshold =
  | 'BLOCK_NONE'
  | 'BLOCK_LOW_AND_ABOVE'
  | 'BLOCK_MEDIUM_AND_ABOVE'
  | 'BLOCK_ONLY_HIGH'
  | (string & {});

export interface GeminiSafetySetting {
  readonly category: GeminiSafetyCategory;
  readonly threshold: GeminiSafetyThreshold;
}

export type GeminiPart =
  | { readonly text: string }
  | { readonly inlineData: { readonly mimeType: string; readonly data: string } }
  | { readonly fileData: { readonly mimeType: string; readonly fileUri: string } }
  | { readonly functionCall?: { readonly name: string; readonly args?: Record<string, unknown> } }
  | { readonly functionResponse?: { readonly name: string; readonly response: Record<string, unknown> } };

export interface GeminiContent {
  readonly role: 'user' | 'model';
  readonly parts: readonly GeminiPart[];
}

export interface GeminiGenerationConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  responseSchema?: Record<string, unknown>;
}

export interface GeminiConfig {
  readonly apiKey?: string | (() => string | Promise<string>) | undefined;
  readonly baseURL?: string | undefined;
  readonly headers?:
    | Record<string, string>
    | (() => Record<string, string> | Promise<Record<string, string>>)
    | undefined;
  readonly fetch?: typeof fetch | undefined;
}

export interface GeminiSettings {
  readonly systemInstruction?: string | readonly AIMessageContentPart[] | undefined;
  readonly safetySettings?: readonly GeminiSafetySetting[] | undefined;
  readonly temperature?: number | undefined;
  readonly topP?: number | undefined;
  readonly topK?: number | undefined;
  readonly maxOutputTokens?: number | undefined;
  readonly responseMimeType?: string | undefined;
  readonly responseSchema?: Record<string, unknown> | undefined;
  readonly structuredOutputs?: boolean | undefined;
}

export interface GeminiModelInstance extends AIModelInstance {
  readonly provider: 'gemini';
  readonly modelId: string;
  readonly config: GeminiConfig;
  readonly settings?: GeminiSettings | undefined;
  doStream(options: StreamExecutionOptions): Promise<ReadableStream<AIChunk>>;
}

export interface GeminiProvider {
  (modelId: GeminiModelId, settings?: GeminiSettings): GeminiModelInstance;
  readonly name: 'gemini';
  readonly config: GeminiConfig;
  model(modelId: GeminiModelId, settings?: GeminiSettings): GeminiModelInstance;
}
