import type { RanuDiagnostic } from '@ranu/diagnostics';
import type { RouteKind } from '@ranu/core';
import type { RuntimeConfig } from './types.js';

export function classifyError(error: unknown): RanuDiagnostic {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  
  const diagnostic: RanuDiagnostic = {
    code: 'RANU_RUNTIME_EXECUTION_ERROR',
    severity: 'error',
    message,
  };
  if (stack !== undefined) {
    diagnostic.hint = stack;
  }
  return diagnostic;
}

export function sanitizeErrorResponse(
  error: unknown,
  requestId: string,
  config: RuntimeConfig,
  routeKind?: RouteKind
): Response {
  if (config.mode === 'development') {
    const diagnostic = classifyError(error);
    const detail = {
      code: diagnostic.code,
      message: diagnostic.message,
      stack: diagnostic.hint,
      requestId,
      routeKind,
    };
    if (routeKind === 'api') {
      return new Response(JSON.stringify(detail, null, 2), {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    } else {
      const html = `<!DOCTYPE html>
<html>
<head>
  <title>Development Error</title>
  <style>
    body { font-family: monospace; padding: 2rem; background: #fafafa; color: #333; }
    h1 { color: #d32f2f; }
    pre { background: #f0f0f0; padding: 1rem; border-radius: 4px; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>Development Error [${detail.code}]</h1>
  <p><strong>Request ID:</strong> ${detail.requestId}</p>
  <p><strong>Message:</strong> ${detail.message}</p>
  ${detail.stack ? `<pre>${detail.stack}</pre>` : ''}
</body>
</html>`;
      return new Response(html, {
        status: 500,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
  }

  // Production: sanitize error response
  if (routeKind === 'api') {
    const payload = {
      error: 'Internal Server Error',
      requestId,
    };
    return new Response(JSON.stringify(payload), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  } else {
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Internal Server Error</title>
  <style>
    body { font-family: sans-serif; text-align: center; padding: 20% 10%; color: #555; }
    h1 { font-size: 2rem; color: #333; }
  </style>
</head>
<body>
  <h1>Internal Server Error</h1>
  <p>An unexpected error occurred on the server.</p>
  <p>Reference ID: <code>${requestId}</code></p>
</body>
</html>`;
    return new Response(html, {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}
