/**
 * HTML character escaping map to prevent XSS in SSR metadata and head tags.
 */
const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Safely escapes a string for HTML text and attribute contexts.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPE_MAP[char] ?? char);
}

/**
 * Sanitized error presentation shape.
 */
export interface SanitizedErrorInfo {
  readonly message: string;
  readonly stack?: string | undefined;
  readonly requestId?: string | undefined;
}

/**
 * Sanitizes an error for SSR presentation according to framework mode.
 * In production: suppresses file paths, database errors, and stack traces.
 * In development: retains full diagnostic message and stack trace.
 */
export function sanitizeRenderError(
  error: unknown,
  mode: 'development' | 'production' = 'production',
  requestId?: string,
): SanitizedErrorInfo {
  if (mode === 'development') {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    return {
      message: message || 'Render Error',
      ...(stack !== undefined ? { stack } : {}),
      ...(requestId !== undefined ? { requestId } : {}),
    };
  }

  // Production mode: generic and safe
  return {
    message: 'Internal Server Error',
    ...(requestId !== undefined ? { requestId } : {}),
  };
}
