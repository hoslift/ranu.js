import type { RanuHydrationPayload, RouteClientAssets } from '../types.js';

/**
 * Canonical script element identifier for Ranu.js client hydration data.
 */
export const HYDRATION_DATA_SCRIPT_ID = '__ranu_data__';

/**
 * Canonical MIME type for the inert JSON hydration script element.
 */
export const HYDRATION_DATA_SCRIPT_TYPE = 'application/json';

/**
 * Forbidden prototype pollution keys.
 */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Checks if a value is a plain object with a safe prototype.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Checks for unsupported non-serializable values (functions, symbols, bigint, cyclic structures).
 */
function validateSerializableValue(value: unknown, seen = new WeakSet<object>()): void {
  if (value === null || value === undefined) {
    return;
  }

  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') {
    return;
  }

  if (type === 'function' || type === 'symbol' || type === 'bigint') {
    throw new TypeError(`Cannot serialize non-JSON type "${type}" into hydration payload.`);
  }

  if (type === 'object') {
    const obj = value as object;
    if (seen.has(obj)) {
      throw new TypeError('Cannot serialize cyclic structure into hydration payload.');
    }
    seen.add(obj);

    if (Array.isArray(value)) {
      for (const item of value) {
        validateSerializableValue(item, seen);
      }
      return;
    }

    if (!isPlainObject(value)) {
      throw new TypeError(
        `Cannot serialize class instance or non-plain object "${obj.constructor?.name ?? 'Unknown'}" into hydration payload.`,
      );
    }

    for (const key of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(key)) {
        throw new TypeError(
          `Cannot serialize object with forbidden prototype pollution key "${key}".`,
        );
      }
      validateSerializableValue((value as Record<string, unknown>)[key], seen);
    }
  }
}

/**
 * Escapes characters that could break out of a `<script type="application/json">` block.
 * Protects against `</script>`, `<!--`, `<script>`, and JS line/paragraph separators.
 */
export function escapeScriptJson(jsonString: string): string {
  return jsonString
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Unescapes the JSON string produced by escapeScriptJson before JSON parsing.
 */
export function unescapeScriptJson(escapedJson: string): string {
  return escapedJson
    .replace(/\\u003c/g, '<')
    .replace(/\\u003e/g, '>')
    .replace(/\\u0026/g, '&')
    .replace(/\\u2028/g, '\u2028')
    .replace(/\\u2029/g, '\u2029');
}

/**
 * Validates the exact structural schema of a RanuHydrationPayload object.
 * Throws a deterministic TypeError or Error on invalid shape.
 */
export function validateHydrationPayload(input: unknown): RanuHydrationPayload {
  if (!isPlainObject(input)) {
    throw new TypeError('Hydration payload must be a non-null plain object.');
  }

  const { buildId, routeId, pathname, params, searchParams, publicEnv, assets, renderMode } = input;

  if (typeof buildId !== 'string' || buildId.trim().length === 0) {
    throw new TypeError('Hydration payload "buildId" must be a non-empty string.');
  }

  if (typeof routeId !== 'string' || routeId.trim().length === 0) {
    throw new TypeError('Hydration payload "routeId" must be a non-empty string.');
  }

  if (typeof pathname !== 'string' || !pathname.startsWith('/')) {
    throw new TypeError(
      'Hydration payload "pathname" must be a valid absolute pathname starting with "/".',
    );
  }

  if (!isPlainObject(params)) {
    throw new TypeError('Hydration payload "params" must be a plain object.');
  }
  for (const [k, v] of Object.entries(params)) {
    if (FORBIDDEN_KEYS.has(k)) {
      throw new TypeError(`Forbidden key "${k}" detected in params.`);
    }
    if (typeof v === 'string') {
      continue;
    }
    if (Array.isArray(v) && v.every((item) => typeof item === 'string')) {
      continue;
    }
    throw new TypeError(`Hydration payload param "${k}" must be a string or array of strings.`);
  }

  if (!isPlainObject(searchParams)) {
    throw new TypeError('Hydration payload "searchParams" must be a plain object.');
  }
  for (const [k, v] of Object.entries(searchParams)) {
    if (FORBIDDEN_KEYS.has(k)) {
      throw new TypeError(`Forbidden key "${k}" detected in searchParams.`);
    }
    if (v === undefined || typeof v === 'string') {
      continue;
    }
    if (Array.isArray(v) && v.every((item) => typeof item === 'string')) {
      continue;
    }
    throw new TypeError(
      `Hydration payload searchParam "${k}" must be a string, array of strings, or undefined.`,
    );
  }

  if (!isPlainObject(publicEnv)) {
    throw new TypeError('Hydration payload "publicEnv" must be a plain object.');
  }
  for (const [k, v] of Object.entries(publicEnv)) {
    if (FORBIDDEN_KEYS.has(k)) {
      throw new TypeError(`Forbidden key "${k}" detected in publicEnv.`);
    }
    if (typeof v !== 'string') {
      throw new TypeError(`Hydration payload publicEnv "${k}" must be a string.`);
    }
  }

  if (!isPlainObject(assets)) {
    throw new TypeError('Hydration payload "assets" must be a plain object.');
  }
  const rawAssets = assets as Record<string, unknown>;
  if (!Array.isArray(rawAssets.js) || !rawAssets.js.every((item) => typeof item === 'string')) {
    throw new TypeError('Hydration payload "assets.js" must be an array of string paths.');
  }
  if (!Array.isArray(rawAssets.css) || !rawAssets.css.every((item) => typeof item === 'string')) {
    throw new TypeError('Hydration payload "assets.css" must be an array of string paths.');
  }

  if (
    renderMode !== undefined &&
    renderMode !== 'server' &&
    renderMode !== 'static' &&
    renderMode !== 'client'
  ) {
    throw new TypeError(
      'Hydration payload "renderMode" must be "server", "static", or "client" when provided.',
    );
  }

  const validatedAssets: RouteClientAssets = {
    js: Object.freeze([...rawAssets.js]),
    css: Object.freeze([...rawAssets.css]),
  };

  return {
    buildId,
    routeId,
    pathname,
    params: Object.freeze({ ...params } as Record<string, string | readonly string[]>),
    searchParams: Object.freeze({ ...searchParams } as Record<
      string,
      string | readonly string[] | undefined
    >),
    publicEnv: Object.freeze({ ...publicEnv } as Record<string, string>),
    assets: validatedAssets,
    ...(renderMode !== undefined ? { renderMode } : {}),
  };
}

/**
 * Serializes a RanuHydrationPayload into an XSS-safe JSON string ready for script embedding.
 */
export function serializeHydrationData(payload: RanuHydrationPayload): string {
  const validated = validateHydrationPayload(payload);
  validateSerializableValue(validated);
  const rawJson = JSON.stringify(validated);
  return escapeScriptJson(rawJson);
}

/**
 * Deserializes and strictly validates a raw hydration JSON string from the document script element.
 */
export function deserializeHydrationData(rawJson: string): RanuHydrationPayload {
  if (typeof rawJson !== 'string' || rawJson.trim().length === 0) {
    throw new TypeError('Cannot deserialize empty or non-string hydration data.');
  }

  const unescaped = unescapeScriptJson(rawJson);
  let parsed: unknown;
  try {
    parsed = JSON.parse(unescaped, (key, value) => {
      if (FORBIDDEN_KEYS.has(key)) {
        throw new TypeError(`Forbidden prototype pollution key "${key}" detected in payload.`);
      }
      return value;
    });
  } catch (err: unknown) {
    if (err instanceof TypeError) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse hydration JSON payload: ${msg}`);
  }

  return validateHydrationPayload(parsed);
}
