import crypto from 'node:crypto';
import ts from 'typescript';

/**
 * Normalizes an AST node by printing without comments and normalizing whitespace.
 * Ensures whitespace, indentation, and comments do not alter the content-addressed hash.
 */
export function normalizeAstSignature(node: ts.Node, sourceFile: ts.SourceFile): string {
  const printer = ts.createPrinter({ removeComments: true });
  const printed = printer.printNode(ts.EmitHint.Unspecified, node, sourceFile);
  // Collapse whitespace and trim
  return printed.replace(/\s+/g, ' ').trim();
}

/**
 * Computes a deterministic content-addressed 16-character hexadecimal action hash: act_<hash16>.
 * Decoupled from ephemeral buildId so unchanged actions retain the identical hash across builds.
 *
 * @param moduleId - Relative module identifier (e.g. "app/actions/user.ts")
 * @param exportName - The exported name of the action (e.g. "updateUser" or "default")
 * @param astSignature - Normalized signature or AST code representation
 */
export function computeActionId(
  moduleId: string,
  exportName: string,
  astSignature: string,
): string {
  const normalizedModule = moduleId
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^\.\//, '');
  const content = `${normalizedModule}:${exportName}:${astSignature}`;
  const hash16 = crypto.createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16);
  return `act_${hash16}`;
}
