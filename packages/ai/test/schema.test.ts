import { describe, it, expect, vi } from 'vitest';
import {
  generateObject,
  AIValidationError,
  isStandardSchema,
  extractJsonFromText,
  validateWithSchema,
  createAIProvider,
  type AIChunk,
  type AIModelInstance,
  type StandardSchemaV1,
  type StreamExecutionOptions,
} from '../src/index.js';

/**
 * Creates a mock AIModelInstance yielding the provided chunks.
 */
function createMockModel(
  chunks: AIChunk[],
  onExecute?: (options: StreamExecutionOptions) => void,
): AIModelInstance {
  return {
    provider: 'test-provider',
    modelId: 'test-model',
    doStream: async (options: StreamExecutionOptions) => {
      onExecute?.(options);
      return new ReadableStream<AIChunk>({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      });
    },
  };
}

/**
 * Helper to construct a compliant Standard Schema v1 instance.
 */
function createStandardSchema<T>(
  validateFn: (value: unknown) =>
    | { value: T; issues?: undefined }
    | { issues: readonly { message: string; path?: readonly (string | number | symbol)[] }[]; value?: undefined }
    | Promise<
        | { value: T; issues?: undefined }
        | { issues: readonly { message: string; path?: readonly (string | number | symbol)[] }[]; value?: undefined }
      >,
  vendor = 'test-vendor',
): StandardSchemaV1<unknown, T> {
  return {
    '~standard': {
      version: 1,
      vendor,
      validate: validateFn,
    },
  };
}

describe('isStandardSchema type guard', () => {
  it('returns true for a compliant Standard Schema v1 specification', () => {
    const schema = createStandardSchema((val) => ({ value: val }));
    expect(isStandardSchema(schema)).toBe(true);
  });

  it('returns false for non-objects or null/undefined', () => {
    expect(isStandardSchema(null)).toBe(false);
    expect(isStandardSchema(undefined)).toBe(false);
    expect(isStandardSchema('schema')).toBe(false);
    expect(isStandardSchema(123)).toBe(false);
  });

  it('returns false for objects without ~standard property', () => {
    expect(isStandardSchema({})).toBe(false);
    expect(isStandardSchema({ parse: () => {} })).toBe(false);
    expect(isStandardSchema({ safeParse: () => {} })).toBe(false);
  });

  it('returns false when version is not 1 or vendor is missing', () => {
    expect(
      isStandardSchema({
        '~standard': {
          version: 2,
          vendor: 'test',
          validate: () => ({ value: null }),
        },
      }),
    ).toBe(false);

    expect(
      isStandardSchema({
        '~standard': {
          version: 1,
          vendor: 123,
          validate: () => ({ value: null }),
        },
      }),
    ).toBe(false);
  });
});

