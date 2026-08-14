/**
 * @ranu/diagnostics
 *
 * Diagnostic codes, data structures, and formatting.
 * Internal package — not public application API.
 */

/** Diagnostic severity levels */
export type DiagnosticSeverity = 'error' | 'warning';

/** Source location for a diagnostic */
export interface SourceLocation {
  file: string;
  line?: number;
  column?: number;
}

/** A Ranu.js diagnostic message */
export interface RanuDiagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  location?: SourceLocation;
  routeId?: string;
  importChain?: string[];
  hint?: string;
}

/**
 * Format a diagnostic for console output.
 * Produces a clear, indented layout indicating code, severity, location,
 * import path, and potential user hints.
 */
export function formatDiagnostic(diagnostic: RanuDiagnostic): string {
  const parts: string[] = [];
  
  // Format location prefix if present
  if (diagnostic.location?.file) {
    let loc = diagnostic.location.file;
    if (diagnostic.location.line !== undefined) {
      loc += `:${diagnostic.location.line}`;
      if (diagnostic.location.column !== undefined) {
        loc += `:${diagnostic.location.column}`;
      }
    }
    parts.push(`${loc} - `);
  }

  const severityText = diagnostic.severity.toUpperCase();
  parts.push(`${severityText} [${diagnostic.code}]: ${diagnostic.message}`);

  if (diagnostic.routeId) {
    parts.push(`\n  Route: ${diagnostic.routeId}`);
  }

  if (diagnostic.importChain && diagnostic.importChain.length > 0) {
    parts.push(`\n  Import Trace:`);
    diagnostic.importChain.forEach((module, idx) => {
      parts.push(`\n    ${idx + 1}. ${module}`);
    });
  }

  if (diagnostic.hint) {
    parts.push(`\n  Hint: ${diagnostic.hint}`);
  }

  return parts.join('');
}

/**
 * Serialize a diagnostic into a structured JSON string.
 */
export function serializeDiagnostic(diagnostic: RanuDiagnostic): string {
  return JSON.stringify({
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    location: diagnostic.location,
    routeId: diagnostic.routeId,
    importChain: diagnostic.importChain,
    hint: diagnostic.hint,
  });
}

/**
 * Deserialize a JSON string into a structured RanuDiagnostic.
 * Validates existence of required fields.
 */
export function deserializeDiagnostic(serialized: string): RanuDiagnostic {
  const data = JSON.parse(serialized);
  
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid diagnostic serialization: expected an object.');
  }
  if (typeof data.code !== 'string') {
    throw new Error('Invalid diagnostic serialization: missing "code".');
  }
  if (data.severity !== 'error' && data.severity !== 'warning') {
    throw new Error('Invalid diagnostic serialization: invalid or missing "severity".');
  }
  if (typeof data.message !== 'string') {
    throw new Error('Invalid diagnostic serialization: missing "message".');
  }

  return {
    code: data.code,
    severity: data.severity,
    message: data.message,
    location: data.location,
    routeId: data.routeId,
    importChain: data.importChain,
    hint: data.hint,
  };
}
