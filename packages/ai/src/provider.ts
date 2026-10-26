/**
 * Ranu.js Universal AI Provider Factory & Stream Dispatcher.
 */

import type {
  AIChunk,
  AIModelInstance,
  AIMessage,
  AIMessageContentPart,
  AIProvider,
  AIProviderConfig,
  AIUsage,
  StreamExecutionOptions,
} from './types.js';

type ProviderFamily = 'google' | 'groq' | 'claude' | 'openai' | 'ollama' | 'custom';

function detectProviderFamily(name: string, baseURL: string): ProviderFamily {
  const lowerName = name.toLowerCase();
  let host = '';
  try {
    host = new URL(baseURL).hostname.toLowerCase();
  } catch {
    // If not a valid absolute URL, host remains empty
  }

  const isHost = (domain: string) => host === domain || host.endsWith('.' + domain);

  if (lowerName === 'google' || lowerName.includes('gemini') || isHost('generativelanguage.googleapis.com')) {
    return 'google';
  }
  if (lowerName === 'groq' || isHost('api.groq.com')) {
    return 'groq';
  }
  if (lowerName === 'claude' || lowerName === 'anthropic' || isHost('api.anthropic.com')) {
    return 'claude';
  }
  if (lowerName === 'openai' || isHost('api.openai.com')) {
    return 'openai';
  }
  if (lowerName === 'ollama' || lowerName === 'local' || baseURL.includes(':11434')) {
    return 'ollama';
  }
  return 'custom';
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

function normalizeMessages(options: StreamExecutionOptions): AIMessage[] {
  if (options.messages && options.messages.length > 0) {
    return [...options.messages];
  }
  if (options.prompt !== undefined && options.prompt.length > 0) {
    return [{ role: 'user', content: options.prompt }];
  }
  return [];
}

async function resolveHeaders(
  config: AIProviderConfig,
  family: ProviderFamily,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (typeof config.headers === 'function') {
    const dynamicHeaders = await config.headers();
    Object.assign(headers, dynamicHeaders);
  } else if (config.headers) {
    Object.assign(headers, config.headers);
  }

  let resolvedApiKey: string | undefined;
  if (typeof config.apiKey === 'function') {
    resolvedApiKey = await config.apiKey();
  } else if (config.apiKey) {
    resolvedApiKey = config.apiKey;
  }

  if (resolvedApiKey) {
    if (family === 'claude') {
      if (!headers['x-api-key']) {
        headers['x-api-key'] = resolvedApiKey;
      }
    } else if (family === 'google') {
      if (!headers['x-goog-api-key'] && !headers['Authorization'] && !headers['authorization']) {
        headers['x-goog-api-key'] = resolvedApiKey;
      }
    } else {
      if (!headers['Authorization'] && !headers['authorization']) {
        headers['Authorization'] = `Bearer ${resolvedApiKey}`;
      }
    }
  }

  if (family === 'claude' && !headers['anthropic-version']) {
    headers['anthropic-version'] = '2023-06-01';
  }

  return headers;
}

function resolveEndpoint(config: AIProviderConfig, modelId: string, family: ProviderFamily): string {
  let cleanBase = config.baseURL;
  while (cleanBase.endsWith('/')) {
    cleanBase = cleanBase.slice(0, -1);
  }

  switch (family) {
    case 'google': {
      if (cleanBase.includes('/chat/completions') || cleanBase.includes('/openai')) {
        return cleanBase.endsWith('/chat/completions') ? cleanBase : `${cleanBase}/chat/completions`;
      }
      return `${cleanBase}/models/${modelId}:streamGenerateContent?alt=sse`;
    }
    case 'claude': {
      if (cleanBase.endsWith('/messages')) {
        return cleanBase;
      }
      return `${cleanBase}/messages`;
    }
    case 'ollama': {
      if (cleanBase.endsWith('/chat/completions')) {
        return cleanBase;
      }
      if (cleanBase.endsWith('/api/chat')) {
        return cleanBase;
      }
      if (cleanBase.endsWith('/api')) {
        return `${cleanBase}/chat`;
      }
      return `${cleanBase}/api/chat`;
    }
    case 'groq':
    case 'openai':
    case 'custom':
    default: {
      if (cleanBase.endsWith('/chat/completions')) {
        return cleanBase;
      }
      return `${cleanBase}/chat/completions`;
    }
  }
}

function buildRequestBody(
  family: ProviderFamily,
  modelId: string,
  messages: AIMessage[],
  options: StreamExecutionOptions,
): Record<string, unknown> {
  switch (family) {
    case 'google': {
      const contents = messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : m.role === 'system' ? 'user' : m.role,
        parts: [{ text: extractText(m.content) }],
      }));

      const body: Record<string, unknown> = {
        contents,
      };

      const generationConfig: Record<string, unknown> = {};
      if (options.temperature !== undefined) {
        generationConfig['temperature'] = options.temperature;
      }
      if (options.maxTokens !== undefined) {
        generationConfig['maxOutputTokens'] = options.maxTokens;
      }
      if (Object.keys(generationConfig).length > 0) {
        body['generationConfig'] = generationConfig;
      }

      return body;
    }

    case 'claude': {
      const systemParts: string[] = [];
      const nonSystemMessages: AIMessage[] = [];

      for (const msg of messages) {
        if (msg.role === 'system') {
          systemParts.push(extractText(msg.content));
        } else {
          nonSystemMessages.push(msg);
        }
      }

      const body: Record<string, unknown> = {
        model: modelId,
        max_tokens: options.maxTokens ?? 4096,
        stream: true,
        messages: nonSystemMessages.map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: extractText(m.content),
        })),
      };

      if (systemParts.length > 0) {
        body['system'] = systemParts.join('\n\n');
      }
      if (options.temperature !== undefined) {
        body['temperature'] = options.temperature;
      }
      if (options.tools) {
        body['tools'] = options.tools;
      }
      if (options.toolChoice) {
        body['tool_choice'] = options.toolChoice;
      }

      return body;
    }

    case 'ollama': {
      const body: Record<string, unknown> = {
        model: modelId,
        stream: true,
        messages: messages.map((m) => ({
          role: m.role,
          content: extractText(m.content),
        })),
      };

      if (options.temperature !== undefined) {
        body['options'] = { temperature: options.temperature };
      }

      return body;
    }

    case 'groq':
    case 'openai':
    case 'custom':
    default: {
      const body: Record<string, unknown> = {
        model: modelId,
        stream: true,
        messages: messages.map((m) => {
          const entry: Record<string, unknown> = {
            role: m.role,
            content: extractText(m.content),
          };
          if (m.name) {
            entry['name'] = m.name;
          }
          return entry;
        }),
      };

      if (options.temperature !== undefined) {
        body['temperature'] = options.temperature;
      }
      if (options.maxTokens !== undefined) {
        body['max_tokens'] = options.maxTokens;
      }
      if (options.tools) {
        body['tools'] = options.tools;
      }
      if (options.toolChoice) {
        body['tool_choice'] = options.toolChoice;
      }

      return body;
    }
  }
}

