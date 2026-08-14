import ts from 'typescript';
import type { HttpMethod } from '@ranu/core';
import type { RanuDiagnostic } from '@ranu/diagnostics';

/** Canonical HTTP methods supported by Ranu.js V1 */
const CANONICAL_METHODS: HttpMethod[] = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

/** Known unsupported HTTP methods to diagnose */
const UNSUPPORTED_HTTP_METHODS = ['TRACE', 'CONNECT', 'PURGE', 'COPY', 'LOCK', 'UNLOCK', 'PROPFIND', 'VIEW'];

/**
 * Statically analyzes a route module source file using the TypeScript Compiler API.
 * Discovers and validates HTTP method exports without executing the module.
 */
export function analyzeRouteMethods(
  filePath: string,
  fileContent: string
): { methods: HttpMethod[]; diagnostics: RanuDiagnostic[] } {
  const sourceFile = ts.createSourceFile(filePath, fileContent, ts.ScriptTarget.Latest, true);
  const diagnostics: RanuDiagnostic[] = [];
  const discoveredMethods = new Set<HttpMethod>();

  // Helper to extract line/column for diagnostics
  function getLoc(node: ts.Node) {
    const { line, character } = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));
    return {
      file: filePath,
      line: line + 1,
      column: character + 1,
    };
  }

  // 1. Inspect syntactic parser diagnostics first. If there are syntax errors, abort method extraction.
  const parseDiagnostics = (sourceFile as any).parseDiagnostics;
  if (parseDiagnostics && parseDiagnostics.length > 0) {
    parseDiagnostics.forEach((diag: any) => {
      const { line, character } = ts.getLineAndCharacterOfPosition(sourceFile, diag.start ?? 0);
      diagnostics.push({
        code: 'RANU_ROUTE_SYNTAX_ERROR',
        severity: 'error',
        message: ts.flattenDiagnosticMessageText(diag.messageText, '\n'),
        location: {
          file: filePath,
          line: line + 1,
          column: character + 1,
        },
      });
    });
    return { methods: [], diagnostics };
  }

  // Helper to check if a node has the 'export' modifier
  function isExported(node: ts.Node): boolean {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    return !!modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
  }

  // Helper to validate and process export name
  function processExport(name: string, shapeNode: ts.Node, isValidShape: boolean) {
    const uppercaseName = name.toUpperCase();
    const isReservedMethod = CANONICAL_METHODS.includes(uppercaseName as HttpMethod);

    if (isReservedMethod) {
      if (name !== uppercaseName) {
        diagnostics.push({
          code: 'RANU_ROUTE_INVALID_METHOD_CASE',
          severity: 'error',
          message: `Method export "${name}" is mis-cased. HTTP method exports must be uppercase, e.g., "${uppercaseName}".`,
          location: getLoc(shapeNode),
        });
      } else {
        if (!isValidShape) {
          diagnostics.push({
            code: 'RANU_ROUTE_INVALID_METHOD_SHAPE',
            severity: 'error',
            message: `HTTP method export "${name}" has an invalid declaration shape. Method exports must be direct function declarations or callable assignments.`,
            location: getLoc(shapeNode),
          });
        } else {
          discoveredMethods.add(name as HttpMethod);
        }
      }
      return;
    }

    // Check if it matches case-insensitively with reserved methods (e.g., "get", "Get")
    const isCaseMismatch = CANONICAL_METHODS.some(m => m.toLowerCase() === name.toLowerCase());
    if (isCaseMismatch) {
      diagnostics.push({
        code: 'RANU_ROUTE_INVALID_METHOD_CASE',
        severity: 'error',
        message: `Method export "${name}" is mis-cased. HTTP method exports must be uppercase, e.g., "${uppercaseName}".`,
        location: getLoc(shapeNode),
      });
      return;
    }

    // Check known unsupported methods
    if (UNSUPPORTED_HTTP_METHODS.includes(uppercaseName) || UNSUPPORTED_HTTP_METHODS.some(m => m.toLowerCase() === name.toLowerCase())) {
      diagnostics.push({
        code: 'RANU_ROUTE_UNSUPPORTED_METHOD',
        severity: 'error',
        message: `HTTP method export "${name}" is not supported by Ranu.js V1. Supported methods are GET, HEAD, POST, PUT, PATCH, DELETE, and OPTIONS.`,
        location: getLoc(shapeNode),
      });
    }

    // Other names (like "helper", "config", "generateStaticParams") are ignored
  }

  // Walk top-level statements
  ts.forEachChild(sourceFile, node => {
    // 1. Direct function declarations (e.g., export function GET() {})
    if (ts.isFunctionDeclaration(node)) {
      if (isExported(node) && node.name && ts.isIdentifier(node.name)) {
        processExport(node.name.text, node, true);
      }
    }

    // 2. Variable statements (e.g., export const POST = ...)
    else if (ts.isVariableStatement(node)) {
      if (isExported(node)) {
        for (const declaration of node.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) {
            const name = declaration.name.text;
            const uppercaseName = name.toUpperCase();
            const isReserved = CANONICAL_METHODS.includes(uppercaseName as HttpMethod) || CANONICAL_METHODS.some(m => m.toLowerCase() === name.toLowerCase());

            if (isReserved) {
              const initializer = declaration.initializer;
              let isValidShape = false;
              if (initializer) {
                isValidShape = ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer);
              }
              processExport(name, declaration, isValidShape);
            } else {
              processExport(name, declaration, false);
            }
          }
        }
      }
    }

    // 3. Export Declarations (e.g., export { handler as GET } or export { GET } from './module')
    else if (ts.isExportDeclaration(node)) {
      // Re-export from another file: export { GET } from './module'
      if (node.moduleSpecifier) {
        if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          for (const specifier of node.exportClause.elements) {
            const name = specifier.name.text;
            processExport(name, specifier, false); // Cross-module re-export is unsupported shape
          }
        }
      } 
      // Local alias mapping: export { handler as GET }
      else if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const specifier of node.exportClause.elements) {
          const name = specifier.name.text;
          processExport(name, specifier, false); // Local alias/mapped exports are unsupported shape
        }
      }
    }
  });

  // Sort discovered methods alphabetically for deterministic canonical ordering
  const sortedMethods = Array.from(discoveredMethods).sort() as HttpMethod[];

  return {
    methods: sortedMethods,
    diagnostics,
  };
}
