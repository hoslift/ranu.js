import type { RanuDiagnostic } from '@ranu/diagnostics';
import type { CompiledRoutePattern, CompiledRouteSegment } from '@ranu/router';
import type { StaticParamRecord, StaticParamValue } from '@ranu/core';

/**
 * Evaluated concrete static route path representation.
 */
export interface EvaluatedStaticPath {
  readonly pathname: string;
  readonly params: StaticParamRecord;
}

export interface EvaluateStaticRouteOptions {
  readonly routeId: string;
  readonly pathnameTemplate: string;
  readonly pattern: CompiledRoutePattern;
  readonly params: readonly string[];
  readonly renderMode?: ('server' | 'static' | 'client') | undefined;
  readonly generatorFn?: (() => unknown) | undefined;
  readonly filePath?: string | undefined;
}

export interface EvaluateStaticRouteResult {
  readonly isStatic: boolean;
  readonly paths: readonly EvaluatedStaticPath[];
  readonly diagnostics: readonly RanuDiagnostic[];
}

/**
 * Disallowed prototype pollution and reserved parameter property keys.
 */
const FORBIDDEN_PARAM_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Validates whether a single logical route segment value contains path traversal or invalid characters.
 */
export function isUnsafeSegmentValue(val: string): boolean {
  if (typeof val !== 'string' || val.length === 0) return true;
  // Reject relative traversal markers
  if (val === '.' || val === '..') return true;
  // Reject embedded slashes, backslashes, or null bytes
  if (val.includes('/') || val.includes('\\') || val.includes('\0')) return true;
  // Reject Windows drive-letter patterns (e.g. "C:")
  if (/^[a-zA-Z]:/.test(val)) return true;
  return false;
}

/**
 * Evaluates and strictly validates static route parameters and expands concrete public pathnames.
 * Pure analysis engine: performs zero filesystem operations and zero React rendering.
 */
