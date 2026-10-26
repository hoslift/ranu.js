/**
 * OpenAI Model Driver for Ranu.js.
 *
 * Implements GPT-4o, GPT-4o mini, o1, o1-mini, o3-mini reasoning models,
 * structured outputs (json_schema mode), tool-calling deltas,
 * dynamic API key, organization and project headers, and SSE streaming.
 */

import type {
  AIChunk,
  AIMessage,
  AIMessageContentPart,
  AIUsage,
  StreamExecutionOptions,
} from '@ranu/ai';
import type {
  OpenAIConfig,
  OpenAIModelId,
  OpenAIModelInstance,
  OpenAIProvider,
  OpenAISettings,
} from './types.js';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

export function isReasoningModel(modelId: string): boolean {
  return /^o[1-9](-.*)?$/i.test(modelId);
}

async function resolveApiKey(config?: OpenAIConfig): Promise<string> {
  if (typeof config?.apiKey === 'function') {
    return await config.apiKey();
  }
  if (typeof config?.apiKey === 'string' && config.apiKey.length > 0) {
    return config.apiKey;
  }
  if (typeof process !== 'undefined' && process.env && process.env['OPENAI_API_KEY']) {
    return process.env['OPENAI_API_KEY'];
  }
  throw new Error(
    'OpenAI API key is required. Set OPENAI_API_KEY environment variable or pass apiKey in OpenAIConfig.',
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

function convertImageToUrl(img: unknown, mimeType?: string): string | undefined {
  const defaultMime = mimeType ?? 'image/jpeg';

  if (img instanceof Uint8Array) {
    return `data:${defaultMime};base64,${Buffer.from(img).toString('base64')}`;
  }

  if (typeof img === 'string') {
    if (img.startsWith('data:') || img.startsWith('http://') || img.startsWith('https://')) {
      return img;
    }
    return `data:${defaultMime};base64,${img}`;
  }

  if (img instanceof URL) {
    return img.toString();
  }

  return undefined;
}

interface OpenAIChatMessage {
  role: string;
  content: string | Array<Record<string, unknown>>;
  name?: string;
  tool_call_id?: string;
}

function normalizeOpenAIMessages(options: StreamExecutionOptions): OpenAIChatMessage[] {
  if (options.messages && options.messages.length > 0) {
    return options.messages.map((m: AIMessage): OpenAIChatMessage => {
      if (m.role === 'tool') {
        const toolMsg: OpenAIChatMessage = {
          role: 'tool',
          content: extractText(m.content),
        };
        if (m.toolCallId) {
          toolMsg.tool_call_id = m.toolCallId;
        }
        return toolMsg;
      }

      if (typeof m.content === 'string') {
        const msg: OpenAIChatMessage = {
          role: m.role,
          content: m.content,
        };
        if (m.name) {
          msg.name = m.name;
        }
        return msg;
      }

      if (Array.isArray(m.content)) {
        const parts: Array<Record<string, unknown>> = [];
        for (const part of m.content) {
          if (part.type === 'text') {
            parts.push({ type: 'text', text: part.text });
          } else if (part.type === 'image') {
            const url = convertImageToUrl(part.image, part.mimeType);
            if (url) {
              parts.push({ type: 'image_url', image_url: { url } });
            }
          }
        }
        const msg: OpenAIChatMessage = {
          role: m.role,
          content: parts,
        };
        if (m.name) {
          msg.name = m.name;
        }
        return msg;
      }

      return {
        role: m.role,
        content: extractText(m.content),
      };
    });
  }

  if (options.prompt !== undefined && options.prompt.length > 0) {
    return [{ role: 'user', content: options.prompt }];
  }

  return [];
}

interface OpenAIStreamState {
  finishReason?: string | undefined;
  usage?: AIUsage | undefined;
}

function parseOpenAIStreamLine(
  line: string,
  state: OpenAIStreamState,
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
              enqueue({ type: 'text', text: delta['content'] });
            }

            // Reasoning delta (o1 / o3-mini reasoning_content)
            const reasoning = delta['reasoning_content'] ?? delta['reasoning'];
            if (typeof reasoning === 'string' && reasoning.length > 0) {
              enqueue({ type: 'reasoning', reasoning });
            }

            // Tool calling deltas
            if (Array.isArray(delta['tool_calls'])) {
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
          }
        }
      }
    } catch {
      // Incomplete or non-JSON chunk; ignored
    }
  }
}

