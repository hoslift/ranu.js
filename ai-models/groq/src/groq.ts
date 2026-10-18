/**
 * Groq LPU High-Speed Inference Model Driver for Ranu.js.
 *
 * Implements sub-10ms latency metrics tracking (TTFT, TPS, latencyMs),
 * OpenAI-compatible SSE streaming, tool-calling deltas, JSON mode,
 * and dynamic API key resolution.
 */

import type {
  AIChunk,
  AIMessageContentPart,
  AIUsage,
  StreamExecutionOptions,
} from '@ranu/ai';
import type {
  GroqConfig,
  GroqMetrics,
  GroqModelId,
  GroqModelInstance,
  GroqProvider,
  GroqSettings,
} from './types.js';

const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';

async function resolveApiKey(config?: GroqConfig): Promise<string> {
  if (typeof config?.apiKey === 'function') {
    return await config.apiKey();
  }
  if (typeof config?.apiKey === 'string' && config.apiKey.length > 0) {
    return config.apiKey;
  }
  if (typeof process !== 'undefined' && process.env && process.env['GROQ_API_KEY']) {
    return process.env['GROQ_API_KEY'];
  }
  throw new Error(
    'Groq API key is required. Set GROQ_API_KEY environment variable or pass apiKey in GroqConfig.',
  );
}

function extractText(content: string | readonly AIMessageContentPart[]): string {
  if (typeof content === 'string') {
    return content;
  }
  return content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

function normalizeMessages(options: StreamExecutionOptions): Array<{ role: string; content: string; name?: string }> {
  if (options.messages && options.messages.length > 0) {
    return options.messages.map((m) => {
      const entry: { role: string; content: string; name?: string } = {
        role: m.role,
        content: extractText(m.content),
      };
      if (m.name) {
        entry.name = m.name;
      }
      return entry;
    });
  }

  if (options.prompt !== undefined && options.prompt.length > 0) {
    return [{ role: 'user', content: options.prompt }];
  }

  return [];
}

interface StreamParsingState {
  firstTokenTime?: number | undefined;
  tokensCounted: number;
  finishReason?: string | undefined;
  usage?: AIUsage | undefined;
}

function parseGroqStreamLine(
  line: string,
  state: StreamParsingState,
  requestStartTime: number,
  enqueue: (chunk: AIChunk) => void,
): void {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(':')) {
    return;
  }

  if (trimmed.startsWith('data:')) {
    const rawData = trimmed.slice(5).trim();
    if (rawData === '[DONE]') {
      return;
    }

    try {
      const json = JSON.parse(rawData) as Record<string, unknown>;

      // Track usage object if sent in stream_options
      if (json['usage'] && typeof json['usage'] === 'object') {
        const usageObj = json['usage'] as Record<string, number>;
        state.usage = {
          promptTokens: usageObj['prompt_tokens'],
          completionTokens: usageObj['completion_tokens'],
          totalTokens: usageObj['total_tokens'],
        };
      }

      if (Array.isArray(json['choices'])) {
        for (const choice of json['choices'] as Array<Record<string, unknown>>) {
          const delta = choice['delta'] as Record<string, unknown> | undefined;
          if (delta) {
            // Text delta
            if (typeof delta['content'] === 'string' && delta['content'].length > 0) {
              if (state.firstTokenTime === undefined) {
                state.firstTokenTime = performance.now();
              }
              state.tokensCounted += Math.max(1, Math.ceil(delta['content'].length / 4));
              enqueue({ type: 'text', text: delta['content'] });
            }

            // Reasoning delta (e.g. DeepSeek / Llama thinking)
            const reasoning = delta['reasoning_content'] ?? delta['reasoning'];
            if (typeof reasoning === 'string' && reasoning.length > 0) {
              if (state.firstTokenTime === undefined) {
                state.firstTokenTime = performance.now();
              }
              state.tokensCounted += Math.max(1, Math.ceil(reasoning.length / 4));
              enqueue({ type: 'reasoning', reasoning });
            }

            // Tool calling deltas
            if (Array.isArray(delta['tool_calls'])) {
              if (state.firstTokenTime === undefined) {
                state.firstTokenTime = performance.now();
              }
              for (const tc of delta['tool_calls'] as Array<Record<string, unknown>>) {
                const func = tc['function'] as Record<string, unknown> | undefined;
                const toolCall: { id?: string; name?: string; arguments?: string } = {};
                if (typeof tc['id'] === 'string') toolCall.id = tc['id'];
                if (typeof func?.['name'] === 'string') toolCall.name = func['name'];
                if (typeof func?.['arguments'] === 'string') toolCall.arguments = func['arguments'];
                enqueue({ type: 'tool-call', toolCall });
              }
            }
          }

          const rawFinish = choice['finish_reason'];
          if (typeof rawFinish === 'string') {
            state.finishReason = rawFinish;
          } else if (typeof rawFinish === 'number' || typeof rawFinish === 'boolean') {
            state.finishReason = String(rawFinish);
          }
        }
      }
    } catch {
      // Incomplete or non-JSON chunk; ignored
    }
  }
}