function buildUsage(prompt?: number, completion?: number, total?: number): AIUsage | undefined {
  const usage: { promptTokens?: number | undefined; completionTokens?: number | undefined; totalTokens?: number | undefined } = {};
  if (typeof prompt === 'number') usage.promptTokens = prompt;
  if (typeof completion === 'number') usage.completionTokens = completion;
  if (typeof total === 'number') usage.totalTokens = total;
  return Object.keys(usage).length > 0 ? usage : undefined;
}

function createFinishChunk(finishReason?: string, usage?: AIUsage): AIChunk {
  const chunk: { type: 'finish'; finishReason?: string | undefined; usage?: AIUsage | undefined } = { type: 'finish' };
  if (finishReason !== undefined) {
    chunk.finishReason = finishReason;
  }
  if (usage !== undefined) {
    chunk.usage = usage;
  }
  return chunk;
}

function parseStreamLine(line: string, family: ProviderFamily, enqueue: (chunk: AIChunk) => void): void {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(':')) {
    return;
  }

  // Handle SSE data: line
  if (trimmed.startsWith('data:')) {
    const rawData = trimmed.slice(5).trim();
    if (rawData === '[DONE]') {
      enqueue(createFinishChunk('stop'));
      return;
    }

    try {
      const json = JSON.parse(rawData) as Record<string, unknown>;

      // Claude message events
      if (json['type'] === 'content_block_start') {
        const block = json['content_block'] as Record<string, unknown> | undefined;
        if (block?.['type'] === 'tool_use') {
          const toolCall: { id?: string | undefined; name?: string | undefined; arguments?: string | undefined } = {};
          if (typeof block['id'] === 'string') toolCall.id = block['id'];
          if (typeof block['name'] === 'string') toolCall.name = block['name'];
          enqueue({ type: 'tool-call', toolCall });
          return;
        }
      }

      if (json['type'] === 'content_block_delta') {
        const delta = json['delta'] as Record<string, unknown> | undefined;
        if (delta?.['type'] === 'text_delta' && typeof delta['text'] === 'string') {
          enqueue({ type: 'text', text: delta['text'] });
          return;
        }
        if (delta?.['type'] === 'thinking_delta' && typeof delta['thinking'] === 'string') {
          enqueue({ type: 'reasoning', reasoning: delta['thinking'] });
          return;
        }
        if (delta?.['type'] === 'input_json_delta' && typeof delta['partial_json'] === 'string') {
          enqueue({
            type: 'tool-call',
            toolCall: { arguments: delta['partial_json'] },
          });
          return;
        }
      }

      if (json['type'] === 'message_delta') {
        const delta = json['delta'] as Record<string, unknown> | undefined;
        const usage = json['usage'] as Record<string, unknown> | undefined;
        const stopReason = typeof delta?.['stop_reason'] === 'string' ? delta['stop_reason'] : undefined;
        let aiUsage: AIUsage | undefined;
        if (usage && typeof usage['output_tokens'] === 'number') {
          aiUsage = { completionTokens: usage['output_tokens'] };
        }
        enqueue(createFinishChunk(stopReason, aiUsage));
        return;
      }

      if (json['type'] === 'message_stop') {
        enqueue(createFinishChunk('stop'));
        return;
      }

      // Google Gemini SSE
      if (Array.isArray(json['candidates'])) {
        const candidate = json['candidates'][0] as Record<string, unknown> | undefined;
        if (candidate) {
          const content = candidate['content'] as Record<string, unknown> | undefined;
          if (Array.isArray(content?.['parts'])) {
            for (const part of content['parts'] as Array<Record<string, unknown>>) {
              if (typeof part['text'] === 'string') {
                enqueue({ type: 'text', text: part['text'] });
              }
            }
          }
          if (typeof candidate['finishReason'] === 'string') {
            const usageMeta = json['usageMetadata'] as Record<string, number> | undefined;
            const usage = usageMeta
              ? buildUsage(usageMeta['promptTokenCount'], usageMeta['candidatesTokenCount'], usageMeta['totalTokenCount'])
              : undefined;
            enqueue(createFinishChunk(candidate['finishReason'], usage));
          }
        }
        return;
      }

      // OpenAI / Groq / Standard chat completions SSE
      if (Array.isArray(json['choices'])) {
        const choice = json['choices'][0] as Record<string, unknown> | undefined;
        if (choice) {
          const delta = choice['delta'] as Record<string, unknown> | undefined;
          if (delta) {
            if (typeof delta['content'] === 'string') {
              enqueue({ type: 'text', text: delta['content'] });
            }
            const reasoning = delta['reasoning_content'] ?? delta['reasoning'];
            if (typeof reasoning === 'string') {
              enqueue({ type: 'reasoning', reasoning });
            }
            if (Array.isArray(delta['tool_calls'])) {
              for (const tc of delta['tool_calls'] as Array<Record<string, unknown>>) {
                const func = tc['function'] as Record<string, unknown> | undefined;
                const toolCall: { id?: string | undefined; name?: string | undefined; arguments?: string | undefined } = {};
                if (typeof tc['id'] === 'string') toolCall.id = tc['id'];
                if (typeof func?.['name'] === 'string') toolCall.name = func['name'];
                if (typeof func?.['arguments'] === 'string') toolCall.arguments = func['arguments'];
                enqueue({ type: 'tool-call', toolCall });
              }
            }
          }

          if (choice['finish_reason'] !== undefined && choice['finish_reason'] !== null) {
            const usageObj = json['usage'] as Record<string, number> | undefined;
            const usage = usageObj
              ? buildUsage(usageObj['prompt_tokens'], usageObj['completion_tokens'], usageObj['total_tokens'])
              : undefined;
            const rawFinish = choice['finish_reason'];
            const finishReason =
              typeof rawFinish === 'string'
                ? rawFinish
                : typeof rawFinish === 'number'
                  ? String(rawFinish)
                  : undefined;
            enqueue(createFinishChunk(finishReason, usage));
          }
        }
        return;
      }

      // Generic / custom provider SSE payloads (e.g. data: {"text": "..."} or {"content": "..."})
      let emittedGenericText = false;
      if (typeof json['text'] === 'string') {
        enqueue({ type: 'text', text: json['text'] });
        emittedGenericText = true;
      } else if (typeof json['content'] === 'string') {
        enqueue({ type: 'text', text: json['content'] });
        emittedGenericText = true;
      } else if (typeof json['response'] === 'string') {
        enqueue({ type: 'text', text: json['response'] });
        emittedGenericText = true;
      }

      if (json['done'] === true || typeof json['finish_reason'] === 'string') {
        const rawReason = json['finish_reason'];
        const finishReason = typeof rawReason === 'string' ? rawReason : 'stop';
        enqueue(createFinishChunk(finishReason));
        return;
      }

      if (emittedGenericText) {
        return;
      }
    } catch {
      // Incomplete or non-JSON SSE payload; ignored
    }
  }

  // Handle Ollama NDJSON format
  if (family === 'ollama' && trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const json = JSON.parse(trimmed) as Record<string, unknown>;
      const message = json['message'] as Record<string, unknown> | undefined;
      if (typeof message?.['content'] === 'string' && message['content'].length > 0) {
        enqueue({ type: 'text', text: message['content'] });
      }
      if (json['done'] === true) {
        const promptCount = typeof json['prompt_eval_count'] === 'number' ? json['prompt_eval_count'] : undefined;
        const evalCount = typeof json['eval_count'] === 'number' ? json['eval_count'] : undefined;
        const usage = buildUsage(promptCount, evalCount);
        const finishReason = typeof json['done_reason'] === 'string' ? json['done_reason'] : 'stop';
        enqueue(createFinishChunk(finishReason, usage));
      }
    } catch {
      // Incomplete line; ignored
    }
  }
}

