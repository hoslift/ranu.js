import path from 'node:path';
import ts from 'typescript';

/**
 * Checks if a file path is inside the project's `server/` directory.
 */
export function isServerDirectoryModule(filePath: string, projectRoot: string): boolean {
  const relative = path.relative(projectRoot, filePath).replace(/\\/g, '/');
  return relative.startsWith('server/') || relative === 'server';
}

/**
 * Checks if a source file explicitly imports the `ranu/server-only` marker module.
 */
export function hasServerOnlyImport(filePath: string, fileContent: string): boolean {
  // Fast check first
  if (!fileContent.includes('ranu/server-only')) {
    return false;
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    fileContent,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  let found = false;
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      if (ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === 'ranu/server-only') {
        found = true;
      }
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg) && arg.text === 'ranu/server-only') {
        found = true;
      }
    }
    if (!found) {
      ts.forEachChild(node, visit);
    }
  }

  visit(sourceFile);
  return found;
}

/**
 * Combined check: determines if a module is classified as server-only (either by location or import marker).
 */
export function isServerOnlyModule(
  filePath: string,
  fileContent: string,
  projectRoot: string
): { isServerOnly: boolean; reason?: 'server-directory' | 'server-only-import' } {
  if (isServerDirectoryModule(filePath, projectRoot)) {
    return { isServerOnly: true, reason: 'server-directory' };
  }
  if (hasServerOnlyImport(filePath, fileContent)) {
    return { isServerOnly: true, reason: 'server-only-import' };
  }
  return { isServerOnly: false };
}
