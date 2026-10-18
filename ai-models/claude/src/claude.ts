/**
 * Anthropic Claude Model Driver for Ranu.js.
 *
 * Implements Claude 3.5 Sonnet / Haiku / Opus tool-use streaming,
 * prompt caching headers and blocks, dynamic API key resolution,
 * and Anthropic Messages SSE streaming protocol.
 */

import type {
  AIChunk,
  AIMessage,
  AIMessageContentPart,
  AIUsage,
  StreamExecutionOptions,
} from '@ranu/ai';
import type {
  ClaudeConfig,
  ClaudeModelId,
  ClaudeModelInstance,
  ClaudeProvider,
  ClaudeSettings,
  ClaudeSystemBlock,
} from './types.js';

const DEFAULT_BASE_URL = 'https://api.anthropic.com/v1';
const DEFAULT_ANTHROPIC_VERSION = '2023-06-01';
const PROMPT_CACHING_BETA_HEADER = 'prompt-caching-2024-07-31';

async function resolveApiKey(config?: ClaudeConfig): Promise<string> {
  if (typeof config?.apiKey === 'function') {
    return await config.apiKey();
  }
  if (typeof config?.apiKey === 'string' && config.apiKey.length > 0) {
    return config.apiKey;
  }
  if (typeof process !== 'undefined' && process.env && process.env['ANTHROPIC_API_KEY']) {
    return process.env['ANTHROPIC_API_KEY'];
  }
  throw new Error(
    'Claude API key is required. Set ANTHROPIC_API_KEY environment variable or pass apiKey in ClaudeConfig.',
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

interface ImageSource {
  type: 'base64';
  media_type: string;
  data: string;
}

function convertImagePart(img: unknown, mimeType?: string): ImageSource | undefined {
  const defaultMime = mimeType ?? 'image/jpeg';

  if (img instanceof Uint8Array) {
    return {
      type: 'base64',
      media_type: defaultMime,
      data: Buffer.from(img).toString('base64'),
    };
  }

  if (typeof img === 'string') {
    const dataUrlMatch = /^data:([^;]+);base64,(.+)$/s.exec(img);
    if (dataUrlMatch && dataUrlMatch[1] && dataUrlMatch[2]) {
      return {
        type: 'base64',
        media_type: dataUrlMatch[1],
        data: dataUrlMatch[2],
      };
    }
    return {
      type: 'base64',
      media_type: defaultMime,
      data: img,
    };
  }

  return undefined;
}

interface AnthropicContentBlock {
  type: 'text' | 'image' | 'tool_use' | 'tool_result';
  text?: string;
  source?: ImageSource;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

function normalizeAnthropicMessages(
  options: StreamExecutionOptions,
  settings?: ClaudeSettings,
): {
  system?: string | ClaudeSystemBlock[] | undefined;
  messages: Array<{ role: 'user' | 'assistant'; content: string | AnthropicContentBlock[] }>;
  hasPromptCaching: boolean;
} {
  const systemBlocks: ClaudeSystemBlock[] = [];
  let hasPromptCaching = settings?.promptCaching === true || options['promptCaching'] === true;

  if (settings?.system) {
    if (typeof settings.system === 'string') {
      systemBlocks.push({ type: 'text', text: settings.system });
    } else if (Array.isArray(settings.system)) {
      for (const item of settings.system) {
        if (typeof item === 'string') {
          systemBlocks.push({ type: 'text', text: item });
        } else if (typeof item === 'object' && item !== null) {
          const itemObj = item as Record<string, unknown>;
          if (itemObj['cache_control']) {
            hasPromptCaching = true;
          }
          if (typeof itemObj['text'] === 'string') {
            systemBlocks.push({
              type: 'text',
              text: itemObj['text'],
              ...(itemObj['cache_control']
                ? { cache_control: itemObj['cache_control'] as { type: 'ephemeral' } }
                : {}),
            });
          }
        }
      }
    }
  }

  const rawMessages: readonly AIMessage[] = options.messages && options.messages.length > 0
    ? options.messages
    : options.prompt !== undefined
      ? [{ role: 'user', content: options.prompt }]
      : [];

  const anthropicMessages: Array<{
    role: 'user' | 'assistant';
    content: string | AnthropicContentBlock[];
  }> = [];

  for (const m of rawMessages) {
    if (m.role === 'system') {
      const text = extractText(m.content);
      systemBlocks.push({ type: 'text', text });
      continue;
    }

    if (m.role === 'tool') {
      // In Anthropic Messages API, tool results are represented as user role with tool_result block
      anthropicMessages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: m.toolCallId ?? '',
            content: extractText(m.content),
          },
        ],
      });
      continue;
    }

    const role: 'user' | 'assistant' = m.role === 'assistant' ? 'assistant' : 'user';

    if (typeof m.content === 'string') {
      anthropicMessages.push({ role, content: m.content });
      continue;
    }

    if (Array.isArray(m.content)) {
      const blocks: AnthropicContentBlock[] = [];
      for (const part of m.content) {
        if (part.type === 'text') {
          blocks.push({ type: 'text', text: part.text });
        } else if (part.type === 'image') {
          const source = convertImagePart(part.image, part.mimeType);
          if (source) {
            blocks.push({ type: 'image', source });
          }
        }
      }
      anthropicMessages.push({ role, content: blocks });
    }
  }

  // If promptCaching is true and we have system blocks, attach ephemeral cache_control to the last system block
  if (hasPromptCaching && systemBlocks.length > 0) {
    const lastIdx = systemBlocks.length - 1;
    const lastBlock = systemBlocks[lastIdx];
    if (lastBlock && !lastBlock.cache_control) {
      systemBlocks[lastIdx] = {
        ...lastBlock,
        cache_control: { type: 'ephemeral' },
      };
    }
  }

  let finalSystem: string | ClaudeSystemBlock[] | undefined;
  if (systemBlocks.length === 1 && !hasPromptCaching) {
    finalSystem = systemBlocks[0]?.text;
  } else if (systemBlocks.length > 0) {
    finalSystem = systemBlocks;
  }

  return {
    system: finalSystem,
    messages: anthropicMessages,
    hasPromptCaching,
  };
}