function transformByteStreamToChunks(
  byteStream: ReadableStream<Uint8Array>,
  family: ProviderFamily,
): ReadableStream<AIChunk> {
  const reader = byteStream.getReader();
  const decoder = new TextDecoder('utf-8');
  let lineBuffer = '';

  return new ReadableStream<AIChunk>({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          lineBuffer += decoder.decode(value, { stream: true });
          const lines = lineBuffer.split(/\r?\n/);
          lineBuffer = lines.pop() ?? '';

          for (const line of lines) {
            parseStreamLine(line, family, (chunk) => controller.enqueue(chunk));
          }
        }

        // Flush any trailing line in the buffer
        lineBuffer += decoder.decode();
        if (lineBuffer.trim().length > 0) {
          parseStreamLine(lineBuffer, family, (chunk) => controller.enqueue(chunk));
        }

        controller.close();
      } catch (err: unknown) {
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

async function executeStream(
  config: AIProviderConfig,
  modelId: string,
  options: StreamExecutionOptions,
): Promise<ReadableStream<AIChunk>> {
  const family = detectProviderFamily(config.name, config.baseURL);
  const endpoint = resolveEndpoint(config, modelId, family);
  const headers = await resolveHeaders(config, family);
  const messages = normalizeMessages(options);
  const body = buildRequestBody(family, modelId, messages, options);

  const fetchImpl = config.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error('No fetch implementation available. Provide a custom fetch in AIProviderConfig.');
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
      `Provider (${config.name}) request failed with status ${response.status} ${response.statusText}: ${errorText}`,
    );
  }

  if (!response.body) {
    throw new Error(`Provider (${config.name}) returned an empty response body`);
  }

  return transformByteStreamToChunks(response.body, family);
}

