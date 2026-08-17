import fs from 'node:fs';
import ts from 'typescript';
import type { RanuDiagnostic } from '@ranu/diagnostics';
import type { ModuleGraph } from '../graph/graph-types.js';

export interface EnvValidationResult {
  success: boolean;
  diagnostics: RanuDiagnostic[];
}

/**
 * Checks a client source file for private environment variable access (e.g. `process.env.DATABASE_URL`).
 *
 * Rules:
 * - Access to `process.env.RANU_PUBLIC_*` or `import.meta.env.RANU_PUBLIC_*` is permitted.
 * - Access to any non-public `process.env.SECRET` is a hard error (RANU_BUILD_PRIVATE_ENV_CLIENT).
 * - Full `process.env` object usage (e.g. `console.log(process.env)` or spreading `...process.env`) is a hard error.
 */
export function validateClientSourceEnv(filePath: string, fileContent: string): RanuDiagnostic[] {
  if (!fileContent.includes('process.env')) {
    return [];
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    fileContent,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  const diagnostics: RanuDiagnostic[] = [];

  function visit(node: ts.Node) {
    if (ts.isPropertyAccessExpression(node)) {
      // Check process.env.VAR_NAME
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'process' &&
        node.expression.name.text === 'env'
      ) {
        const varName = node.name.text;
        // NODE_ENV is standard safe runtime constant
        if (varName !== 'NODE_ENV' && !varName.startsWith('RANU_PUBLIC_')) {
          const { line, character } = ts.getLineAndCharacterOfPosition(
            sourceFile,
            node.getStart(sourceFile)
          );
          diagnostics.push({
            code: 'RANU_BUILD_PRIVATE_ENV_CLIENT',
            severity: 'error',
            message: `Private server environment variable "process.env.${varName}" cannot be accessed in browser/client-reachable code. Only variables prefixed with "RANU_PUBLIC_" are exposed to client code.`,
            location: {
              file: filePath,
              line: line + 1,
              column: character + 1,
            },
          });
        }
      }
    }
    // Check element access: process.env['VAR_NAME']
    else if (ts.isElementAccessExpression(node)) {
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'process' &&
        node.expression.name.text === 'env'
      ) {
        let varName = '';
        if (ts.isStringLiteral(node.argumentExpression)) {
          varName = node.argumentExpression.text;
        }

        if (varName !== 'NODE_ENV' && !varName.startsWith('RANU_PUBLIC_')) {
          const { line, character } = ts.getLineAndCharacterOfPosition(
            sourceFile,
            node.getStart(sourceFile)
          );
          diagnostics.push({
            code: 'RANU_BUILD_PRIVATE_ENV_CLIENT',
            severity: 'error',
            message: `Private environment variable access "process.env['${varName || '...'}']" is prohibited in client-reachable code.`,
            location: {
              file: filePath,
              line: line + 1,
              column: character + 1,
            },
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return diagnostics;
}

/**
 * Validates environment access across all client-reachable modules in the dependency graph.
 */
export function validateGraphEnvAccess(graph: ModuleGraph): EnvValidationResult {
  const diagnostics: RanuDiagnostic[] = [];

  const clientReachableNodes = Array.from(graph.nodes.values()).filter(
    node =>
      node.classification === 'client-entry' ||
      node.classification === 'client-reachable' ||
      node.classification === 'shared'
  );

  for (const node of clientReachableNodes) {
    if (node.filePath && fs.existsSync(node.filePath)) {
      const content = fs.readFileSync(node.filePath, 'utf8');
      const diags = validateClientSourceEnv(node.filePath, content);
      diagnostics.push(...diags);
    }
  }

  return {
    success: diagnostics.length === 0,
    diagnostics,
  };
}

/**
 * Builds esbuild `define` replacements for public environment variables.
 * Injects both `process.env.RANU_PUBLIC_X` and `import.meta.env.RANU_PUBLIC_X`.
 */
export function buildPublicEnvDefines(publicEnv: Record<string, string>): Record<string, string> {
  const defines: Record<string, string> = {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'import.meta.env.NODE_ENV': JSON.stringify('production'),
  };

  for (const [key, value] of Object.entries(publicEnv)) {
    if (key.startsWith('RANU_PUBLIC_')) {
      const jsonVal = JSON.stringify(value);
      defines[`process.env.${key}`] = jsonVal;
      defines[`import.meta.env.${key}`] = jsonVal;
    }
  }

  return defines;
}