interface ClaudeStreamState {
  hasFinished: boolean;
  finishReason?: string | undefined;
  promptTokens: number;
  completionTokens: number;
  toolBlocks: Map<number, { id?: string | undefined; name?: string | undefined }>;
}

function parseClaudeStreamLine(
  line: string,
  state: ClaudeStreamState,
  enqueue: (chunk: AIChunk) => void,
): void {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(':')) {
    return;
  }

  if (trimmed.startsWith('data:')) {
    const rawData = trimmed.slice(5).trim();
    if (!rawData) return;

    try {
      const json = JSON.parse(rawData) as Record<string, unknown>;
      const eventType = (json['type'] as string | undefined) ?? '';

      switch (eventType) {
        case 'message_start': {
          const message = json['message'] as Record<string, unknown> | undefined;
          const usage = message?.['usage'] as Record<string, number> | undefined;
          if (usage) {
            state.promptTokens =
              (usage['input_tokens'] ?? 0) +
              (usage['cache_read_input_tokens'] ?? 0) +
              (usage['cache_creation_input_tokens'] ?? 0);
          }
          break;
        }

        case 'content_block_start': {
          const index = typeof json['index'] === 'number' ? json['index'] : 0;
          const contentBlock = json['content_block'] as Record<string, unknown> | undefined;
          if (contentBlock?.['type'] === 'tool_use') {
            const id = typeof contentBlock['id'] === 'string' ? contentBlock['id'] : undefined;
            const name = typeof contentBlock['name'] === 'string' ? contentBlock['name'] : undefined;
            state.toolBlocks.set(index, { id, name });
            enqueue({
              type: 'tool-call',
              toolCall: {
                id,
                name,
                arguments: '',
              },
            });
          }
          break;
        }

        case 'content_block_delta': {
          const delta = json['delta'] as Record<string, unknown> | undefined;
          if (!delta) break;

          const deltaType = delta['type'];
          if (deltaType === 'text_delta' && typeof delta['text'] === 'string') {
            enqueue({ type: 'text', text: delta['text'] });
          } else if (deltaType === 'input_json_delta' && typeof delta['partial_json'] === 'string') {
            const index = typeof json['index'] === 'number' ? json['index'] : 0;
            const tool = state.toolBlocks.get(index);
            enqueue({
              type: 'tool-call',
              toolCall: {
                id: tool?.id,
                name: tool?.name,
                arguments: delta['partial_json'],
              },
            });
          } else if (deltaType === 'thinking_delta' && typeof delta['thinking'] === 'string') {
            enqueue({ type: 'reasoning', reasoning: delta['thinking'] });
          }
          break;
        }

        case 'content_block_stop': {
          // Block completed
          break;
        }

        case 'message_delta': {
          const delta = json['delta'] as Record<string, unknown> | undefined;
          if (delta && typeof delta['stop_reason'] === 'string') {
            const rawStop = delta['stop_reason'];
            if (rawStop === 'end_turn') {
              state.finishReason = 'stop';
            } else if (rawStop === 'tool_use') {
              state.finishReason = 'tool_calls';
            } else if (rawStop === 'max_tokens') {
              state.finishReason = 'length';
            } else {
              state.finishReason = rawStop;
            }
          }

          const usage = json['usage'] as Record<string, number> | undefined;
          if (usage && typeof usage['output_tokens'] === 'number') {
            state.completionTokens = usage['output_tokens'];
          }
          break;
        }

        case 'message_stop': {
          if (!state.hasFinished) {
            state.hasFinished = true;
            const totalTokens = state.promptTokens + state.completionTokens;
            const usage: AIUsage = {
              promptTokens: state.promptTokens,
              completionTokens: state.completionTokens,
              totalTokens,
            };
            enqueue({
              type: 'finish',
              finishReason: state.finishReason ?? 'stop',
              usage,
            });
          }
          break;
        }

        case 'error': {
          const errObj = json['error'] ?? json;
          enqueue({ type: 'error', error: errObj });
          break;
        }

        case 'ping': {
          break;
        }

        default:
          break;
      }
    } catch {
      // Incomplete or non-JSON chunk; ignored
    }
  }
}