function transformOpenAIByteStream(byteStream: ReadableStream<Uint8Array>): ReadableStream<AIChunk> {
  const reader = byteStream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  const state: OpenAIStreamState = {};

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
            parseOpenAIStreamLine(line, state, (chunk) => controller.enqueue(chunk));
          }
        }

        buffer += decoder.decode();
        if (buffer.trim().length > 0) {
          parseOpenAIStreamLine(buffer, state, (chunk) => controller.enqueue(chunk));
        }

        const finishChunk: {
          type: 'finish';
          finishReason: string;
          usage?: AIUsage | undefined;
        } = {
          type: 'finish',
          finishReason: state.finishReason ?? 'stop',
        };

        if (state.usage) {
          finishChunk.usage = state.usage;
        }

        controller.enqueue(finishChunk);
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

function resolveStructuredJsonSchema(
  options: StreamExecutionOptions,
  settings?: OpenAISettings,
): Record<string, unknown> | undefined {
  if (settings?.responseFormat?.type === 'json_schema') {
    const rf = settings.responseFormat as unknown as Record<string, unknown>;
    if (rf['json_schema'] && typeof rf['json_schema'] === 'object') {
      return rf['json_schema'] as Record<string, unknown>;
    }
  }

  const rawFormat = options['response_format'] ?? options['responseFormat'];
  if (rawFormat && typeof rawFormat === 'object') {
    const rf = rawFormat as Record<string, unknown>;
    if (rf['type'] === 'json_schema' && rf['json_schema'] && typeof rf['json_schema'] === 'object') {
      return rf['json_schema'] as Record<string, unknown>;
    }
  }

  if (options.schema && typeof options.schema === 'object') {
    const s = options.schema as Record<string, unknown>;
    if (s['jsonSchema'] && typeof s['jsonSchema'] === 'object') {
      return {
        name: (options['schemaName'] as string | undefined) ?? 'schema',
        strict: true,
        schema: s['jsonSchema'],
      };
    }
    if (s['properties'] || s['type'] === 'object' || s['type'] === 'array') {
      return {
        name: (options['schemaName'] as string | undefined) ?? 'schema',
        strict: true,
        schema: s,
      };
    }
    return {
      name: (options['schemaName'] as string | undefined) ?? 'schema',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: true,
      },
    };
  }

  return undefined;
}

/**
 * Creates an OpenAI AI provider with the specified configuration.
 */
