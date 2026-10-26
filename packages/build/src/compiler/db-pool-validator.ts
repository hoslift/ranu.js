import fs from 'node:fs';
import ts from 'typescript';
import type { RanuDiagnostic } from '@ranu/diagnostics';
import type { ModuleGraph } from '../graph/graph-types.js';
import type { RanuDeploymentAdapter } from '@ranu/core';

export interface DbPoolValidationResult {
  readonly success: boolean;
  readonly diagnostics: readonly RanuDiagnostic[];
}

/**
 * Determines whether the current deployment adapter targets a serverless or edge runtime
 * where concurrent microVM instances cause database connection exhaustion.
 */
export function isServerlessTarget(adapter?: RanuDeploymentAdapter<unknown, unknown>): boolean {
  if (!adapter) {
    return false;
  }

  const name = adapter.name.toLowerCase();
  if (
    name.includes('vercel') ||
    name.includes('cloudflare') ||
    name.includes('netlify') ||
    name.includes('lambda')
  ) {
    return true;
  }

  const caps = adapter.capabilities;
  if (caps) {
    if (caps.longLivedProcess === false) {
      return true;
    }
    if (caps.maxDatabaseConnections !== undefined && caps.maxDatabaseConnections <= 1) {
      return true;
    }
    if (caps.runtime === 'workerd' || caps.runtime === 'edge') {
      return true;
    }
  }

  return false;
}

const POOL_IDENTIFIER_PATTERNS = new Set([
  'pool',
  'createpool',
  'createpoolcluster',
  'connectionpool',
  'knex',
  'sequelize',
]);

/**
 * Inspects a source file AST for database driver connection pools configured with max > 1.
 */
export function validateSourceDbPool(
  filePath: string,
  fileContent: string,
  adapterName: string
): RanuDiagnostic[] {
  // Fast path: if file does not contain keywords likely related to connection pools, skip AST
  if (
    !fileContent.includes('max') &&
    !fileContent.includes('connectionLimit') &&
    !fileContent.includes('maxConnections') &&
    !fileContent.includes('pool') &&
    !fileContent.includes('Pool')
  ) {
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

  function getExpressionName(expr: ts.Expression): string {
    if (ts.isIdentifier(expr)) {
      return expr.text;
    }
    if (ts.isPropertyAccessExpression(expr)) {
      return expr.name.text;
    }
    return '';
  }

  function checkObjectForExcessivePool(obj: ts.ObjectLiteralExpression, node: ts.Node): void {
    for (const prop of obj.properties) {
      if (!ts.isPropertyAssignment(prop)) {
        continue;
      }

      const propName = prop.name.getText(sourceFile).replace(/['"]/g, '');

      // Direct property: max: 10, connectionLimit: 10, maxConnections: 10
      if (
        propName === 'max' ||
        propName === 'connectionLimit' ||
        propName === 'maxConnections'
      ) {
        if (ts.isNumericLiteral(prop.initializer)) {
          const val = Number(prop.initializer.text);
          if (val > 1) {
            const { line, character } = sourceFile.getLineAndCharacterOfPosition(
              node.getStart(sourceFile)
            );
            diagnostics.push({
              code: 'RANU_BUILD_SERVERLESS_DB_POOL',
              severity: 'warning',
              message: `Database connection pool configured with max (${val}) connections for serverless target "${adapterName}". High connection limits in ephemeral serverless instances risk database connection exhaustion.`,
              location: {
                file: filePath,
                line: line + 1,
                column: character + 1,
              },
              hint: 'In serverless environments, each ephemeral worker instance creates its own pool. Configure max: 1 or use a connection pooling proxy (e.g., PgBouncer, Neon serverless, Prisma Accelerate, or Cloudflare Hyperdrive).',
            });
          }
        }
      }

      // Nested pool configuration: pool: { max: 10 } (e.g. knex, sequelize)
      if (propName === 'pool' && ts.isObjectLiteralExpression(prop.initializer)) {
        checkObjectForExcessivePool(prop.initializer, node);
      }
    }
  }

  function visit(node: ts.Node): void {
    // Check `new Pool({...})` or `createPool({...})` or `knex({...})`
    if (ts.isNewExpression(node) || ts.isCallExpression(node)) {
      const callee = node.expression;
      const calleeName = getExpressionName(callee).toLowerCase();

      const isKnownPoolCallee =
        POOL_IDENTIFIER_PATTERNS.has(calleeName) ||
        calleeName.includes('pool');

      for (const arg of node.arguments ?? []) {
        if (ts.isObjectLiteralExpression(arg)) {
          const hasPoolProp = arg.properties.some(
            (p) =>
              ts.isPropertyAssignment(p) &&
              p.name.getText(sourceFile).replace(/['"]/g, '') === 'pool'
          );

          if (isKnownPoolCallee || hasPoolProp) {
            checkObjectForExcessivePool(arg, node);
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return diagnostics;
}

/**
 * Validates database connection pools across all server files in the module graph
 * when compiling for serverless or edge deployment targets.
 */
export function validateGraphDbPools(
  moduleGraph: ModuleGraph,
  adapter?: RanuDeploymentAdapter<unknown, unknown>
): DbPoolValidationResult {
  if (!isServerlessTarget(adapter)) {
    return { success: true, diagnostics: [] };
  }

  const adapterName = adapter?.name ?? 'serverless';
  const diagnostics: RanuDiagnostic[] = [];

  for (const [, node] of moduleGraph.nodes.entries()) {
    // Skip client-only modules
    if (node.classification === 'client-reachable' || node.classification === 'client-entry') {
      continue;
    }

    const filePath = node.filePath ?? node.id;
    if (!filePath || !fs.existsSync(filePath)) {
      continue;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const fileDiags = validateSourceDbPool(filePath, content, adapterName);
      diagnostics.push(...fileDiags);
    } catch {
      // Ignore unreadable files during validation pass
    }
  }

  return {
    success: true, // Warnings do not abort build
    diagnostics,
  };
}
