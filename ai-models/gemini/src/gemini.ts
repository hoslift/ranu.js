/**
 * Google Gemini Model Driver for Ranu.js.
 *
 * Implements multimodal inputs, streaming SSE, structured JSON outputs,
 * safety settings, and dynamic API key resolution.
 */

import type {
  AIChunk,
  AIMessage,
  AIUsage,
  StreamExecutionOptions,
} from '@ranu/ai';
import type {
  GeminiConfig,
  GeminiGenerationConfig,
  GeminiModelId,
  GeminiModelInstance,
  GeminiPart,
  GeminiProvider,
  GeminiSafetySetting,
  GeminiSettings,
} from './types.js';

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

async function resolveApiKey(config?: GeminiConfig): Promise<string> {
  if (typeof config?.apiKey === 'function') {
    return await config.apiKey();
  }
  if (typeof config?.apiKey === 'string' && config.apiKey.length > 0) {
    return config.apiKey;
  }
  if (typeof process !== 'undefined' && process.env && process.env['GEMINI_API_KEY']) {
    return process.env['GEMINI_API_KEY'];
  }
  throw new Error(
    'Gemini API key is required. Set GEMINI_API_KEY environment variable or pass apiKey in GeminiConfig.',
  );
}

function convertPartToGemini(part: unknown): GeminiPart {
  if (!part || typeof part !== 'object') {
    const textVal = typeof part === 'string' || typeof part === 'number' || typeof part === 'boolean'
      ? String(part)
      : '';
    return { text: textVal };
  }

  const p = part as Record<string, unknown>;

  // Direct Gemini inlineData or fileData
  if (p['inlineData'] && typeof p['inlineData'] === 'object') {
    return { inlineData: p['inlineData'] as { mimeType: string; data: string } };
  }
  if (p['fileData'] && typeof p['fileData'] === 'object') {
    return { fileData: p['fileData'] as { mimeType: string; fileUri: string } };
  }

  const partType = p['type'];

  if (partType === 'text' && typeof p['text'] === 'string') {
    return { text: p['text'] };
  }

  if (partType === 'image') {
    const img = p['image'];
    const mimeType = (p['mimeType'] as string | undefined) ?? 'image/jpeg';

    if (img instanceof Uint8Array) {
      return {
        inlineData: {
          mimeType,
          data: Buffer.from(img).toString('base64'),
        },
      };
    }

    if (typeof img === 'string') {
      const dataUrlMatch = /^data:([^;]+);base64,(.+)$/s.exec(img);
      if (dataUrlMatch && dataUrlMatch[1] && dataUrlMatch[2]) {
        return {
          inlineData: {
            mimeType: dataUrlMatch[1],
            data: dataUrlMatch[2],
          },
        };
      }

      if (img.startsWith('http://') || img.startsWith('https://') || img.startsWith('gs://')) {
        return {
          fileData: {
            mimeType,
            fileUri: img,
          },
        };
      }

      return {
        inlineData: {
          mimeType,
          data: img,
        },
      };
    }

    if (img instanceof URL) {
      return {
        fileData: {
          mimeType,
          fileUri: img.toString(),
        },
      };
    }
  }

  if (partType === 'audio') {
    const audio = p['audio'] ?? p['data'];
    const mimeType = (p['mimeType'] as string | undefined) ?? 'audio/mp3';

    if (audio instanceof Uint8Array) {
      return {
        inlineData: {
          mimeType,
          data: Buffer.from(audio).toString('base64'),
        },
      };
    }

    if (typeof audio === 'string') {
      const dataUrlMatch = /^data:([^;]+);base64,(.+)$/s.exec(audio);
      if (dataUrlMatch && dataUrlMatch[1] && dataUrlMatch[2]) {
        return {
          inlineData: {
            mimeType: dataUrlMatch[1],
            data: dataUrlMatch[2],
          },
        };
      }

      if (audio.startsWith('http://') || audio.startsWith('https://') || audio.startsWith('gs://')) {
        return {
          fileData: {
            mimeType,
            fileUri: audio,
          },
        };
      }

      return {
        inlineData: {
          mimeType,
          data: audio,
        },
      };
    }

    if (audio instanceof URL) {
      return {
        fileData: {
          mimeType,
          fileUri: audio.toString(),
        },
      };
    }
  }

  if (partType === 'video') {
    const video = p['video'] ?? p['data'];
    const mimeType = (p['mimeType'] as string | undefined) ?? 'video/mp4';

    if (video instanceof Uint8Array) {
      return {
        inlineData: {
          mimeType,
          data: Buffer.from(video).toString('base64'),
        },
      };
    }

    if (typeof video === 'string') {
      const dataUrlMatch = /^data:([^;]+);base64,(.+)$/s.exec(video);
      if (dataUrlMatch && dataUrlMatch[1] && dataUrlMatch[2]) {
        return {
          inlineData: {
            mimeType: dataUrlMatch[1],
            data: dataUrlMatch[2],
          },
        };
      }

      if (video.startsWith('http://') || video.startsWith('https://') || video.startsWith('gs://')) {
        return {
          fileData: {
            mimeType,
            fileUri: video,
          },
        };
      }

      return {
        inlineData: {
          mimeType,
          data: video,
        },
      };
    }

    if (video instanceof URL) {
      return {
        fileData: {
          mimeType,
          fileUri: video.toString(),
        },
      };
    }
  }

  if (typeof p['text'] === 'string') {
    return { text: p['text'] };
  }

  return { text: JSON.stringify(part) };
}

