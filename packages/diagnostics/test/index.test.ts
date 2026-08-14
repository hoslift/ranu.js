import { describe, it, expect } from 'vitest';
import { type RanuDiagnostic, formatDiagnostic, serializeDiagnostic, deserializeDiagnostic } from '../src/index.js';

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
});