export async function evaluateStaticRoute(
  options: EvaluateStaticRouteOptions
): Promise<EvaluateStaticRouteResult> {
  const {
    routeId,
    pathnameTemplate,
    pattern,
    params: expectedParamNames,
    renderMode = 'server',
    generatorFn,
    filePath,
  } = options;

  const diagnostics: RanuDiagnostic[] = [];

  // 1. Non-static routes are not evaluated for SSG
  if (renderMode !== 'static') {
    return {
      isStatic: false,
      paths: [],
      diagnostics,
    };
  }

  // 2. Literal static routes (no dynamic segments)
  if (expectedParamNames.length === 0) {
    const canonicalPath = pathnameTemplate || '/';
    return {
      isStatic: true,
      paths: [
        {
          pathname: canonicalPath,
          params: Object.freeze({}),
        },
      ],
      diagnostics,
    };
  }

  // 3. Dynamic static routes require a valid generateStaticParams() export
  if (typeof generatorFn !== 'function') {
    diagnostics.push({
      code: 'RANU_SSG_MISSING_GENERATOR',
      severity: 'error',
      message: `Dynamic static route "${routeId}" is marked render = 'static' but is missing the required generateStaticParams() export.`,
      ...(filePath ? { location: { file: filePath } } : {}),
    });
    return {
      isStatic: true,
      paths: [],
      diagnostics,
    };
  }

  // 4. Execute the generator function
  let rawResult: unknown;
  try {
    rawResult = await generatorFn();
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    diagnostics.push({
      code: 'RANU_SSG_GENERATOR_FAILED',
      severity: 'error',
      message: `generateStaticParams() failed for route "${routeId}": ${errorMsg}`,
      ...(filePath ? { location: { file: filePath } } : {}),
    });
    return {
      isStatic: true,
      paths: [],
      diagnostics,
    };
  }

  // 5. Validate that return is an Array
  if (!Array.isArray(rawResult)) {
    diagnostics.push({
      code: 'RANU_SSG_INVALID_RETURN',
      severity: 'error',
      message: `generateStaticParams() for route "${routeId}" must return an Array of parameter objects.`,
      ...(filePath ? { location: { file: filePath } } : {}),
    });
    return {
      isStatic: true,
      paths: [],
      diagnostics,
    };
  }

  // Empty generator result is valid and produces 0 concrete paths
  if (rawResult.length === 0) {
    return {
      isStatic: true,
      paths: [],
      diagnostics,
    };
  }

  const expectedKeySet = new Set(expectedParamNames);
  const seenPathnames = new Set<string>();
  const evaluatedPaths: EvaluatedStaticPath[] = [];

  // 6. Validate and expand each parameter record
  for (let idx = 0; idx < rawResult.length; idx++) {
    const item: unknown = rawResult[idx];

    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      diagnostics.push({
        code: 'RANU_SSG_INVALID_PARAM_RECORD',
        severity: 'error',
        message: `generateStaticParams() for route "${routeId}" returned invalid item at index ${idx}. Expected an object record.`,
        ...(filePath ? { location: { file: filePath } } : {}),
      });
      continue;
    }

    const record = item as Record<string, unknown>;
    const recordKeys = Object.keys(record);

    // Check for prototype pollution or forbidden keys
    let hasForbiddenKey = false;
    for (const key of recordKeys) {
      if (FORBIDDEN_PARAM_KEYS.has(key)) {
        diagnostics.push({
          code: 'RANU_SSG_FORBIDDEN_PARAM_KEY',
          severity: 'error',
          message: `generateStaticParams() for route "${routeId}" at index ${idx} contains forbidden parameter key "${key}".`,
          ...(filePath ? { location: { file: filePath } } : {}),
        });
        hasForbiddenKey = true;
      }
    }
    if (hasForbiddenKey) continue;

    // Verify parameter key completeness and correctness
    let keysMatch = true;
    for (const expectedKey of expectedParamNames) {
      if (!(expectedKey in record)) {
        diagnostics.push({
          code: 'RANU_SSG_PARAM_KEY_MISMATCH',
          severity: 'error',
          message: `generateStaticParams() for route "${routeId}" at index ${idx} is missing required parameter key "${expectedKey}".`,
          ...(filePath ? { location: { file: filePath } } : {}),
        });
        keysMatch = false;
      }
    }

    for (const actualKey of recordKeys) {
      if (!expectedKeySet.has(actualKey)) {
        diagnostics.push({
          code: 'RANU_SSG_PARAM_KEY_MISMATCH',
          severity: 'error',
          message: `generateStaticParams() for route "${routeId}" at index ${idx} contains unexpected parameter key "${actualKey}".`,
          ...(filePath ? { location: { file: filePath } } : {}),
        });
        keysMatch = false;
      }
    }

    if (!keysMatch) continue;

    // Validate parameter values against route pattern segment types
    let itemValid = true;
    const validatedParams: Record<string, StaticParamValue> = {};
    const concreteSegments: string[] = [];

    for (const seg of pattern.segments) {
      if (seg.kind === 'static') {
        concreteSegments.push(encodeURIComponent(seg.value ?? ''));
      } else if (seg.kind === 'dynamic') {
        const paramName = seg.param ?? '';
        const val: unknown = record[paramName];

        if (typeof val !== 'string') {
          diagnostics.push({
            code: 'RANU_SSG_INVALID_PARAM_VALUE',
            severity: 'error',
            message: `generateStaticParams() for route "${routeId}" at index ${idx} expected string for dynamic segment "${paramName}", but received ${typeof val}.`,
            ...(filePath ? { location: { file: filePath } } : {}),
          });
          itemValid = false;
          break;
        }

        if (isUnsafeSegmentValue(val)) {
          diagnostics.push({
            code: 'RANU_SSG_UNSAFE_PARAM_VALUE',
            severity: 'error',
            message: `generateStaticParams() for route "${routeId}" at index ${idx} contains unsafe or path-traversing dynamic segment value "${val}" for "${paramName}".`,
            ...(filePath ? { location: { file: filePath } } : {}),
          });
          itemValid = false;
          break;
        }

        validatedParams[paramName] = val;
        concreteSegments.push(encodeURIComponent(val));
      } else if (seg.kind === 'catch-all') {
        const paramName = seg.param ?? '';
        const val: unknown = record[paramName];

        if (!Array.isArray(val)) {
          diagnostics.push({
            code: 'RANU_SSG_INVALID_PARAM_VALUE',
            severity: 'error',
            message: `generateStaticParams() for route "${routeId}" at index ${idx} expected string array for catch-all segment "${paramName}", but received ${typeof val}.`,
            ...(filePath ? { location: { file: filePath } } : {}),
          });
          itemValid = false;
          break;
        }

        if (val.length === 0) {
          diagnostics.push({
            code: 'RANU_SSG_CATCH_ALL_EMPTY',
            severity: 'error',
            message: `generateStaticParams() for route "${routeId}" at index ${idx} received empty array for required catch-all segment "${paramName}". Required catch-all must have at least one segment.`,
            ...(filePath ? { location: { file: filePath } } : {}),
          });
          itemValid = false;
          break;
        }

        const validParts: string[] = [];
        for (const part of val) {
          if (typeof part !== 'string' || isUnsafeSegmentValue(part)) {
            diagnostics.push({
              code: 'RANU_SSG_UNSAFE_PARAM_VALUE',
              severity: 'error',
              message: `generateStaticParams() for route "${routeId}" at index ${idx} contains non-string or unsafe catch-all segment value "${String(part)}" in "${paramName}".`,
              ...(filePath ? { location: { file: filePath } } : {}),
            });
            itemValid = false;
            break;
          }
          validParts.push(part);
          concreteSegments.push(encodeURIComponent(part));
        }

        if (!itemValid) break;
        validatedParams[paramName] = Object.freeze(validParts);
      } else if (seg.kind === 'optional-catch-all') {
        const paramName = seg.param ?? '';
        const val: unknown = record[paramName];

        if (!Array.isArray(val)) {
          diagnostics.push({
            code: 'RANU_SSG_INVALID_PARAM_VALUE',
            severity: 'error',
            message: `generateStaticParams() for route "${routeId}" at index ${idx} expected string array for optional catch-all segment "${paramName}", but received ${typeof val}.`,
            ...(filePath ? { location: { file: filePath } } : {}),
          });
          itemValid = false;
          break;
        }

        const validParts: string[] = [];
        for (const part of val) {
          if (typeof part !== 'string' || isUnsafeSegmentValue(part)) {
            diagnostics.push({
              code: 'RANU_SSG_UNSAFE_PARAM_VALUE',
              severity: 'error',
              message: `generateStaticParams() for route "${routeId}" at index ${idx} contains non-string or unsafe optional catch-all segment value "${String(part)}" in "${paramName}".`,
              ...(filePath ? { location: { file: filePath } } : {}),
            });
            itemValid = false;
            break;
          }
          validParts.push(part);
          concreteSegments.push(encodeURIComponent(part));
        }

        if (!itemValid) break;
        validatedParams[paramName] = Object.freeze(validParts);
      }
    }

    if (!itemValid) continue;

    // Assemble canonical concrete public pathname
    const assembledPath = '/' + concreteSegments.filter(Boolean).join('/');
    const canonicalPathname = assembledPath === '' ? '/' : assembledPath;

    // Check duplicate concrete pathnames
    if (seenPathnames.has(canonicalPathname)) {
      diagnostics.push({
        code: 'RANU_SSG_DUPLICATE_PATH',
        severity: 'error',
        message: `Duplicate concrete pathname "${canonicalPathname}" produced by generateStaticParams() for route "${routeId}".`,
        ...(filePath ? { location: { file: filePath } } : {}),
      });
      continue;
    }

    seenPathnames.add(canonicalPathname);
    evaluatedPaths.push({
      pathname: canonicalPathname,
      params: Object.freeze(validatedParams),
    });
  }

  // Deterministically sort concrete evaluated paths alphabetically by pathname
  evaluatedPaths.sort((a, b) => a.pathname.localeCompare(b.pathname));

  return {
    isStatic: true,
    paths: evaluatedPaths,
    diagnostics,
  };
}