function normalizeContents(
  messages: readonly AIMessage[],
  settings?: GeminiSettings,
): { systemInstruction?: { parts: GeminiPart[] }; contents: Array<{ role: 'user' | 'model'; parts: GeminiPart[] }> } {
  const systemParts: GeminiPart[] = [];

  if (settings?.systemInstruction) {
    if (typeof settings.systemInstruction === 'string') {
      systemParts.push({ text: settings.systemInstruction });
    } else if (Array.isArray(settings.systemInstruction)) {
      for (const part of settings.systemInstruction) {
        systemParts.push(convertPartToGemini(part));
      }
    }
  }

  const contents: Array<{ role: 'user' | 'model'; parts: GeminiPart[] }> = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      if (typeof msg.content === 'string') {
        systemParts.push({ text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          systemParts.push(convertPartToGemini(part));
        }
      }
      continue;
    }

    const role: 'user' | 'model' = msg.role === 'assistant' ? 'model' : 'user';
    const parts: GeminiPart[] = [];

    if (typeof msg.content === 'string') {
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        parts.push(convertPartToGemini(part));
      }
    }

    contents.push({ role, parts });
  }

  const result: { systemInstruction?: { parts: GeminiPart[] }; contents: Array<{ role: 'user' | 'model'; parts: GeminiPart[] }> } = {
    contents,
  };

  if (systemParts.length > 0) {
    result.systemInstruction = { parts: systemParts };
  }

  return result;
}

function parseUsage(meta?: Record<string, unknown>): AIUsage | undefined {
  if (!meta) return undefined;
  const usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } = {};
  if (typeof meta['promptTokenCount'] === 'number') usage.promptTokens = meta['promptTokenCount'];
  if (typeof meta['candidatesTokenCount'] === 'number') usage.completionTokens = meta['candidatesTokenCount'];
  if (typeof meta['totalTokenCount'] === 'number') usage.totalTokens = meta['totalTokenCount'];
  return Object.keys(usage).length > 0 ? usage : undefined;
}

interface GeminiStreamState {
  hasFinished: boolean;
}

function parseGeminiStreamLine(
  line: string,
  state: GeminiStreamState,
  enqueue: (chunk: AIChunk) => void,
): void {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(':')) {
    return;
  }

  if (trimmed.startsWith('data:')) {
    const rawData = trimmed.slice(5).trim();
    if (rawData === '[DONE]') {
      if (!state.hasFinished) {
        state.hasFinished = true;
        enqueue({ type: 'finish', finishReason: 'STOP' });
      }
      return;
    }

    try {
      const json = JSON.parse(rawData) as Record<string, unknown>;

      const usage = parseUsage(json['usageMetadata'] as Record<string, unknown> | undefined);

      if (Array.isArray(json['candidates'])) {
        for (const candidate of json['candidates'] as Array<Record<string, unknown>>) {
          const content = candidate['content'] as Record<string, unknown> | undefined;
          if (Array.isArray(content?.['parts'])) {
            for (const part of content['parts'] as Array<Record<string, unknown>>) {
              if (typeof part['text'] === 'string') {
                enqueue({ type: 'text', text: part['text'] });
              }
              if (part['functionCall'] && typeof part['functionCall'] === 'object') {
                const fc = part['functionCall'] as Record<string, unknown>;
                enqueue({
                  type: 'tool-call',
                  toolCall: {
                    name: typeof fc['name'] === 'string' ? fc['name'] : undefined,
                    arguments: JSON.stringify(fc['args'] ?? {}),
                  },
                });
              }
            }
          }

          if (typeof candidate['finishReason'] === 'string') {
            if (!state.hasFinished) {
              state.hasFinished = true;
              const finishChunk: { type: 'finish'; finishReason: string; usage?: AIUsage } = {
                type: 'finish',
                finishReason: candidate['finishReason'],
              };
              if (usage) {
                finishChunk.usage = usage;
              }
              enqueue(finishChunk);
            }
          }
        }
      }
    } catch {
      // Incomplete or non-JSON chunk; ignored
    }
  }
}

