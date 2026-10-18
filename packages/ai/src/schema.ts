/**
 * Ranu.js Universal AI Structured Outputs Engine.
 *
 * Implements Standard Schema v1 specification (~standard), fallback support
 * for Zod/Valibot/ArkType schemas, robust JSON extraction from model outputs,
 * and strongly-typed structured object generation.
 */

import type {
  AIMessage,
  AIUsage,
  AIValidationIssue,
  GenerateObjectOptions,
  GenerateObjectResult,
  ParseSchema,
  SafeParseSchema,
  StandardSchemaV1,
  StandardSchemaV1Issue,
  SupportedSchema,
} from './types.js';

/**
 * Dedicated error thrown when model output fails schema validation.
 */
export class AIValidationError extends Error {
  readonly issues: readonly AIValidationIssue[];
  readonly rawInput: unknown;
  readonly rawText: string;

  constructor(
    message: string,
    issues: readonly AIValidationIssue[],
    rawInput: unknown,
    rawText: string,
  ) {
    super(message);
    this.name = 'AIValidationError';
    this.issues = issues;
    this.rawInput = rawInput;
    this.rawText = rawText;
    Object.setPrototypeOf(this, AIValidationError.prototype);
  }
}

/**
 * Type guard verifying if an unknown schema implements the Standard Schema v1 specification (~standard).
 */
export function isStandardSchema(schema: unknown): schema is StandardSchemaV1 {
  if (typeof schema !== 'object' || schema === null) {
    return false;
  }
  const std = (schema as Record<string, unknown>)['~standard'];
  if (typeof std !== 'object' || std === null) {
    return false;
  }
  const stdObj = std as Record<string, unknown>;
  return (
    stdObj['version'] === 1 &&
    typeof stdObj['vendor'] === 'string' &&
    typeof stdObj['validate'] === 'function'
  );
}

/**
 * Normalizes hierarchical issue path segments into property keys.
 */
function normalizePath(
  path?: readonly (string | number | symbol | { readonly key: string | number | symbol })[],
): (string | number | symbol)[] | undefined {
  if (!path || path.length === 0) {
    return undefined;
  }
  return path.map((segment) => {
    if (typeof segment === 'object' && segment !== null && 'key' in segment) {
      return (segment as { readonly key: string | number | symbol }).key;
    }
    return segment;
  });
}

/**
 * Extracts and parses JSON from raw model output, handling markdown code fences,
 * embedded objects/arrays, and reporting helpful syntax errors on malformed JSON.
 */
export function extractJsonFromText(rawText: string): { parsed: unknown; extractedText: string } {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new SyntaxError('Empty response received from AI model; expected JSON payload.');
  }

  // 1. Direct JSON parse
  try {
    return { parsed: JSON.parse(trimmed), extractedText: trimmed };
  } catch {
    // Continue with extraction strategies
  }

  // 2. Check for markdown code fences: ```json ... ``` or ``` ... ```
  const codeBlockRegex = /```(?:json|JSON)?\s*([\s\S]*?)\s*```/g;
  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = codeBlockRegex.exec(trimmed)) !== null) {
    const candidate = blockMatch[1]?.trim();
    if (candidate) {
      try {
        return { parsed: JSON.parse(candidate), extractedText: candidate };
      } catch {
        // Continue checking next fence if any
      }
    }
  }

  // 3. Extract JSON object substring between outermost { and }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1).trim();
    try {
      return { parsed: JSON.parse(candidate), extractedText: candidate };
    } catch {
      // Continue
    }
  }

  // 4. Extract JSON array substring between outermost [ and ]
  const firstBracket = trimmed.indexOf('[');
  const lastBracket = trimmed.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const candidate = trimmed.slice(firstBracket, lastBracket + 1).trim();
    try {
      return { parsed: JSON.parse(candidate), extractedText: candidate };
    } catch {
      // Continue
    }
  }

  // If a markdown code fence was detected but contained malformed JSON, provide specific error
  const singleFenceMatch = /```(?:json|JSON)?\s*([\s\S]*?)\s*```/.exec(trimmed);
  if (singleFenceMatch && singleFenceMatch[1]) {
    const candidate = singleFenceMatch[1].trim();
    try {
      JSON.parse(candidate);
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      throw new SyntaxError(`Malformed JSON inside code fence: ${msg}\nExtracted text:\n${candidate}`);
    }
  }

  // Default: attempt JSON.parse on trimmed to capture native syntax error
  try {
    JSON.parse(trimmed);
  } catch (parseErr) {
    const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
    throw new SyntaxError(`Malformed JSON in AI model response: ${msg}\nRaw model output:\n${trimmed}`);
  }

  throw new SyntaxError(`Unable to parse or extract valid JSON from AI model response:\n${trimmed}`);
}