/**
 * Creates a universal AI provider instance adhering to Ranu.js Layer 1 contracts.
 */
export function createAIProvider(config: AIProviderConfig): AIProvider {
  if (!config) {
    throw new Error('createAIProvider requires a valid AIProviderConfig');
  }
  if (!config.name || typeof config.name !== 'string') {
    throw new Error('AIProviderConfig.name must be a non-empty string');
  }
  if (!config.baseURL || typeof config.baseURL !== 'string') {
    throw new Error('AIProviderConfig.baseURL must be a non-empty string');
  }

  const modelFactory = (modelId: string): AIModelInstance => {
    if (!modelId || typeof modelId !== 'string') {
      throw new Error('Model ID must be a non-empty string');
    }
    return {
      provider: config.name,
      modelId,
      doStream: (options: StreamExecutionOptions) => executeStream(config, modelId, options),
    };
  };

  Object.defineProperty(modelFactory, 'name', {
    value: config.name,
    writable: false,
    configurable: true,
  });
  Object.defineProperty(modelFactory, 'config', {
    value: config,
    writable: false,
    configurable: true,
  });
  Object.defineProperty(modelFactory, 'model', {
    value: (modelId: string) => modelFactory(modelId),
    writable: false,
    configurable: true,
  });

  return modelFactory as unknown as AIProvider;
}