function transformGeminiByteStream(byteStream: ReadableStream<Uint8Array>): ReadableStream<AIChunk> {
  const reader = byteStream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  const state: GeminiStreamState = { hasFinished: false };

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
            parseGeminiStreamLine(line, state, (chunk) => controller.enqueue(chunk));
          }
        }

        buffer += decoder.decode();
        if (buffer.trim().length > 0) {
          parseGeminiStreamLine(buffer, state, (chunk) => controller.enqueue(chunk));
        }

        if (!state.hasFinished) {
          state.hasFinished = true;
          controller.enqueue({ type: 'finish', finishReason: 'STOP' });
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
 * Creates a Google Gemini AI provider with the specified configuration.
 */
export function createGemini(config?: GeminiConfig): GeminiProvider {
  const provider = (modelId: GeminiModelId, settings?: GeminiSettings): GeminiModelInstance => {
    if (!modelId || typeof modelId !== 'string') {
      throw new Error('Model ID must be a non-empty string');
    }

    return {
      provider: 'gemini',
      modelId,
      config: config ?? {},
      settings,
      async doStream(options: StreamExecutionOptions): Promise<ReadableStream<AIChunk>> {
        const apiKey = await resolveApiKey(config);
        const baseURL = (config?.baseURL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
        const endpoint = `${baseURL}/models/${modelId}:streamGenerateContent?alt=sse`;

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        };

        if (typeof config?.headers === 'function') {
          Object.assign(headers, await config.headers());
        } else if (config?.headers) {
          Object.assign(headers, config.headers);
        }

        // Normalize messages
        let messages: readonly AIMessage[] = options.messages ?? [];
        if (messages.length === 0 && options.prompt) {
          messages = [{ role: 'user', content: options.prompt }];
        }

        const { systemInstruction, contents } = normalizeContents(messages, settings);

        // Build generationConfig
        const generationConfig: GeminiGenerationConfig = {};
        if (options.temperature !== undefined) {
          generationConfig.temperature = options.temperature;
        } else if (settings?.temperature !== undefined) {
          generationConfig.temperature = settings.temperature;
        }

        const topP = (options['topP'] as number | undefined) ?? settings?.topP;
        if (topP !== undefined) generationConfig.topP = topP;

        const topK = (options['topK'] as number | undefined) ?? settings?.topK;
        if (topK !== undefined) generationConfig.topK = topK;

        const maxTokens = options.maxTokens ?? settings?.maxOutputTokens;
        if (maxTokens !== undefined) generationConfig.maxOutputTokens = maxTokens;

        // Structured output mode handling
        const isStructured =
          settings?.structuredOutputs === true ||
          options['structuredOutputs'] === true ||
          settings?.responseMimeType === 'application/json' ||
          options['responseMimeType'] === 'application/json' ||
          settings?.responseSchema !== undefined ||
          options['responseSchema'] !== undefined ||
          options.schema !== undefined;

        if (isStructured) {
          generationConfig.responseMimeType = 'application/json';

          const directSchema =
            settings?.responseSchema ?? (options['responseSchema'] as Record<string, unknown> | undefined);
          if (directSchema) {
            generationConfig.responseSchema = directSchema;
          } else if (options.schema && typeof options.schema === 'object') {
            const schemaObj = options.schema as Record<string, unknown>;
            if (schemaObj['jsonSchema'] && typeof schemaObj['jsonSchema'] === 'object') {
              generationConfig.responseSchema = schemaObj['jsonSchema'] as Record<string, unknown>;
            } else if (schemaObj['properties'] || schemaObj['type']) {
              generationConfig.responseSchema = schemaObj;
            }
          }
        }

        // Safety settings
        const safetySettingsList: GeminiSafetySetting[] = [];
        if (settings?.safetySettings) {
          safetySettingsList.push(...settings.safetySettings);
        }
        const optSafety = options['safetySettings'] as readonly GeminiSafetySetting[] | undefined;
        if (optSafety) {
          safetySettingsList.push(...optSafety);
        }

        const body: Record<string, unknown> = {
          contents,
        };

        if (systemInstruction) {
          body['systemInstruction'] = systemInstruction;
        }
        if (Object.keys(generationConfig).length > 0) {
          body['generationConfig'] = generationConfig;
        }
        if (safetySettingsList.length > 0) {
          body['safetySettings'] = safetySettingsList;
        }

        const fetchImpl = config?.fetch ?? globalThis.fetch;
        if (!fetchImpl) {
          throw new Error('No fetch implementation available. Provide a custom fetch in GeminiConfig.');
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
            `Gemini request failed with status ${response.status} ${response.statusText}: ${errorText}`,
          );
        }

        if (!response.body) {
          throw new Error('Gemini returned an empty response body');
        }

        return transformGeminiByteStream(response.body);
      },
    };
  };

  Object.defineProperty(provider, 'name', {
    value: 'gemini',
    writable: false,
    configurable: true,
  });
  Object.defineProperty(provider, 'config', {
    value: config ?? {},
    writable: false,
    configurable: true,
  });
  Object.defineProperty(provider, 'model', {
    value: (modelId: GeminiModelId, settings?: GeminiSettings) => provider(modelId, settings),
    writable: false,
    configurable: true,
  });

  return provider as GeminiProvider;
}

/**
 * Default Gemini model factory targeting Google Gemini models.
 */
export const gemini = (modelId: GeminiModelId, settings?: GeminiSettings): GeminiModelInstance =>
  createGemini()(modelId, settings);