/**
 * Validates parsed JSON against the given schema (Standard Schema v1, safeParse, parse, or validator function).
 * Throws AIValidationError on validation failure.
 */
export async function validateWithSchema<T>(
  schema: SupportedSchema<T>,
  parsedData: unknown,
  rawText: string,
): Promise<T> {
  // 1. Standard Schema v1
  if (isStandardSchema(schema)) {
    const result = await schema['~standard'].validate(parsedData);
    if (result.issues && result.issues.length > 0) {
      const issues: AIValidationIssue[] = result.issues.map((issue: StandardSchemaV1Issue) => {
        const path = normalizePath(issue.path);
        return {
          message: issue.message,
          ...(path ? { path } : {}),
        };
      });
      const summary = issues.map((i) => (i.path ? `[${i.path.join('.')}] ${i.message}` : i.message)).join('; ');
      throw new AIValidationError(
        `AI structured output failed schema validation (${schema['~standard'].vendor}): ${summary}`,
        issues,
        parsedData,
        rawText,
      );
    }
    return (result.value !== undefined ? result.value : parsedData) as T;
  }

  const schemaAny = schema as unknown as Record<string, unknown>;

  // 2. safeParse support (Zod, Valibot-like)
  if (typeof schemaAny['safeParse'] === 'function') {
    const parseResult = (schemaAny as unknown as SafeParseSchema<T>).safeParse(parsedData);
    const resolved = parseResult instanceof Promise ? await parseResult : parseResult;
    if (!resolved.success) {
      const rawIssues = resolved.error?.issues ?? [{ message: 'Validation failed' }];
      const issues: AIValidationIssue[] = rawIssues.map((i) => {
        const path = normalizePath(i.path);
        return {
          message: i.message,
          ...(path ? { path } : {}),
        };
      });
      const summary = issues.map((i) => (i.path ? `[${i.path.join('.')}] ${i.message}` : i.message)).join('; ');
      throw new AIValidationError(
        `AI structured output failed safeParse validation: ${summary}`,
        issues,
        parsedData,
        rawText,
      );
    }
    return resolved.data;
  }

  // 3. parse support (Zod, ArkType, Yup-like)
  if (typeof schemaAny['parse'] === 'function') {
    try {
      const parseResult = (schemaAny as unknown as ParseSchema<T>).parse(parsedData);
      const resolved = parseResult instanceof Promise ? await parseResult : parseResult;
      return resolved;
    } catch (err: unknown) {
      let issues: AIValidationIssue[];
      if (err && typeof err === 'object' && 'issues' in err && Array.isArray((err as Record<string, unknown>)['issues'])) {
        issues = ((err as Record<string, unknown>)['issues'] as Array<{ message?: string; path?: readonly (string | number | symbol)[] }>).map((i) => {
          const path = normalizePath(i.path);
          return {
            message: i.message || 'Validation error',
            ...(path ? { path } : {}),
          };
        });
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        issues = [{ message: msg }];
      }
      const summary = issues.map((i) => (i.path ? `[${i.path.join('.')}] ${i.message}` : i.message)).join('; ');
      throw new AIValidationError(
        `AI structured output failed parse validation: ${summary}`,
        issues,
        parsedData,
        rawText,
      );
    }
  }

  // 4. Custom validator function
  if (typeof schema === 'function') {
    try {
      const result = await (schema as (val: unknown) => Promise<T> | T)(parsedData);
      if (result === (false as unknown)) {
        throw new Error('Validation function returned false');
      }
      if (
        result &&
        typeof result === 'object' &&
        'success' in (result as Record<string, unknown>) &&
        (result as Record<string, unknown>)['success'] === false
      ) {
        const resObj = result as Record<string, unknown>;
        const rawIssues = Array.isArray(resObj['issues'])
          ? (resObj['issues'] as Array<{ message?: string; path?: readonly (string | number | symbol)[] }>)
          : [{ message: 'Validation failed' }];
        const issues: AIValidationIssue[] = rawIssues.map((i) => ({
          message: i.message || 'Validation failed',
          ...(i.path ? { path: normalizePath(i.path) } : {}),
        }));
        const summary = issues.map((i) => (i.path ? `[${i.path.join('.')}] ${i.message}` : i.message)).join('; ');
        throw new AIValidationError(
          `AI structured output failed custom validation: ${summary}`,
          issues,
          parsedData,
          rawText,
        );
      }
      return (result !== undefined ? result : parsedData) as T;
    } catch (err: unknown) {
      if (err instanceof AIValidationError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      const issues: AIValidationIssue[] = [{ message: msg }];
      throw new AIValidationError(
        `AI structured output failed custom validation: ${msg}`,
        issues,
        parsedData,
        rawText,
      );
    }
  }

  // 5. Fallback if no validation rules apply
  return parsedData as T;
}

/**
 * Builds prompt and message augmentation enforcing strict JSON without conversational padding.
 */
function buildPromptAugmentation(options: GenerateObjectOptions<unknown>): {
  messages: AIMessage[];
  prompt?: string | undefined;
} {
  const instructions: string[] = [
    'You are a strict JSON generator. Your response must be valid, well-formed JSON conforming strictly to the requested schema.',
    'CRITICAL INSTRUCTIONS:',
    '1. Output valid JSON only.',
    '2. Do NOT include conversational commentary, explanations, reasoning, or markdown text outside the JSON.',
    '3. Ensure all property names and string values are enclosed in double quotes.',
  ];

  if (options.schemaName) {
    instructions.push(`4. Target Schema: ${options.schemaName}`);
  }

  if (options.schemaDescription) {
    instructions.push(`5. Schema Constraints:\n${options.schemaDescription}`);
  }

  const systemInstruction = instructions.join('\n');

  if (options.messages && options.messages.length > 0) {
    const updatedMessages: AIMessage[] = [];
    let systemFound = false;

    for (const msg of options.messages) {
      if (msg.role === 'system' && !systemFound) {
        systemFound = true;
        const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        updatedMessages.push({
          ...msg,
          content: `${text}\n\n${systemInstruction}`,
        });
      } else {
        updatedMessages.push(msg);
      }
    }

    if (!systemFound) {
      updatedMessages.unshift({
        role: 'system',
        content: systemInstruction,
      });
    }

    return {
      messages: updatedMessages,
      prompt: options.prompt ? `${options.prompt}\n\n[Instruction: Return strict JSON only]` : undefined,
    };
  }

  const promptText = options.prompt ?? '';
  return {
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: `${promptText}\n\n[Instruction: Return strict JSON only]` },
    ],
    prompt: `${promptText}\n\n${systemInstruction}`,
  };
}

