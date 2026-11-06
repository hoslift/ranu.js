/**
 * Empirical Challenge Suite for Milestone M3 (PR #247)
 * Standard-Schema Structured Outputs & Adversarial Text Extraction
 *
 * Verifies:
 * 1. Complex schemas: deep object nesting (5+ levels), polymorphic arrays, optional/nullable, enum.
 * 2. Adversarial model outputs: markdown code fences with trailing text, conversational padding,
 *    unicode escape sequences, severely truncated and malformed JSON.
 * 3. AIValidationError breadcrumbs: exact path arrays (e.g. ['users', 0, 'address', 'zipCode']),
 *    multi-validator compatibility (Standard Schema v1, safeParse, parse, custom), and diagnostics.
 */

import { describe, it, expect } from 'vitest';
import {
  generateObject,
  AIValidationError,
  extractJsonFromText,
  validateWithSchema,
  type AIChunk,
  type AIModelInstance,
  type StandardSchemaV1,
  type StreamExecutionOptions,
} from '../src/index.js';

/**
 * Creates a mock AIModelInstance emitting the specified chunks.
 */
function createMockModel(chunks: AIChunk[]): AIModelInstance {
  return {
    provider: 'challenge-provider',
    modelId: 'challenge-model',
    doStream: async (_options: StreamExecutionOptions) => {
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
 * Creates a Standard Schema v1 validator.
 */
function createStandardSchema<T>(
  validateFn: (value: unknown) =>
    | { value: T; issues?: undefined }
    | {
        issues: readonly {
          message: string;
          path?: readonly (
            | string
            | number
            | symbol
            | { readonly key: string | number | symbol }
          )[];
        }[];
        value?: undefined;
      }
    | Promise<
        | { value: T; issues?: undefined }
        | {
            issues: readonly {
              message: string;
              path?: readonly (
                | string
                | number
                | symbol
                | { readonly key: string | number | symbol }
              )[];
            }[];
            value?: undefined;
          }
      >,
  vendor = 'standard-schema-v1',
): StandardSchemaV1<unknown, T> {
  return {
    '~standard': {
      version: 1,
      vendor,
      validate: validateFn,
    },
  };
}

describe('Empirical Challenge 1: Complex Schemas', () => {
  // 1.1 Deep Object Nesting (7 levels deep)
  interface Level7Object {
    level1: {
      level2: {
        level3: {
          level4: {
            level5: {
              level6: {
                level7: {
                  targetKey: string;
                  count: number;
                };
              };
            };
          };
        };
      };
    };
  }

  const deepNestedSchema = createStandardSchema<Level7Object>((val) => {
    if (typeof val !== 'object' || val === null) {
      return { issues: [{ message: 'Expected object at root', path: [] }] };
    }
    const r = val as Record<string, any>;
    const l1 = r.level1;
    if (!l1) return { issues: [{ message: 'Missing level1', path: ['level1'] }] };
    const l2 = l1.level2;
    if (!l2) return { issues: [{ message: 'Missing level2', path: ['level1', 'level2'] }] };
    const l3 = l2.level3;
    if (!l3) return { issues: [{ message: 'Missing level3', path: ['level1', 'level2', 'level3'] }] };
    const l4 = l3.level4;
    if (!l4) return { issues: [{ message: 'Missing level4', path: ['level1', 'level2', 'level3', 'level4'] }] };
    const l5 = l4.level5;
    if (!l5) return { issues: [{ message: 'Missing level5', path: ['level1', 'level2', 'level3', 'level4', 'level5'] }] };
    const l6 = l5.level6;
    if (!l6) return { issues: [{ message: 'Missing level6', path: ['level1', 'level2', 'level3', 'level4', 'level5', 'level6'] }] };
    const l7 = l6.level7;
    if (!l7) return { issues: [{ message: 'Missing level7', path: ['level1', 'level2', 'level3', 'level4', 'level5', 'level6', 'level7'] }] };

    if (typeof l7.targetKey !== 'string') {
      return {
        issues: [
          {
            message: 'targetKey must be a string',
            path: ['level1', 'level2', 'level3', 'level4', 'level5', 'level6', 'level7', 'targetKey'],
          },
        ],
      };
    }
    if (typeof l7.count !== 'number') {
      return {
        issues: [
          {
            message: 'count must be a number',
            path: ['level1', 'level2', 'level3', 'level4', 'level5', 'level6', 'level7', 'count'],
          },
        ],
      };
    }

    return { value: val as Level7Object };
  });

  it('successfully generates and validates deeply nested object (7 levels)', async () => {
    const payload: Level7Object = {
      level1: {
        level2: {
          level3: {
            level4: {
              level5: {
                level6: {
                  level7: {
                    targetKey: 'deep-success-token',
                    count: 1048576,
                  },
                },
              },
            },
          },
        },
      },
    };

    const model = createMockModel([
      { type: 'text', text: JSON.stringify(payload) },
      { type: 'finish', finishReason: 'stop' },
    ]);

    const result = await generateObject({
      model,
      schema: deepNestedSchema,
      prompt: 'Generate 7-level nested object',
    });

    expect(result.object).toEqual(payload);
    expect(result.object.level1.level2.level3.level4.level5.level6.level7.targetKey).toBe(
      'deep-success-token',
    );
  });

  it('fails with exact 7-segment path breadcrumbs when leaf property in deep nesting is invalid', async () => {
    const invalidPayload = {
      level1: {
        level2: {
          level3: {
            level4: {
              level5: {
                level6: {
                  level7: {
                    targetKey: 12345, // Invalid: expected string
                    count: 1048576,
                  },
                },
              },
            },
          },
        },
      },
    };

    const model = createMockModel([
      { type: 'text', text: JSON.stringify(invalidPayload) },
      { type: 'finish', finishReason: 'stop' },
    ]);

    try {
      await generateObject({
        model,
        schema: deepNestedSchema,
        prompt: 'Generate deep invalid object',
      });
      expect.unreachable('Should have thrown AIValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(AIValidationError);
      const valErr = err as AIValidationError;
      expect(valErr.issues).toHaveLength(1);
      expect(valErr.issues[0]?.path).toEqual([
        'level1',
        'level2',
        'level3',
        'level4',
        'level5',
        'level6',
        'level7',
        'targetKey',
      ]);
      expect(valErr.issues[0]?.message).toBe('targetKey must be a string');
      expect(valErr.message).toContain(
        '[level1.level2.level3.level4.level5.level6.level7.targetKey] targetKey must be a string',
      );
    }
  });

  // 1.2 Arrays of Polymorphic Objects (Discriminated Union)
  type PolymorphicEvent =
    | { kind: 'click'; x: number; y: number }
    | { kind: 'keystroke'; key: string; code: number }
    | { kind: 'scroll'; deltaY: number; target: string };

  const polymorphicArraySchema = createStandardSchema<PolymorphicEvent[]>((val) => {
    if (!Array.isArray(val)) {
      return { issues: [{ message: 'Expected array of events' }] };
    }
    const validatedEvents: PolymorphicEvent[] = [];
    for (let i = 0; i < val.length; i++) {
      const item = val[i];
      if (typeof item !== 'object' || item === null) {
        return { issues: [{ message: 'Event must be an object', path: [i] }] };
      }
      switch (item.kind) {
        case 'click':
          if (typeof item.x !== 'number' || typeof item.y !== 'number') {
            return {
              issues: [
                {
                  message: 'Click event requires numeric x and y coordinates',
                  path: [i, 'coordinates'],
                },
              ],
            };
          }
          validatedEvents.push({ kind: 'click', x: item.x, y: item.y });
          break;
        case 'keystroke':
          if (typeof item.key !== 'string' || typeof item.code !== 'number') {
            return {
              issues: [
                {
                  message: 'Keystroke event requires string key and numeric code',
                  path: [i, 'keystroke'],
                },
              ],
            };
          }
          validatedEvents.push({ kind: 'keystroke', key: item.key, code: item.code });
          break;
        case 'scroll':
          if (typeof item.deltaY !== 'number' || typeof item.target !== 'string') {
            return {
              issues: [
                {
                  message: 'Scroll event requires numeric deltaY and string target',
                  path: [i, 'scroll'],
                },
              ],
            };
          }
          validatedEvents.push({ kind: 'scroll', deltaY: item.deltaY, target: item.target });
          break;
        default:
          return {
            issues: [
              {
                message: `Unknown event kind: ${item.kind}`,
                path: [i, 'kind'],
              },
            ],
          };
      }
    }
    return { value: validatedEvents };
  });

  it('validates array containing mixed polymorphic objects', async () => {
    const events: PolymorphicEvent[] = [
      { kind: 'click', x: 100, y: 250 },
      { kind: 'keystroke', key: 'Enter', code: 13 },
      { kind: 'scroll', deltaY: -50, target: 'window' },
    ];

    const model = createMockModel([
      { type: 'text', text: JSON.stringify(events) },
      { type: 'finish', finishReason: 'stop' },
    ]);

    const result = await generateObject({
      model,
      schema: polymorphicArraySchema,
      prompt: 'Stream user events',
    });

    expect(result.object).toEqual(events);
    expect(result.object).toHaveLength(3);
  });

  it('throws AIValidationError with index breadcrumb when one item in polymorphic array is invalid', async () => {
    const invalidEvents = [
      { kind: 'click', x: 100, y: 250 },
      { kind: 'keystroke', key: 'Enter', code: 13 },
      { kind: 'scroll', deltaY: 'not-a-number', target: 'window' }, // Invalid at index 2
    ];

    const model = createMockModel([
      { type: 'text', text: JSON.stringify(invalidEvents) },
      { type: 'finish', finishReason: 'stop' },
    ]);

    try {
      await generateObject({
        model,
        schema: polymorphicArraySchema,
        prompt: 'Stream user events',
      });
      expect.unreachable('Should have thrown AIValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(AIValidationError);
      const valErr = err as AIValidationError;
      expect(valErr.issues[0]?.path).toEqual([2, 'scroll']);
      expect(valErr.message).toContain('[2.scroll]');
    }
  });

  // 1.3 Optional and Nullable fields
  interface UserContact {
    id: string;
    email: string;
    phone?: string | undefined;
    secondaryEmail: string | null;
    bio?: string | null | undefined;
  }

  const userContactSchema = createStandardSchema<UserContact>((val) => {
    if (typeof val !== 'object' || val === null) {
      return { issues: [{ message: 'Expected object' }] };
    }
    const r = val as Record<string, any>;
    if (typeof r.id !== 'string') return { issues: [{ message: 'id must be string', path: ['id'] }] };
    if (typeof r.email !== 'string') return { issues: [{ message: 'email must be string', path: ['email'] }] };

    if (r.phone !== undefined && typeof r.phone !== 'string') {
      return { issues: [{ message: 'phone must be string or undefined', path: ['phone'] }] };
    }
    if (r.secondaryEmail !== null && typeof r.secondaryEmail !== 'string') {
      return {
        issues: [{ message: 'secondaryEmail must be string or null', path: ['secondaryEmail'] }],
      };
    }
    if (r.bio !== undefined && r.bio !== null && typeof r.bio !== 'string') {
      return { issues: [{ message: 'bio must be string, null or undefined', path: ['bio'] }] };
    }

    return {
      value: {
        id: r.id,
        email: r.email,
        phone: r.phone,
        secondaryEmail: r.secondaryEmail,
        bio: r.bio,
      },
    };
  });

  it('accepts omitted optional fields and null nullable fields', async () => {
    const payload = {
      id: 'usr_abc',
      email: 'alex@example.com',
      secondaryEmail: null,
      // phone and bio are completely omitted
    };

    const model = createMockModel([
      { type: 'text', text: JSON.stringify(payload) },
      { type: 'finish', finishReason: 'stop' },
    ]);

    const result = await generateObject({
      model,
      schema: userContactSchema,
      prompt: 'Generate user contact with null secondaryEmail',
    });

    expect(result.object).toEqual({
      id: 'usr_abc',
      email: 'alex@example.com',
      phone: undefined,
      secondaryEmail: null,
      bio: undefined,
    });
  });

  it('rejects type mismatch on optional field when present with invalid type', async () => {
    const payload = {
      id: 'usr_abc',
      email: 'alex@example.com',
      phone: 1234567890, // Invalid: should be string
      secondaryEmail: null,
    };

    const model = createMockModel([
      { type: 'text', text: JSON.stringify(payload) },
      { type: 'finish', finishReason: 'stop' },
    ]);

    await expect(
      generateObject({
        model,
        schema: userContactSchema,
        prompt: 'Generate user contact with numeric phone',
      }),
    ).rejects.toThrow(AIValidationError);
  });

  // 1.4 Enum Validation
  type DeploymentTier = 'DEVELOPMENT' | 'STAGING' | 'CANARY' | 'PRODUCTION';
  const validTiers: Set<DeploymentTier> = new Set([
    'DEVELOPMENT',
    'STAGING',
    'CANARY',
    'PRODUCTION',
  ]);

  interface DeploymentConfig {
    name: string;
    tier: DeploymentTier;
  }

  const enumSchema = createStandardSchema<DeploymentConfig>((val) => {
    const r = val as Record<string, any>;
    if (typeof r?.name !== 'string') {
      return { issues: [{ message: 'name must be string', path: ['name'] }] };
    }
    if (!validTiers.has(r.tier)) {
      return {
        issues: [
          {
            message: `tier must be one of: DEVELOPMENT, STAGING, CANARY, PRODUCTION (got '${r.tier}')`,
            path: ['tier'],
          },
        ],
      };
    }
    return { value: { name: r.name, tier: r.tier } };
  });

  it('validates strictly valid enum values', async () => {
    const model = createMockModel([
      { type: 'text', text: '{"name": "core-api", "tier": "CANARY"}' },
      { type: 'finish', finishReason: 'stop' },
    ]);

    const result = await generateObject({
      model,
      schema: enumSchema,
      prompt: 'Deploy core-api to canary',
    });

    expect(result.object.tier).toBe('CANARY');
  });

  it('rejects invalid enum values with informative error message and breadcrumb', async () => {
    const model = createMockModel([
      { type: 'text', text: '{"name": "core-api", "tier": "canary_lowercase"}' },
      { type: 'finish', finishReason: 'stop' },
    ]);

    try {
      await generateObject({
        model,
        schema: enumSchema,
        prompt: 'Deploy core-api',
      });
      expect.unreachable('Should fail with invalid enum');
    } catch (err) {
      expect(err).toBeInstanceOf(AIValidationError);
      const valErr = err as AIValidationError;
      expect(valErr.issues[0]?.path).toEqual(['tier']);
      expect(valErr.issues[0]?.message).toContain("got 'canary_lowercase'");
      expect(valErr.message).toContain('[tier]');
    }
  });
});

describe('Empirical Challenge 2: Adversarial Model Outputs', () => {
  const dummySchema = createStandardSchema<{ token: string; count: number }>((val) => {
    const r = val as Record<string, any>;
    if (typeof r?.token !== 'string' || typeof r?.count !== 'number') {
      return { issues: [{ message: 'Invalid payload' }] };
    }
    return { value: { token: r.token, count: r.count } };
  });

  // 2.1 Markdown code fences with trailing text
  it('extracts JSON from code fence with trailing conversational text', () => {
    const raw = [
      '```json',
      '{"token": "tok_xyz", "count": 42}',
      '```',
      'Here is the completed configuration. Remember to keep tok_xyz confidential and rotate regularly.',
    ].join('\n');

    const result = extractJsonFromText(raw);
    expect(result.parsed).toEqual({ token: 'tok_xyz', count: 42 });
  });

  it('extracts JSON from untagged code fence with both leading and trailing conversational text', () => {
    const raw = [
      'Preamble note: Model generation completed successfully.',
      '```',
      '{"token": "tok_un_tagged", "count": 99}',
      '```',
      'Postscript: All operations finished with exit code 0.',
    ].join('\n');

    const result = extractJsonFromText(raw);
    expect(result.parsed).toEqual({ token: 'tok_un_tagged', count: 99 });
  });

  it('extracts JSON when uppercase ```JSON code block is used with trailing commentary', () => {
    const raw = [
      '```JSON',
      '{"token": "uppercase_block", "count": 77}',
      '```',
      'Trailing line 1',
      'Trailing line 2',
    ].join('\n');

    const result = extractJsonFromText(raw);
    expect(result.parsed).toEqual({ token: 'uppercase_block', count: 77 });
  });

  // 2.2 Messy conversational padding before and after JSON (no fences)
  it('extracts JSON object embedded between conversational commentary without fences', () => {
    const raw =
      'Certainly! Here is your structured configuration payload: {"token": "embedded_token", "count": 100} — let me know if you need any adjustments!';
    const result = extractJsonFromText(raw);
    expect(result.parsed).toEqual({ token: 'embedded_token', count: 100 });
  });

  it('extracts JSON array embedded between conversational sentences without fences', () => {
    const raw =
      'The requested ID batch is: ["id-alpha", "id-beta", "id-gamma"]. End of generation.';
    const result = extractJsonFromText(raw);
    expect(result.parsed).toEqual(['id-alpha', 'id-beta', 'id-gamma']);
  });

  // 2.3 JSON with unicode escape sequences
  it('correctly parses JSON containing unicode escape sequences (emojis, CJK, symbols, accents)', async () => {
    const rawUnicodeJson = JSON.stringify({
      token: '\\uD83D\\uDE80 \\u2728 Tokyo: \\u6771\\u4EAC | Price: \\u20AC50 | \\u00A9 2026',
      count: 1,
    });

    // Model streams raw text with JSON unicode escapes: \uD83D\uDE80 (rocket), \u2728 (sparkles), \u6771\u4EAC (Tokyo)
    const modelOutput =
      '{"token": "\\uD83D\\uDE80 \\u2728 Tokyo: \\u6771\\u4EAC | Price: \\u20AC50 | \\u00A9 2026", "count": 1}';

    const model = createMockModel([
      { type: 'text', text: modelOutput },
      { type: 'finish', finishReason: 'stop' },
    ]);

    const result = await generateObject({
      model,
      schema: dummySchema,
      prompt: 'Emit unicode test object',
    });

    expect(result.object.token).toBe('🚀 ✨ Tokyo: 東京 | Price: €50 | © 2026');
    expect(result.object.count).toBe(1);
  });

  it('handles JSON with escaped characters: quotes, newlines, tabs, and backslashes', () => {
    const raw = '{"token": "line1\\nline2\\t\\"quoted\\"\\\\path", "count": 5}';
    const result = extractJsonFromText(raw);
    expect(result.parsed).toEqual({
      token: 'line1\nline2\t"quoted"\\path',
      count: 5,
    });
  });

  // 2.4 Severely truncated or malformed JSON
  it('throws SyntaxError on severely truncated JSON mid-string', async () => {
    const truncated = '{"token": "incomplete_str';
    const model = createMockModel([
      { type: 'text', text: truncated },
      { type: 'finish', finishReason: 'length' },
    ]);

    await expect(
      generateObject({
        model,
        schema: dummySchema,
        prompt: 'Generate truncated',
      }),
    ).rejects.toThrow(SyntaxError);
  });

  it('throws SyntaxError on severely truncated JSON mid-object', async () => {
    const truncated = '{"token": "tok_1", "count": ';
    const model = createMockModel([
      { type: 'text', text: truncated },
      { type: 'finish', finishReason: 'length' },
    ]);

    await expect(
      generateObject({
        model,
        schema: dummySchema,
        prompt: 'Generate truncated number',
      }),
    ).rejects.toThrow(SyntaxError);
  });

  it('throws SyntaxError on unquoted keys or invalid JS object literals', () => {
    const invalidLiteral = '{ token: "tok_1", count: 10 }'; // Not valid JSON
    expect(() => extractJsonFromText(invalidLiteral)).toThrow(SyntaxError);
  });

  it('throws SyntaxError on single-quoted JSON string', () => {
    const singleQuotes = "{ 'token': 'tok_single', 'count': 1 }";
    expect(() => extractJsonFromText(singleQuotes)).toThrow(SyntaxError);
  });

  it('throws SyntaxError on trailing commas in objects or arrays', () => {
    const trailingComma = '{"token": "tok_1", "count": 10,}';
    expect(() => extractJsonFromText(trailingComma)).toThrow(SyntaxError);
  });

  it('throws SyntaxError on AI refusal without JSON', async () => {
    const refusal =
      'I apologize, but as an AI language model I cannot assist with generating this object.';
    const model = createMockModel([
      { type: 'text', text: refusal },
      { type: 'finish', finishReason: 'stop' },
    ]);

    await expect(
      generateObject({
        model,
        schema: dummySchema,
        prompt: 'Trigger refusal',
      }),
    ).rejects.toThrow(SyntaxError);
  });
});

describe('Empirical Challenge 3: AIValidationError Exact Breadcrumbs & Multi-Validator Matrix', () => {
  // 3.1 Exact path breadcrumbs for deeply nested arrays: ['users', 0, 'address', 'zipCode']
  it('verifies exact path breadcrumbs in Standard Schema v1', async () => {
    const schema = createStandardSchema((val) => {
      return {
        issues: [
          {
            message: 'zipCode is required and must be 5 digits',
            path: ['users', 0, 'address', 'zipCode'],
          },
        ],
      };
    });

    const parsedData = {
      users: [
        {
          name: 'Charlie',
          address: { street: '123 Main St', zipCode: 'invalid' },
        },
      ],
    };

    try {
      await validateWithSchema(schema, parsedData, JSON.stringify(parsedData));
      expect.unreachable('Should throw AIValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(AIValidationError);
      const valErr = err as AIValidationError;
      expect(valErr.issues).toHaveLength(1);
      expect(valErr.issues[0]?.path).toEqual(['users', 0, 'address', 'zipCode']);
      expect(valErr.issues[0]?.message).toBe('zipCode is required and must be 5 digits');
      expect(valErr.message).toContain(
        '[users.0.address.zipCode] zipCode is required and must be 5 digits',
      );
      expect(valErr.rawInput).toEqual(parsedData);
    }
  });

  // 3.2 Standard Schema v1 path segments represented as objects with .key
  it('normalizes path segments formatted as { key: PropertyKey } according to Standard Schema v1 spec', async () => {
    const schema = createStandardSchema((_val) => {
      return {
        issues: [
          {
            message: 'city must be capitalized',
            path: [{ key: 'users' }, { key: 1 }, { key: 'address' }, { key: 'city' }],
          },
        ],
      };
    });

    try {
      await validateWithSchema(schema, {}, '{}');
      expect.unreachable('Should throw AIValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(AIValidationError);
      const valErr = err as AIValidationError;
      expect(valErr.issues[0]?.path).toEqual(['users', 1, 'address', 'city']);
      expect(valErr.message).toContain('[users.1.address.city] city must be capitalized');
    }
  });

  // 3.3 safeParse validator (Zod-like) exact breadcrumbs
  it('verifies exact breadcrumbs with safeParse schema', async () => {
    const zodLikeSchema = {
      safeParse: (_data: unknown) => ({
        success: false as const,
        error: {
          issues: [
            {
              message: 'Invalid email format',
              path: ['members', 2, 'contact', 'email'],
            },
          ],
        },
      }),
    };

    try {
      await validateWithSchema(zodLikeSchema, { test: 1 }, '{"test": 1}');
      expect.unreachable('Should throw AIValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(AIValidationError);
      const valErr = err as AIValidationError;
      expect(valErr.issues[0]?.path).toEqual(['members', 2, 'contact', 'email']);
      expect(valErr.issues[0]?.message).toBe('Invalid email format');
      expect(valErr.message).toContain('[members.2.contact.email] Invalid email format');
    }
  });

  // 3.4 parse validator (ArkType / Yup-like) exact breadcrumbs
  it('verifies exact breadcrumbs with parse schema throwing error with issues array', async () => {
    const arkTypeLikeSchema = {
      parse: (_data: unknown) => {
        const err = new Error('Validation failed');
        (err as Record<string, unknown>)['issues'] = [
          {
            message: 'Must be greater than 0',
            path: ['inventory', 'warehouseA', 'stock', 3],
          },
        ];
        throw err;
      },
    };

    try {
      await validateWithSchema(arkTypeLikeSchema, {}, '{}');
      expect.unreachable('Should throw AIValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(AIValidationError);
      const valErr = err as AIValidationError;
      expect(valErr.issues[0]?.path).toEqual(['inventory', 'warehouseA', 'stock', 3]);
      expect(valErr.issues[0]?.message).toBe('Must be greater than 0');
      expect(valErr.message).toContain(
        '[inventory.warehouseA.stock.3] Must be greater than 0',
      );
    }
  });

  // 3.5 Custom validator function returning { success: false, issues: [...] }
  it('verifies exact breadcrumbs with custom validator returning failure object with issues', async () => {
    const customValidator = (_val: unknown) => ({
      success: false,
      issues: [
        {
          message: 'Permission denied for role',
          path: ['account', 'roles', 0, 'permissions', 'write'],
        },
      ],
    });

    try {
      await validateWithSchema(customValidator, {}, '{}');
      expect.unreachable('Should throw AIValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(AIValidationError);
      const valErr = err as AIValidationError;
      expect(valErr.issues[0]?.path).toEqual([
        'account',
        'roles',
        0,
        'permissions',
        'write',
      ]);
      expect(valErr.message).toContain(
        '[account.roles.0.permissions.write] Permission denied for role',
      );
    }
  });

  // 3.6 Multi-issue validation reporting across different branches
  it('preserves and aggregates multiple simultaneous validation issues across separate branches', async () => {
    const multiIssueSchema = createStandardSchema((_val) => {
      return {
        issues: [
          { message: 'Invalid name', path: ['header', 'title'] },
          { message: 'Invalid status', path: ['metadata', 'status'] },
          { message: 'Missing price', path: ['items', 0, 'price'] },
          { message: 'Negative quantity', path: ['items', 1, 'quantity'] },
        ],
      };
    });

    try {
      await validateWithSchema(multiIssueSchema, { raw: true }, '{"raw": true}');
      expect.unreachable('Should throw AIValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(AIValidationError);
      const valErr = err as AIValidationError;
      expect(valErr.issues).toHaveLength(4);
      expect(valErr.issues[0]?.path).toEqual(['header', 'title']);
      expect(valErr.issues[1]?.path).toEqual(['metadata', 'status']);
      expect(valErr.issues[2]?.path).toEqual(['items', 0, 'price']);
      expect(valErr.issues[3]?.path).toEqual(['items', 1, 'quantity']);

      expect(valErr.message).toContain('[header.title] Invalid name');
      expect(valErr.message).toContain('[metadata.status] Invalid status');
      expect(valErr.message).toContain('[items.0.price] Missing price');
      expect(valErr.message).toContain('[items.1.quantity] Negative quantity');
    }
  });
});

describe('Empirical Challenge 4: Tool-Call and Chunked Streaming Boundaries', () => {
  const testSchema = createStandardSchema<{ name: string; score: number }>((val) => {
    const r = val as Record<string, any>;
    if (typeof r?.name !== 'string' || typeof r?.score !== 'number') {
      return { issues: [{ message: 'Expected name and score' }] };
    }
    return { value: { name: r.name, score: r.score } };
  });

  it('handles model output delivered exclusively via toolCallArguments chunks', async () => {
    const model = createMockModel([
      {
        type: 'tool-call',
        toolCall: { id: 'tc-1', name: 'submit_data', arguments: '{"name": "Alice", ' },
      },
      {
        type: 'tool-call',
        toolCall: { id: 'tc-1', name: 'submit_data', arguments: '"score": 98}' },
      },
      { type: 'finish', finishReason: 'tool_calls' },
    ]);

    const result = await generateObject({
      model,
      schema: testSchema,
      prompt: 'Execute tool call with structured data',
    });

    expect(result.object).toEqual({ name: 'Alice', score: 98 });
    expect(result.rawText).toBe('{"name": "Alice", "score": 98}');
    expect(result.finishReason).toBe('tool_calls');
  });

  it('handles micro-chunk streaming (1-char chunks) across code block fences and JSON payload', async () => {
    const fullPayload = '```json\n{"name": "StreamingChar", "score": 100}\n```';
    const singleCharChunks: AIChunk[] = fullPayload.split('').map((char) => ({
      type: 'text',
      text: char,
    }));
    singleCharChunks.push({ type: 'finish', finishReason: 'stop' });

    const model = createMockModel(singleCharChunks);

    const result = await generateObject({
      model,
      schema: testSchema,
      prompt: 'Stream character by character',
    });

    expect(result.object).toEqual({ name: 'StreamingChar', score: 100 });
  });

  it('recovers when a non-JSON code block precedes the valid JSON code block', () => {
    const raw = [
      'Here is the TypeScript interface for reference:',
      '```typescript',
      'export interface Metric { name: string; score: number; }',
      '```',
      'And here is the JSON data conforming to it:',
      '```json',
      '{"name": "MultiFenceTest", "score": 95}',
      '```',
      'Let me know if you need any other formats.',
    ].join('\n');

    const result = extractJsonFromText(raw);
    expect(result.parsed).toEqual({ name: 'MultiFenceTest', score: 95 });
  });

  it('handles JSON with leading Byte Order Mark (BOM)', () => {
    const raw = '\uFEFF{"name": "BOMTest", "score": 88}';
    const result = extractJsonFromText(raw);
    expect(result.parsed).toEqual({ name: 'BOMTest', score: 88 });
  });

  it('parses JSON with scientific notation, negative floats, and exponent numbers', () => {
    const raw = '{"count": -1.5e-3, "ratio": 1e6, "zero": -0}';
    const result = extractJsonFromText(raw);
    expect(result.parsed).toEqual({
      count: -0.0015,
      ratio: 1000000,
      zero: -0,
    });
  });

  it('survives large array stress extraction (1,000 objects)', async () => {
    const largeList = Array.from({ length: 1000 }, (_, idx) => ({
      id: `item-${idx}`,
      active: idx % 2 === 0,
    }));

    const listSchema = createStandardSchema<{ id: string; active: boolean }[]>((val) => {
      if (!Array.isArray(val)) {
        return { issues: [{ message: 'Expected array' }] };
      }
      return { value: val as { id: string; active: boolean }[] };
    });

    const model = createMockModel([
      { type: 'text', text: '```json\n' },
      { type: 'text', text: JSON.stringify(largeList) },
      { type: 'text', text: '\n```' },
      { type: 'finish', finishReason: 'stop' },
    ]);

    const result = await generateObject({
      model,
      schema: listSchema,
      prompt: 'Generate 1,000 items',
    });

    expect(result.object).toHaveLength(1000);
    expect(result.object[999]?.id).toBe('item-999');
    expect(result.object[999]?.active).toBe(false);
  });
});