describe('extractJsonFromText', () => {
  it('extracts raw JSON objects directly', () => {
    const raw = '{"name": "Alice", "age": 30}';
    const result = extractJsonFromText(raw);
    expect(result.parsed).toEqual({ name: 'Alice', age: 30 });
    expect(result.extractedText).toBe(raw);
  });

  it('extracts raw JSON arrays directly', () => {
    const raw = '[1, 2, "three", true]';
    const result = extractJsonFromText(raw);
    expect(result.parsed).toEqual([1, 2, 'three', true]);
  });

  it('extracts JSON from standard markdown code fence with json tag', () => {
    const raw = '```json\n{\n  "title": "Post",\n  "views": 100\n}\n```';
    const result = extractJsonFromText(raw);
    expect(result.parsed).toEqual({ title: 'Post', views: 100 });
  });

  it('extracts JSON from markdown code fence without language tag', () => {
    const raw = '```\n{\n  "status": "active"\n}\n```';
    const result = extractJsonFromText(raw);
    expect(result.parsed).toEqual({ status: 'active' });
  });

  it('extracts JSON when conversational preamble and postscript surround the code fence', () => {
    const raw =
      'Here is the requested user profile object:\n\n```json\n{\n  "id": "usr_123",\n  "verified": true\n}\n```\n\nLet me know if you need any adjustments!';
    const result = extractJsonFromText(raw);
    expect(result.parsed).toEqual({ id: 'usr_123', verified: true });
  });

  it('extracts JSON object embedded within conversational text without fences', () => {
    const raw = 'Certainly! The answer is {"result": 42, "unit": "kg"}. Hope this helps.';
    const result = extractJsonFromText(raw);
    expect(result.parsed).toEqual({ result: 42, unit: 'kg' });
  });

  it('extracts JSON array embedded within conversational text without fences', () => {
    const raw = 'Here are the IDs: ["id-1", "id-2", "id-3"] as requested.';
    const result = extractJsonFromText(raw);
    expect(result.parsed).toEqual(['id-1', 'id-2', 'id-3']);
  });

  it('throws SyntaxError for empty or whitespace-only response', () => {
    expect(() => extractJsonFromText('')).toThrow(SyntaxError);
    expect(() => extractJsonFromText('   \n\t  ')).toThrow(SyntaxError);
  });

  it('throws SyntaxError when code fence contains malformed JSON', () => {
    const raw = '```json\n{ name: Alice, unquoted }\n```';
    expect(() => extractJsonFromText(raw)).toThrow(SyntaxError);
  });

  it('throws SyntaxError with informative message for non-JSON conversational output', () => {
    const raw = 'I am an AI assistant and I cannot produce structured JSON for this prompt.';
    expect(() => extractJsonFromText(raw)).toThrow(SyntaxError);
    expect(() => extractJsonFromText(raw)).toThrow(/Malformed JSON in AI model response/);
  });
});