export function createOpenAI(config?: OpenAIConfig): OpenAIProvider {
  const provider = (modelId: OpenAIModelId, settings?: OpenAISettings): OpenAIModelInstance => {
    if (!modelId || typeof modelId !== 'string') {
      throw new Error('Model ID must be a non-empty string');
    }

    const isReasoning = isReasoningModel(modelId);

    return {
      provider: 'openai',
      modelId,
      config: config ?? {},
      settings,
      async doStream(options: StreamExecutionOptions): Promise<ReadableStream<AIChunk>> {
        const apiKey = await resolveApiKey(config);
        let baseURL = config?.baseURL ?? DEFAULT_BASE_URL;
        while (baseURL.endsWith('/')) {
          baseURL = baseURL.slice(0, -1);
        }
        const endpoint = baseURL.endsWith('/chat/completions')
          ? baseURL
          : `${baseURL}/chat/completions`;

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        };

        const org =
          config?.organization ??
          (typeof process !== 'undefined'
            ? process.env?.['OPENAI_ORG_ID'] ?? process.env?.['OPENAI_ORGANIZATION']
            : undefined);
        if (org) {
          headers['OpenAI-Organization'] = org;
        }

        const project =
          config?.project ??
          (typeof process !== 'undefined' ? process.env?.['OPENAI_PROJECT_ID'] : undefined);
        if (project) {
          headers['OpenAI-Project'] = project;
        }

        if (typeof config?.headers === 'function') {
          Object.assign(headers, await config.headers());
        } else if (config?.headers) {
          Object.assign(headers, config.headers);
        }

        const messages = normalizeOpenAIMessages(options);

        const body: Record<string, unknown> = {
          model: modelId,
          messages,
          stream: true,
          stream_options: { include_usage: true },
        };

        const maxTokens = options.maxTokens ?? settings?.maxTokens;

        if (isReasoning) {
          // Reasoning models (o1, o1-mini, o3-mini) use max_completion_tokens
          if (maxTokens !== undefined) {
            body['max_completion_tokens'] = maxTokens;
          }

          const reasoningEffort =
            (options['reasoningEffort'] as 'low' | 'medium' | 'high' | undefined) ??
            settings?.reasoningEffort;
          if (reasoningEffort) {
            body['reasoning_effort'] = reasoningEffort;
          }

          // Do not send temperature/topP/penalty for reasoning models
        } else {
          // Non-reasoning models (gpt-4o, gpt-4o-mini)
          if (maxTokens !== undefined) {
            body['max_tokens'] = maxTokens;
          }

          if (options.temperature !== undefined) {
            body['temperature'] = options.temperature;
          } else if (settings?.temperature !== undefined) {
            body['temperature'] = settings.temperature;
          }

          const topP = (options['topP'] as number | undefined) ?? settings?.topP;
          if (topP !== undefined) {
            body['top_p'] = topP;
          }

          const frequencyPenalty =
            (options['frequencyPenalty'] as number | undefined) ?? settings?.frequencyPenalty;
          if (frequencyPenalty !== undefined) {
            body['frequency_penalty'] = frequencyPenalty;
          }

          const presencePenalty =
            (options['presencePenalty'] as number | undefined) ?? settings?.presencePenalty;
          if (presencePenalty !== undefined) {
            body['presence_penalty'] = presencePenalty;
          }
        }

        // Structured Outputs & JSON mode
        const jsonSchema = resolveStructuredJsonSchema(options, settings);
        if (jsonSchema) {
          body['response_format'] = {
            type: 'json_schema',
            json_schema: jsonSchema,
          };
        } else if (
          settings?.responseFormat?.type === 'json_object' ||
          (options['response_format'] as { type?: string } | undefined)?.type === 'json_object' ||
          (options['responseFormat'] as { type?: string } | undefined)?.type === 'json_object' ||
          options['jsonMode'] === true
        ) {
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
          throw new Error('No fetch implementation available. Provide a custom fetch in OpenAIConfig.');
        }

        const requestInit: RequestInit = {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        };
        if (options.signal) {
          requestInit.signal = options.signal;
        }

        const response = await fetchImpl(endpoint, requestInit);

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          throw new Error(
            `OpenAI request failed with status ${response.status} ${response.statusText}: ${errorText}`,
          );
        }

        if (!response.body) {
          throw new Error('OpenAI returned an empty response body');
        }

        return transformOpenAIByteStream(response.body);
      },
    };
  };

  Object.defineProperty(provider, 'name', {
    value: 'openai',
    writable: false,
    configurable: true,
  });
  Object.defineProperty(provider, 'config', {
    value: config ?? {},
    writable: false,
    configurable: true,
  });
  Object.defineProperty(provider, 'model', {
    value: (modelId: OpenAIModelId, settings?: OpenAISettings) => provider(modelId, settings),
    writable: false,
    configurable: true,
  });

  return provider as OpenAIProvider;
}

/**
 * Default OpenAI model factory targeting OpenAI models.
 */
export const openai = (modelId: OpenAIModelId, settings?: OpenAISettings): OpenAIModelInstance =>
  createOpenAI()(modelId, settings);
