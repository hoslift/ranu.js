import type { RanuRequestContext } from '@ranu/runtime';
import type { FormActionResult, StandardSchemaIssue } from './types.js';
import { ServerActionRegistry, defaultActionRegistry } from './registry.js';
export { ServerActionRegistry, defaultActionRegistry };

const ACTION_ID_PATTERN = /^act_[a-f0-9]{16}$/;

function formDataToObject(formData: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = Object.create(null);
  formData.forEach((value, key) => {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const existing = obj[key];
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        obj[key] = [existing, value];
      }
    } else {
      obj[key] = value;
    }
  });
  return obj;
}

function normalizeValidationErrors(issues: readonly StandardSchemaIssue[]): {
  errors: Record<string, string[]>;
  formErrors: string[];
} {
  const errors: Record<string, string[]> = {};
  const formErrors: string[] = [];

  for (const issue of issues) {
    if (issue.path && issue.path.length > 0) {
      const field = String(issue.path[0]);
      if (!errors[field]) {
        errors[field] = [];
      }
      errors[field].push(issue.message);
    } else {
      formErrors.push(issue.message);
    }
  }

  return { errors, formErrors };
}

async function validatePayload(schema: any, rawData: unknown): Promise<{
  valid: boolean;
  data?: unknown;
  errors?: Record<string, string[]>;
  formErrors?: string[];
}> {
  if (!schema) {
    return { valid: true, data: rawData };
  }

  if (schema['~standard'] && typeof schema['~standard'].validate === 'function') {
    const result = await schema['~standard'].validate(rawData);
    if (result.issues && result.issues.length > 0) {
      const { errors, formErrors } = normalizeValidationErrors(result.issues);
      return { valid: false, errors, formErrors };
    }
    return { valid: true, data: result.value !== undefined ? result.value : rawData };
  }

  if (typeof schema.safeParse === 'function') {
    const result = schema.safeParse(rawData);
    if (!result.success) {
      const { errors, formErrors } = normalizeValidationErrors(
        result.error?.issues ?? [{ message: 'Validation failed' }],
      );
      return { valid: false, errors, formErrors };
    }
    return { valid: true, data: result.data };
  }

  if (typeof schema === 'function') {
    try {
      const data = await schema(rawData);
      return { valid: true, data };
    } catch (err: any) {
      return {
        valid: false,
        errors: {},
        formErrors: [err.message || 'Validation rejected'],
      };
    }
  }

  return { valid: true, data: rawData };
}

/**
 * Executes a server action request over HTTP POST.
 */
export async function executeServerAction(
  actionId: string,
  request: Request,
  context: RanuRequestContext,
  registry: ServerActionRegistry = defaultActionRegistry,
): Promise<Response> {
  // 1. Method verification
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: {
        Allow: 'POST',
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }

  // 2. Action ID format validation
  if (!ACTION_ID_PATTERN.test(actionId)) {
    const errorBody: FormActionResult<never> = {
      success: false,
      errors: {},
      formErrors: [`Invalid action ID format: "${actionId}"`],
    };
    return new Response(JSON.stringify(errorBody), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  // 3. Registry lookup (current build or N-1 grace table)
  const registration = registry.get(actionId);
  if (!registration) {
    const errorBody: FormActionResult<never> = {
      success: false,
      errors: {},
      formErrors: [`Server Action "${actionId}" not found`],
    };
    return new Response(JSON.stringify(errorBody), {
      status: 404,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  // 4. Payload extraction (FormData vs JSON)
  const contentType = request.headers.get('content-type') ?? '';
  let rawData: unknown = {};

  try {
    if (
      contentType.includes('multipart/form-data') ||
      contentType.includes('application/x-www-form-urlencoded')
    ) {
      const formData = await request.formData();
      rawData = formDataToObject(formData);
    } else if (contentType.includes('application/json')) {
      rawData = await request.json();
    }
  } catch (err: any) {
    const errorBody: FormActionResult<never> = {
      success: false,
      errors: {},
      formErrors: [err.message || 'Failed to parse request payload'],
    };
    return new Response(JSON.stringify(errorBody), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  // 5. Schema validation if defined
  const validation = await validatePayload(registration.schema, rawData);
  if (!validation.valid) {
    const errorBody: FormActionResult<never> = {
      success: false,
      errors: validation.errors ?? {},
      formErrors: validation.formErrors ?? ['Validation failed'],
    };
    return new Response(JSON.stringify(errorBody), {
      status: 422,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  // 6. Execute action handler inside active request context
  try {
    const actionInput = validation.data;
    const result = await registration.handler(actionInput, request);

    // 7. Check for streaming responses (AsyncIterable or ReadableStream)
    if (
      result != null &&
      (typeof (result as any)[Symbol.asyncIterator] === 'function' ||
        result instanceof ReadableStream)
    ) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const chunks: unknown[] = [];
            if (result instanceof ReadableStream) {
              const reader = result.getReader();
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                controller.enqueue(
                  encoder.encode(JSON.stringify({ type: 'chunk', value }) + '\n'),
                );
              }
            } else {
              for await (const chunk of result as AsyncIterable<unknown>) {
                chunks.push(chunk);
                controller.enqueue(
                  encoder.encode(JSON.stringify({ type: 'chunk', value: chunk }) + '\n'),
                );
              }
            }
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: 'result',
                  success: true,
                  data: chunks,
                }) + '\n',
              ),
            );
            controller.close();
          } catch (err: any) {
            // Mid-Stream Exception Frame (supports both flat and nested error formats)
            const code = err.code || 'ACTION_EXECUTION_ERROR';
            const message = err.message || 'Stream processing failed';
            const recoverable = Boolean(err.recoverable);
            const errorFrame = {
              $e: true,
              code,
              message,
              recoverable,
              error: {
                code,
                message,
                recoverable,
              },
            };
            controller.enqueue(encoder.encode(JSON.stringify(errorFrame) + '\n'));
            controller.close();
          }
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Transfer-Encoding': 'chunked',
        },
      });
    }

    // 8. Standard JSON response
    let responseBody: FormActionResult<unknown>;
    if (result && typeof result === 'object' && 'success' in result) {
      responseBody = result as FormActionResult<unknown>;
    } else {
      responseBody = {
        success: true,
        data: result,
      };
    }

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (err: any) {
    const errorBody: FormActionResult<never> = {
      success: false,
      errors: {},
      formErrors: [err.message || 'Internal action execution error'],
    };
    return new Response(JSON.stringify(errorBody), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}

/**
 * Creates an action dispatcher function for RanuServerRuntimeOptions.
 */
export function createActionDispatcher(
  registry: ServerActionRegistry = defaultActionRegistry,
): (actionId: string, request: Request, context: RanuRequestContext) => Promise<Response> {
  return (actionId: string, request: Request, context: RanuRequestContext) => {
    return executeServerAction(actionId, request, context, registry);
  };
}
