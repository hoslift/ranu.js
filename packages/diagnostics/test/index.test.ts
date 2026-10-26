import { describe, it, expect } from 'vitest';
import {
  type RanuDiagnostic,
  type DiagnosticReport,
  formatDiagnostic,
  serializeDiagnostic,
  deserializeDiagnostic,
  formatDiagnosticsReport,
} from '../src/index.js';

describe('@ranu/diagnostics', () => {
  it('formats a basic diagnostic correctly', () => {
    const diag: RanuDiagnostic = {
      code: 'RANU_TEST_001',
      severity: 'error',
      message: 'Test diagnostic message',
    };
    const formatted = formatDiagnostic(diag);
    expect(formatted).toBe('ERROR [RANU_TEST_001]: Test diagnostic message');
  });

  it('includes detailed source location when provided', () => {
    const diag: RanuDiagnostic = {
      code: 'RANU_TEST_002',
      severity: 'warning',
      message: 'Warning message',
      location: { file: 'app/page.tsx', line: 10, column: 5 },
    };
    const formatted = formatDiagnostic(diag);
    expect(formatted).toBe('app/page.tsx:10:5 - WARNING [RANU_TEST_002]: Warning message');
  });

  it('includes route ID and import chain trace when provided', () => {
    const diag: RanuDiagnostic = {
      code: 'RANU_TEST_003',
      severity: 'warning',
      message: 'Info message',
      routeId: 'page:/products/[id]',
      importChain: ['app/products/[id]/page.tsx', 'components/Button.tsx', 'utils/logger.ts'],
    };
    const formatted = formatDiagnostic(diag);
    expect(formatted).toContain('Route: page:/products/[id]');
    expect(formatted).toContain('Import Trace:');
    expect(formatted).toContain('1. app/products/[id]/page.tsx');
    expect(formatted).toContain('2. components/Button.tsx');
    expect(formatted).toContain('3. utils/logger.ts');
  });

  it('includes hint when provided', () => {
    const diag: RanuDiagnostic = {
      code: 'RANU_TEST_004',
      severity: 'error',
      message: 'Hint message',
      hint: 'Try adding export default',
    };
    const formatted = formatDiagnostic(diag);
    expect(formatted).toContain('Hint: Try adding export default');
  });

  it('handles diagnostic JSON serialization and deserialization successfully', () => {
    const original: RanuDiagnostic = {
      code: 'RANU_TEST_005',
      severity: 'error',
      message: 'Critical error',
      location: { file: 'app/layout.tsx', line: 1 },
      routeId: 'page:/',
      importChain: ['app/layout.tsx'],
      hint: 'Fix import syntax',
    };

    const serialized = serializeDiagnostic(original);
    const parsed = deserializeDiagnostic(serialized);

    expect(parsed.code).toBe(original.code);
    expect(parsed.severity).toBe(original.severity);
    expect(parsed.message).toBe(original.message);
    expect(parsed.location).toEqual(original.location);
    expect(parsed.routeId).toBe(original.routeId);
    expect(parsed.importChain).toEqual(original.importChain);
    expect(parsed.hint).toBe(original.hint);
  });

  it('throws helpful errors during invalid deserialization', () => {
    expect(() => deserializeDiagnostic('{}')).toThrow('missing "code"');
    expect(() => deserializeDiagnostic(JSON.stringify({ code: 'TEST_01', severity: 'invalid', message: 'Hello' }))).toThrow('invalid or missing "severity"');
  });

  describe('formatDiagnosticsReport', () => {
    it('formats an empty diagnostics list into a successful report', () => {
      const output = formatDiagnosticsReport([]);
      const report: DiagnosticReport = JSON.parse(output);

      expect(report.success).toBe(true);
      expect(report.diagnostics).toEqual([]);
      expect(report.summary).toEqual({ errors: 0, warnings: 0 });
    });

    it('marks report as successful when only warnings are present', () => {
      const diags: RanuDiagnostic[] = [
        {
          code: 'RANU_WARN_001',
          severity: 'warning',
          message: 'Minor deprecation notice',
          location: { file: 'app/about/page.tsx', line: 12, column: 3 },
          hint: 'Migrate to the recommended API',
        },
      ];

      const output = formatDiagnosticsReport(diags);
      const report: DiagnosticReport = JSON.parse(output);

      expect(report.success).toBe(true);
      expect(report.summary.errors).toBe(0);
      expect(report.summary.warnings).toBe(1);
      expect(report.diagnostics).toHaveLength(1);
      expect(report.diagnostics[0]?.code).toBe('RANU_WARN_001');
      expect(report.diagnostics[0]?.hint).toBe('Migrate to the recommended API');
    });

    it('marks report as failure when errors are present and serializes all fields properly', () => {
      const diags: RanuDiagnostic[] = [
        {
          code: 'RANU_ERR_001',
          severity: 'error',
          message: 'Server-only module imported in client code',
          location: { file: 'app/components/Counter.tsx', line: 5, column: 1 },
          routeId: 'page:/dashboard',
          importChain: ['app/components/Counter.tsx', 'server/secret.ts'],
          hint: 'Remove server-only import from client component',
        },
        {
          code: 'RANU_WARN_002',
          severity: 'warning',
          message: 'Unused variable',
          location: { file: 'app/utils.ts', line: 20 },
        },
      ];

      const output = formatDiagnosticsReport(diags);
      const report: DiagnosticReport = JSON.parse(output);

      expect(report.success).toBe(false);
      expect(report.summary.errors).toBe(1);
      expect(report.summary.warnings).toBe(1);
      expect(report.diagnostics).toHaveLength(2);

      const err = report.diagnostics[0]!;
      expect(err.code).toBe('RANU_ERR_001');
      expect(err.severity).toBe('error');
      expect(err.message).toBe('Server-only module imported in client code');
      expect(err.location).toEqual({ file: 'app/components/Counter.tsx', line: 5, column: 1 });
      expect(err.routeId).toBe('page:/dashboard');
      expect(err.importChain).toEqual(['app/components/Counter.tsx', 'server/secret.ts']);
      expect(err.hint).toBe('Remove server-only import from client component');
    });

    it('respects pretty: false option', () => {
      const diags: RanuDiagnostic[] = [
        {
          code: 'RANU_ERR_002',
          severity: 'error',
          message: 'Error message',
        },
      ];

      const compact = formatDiagnosticsReport(diags, { pretty: false });
      expect(compact).not.toContain('\n');

      const pretty = formatDiagnosticsReport(diags, { pretty: true });
      expect(pretty).toContain('\n');
    });
  });
});

