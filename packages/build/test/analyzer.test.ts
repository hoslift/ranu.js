import { describe, it, expect } from 'vitest';
import { analyzeRouteMethods } from '../src/analyzer.js';

describe('API Route AST Analyzer', () => {
  it('accepts synchronous function GET export', () => {
    const code = `
      export function GET(request: Request) {
        return Response.json({ ok: true });
      }
    `;
    const result = analyzeRouteMethods('route.ts', code);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.methods).toEqual(['GET']);
  });

  it('accepts asynchronous function GET export', () => {
    const code = `
      export async function GET(request: Request) {
        return Response.json({ ok: true });
      }
    `;
    const result = analyzeRouteMethods('route.ts', code);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.methods).toEqual(['GET']);
  });

  it('accepts arrow function POST export', () => {
    const code = `
      export const POST = (request: Request) => Response.json({ ok: true });
    `;
    const result = analyzeRouteMethods('route.ts', code);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.methods).toEqual(['POST']);
  });

  it('accepts function expression PUT export', () => {
    const code = `
      export const PUT = function(request: Request) {
        return Response.json({ ok: true });
      };
    `;
    const result = analyzeRouteMethods('route.ts', code);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.methods).toEqual(['PUT']);
  });

  it('sorts methods alphabetically/canonically', () => {
    const code = `
      export async function POST() {}
      export async function DELETE() {}
      export async function GET() {}
    `;
    const result = analyzeRouteMethods('route.ts', code);
    expect(result.diagnostics).toHaveLength(0);
    // DELETE, GET, POST (alphabetical)
    expect(result.methods).toEqual(['DELETE', 'GET', 'POST']);
  });

  it('records only explicit exports, no implicit HEAD/OPTIONS', () => {
    const code = `
      export async function GET() {}
    `;
    const result = analyzeRouteMethods('route.ts', code);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.methods).toEqual(['GET']); // HEAD and OPTIONS are not implicitly added
  });

  it('rejects local alias method exports', () => {
    const code = `
      const handler = () => {};
      export { handler as GET };
    `;
    const result = analyzeRouteMethods('route.ts', code);
    expect(result.methods).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe('RANU_ROUTE_INVALID_METHOD_SHAPE');
  });

  it('rejects cross-module re-export', () => {
    const code = `
      export { GET } from './handlers';
    `;
    const result = analyzeRouteMethods('route.ts', code);
    expect(result.methods).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe('RANU_ROUTE_INVALID_METHOD_SHAPE');
  });

  it('rejects identifier-valued method exports', () => {
    const code = `
      import { importedHandler } from './handlers';
      export const GET = importedHandler;
    `;
    const result = analyzeRouteMethods('route.ts', code);
    expect(result.methods).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe('RANU_ROUTE_INVALID_METHOD_SHAPE');
  });

  it('rejects non-callable literals', () => {
    const code = `
      export const GET = "hello";
    `;
    const result = analyzeRouteMethods('route.ts', code);
    expect(result.methods).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe('RANU_ROUTE_INVALID_METHOD_SHAPE');
  });

  it('ignores unrelated helper exports', () => {
    const code = `
      export const config = { runtime: 'nodejs' };
      export async function GET() {}
      export function someHelper() {}
    `;
    const result = analyzeRouteMethods('route.ts', code);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.methods).toEqual(['GET']); // helper and config are ignored
  });

  it('diagnoses mis-cased HTTP methods', () => {
    const code = `
      export function get() {}
    `;
    const result = analyzeRouteMethods('route.ts', code);
    expect(result.methods).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe('RANU_ROUTE_INVALID_METHOD_CASE');
  });

  it('diagnoses TRACE and CONNECT methods', () => {
    const code = `
      export function TRACE() {}
      export function CONNECT() {}
    `;
    const result = analyzeRouteMethods('route.ts', code);
    expect(result.methods).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics[0].code).toBe('RANU_ROUTE_UNSUPPORTED_METHOD');
    expect(result.diagnostics[1].code).toBe('RANU_ROUTE_UNSUPPORTED_METHOD');
  });

  it('diagnoses syntax-invalid modules', () => {
    const code = `
      export async function GET( {
    `;
    const result = analyzeRouteMethods('route.ts', code);
    expect(result.methods).toHaveLength(0);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0].code).toBe('RANU_ROUTE_SYNTAX_ERROR');
    expect(result.diagnostics[0].location?.file).toBe('route.ts');
    expect(result.diagnostics[0].location?.line).toBe(3);
  });
});
