import type {
  FormAction,
  FormActionOptions,
  FormActionResult,
  StandardSchemaIssue,
} from './types.js';

function formDataToObject(formData: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  formData.forEach((value, key) => {
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

async function extractRawData(
  input: FormData | Request | Record<string, unknown>,
): Promise<{ data: unknown; request?: Request }> {
  if (typeof Request !== 'undefined' && input instanceof Request) {
    const contentType = input.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const json = await input.json();
      return { data: json, request: input };
    }
    const formData = await input.formData();
    return { data: formDataToObject(formData), request: input };
  }

  if (typeof FormData !== 'undefined' && input instanceof FormData) {
    return { data: formDataToObject(input) };
  }

  return { data: input };
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

/**
 * Creates a type-safe form and server action supporting Standard Schema (Zod/Valibot/ArkType).
 */
export function createFormAction<TInput, TOutput>(
  options: FormActionOptions<TInput, TOutput>,
): FormAction<TInput, TOutput> {
  const action = (async (
    input: FormData | Request | Record<string, unknown>,
  ): Promise<FormActionResult<TOutput>> => {
    let rawData: unknown;
    let request: Request | undefined;

    try {
      const extracted = await extractRawData(input);
      rawData = extracted.data;
      request = extracted.request;
    } catch (err: any) {
      return {
        success: false,
        errors: {},
        formErrors: [err.message || 'Failed to parse form input payload'],
      };
    }

    let validatedData: TInput = rawData as TInput;

    if (options.schema) {
      const schemaAny = options.schema as any;

      if (schemaAny['~standard'] && typeof schemaAny['~standard'].validate === 'function') {
        const result = await schemaAny['~standard'].validate(rawData);
        if (result.issues && result.issues.length > 0) {
          const { errors, formErrors } = normalizeValidationErrors(result.issues);
          return {
            success: false,
            errors,
            formErrors,
          };
        }
        validatedData = (result.value !== undefined ? result.value : rawData) as TInput;
      } else if (typeof schemaAny.safeParse === 'function') {
        const result = schemaAny.safeParse(rawData);
        if (!result.success) {
          const { errors, formErrors } = normalizeValidationErrors(
            result.error?.issues ?? [{ message: 'Validation failed' }],
          );
          return {
            success: false,
            errors,
            formErrors,
          };
        }
        validatedData = result.data;
      } else if (typeof options.schema === 'function') {
        try {
          validatedData = await (options.schema as Function)(rawData);
        } catch (err: any) {
          return {
            success: false,
            errors: {},
            formErrors: [err.message || 'Validation rejected'],
          };
        }
      }
    }

    try {
      const data = await options.handler(validatedData, request);
      return {
        success: true,
        data,
      };
    } catch (err: any) {
      return {
        success: false,
        errors: {},
        formErrors: [err.message || 'Action handler failed'],
      };
    }
  }) as FormAction<TInput, TOutput>;

  action.raw = async (data: TInput, request?: Request): Promise<TOutput> => {
    return options.handler(data, request);
  };

  return action;
}
