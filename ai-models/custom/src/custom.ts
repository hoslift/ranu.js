/**
 * Custom & Ollama Model Driver for Ranu.js.
 *
 * Implements pre-configured defaults for local Ollama instances and generic
 * OpenAI-compatible enterprise proxies (vLLM, LMStudio, LocalAI, corporate gateways),
 * with DeepSeek-R1 reasoning extraction, tool-calling streaming deltas,
 * flexible enterprise authentication (bearer token, dynamic headers, tenant headers),
 * and W3C streaming execution.
 */

import type {
  AIChunk,
  AIMessage,
  AIMessageContentPart,
  AIUsage,
  StreamExecutionOptions,
} from '@ranu/ai';
import type {
  CustomAIConfig,
  CustomModelId,
  CustomAIModelInstance,
  CustomAIProvider,
  CustomAISettings,
} from './types.js';

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434/v1';

/**
 * Checks whether a model ID targets a DeepSeek-R1 reasoning model.
 */
export function isDeepSeekR1(modelId: string): boolean {
  return /deepseek-r1|deepseek-reasoner/i.test(modelId);
}

/**
 * Resolves the base URL using configuration or environment variables.
 */
export function resolveBaseURL(config?: CustomAIConfig): string {
  if (config?.baseURL && config.baseURL.trim().length > 0) {
    return config.baseURL.trim();
  }
  if (typeof process !== 'undefined' && process.env) {
    if (process.env['CUSTOM_AI_BASE_URL'] && process.env['CUSTOM_AI_BASE_URL'].trim().length > 0) {
      return process.env['CUSTOM_AI_BASE_URL'].trim();
    }
    if (process.env['OLLAMA_BASE_URL'] && process.env['OLLAMA_BASE_URL'].trim().length > 0) {
      return process.env['OLLAMA_BASE_URL'].trim();
    }
  }
  return DEFAULT_OLLAMA_BASE_URL;
}

/**
 * Resolves authentication token and enterprise headers.
 */