describe('validateWithSchema', () => {
  it('validates successfully against Standard Schema v1', async () => {
    const schema = createStandardSchema<{ count: number }>((val) => {
      const obj = val as Record<string, unknown>;
      if (typeof obj['count'] === 'number') {
        return { value: { count: obj['count'] } };
      }
      return { issues: [{ message: 'count must be a number', path: ['count'] }] };
    });

    const validated = await validateWithSchema(schema, { count: 10 }, '{"count": 10}');
    expect(validated).toEqual({ count: 10 });
  });

  it('throws AIValidationError on Standard Schema v1 failure with path and message', async () => {
    const schema = createStandardSchema((val) => {
      const obj = val as Record<string, unknown>;
      if (typeof obj['email'] === 'string' && obj['email'].includes('@')) {
        return { value: obj };
      }
      return { issues: [{ message: 'Invalid email address', path: ['user', 'email'] }] };
    });

    try {
      await validateWithSchema(schema, { email: 'invalid' }, '{"email": "invalid"}');
      expect.unreachable('Should have thrown AIValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(AIValidationError);
      const valErr = err as AIValidationError;
      expect(valErr.name).toBe('AIValidationError');
      expect(valErr.issues).toHaveLength(1);
      expect(valErr.issues[0]?.message).toBe('Invalid email address');
      expect(valErr.issues[0]?.path).toEqual(['user', 'email']);
      expect(valErr.rawInput).toEqual({ email: 'invalid' });
      expect(valErr.rawText).toBe('{"email": "invalid"}');
    }
  });

  it('supports Zod/Valibot safeParse fallback', async () => {
    const safeParseSchema = {
      safeParse: (data: unknown) => {
        const obj = data as Record<string, unknown>;
        if (typeof obj['name'] === 'string') {
          return { success: true as const, data: { name: obj['name'] } };
        }
        return {
          success: false as const,
          error: { issues: [{ message: 'name is required', path: ['name'] }] },
        };
      },
    };

    const valid = await validateWithSchema(safeParseSchema, { name: 'Alice' }, '{"name": "Alice"}');
    expect(valid).toEqual({ name: 'Alice' });

    await expect(validateWithSchema(safeParseSchema, { name: 123 }, '{"name": 123}')).rejects.toThrow(
      AIValidationError,
    );
  });

  it('supports parse method fallback', async () => {
    const parseSchema = {
      parse: (data: unknown) => {
        const obj = data as Record<string, unknown>;
        if (!obj['sku']) {
          const err = new Error('sku missing');
          (err as Record<string, unknown>)['issues'] = [{ message: 'sku missing', path: ['sku'] }];
          throw err;
        }
        return obj;
      },
    };

    const valid = await validateWithSchema(parseSchema, { sku: 'SKU-001' }, '{"sku": "SKU-001"}');
    expect(valid).toEqual({ sku: 'SKU-001' });

    await expect(validateWithSchema(parseSchema, {}, '{}')).rejects.toThrow(AIValidationError);
  });

  it('supports custom validator functions', async () => {
    const customValidator = (val: unknown) => {
      const obj = val as Record<string, unknown>;
      if (!obj['isAdmin']) {
        throw new Error('User must be admin');
      }
      return { isAdmin: true };
    };

    const valid = await validateWithSchema(customValidator, { isAdmin: true }, '{"isAdmin": true}');
    expect(valid).toEqual({ isAdmin: true });

    await expect(validateWithSchema(customValidator, { isAdmin: false }, '{"isAdmin": false}')).rejects.toThrow(
      AIValidationError,
    );
  });
});

describe('generateObject with Standard Schema v1', () => {
  interface UserProfile {
    id: string;
    username: string;
    tags: string[];
    settings: {
      notifications: boolean;
      theme: 'light' | 'dark';
    };
  }

  const userProfileSchema = createStandardSchema<UserProfile>((val) => {
    if (typeof val !== 'object' || val === null) {
      return { issues: [{ message: 'Expected object' }] };
    }
    const rec = val as Record<string, unknown>;
    if (typeof rec['id'] !== 'string') {
      return { issues: [{ message: 'id must be a string', path: ['id'] }] };
    }
    if (typeof rec['username'] !== 'string') {
      return { issues: [{ message: 'username must be a string', path: ['username'] }] };
    }
    if (!Array.isArray(rec['tags'])) {
      return { issues: [{ message: 'tags must be an array', path: ['tags'] }] };
    }
    const settings = rec['settings'] as Record<string, unknown> | undefined;
    if (!settings || typeof settings['notifications'] !== 'boolean') {
      return { issues: [{ message: 'notifications must be boolean', path: ['settings', 'notifications'] }] };
    }
    return {
      value: {
        id: rec['id'],
        username: rec['username'],
        tags: rec['tags'] as string[],
        settings: {
          notifications: settings['notifications'] as boolean,
          theme: (settings['theme'] === 'light' ? 'light' : 'dark') as 'light' | 'dark',
        },
      },
    };
  });

  it('generates and validates nested objects with usage and finishReason', async () => {
    const modelPayload: UserProfile = {
      id: 'usr-99',
      username: 'johndoe',
      tags: ['engineer', 'maintainer'],
      settings: {
        notifications: true,
        theme: 'dark',
      },
    };

    const model = createMockModel([
      { type: 'text', text: '```json\n' },
      { type: 'text', text: JSON.stringify(modelPayload, null, 2) },
      { type: 'text', text: '\n```' },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: { promptTokens: 40, completionTokens: 60, totalTokens: 100 },
      },
    ]);

    const result = await generateObject({
      model,
      schema: userProfileSchema,
      prompt: 'Generate user profile for John',
      schemaName: 'UserProfile',
      schemaDescription: 'User entity with nested settings and tags',
    });

    expect(result.object).toEqual(modelPayload);
    expect(result.finishReason).toBe('stop');
    expect(result.usage).toEqual({ promptTokens: 40, completionTokens: 60, totalTokens: 100 });
    expect(result.rawText).toContain('usr-99');
  });

  it('validates array structured schemas', async () => {
    const arraySchema = createStandardSchema<number[]>((val) => {
      if (!Array.isArray(val)) {
        return { issues: [{ message: 'Expected array' }] };
      }
      return { value: val.map(Number) };
    });

    const model = createMockModel([
      { type: 'text', text: '[10, 20, 30, 40]' },
      { type: 'finish', finishReason: 'stop' },
    ]);

    const result = await generateObject({
      model,
      schema: arraySchema,
      prompt: 'List four numbers',
    });

    expect(result.object).toEqual([10, 20, 30, 40]);
  });

  it('validates primitive schemas', async () => {
    const stringSchema = createStandardSchema<string>((val) => {
      if (typeof val !== 'string') {
        return { issues: [{ message: 'Expected string' }] };
      }
      return { value: val };
    });

    const model = createMockModel([
      { type: 'text', text: '"validated-uuid-string"' },
      { type: 'finish', finishReason: 'stop' },
    ]);

    const result = await generateObject({
      model,
      schema: stringSchema,
      prompt: 'Generate UUID',
    });

    expect(result.object).toBe('validated-uuid-string');
  });

  it('throws AIValidationError with detailed issues on validation failure', async () => {
    const model = createMockModel([
      {
        type: 'text',
        text: JSON.stringify({
          id: 'usr-1',
          username: 'alice',
          tags: 'not-an-array', // Invalid type
          settings: { notifications: true },
        }),
      },
      { type: 'finish', finishReason: 'stop' },
    ]);

    try {
      await generateObject({
        model,
        schema: userProfileSchema,
        prompt: 'Generate user',
      });
      expect.unreachable('Expected generateObject to throw AIValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(AIValidationError);
      const valErr = err as AIValidationError;
      expect(valErr.issues).toHaveLength(1);
      expect(valErr.issues[0]?.path).toEqual(['tags']);
      expect(valErr.issues[0]?.message).toContain('tags must be an array');
      expect(valErr.rawInput).toHaveProperty('tags', 'not-an-array');
    }
  });

  it('throws SyntaxError when model output contains malformed JSON', async () => {
    const model = createMockModel([
      { type: 'text', text: '{"id": "usr-1", "username": ' }, // Truncated/malformed
      { type: 'finish', finishReason: 'length' },
    ]);

    await expect(
      generateObject({
        model,
        schema: userProfileSchema,
        prompt: 'Generate user',
      }),
    ).rejects.toThrow(SyntaxError);
  });

  it('augments prompt and messages to enforce strict JSON', async () => {
    let capturedOptions: StreamExecutionOptions | undefined;

    const model = createMockModel(
      [
        {
          type: 'text',
          text: JSON.stringify({
            id: 'u1',
            username: 'bob',
            tags: [],
            settings: { notifications: false, theme: 'light' },
          }),
        },
        { type: 'finish', finishReason: 'stop' },
      ],
      (opts) => {
        capturedOptions = opts;
      },
    );

    await generateObject({
      model,
      schema: userProfileSchema,
      prompt: 'Create user bob',
      schemaName: 'UserRecord',
      schemaDescription: 'id, username, tags, and settings are mandatory',
    });

    expect(capturedOptions).toBeDefined();
    expect(capturedOptions?.messages).toBeDefined();
    const systemMsg = capturedOptions?.messages?.find((m) => m.role === 'system');
    expect(systemMsg).toBeDefined();
    const content = typeof systemMsg?.content === 'string' ? systemMsg.content : '';
    expect(content).toContain('strict JSON');
    expect(content).toContain('UserRecord');
    expect(content).toContain('mandatory');
  });

  it('respects AbortSignal if already aborted prior to call', async () => {
    const controller = new AbortController();
    controller.abort(new Error('Pre-aborted request'));

    const model = createMockModel([{ type: 'text', text: '{}' }]);

    await expect(
      generateObject({
        model,
        schema: userProfileSchema,
        prompt: 'Create user',
        signal: controller.signal,
      }),
    ).rejects.toThrow('Pre-aborted request');
  });

  it('cancels reading when AbortSignal triggers mid-stream', async () => {
    const controller = new AbortController();

    const slowModel: AIModelInstance = {
      provider: 'test-slow',
      modelId: 'test-slow-model',
      doStream: async () => {
        return new ReadableStream<AIChunk>({
          async start(streamController) {
            streamController.enqueue({ type: 'text', text: '{"id": ' });
            // Wait to simulate delayed chunk
            await new Promise((resolve) => setTimeout(resolve, 50));
            controller.abort(new Error('Aborted mid-stream'));
            await new Promise((resolve) => setTimeout(resolve, 50));
            streamController.enqueue({ type: 'text', text: '"usr-1"}' });
            streamController.close();
          },
        });
      },
    };

    await expect(
      generateObject({
        model: slowModel,
        schema: userProfileSchema,
        prompt: 'Create user',
        signal: controller.signal,
      }),
    ).rejects.toThrow('Aborted mid-stream');
  });
});

describe('Multi-Provider Compatibility with generateObject', () => {
  interface BookReview {
    title: string;
    rating: number;
    recommended: boolean;
  }

  const reviewSchema = createStandardSchema<BookReview>((val) => {
    const rec = val as Record<string, unknown>;
    if (typeof rec['title'] !== 'string') {
      return { issues: [{ message: 'title required', path: ['title'] }] };
    }
    if (typeof rec['rating'] !== 'number') {
      return { issues: [{ message: 'rating required', path: ['rating'] }] };
    }
    return {
      value: {
        title: rec['title'],
        rating: rec['rating'],
        recommended: Boolean(rec['recommended']),
      },
    };
  });

  it('works with Google Gemini SSE format', async () => {
    const mockGeminiResponse = [
      'data: {"candidates":[{"content":{"parts":[{"text":"{\\"title\\": \\"Clean Code\\", \\"rating\\": 5, \\"recommended\\": true}"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":15,"candidatesTokenCount":25,"totalTokenCount":40}}\n\n',
    ].join('');

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(mockGeminiResponse, {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );

    const provider = createAIProvider({
      name: 'google',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: 'test-gemini-key',
      fetch: mockFetch as unknown as typeof fetch,
    });

    const result = await generateObject({
      model: provider('gemini-1.5-pro'),
      schema: reviewSchema,
      prompt: 'Review Clean Code',
    });

    expect(result.object).toEqual({
      title: 'Clean Code',
      rating: 5,
      recommended: true,
    });
    expect(result.finishReason).toBe('STOP');
    expect(result.usage?.totalTokens).toBe(40);
  });

  it('works with Anthropic Claude SSE format with markdown code block', async () => {
    const mockClaudeSSE = [
      'event: content_block_start\n',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
      'event: content_block_delta\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"```json\\n{\\"title\\": \\"Designing Data-Intensive Applications\\", \\"rating\\": 5, \\"recommended\\": true}\\n```"}}\n\n',
      'event: message_delta\n',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":32}}\n\n',
      'event: message_stop\n',
      'data: {"type":"message_stop"}\n\n',
    ].join('');

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(mockClaudeSSE, {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );

    const provider = createAIProvider({
      name: 'claude',
      baseURL: 'https://api.anthropic.com/v1',
      apiKey: 'test-claude-key',
      fetch: mockFetch as unknown as typeof fetch,
    });

    const result = await generateObject({
      model: provider('claude-3-5-sonnet-20241022'),
      schema: reviewSchema,
      prompt: 'Review DDIA',
    });

    expect(result.object).toEqual({
      title: 'Designing Data-Intensive Applications',
      rating: 5,
      recommended: true,
    });
    expect(result.finishReason).toBe('end_turn');
    expect(result.usage?.completionTokens).toBe(32);
  });

  it('works with OpenAI / Groq SSE format', async () => {
    const mockOpenAISSE = [
      'data: {"choices":[{"delta":{"content":"{\\"title\\": \\"Refactoring\\", "},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{"content":"\\"rating\\": 4, \\"recommended\\": true}"},"finish_reason":null}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":12,"completion_tokens":20,"total_tokens":32}}\n\n',
      'data: [DONE]\n\n',
    ].join('');

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(mockOpenAISSE, {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );

    const provider = createAIProvider({
      name: 'openai',
      baseURL: 'https://api.openai.com/v1',
      apiKey: 'test-openai-key',
      fetch: mockFetch as unknown as typeof fetch,
    });

    const result = await generateObject({
      model: provider('gpt-4o'),
      schema: reviewSchema,
      prompt: 'Review Refactoring',
    });

    expect(result.object).toEqual({
      title: 'Refactoring',
      rating: 4,
      recommended: true,
    });
    expect(result.finishReason).toBe('stop');
    expect(result.usage?.totalTokens).toBe(32);
  });
});