function transformClaudeByteStream(byteStream: ReadableStream<Uint8Array>): ReadableStream<AIChunk> {
  const reader = byteStream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  const state: ClaudeStreamState = {
    hasFinished: false,
    promptTokens: 0,
    completionTokens: 0,
    toolBlocks: new Map(),
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
            parseClaudeStreamLine(line, state, (chunk) => controller.enqueue(chunk));
          }
        }

        buffer += decoder.decode();
        if (buffer.trim().length > 0) {
          parseClaudeStreamLine(buffer, state, (chunk) => controller.enqueue(chunk));
        }

        if (!state.hasFinished) {
          state.hasFinished = true;
          const totalTokens = state.promptTokens + state.completionTokens;
          const usage: AIUsage = {
            promptTokens: state.promptTokens,
            completionTokens: state.completionTokens,
            totalTokens,
          };
          controller.enqueue({
            type: 'finish',
            finishReason: state.finishReason ?? 'stop',
            usage,
          });
        }

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
 * Creates an Anthropic Claude AI provider with the specified configuration.
 */
export function createClaude(config?: ClaudeConfig): ClaudeProvider {
  const provider = (modelId: ClaudeModelId, settings?: ClaudeSettings): ClaudeModelInstance => {
    if (!modelId || typeof modelId !== 'string') {
      throw new Error('Model ID must be a non-empty string');
    }

    return {
      provider: 'claude',
      modelId,
      config: config ?? {},
      settings,
      async doStream(options: StreamExecutionOptions): Promise<ReadableStream<AIChunk>> {
        const apiKey = await resolveApiKey(config);
        const baseURL = (config?.baseURL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
        const endpoint = baseURL.endsWith('/messages') ? baseURL : `${baseURL}/messages`;

        const { system, messages, hasPromptCaching } = normalizeAnthropicMessages(options, settings);

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'anthropic-version': config?.anthropicVersion ?? DEFAULT_ANTHROPIC_VERSION,
          'x-api-key': apiKey,
        };

        if (hasPromptCaching) {
          headers['anthropic-beta'] = PROMPT_CACHING_BETA_HEADER;
        }

        if (typeof config?.headers === 'function') {
          const customHeaders = await config.headers();
          Object.assign(headers, customHeaders);
          if (hasPromptCaching && customHeaders['anthropic-beta'] && !customHeaders['anthropic-beta'].includes(PROMPT_CACHING_BETA_HEADER)) {
            headers['anthropic-beta'] = `${customHeaders['anthropic-beta']},${PROMPT_CACHING_BETA_HEADER}`;
          }
        } else if (config?.headers) {
          Object.assign(headers, config.headers);
          if (hasPromptCaching && config.headers['anthropic-beta'] && !config.headers['anthropic-beta'].includes(PROMPT_CACHING_BETA_HEADER)) {
            headers['anthropic-beta'] = `${config.headers['anthropic-beta']},${PROMPT_CACHING_BETA_HEADER}`;
          }
        }

        const maxTokens = options.maxTokens ?? settings?.maxTokens ?? 4096;

        const body: Record<string, unknown> = {
          model: modelId,
          messages,
          max_tokens: maxTokens,
          stream: true,
        };

        if (system) {
          body['system'] = system;
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

        const topK = (options['topK'] as number | undefined) ?? settings?.topK;
        if (topK !== undefined) {
          body['top_k'] = topK;
        }

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
          throw new Error('No fetch implementation available. Provide a custom fetch in ClaudeConfig.');
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
            `Claude request failed with status ${response.status} ${response.statusText}: ${errorText}`,
          );
        }

        if (!response.body) {
          throw new Error('Claude returned an empty response body');
        }

        return transformClaudeByteStream(response.body);
      },
    };
  };

  Object.defineProperty(provider, 'name', {
    value: 'claude',
    writable: false,
    configurable: true,
  });
  Object.defineProperty(provider, 'config', {
    value: config ?? {},
    writable: false,
    configurable: true,
  });
  Object.defineProperty(provider, 'model', {
    value: (modelId: ClaudeModelId, settings?: ClaudeSettings) => provider(modelId, settings),
    writable: false,
    configurable: true,
  });

  return provider as ClaudeProvider;
}

/**
 * Default Claude model factory targeting Anthropic Claude models.
 */
export const claude = (modelId: ClaudeModelId, settings?: ClaudeSettings): ClaudeModelInstance =>
  createClaude()(modelId, settings);