/**
 * Generates a strongly typed structured object using an AI model instance,
 * formatting the prompt for strict JSON, extracting JSON from the response
 * (handling markdown code fences and conversational padding), and validating
 * against the provided schema (Standard Schema v1, Zod/Valibot, or custom function).
 *
 * @throws {AIValidationError} if the extracted JSON fails schema validation.
 * @throws {SyntaxError} if model output contains malformed JSON.
 * @throws {Error} if the operation was aborted or model execution failed.
 */
export async function generateObject<T>(
  options: GenerateObjectOptions<T>,
): Promise<GenerateObjectResult<T>> {
  const signal = options.signal;
  if (signal?.aborted) {
    throw signal.reason ?? new Error('The operation was aborted');
  }

  if (!options.schema) {
    throw new TypeError('A valid schema must be provided to generateObject()');
  }

  const { messages, prompt } = buildPromptAugmentation(options);

  const stream = await options.model.doStream({
    ...options,
    prompt,
    messages,
    signal,
    schema: options.schema,
  });

  const reader = stream.getReader();
  let rawText = '';
  let toolCallArguments = '';
  let finishReason: string | undefined;
  let usage: AIUsage | undefined;

  let onAbort: (() => void) | undefined;
  const abortPromise = new Promise<never>((_, reject) => {
    if (signal) {
      onAbort = () => {
        const reason = signal.reason;
        const abortErr =
          reason instanceof Error
            ? reason
            : new Error(reason !== undefined ? String(reason) : 'The operation was aborted');
        reject(abortErr);
      };
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel(signal.reason).catch(() => {});
        throw signal.reason ?? new Error('The operation was aborted');
      }

      const readPromise = reader.read();
      const { done, value } = signal
        ? await Promise.race([readPromise, abortPromise])
        : await readPromise;

      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      if (value.type === 'text') {
        rawText += value.text;
      } else if (value.type === 'tool-call') {
        if (value.toolCall?.arguments) {
          toolCallArguments += value.toolCall.arguments;
        }
      } else if (value.type === 'finish') {
        if (value.finishReason !== undefined) {
          if (!finishReason || (finishReason === 'stop' && value.finishReason !== 'stop') || value.finishReason !== 'stop') {
            finishReason = value.finishReason;
          }
        }
        if (value.usage !== undefined) {
          usage = { ...usage, ...value.usage };
        }
      } else if (value.type === 'error') {
        const err = value.error instanceof Error ? value.error : new Error(String(value.error));
        throw err;
      }
    }
  } finally {
    if (signal && onAbort) {
      signal.removeEventListener('abort', onAbort);
    }
    try {
      reader.releaseLock();
    } catch {
      // Ignore if already released
    }
  }

  const candidateText = rawText.trim() ? rawText : toolCallArguments;

  // Extract and parse JSON
  const { parsed } = extractJsonFromText(candidateText);

  // Validate against schema
  const validated = await validateWithSchema(options.schema, parsed, candidateText);

  return {
    object: validated,
    rawText: candidateText,
    usage,
    finishReason,
  };
}