function transformGroqByteStream(
  byteStream: ReadableStream<Uint8Array>,
  requestStartTime: number,
  onComplete: (metrics: GroqMetrics) => void,
): ReadableStream<AIChunk> {
  const reader = byteStream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const state: StreamParsingState = {
    tokensCounted: 0,
  };

  return new ReadableStream<AIChunk>({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            parseGroqStreamLine(line, state, requestStartTime, (chunk) => controller.enqueue(chunk));
          }
        }

        buffer += decoder.decode();
        if (buffer.trim().length > 0) {
          parseGroqStreamLine(buffer, state, requestStartTime, (chunk) => controller.enqueue(chunk));
        }

        // Calculate high-speed inference metrics
        const streamEndTime = performance.now();
        const latencyMs = Math.max(0.1, streamEndTime - requestStartTime);
        const ttft = state.firstTokenTime !== undefined
          ? Math.max(0.1, state.firstTokenTime - requestStartTime)
          : latencyMs;

        const completionTokens = state.usage?.completionTokens ?? state.tokensCounted;
        const durationSec = latencyMs / 1000;
        const tps = durationSec > 0 ? completionTokens / durationSec : completionTokens * 1000;

        const metrics: GroqMetrics = {
          latencyMs,
          ttft,
          tps,
          totalTokens: state.usage?.totalTokens ?? (completionTokens + (state.usage?.promptTokens ?? 0)),
          promptTokens: state.usage?.promptTokens,
          completionTokens,
        };

        onComplete(metrics);

        const finishChunk: {
          type: 'finish';
          finishReason: string;
          usage?: AIUsage;
          metrics: GroqMetrics;
        } = {
          type: 'finish',
          finishReason: state.finishReason ?? 'stop',
          metrics,
        };

        if (state.usage) {
          finishChunk.usage = state.usage;
        }

        controller.enqueue(finishChunk as unknown as AIChunk);
        controller.close();
      } catch (err) {
        controller.error(err);
      } finally {
        reader.releaseLock();
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
}

/**
 * Creates a Groq LPU AI provider with the specified configuration.
 */
export function createGroq(config?: GroqConfig): GroqProvider {
  let lastRecordedMetrics: GroqMetrics | undefined;

  const provider = (modelId: GroqModelId, settings?: GroqSettings): GroqModelInstance => {
    if (!modelId || typeof modelId !== 'string') {
      throw new Error('Model ID must be a non-empty string');
    }

    return {
      provider: 'groq',
      modelId,
      config: config ?? {},
      settings,
      getLastMetrics(): GroqMetrics | undefined {
        return lastRecordedMetrics;
      },
      async doStream(options: StreamExecutionOptions): Promise<ReadableStream<AIChunk>> {
        const apiKey = await resolveApiKey(config);
        const baseURL = (config?.baseURL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
        const endpoint = baseURL.endsWith('/chat/completions')
          ? baseURL
          : `${baseURL}/chat/completions`;

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        };

        if (typeof config?.headers === 'function') {
          Object.assign(headers, await config.headers());
        } else if (config?.headers) {
          Object.assign(headers, config.headers);
        }

        const messages = normalizeMessages(options);

        const body: Record<string, unknown> = {
          model: modelId,
          messages,
          stream: true,
          stream_options: { include_usage: true },
        };

        if (options.temperature !== undefined) {
          body['temperature'] = options.temperature;
        } else if (settings?.temperature !== undefined) {
          body['temperature'] = settings.temperature;
        }

        const maxTokens = options.maxTokens ?? settings?.maxTokens;
        if (maxTokens !== undefined) {
          body['max_tokens'] = maxTokens;
        }

        const topP = (options['topP'] as number | undefined) ?? settings?.topP;
        if (topP !== undefined) {
          body['top_p'] = topP;
        }

        // JSON Mode handling
        const isJsonMode =
          settings?.jsonMode === true ||
          settings?.responseFormat?.type === 'json_object' ||
          options['jsonMode'] === true ||
          (options['response_format'] as { type?: string } | undefined)?.type === 'json_object' ||
          (options['responseFormat'] as { type?: string } | undefined)?.type === 'json_object' ||
          options.schema !== undefined;

        if (isJsonMode) {
          body['response_format'] = { type: 'json_object' };
        }

        // Tools and tool choice
        const tools = options.tools ?? settings?.tools;
        if (tools) {
          body['tools'] = tools;
        }

        const toolChoice = options.toolChoice ?? settings?.toolChoice;
        if (toolChoice) {
          body['tool_choice'] = toolChoice;
        }

        const fetchImpl = config?.fetch ?? globalThis.fetch;
        if (!fetchImpl) {
          throw new Error('No fetch implementation available. Provide a custom fetch in GroqConfig.');
        }

        const requestInit: RequestInit = {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        };
        if (options.signal) {
          requestInit.signal = options.signal;
        }

        const requestStartTime = performance.now();
        const response = await fetchImpl(endpoint, requestInit);

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          throw new Error(
            `Groq request failed with status ${response.status} ${response.statusText}: ${errorText}`,
          );
        }

        if (!response.body) {
          throw new Error('Groq returned an empty response body');
        }

        return transformGroqByteStream(response.body, requestStartTime, (metrics) => {
          lastRecordedMetrics = metrics;
          settings?.onMetrics?.(metrics);
        });
      },
    };
  };

  Object.defineProperty(provider, 'name', {
    value: 'groq',
    writable: false,
    configurable: true,
  });
  Object.defineProperty(provider, 'config', {
    value: config ?? {},
    writable: false,
    configurable: true,
  });
  Object.defineProperty(provider, 'model', {
    value: (modelId: GroqModelId, settings?: GroqSettings) => provider(modelId, settings),
    writable: false,
    configurable: true,
  });

  return provider as GroqProvider;
}

/**
 * Default Groq model factory targeting Groq LPU ultra-fast models.
 */
export const groq = (modelId: GroqModelId, settings?: GroqSettings): GroqModelInstance =>
  createGroq()(modelId, settings);