async function resolveHeaders(
  config?: CustomAIConfig,
  optionsHeaders?: unknown,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Enterprise Tenant & Organization headers
  const tenantId =
    config?.tenantId ??
    (typeof process !== 'undefined' ? process.env?.['CUSTOM_AI_TENANT_ID'] : undefined);
  if (tenantId) {
    headers['x-tenant-id'] = tenantId;
  }

  const organizationId =
    config?.organizationId ??
    (typeof process !== 'undefined'
      ? process.env?.['CUSTOM_AI_ORG_ID'] ?? process.env?.['CUSTOM_AI_ORGANIZATION_ID']
      : undefined);
  if (organizationId) {
    headers['x-organization-id'] = organizationId;
    headers['OpenAI-Organization'] = organizationId;
  }

  // Token resolution (apiKey or sessionToken or env)
  let token: string | undefined = undefined;
  if (typeof config?.apiKey === 'function') {
    token = await config.apiKey();
  } else if (typeof config?.apiKey === 'string' && config.apiKey.length > 0) {
    token = config.apiKey;
  } else if (typeof config?.sessionToken === 'function') {
    token = await config.sessionToken();
  } else if (typeof config?.sessionToken === 'string' && config.sessionToken.length > 0) {
    token = config.sessionToken;
  } else if (typeof process !== 'undefined' && process.env) {
    token =
      process.env['CUSTOM_AI_API_KEY'] ||
      process.env['CUSTOM_AI_KEY'] ||
      process.env['OLLAMA_API_KEY'];
  }

  if (token) {
    const authHeaderName = config?.authHeaderName ?? 'Authorization';
    const authHeaderPrefix = config?.authHeaderPrefix !== undefined ? config.authHeaderPrefix : 'Bearer ';
    headers[authHeaderName] = `${authHeaderPrefix}${token}`;
  }

  // Config dynamic or static headers
  if (typeof config?.headers === 'function') {
    Object.assign(headers, await config.headers());
  } else if (config?.headers) {
    Object.assign(headers, config.headers);
  }

  // Per-call options headers
  if (optionsHeaders) {
    if (typeof (optionsHeaders as Headers).entries === 'function') {
      for (const [k, v] of (optionsHeaders as Headers).entries()) {
        headers[k] = v;
      }
    } else if (Array.isArray(optionsHeaders)) {
      for (const [k, v] of optionsHeaders as [string, string][]) {
        headers[k] = v;
      }
    } else if (typeof optionsHeaders === 'object' && optionsHeaders !== null) {
      Object.assign(headers, optionsHeaders as Record<string, string>);
    }
  }

  return headers;
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

interface CustomAIChatMessage {
  role: string;
  content: string | Array<Record<string, unknown>>;
  name?: string;
  tool_call_id?: string;
}

function normalizeCustomAIMessages(options: StreamExecutionOptions): CustomAIChatMessage[] {
  if (options.messages && options.messages.length > 0) {
    return options.messages.map((m: AIMessage): CustomAIChatMessage => {
      if (m.role === 'tool') {
        const toolMsg: CustomAIChatMessage = {
          role: 'tool',
          content: extractText(m.content),
        };
        if (m.toolCallId) {
          toolMsg.tool_call_id = m.toolCallId;
        }
        return toolMsg;
      }

      if (typeof m.content === 'string') {
        const msg: CustomAIChatMessage = {
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
        const msg: CustomAIChatMessage = {
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

interface CustomAIStreamState {
  finishReason?: string | undefined;
  usage?: AIUsage | undefined;
}

function parseCustomAIStreamLine(
  line: string,
  state: CustomAIStreamState,
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

            // Reasoning delta (DeepSeek-R1 reasoning_content or reasoning)
            const reasoning = delta['reasoning_content'] ?? delta['reasoning'];
            if (typeof reasoning === 'string' && reasoning.length > 0) {
              enqueue({ type: 'reasoning', reasoning });
            }

            // Tool calling deltas
            if (Array.isArray(delta['tool_calls'])) {
              for (const tc of delta['tool_calls'] as Array<Record<string, unknown>>) {
                const func = tc['function'] as Record<string, unknown> | undefined;
                const toolCall: {
                  id?: string;
                  name?: string;
                  arguments?: string;
                  index?: number;
                } = {};
                if (typeof tc['index'] === 'number') toolCall.index = tc['index'];
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

function transformCustomAIByteStream(byteStream: ReadableStream<Uint8Array>): ReadableStream<AIChunk> {
  const reader = byteStream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  const state: CustomAIStreamState = {};

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
            parseCustomAIStreamLine(line, state, (chunk) => controller.enqueue(chunk));
          }
        }

        buffer += decoder.decode();
        if (buffer.trim().length > 0) {
          parseCustomAIStreamLine(buffer, state, (chunk) => controller.enqueue(chunk));
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
      try {
        await reader.cancel(reason);
      } catch {
        // Reader was already closed or released
      }
    },
  });
}

function resolveStructuredJsonSchema(
  options: StreamExecutionOptions,
  settings?: CustomAISettings,
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
 * Creates a Custom / Ollama AI provider instance with configurable endpoint and authentication.
 */
export function createCustomAI(config?: CustomAIConfig): CustomAIProvider {
  const provider = (modelId: CustomModelId, settings?: CustomAISettings): CustomAIModelInstance => {
    if (!modelId || typeof modelId !== 'string') {
      throw new Error('Model ID must be a non-empty string');
    }

    return {
      provider: 'custom',
      modelId,
      config: config ?? {},
      settings,
      async doStream(options: StreamExecutionOptions): Promise<ReadableStream<AIChunk>> {
        if (options.signal?.aborted) {
          throw options.signal.reason ?? new Error('The operation was aborted');
        }

        const rawBase = resolveBaseURL(config);
        let baseURL = rawBase;
        while (baseURL.endsWith('/')) {
          baseURL = baseURL.slice(0, -1);
        }
        const endpoint = baseURL.endsWith('/chat/completions')
          ? baseURL
          : `${baseURL}/chat/completions`;

        const headers = await resolveHeaders(config, options['headers']);
        const messages = normalizeCustomAIMessages(options);

        const body: Record<string, unknown> = {
          model: modelId,
          messages,
          stream: true,
          stream_options: { include_usage: true },
        };

        const maxTokens = options.maxTokens ?? settings?.maxTokens;
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
          options['jsonMode'] === true ||
          settings?.format === 'json' ||
          options['format'] === 'json'
        ) {
          body['response_format'] = { type: 'json_object' };
          if (settings?.format === 'json' || options['format'] === 'json') {
            body['format'] = 'json';
          }
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
          throw new Error('No fetch implementation available. Provide a custom fetch in CustomAIConfig.');
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
            `Custom AI request failed with status ${response.status} ${response.statusText}: ${errorText}`,
          );
        }

        if (!response.body) {
          throw new Error('Custom AI returned an empty response body');
        }

        return transformCustomAIByteStream(response.body);
      },
    };
  };

  Object.defineProperty(provider, 'name', {
    value: 'custom',
    writable: false,
    configurable: true,
  });
  Object.defineProperty(provider, 'config', {
    value: config ?? {},
    writable: false,
    configurable: true,
  });
  Object.defineProperty(provider, 'model', {
    value: (modelId: CustomModelId, settings?: CustomAISettings) => provider(modelId, settings),
    writable: false,
    configurable: true,
  });

  return provider as CustomAIProvider;
}

/**
 * Default custom model factory targeting local Ollama / custom AI endpoints.
 */
export const custom = (modelId: CustomModelId, settings?: CustomAISettings): CustomAIModelInstance =>
  createCustomAI()(modelId, settings);
