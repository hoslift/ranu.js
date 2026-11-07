import crypto from 'node:crypto';
import ts from 'typescript';
import { computeActionId, normalizeAstSignature } from './action-hasher.js';

export interface DiscoveredServerAction {
  readonly actionId: string;
  readonly exportName: string;
  readonly functionName?: string | undefined;
  readonly astSignatureHash: string;
  readonly isModuleLevel: boolean;
  readonly isMutating?: boolean | undefined;
  readonly start?: number | undefined;
  readonly end?: number | undefined;
}

export interface DirectiveAnalysis {
  readonly isClient: boolean;
  readonly hasUseServer: boolean;
  readonly hasModuleUseServer: boolean;
  readonly actions: readonly DiscoveredServerAction[];
}

function hasFunctionServerDirective(node: ts.Node): boolean {
  let body: ts.Node | undefined;
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node)) {
    body = node.body;
  } else if (ts.isArrowFunction(node)) {
    body = node.body;
  }

  if (body && ts.isBlock(body) && body.statements.length > 0) {
    const firstStatement = body.statements[0];
    if (
      firstStatement &&
      ts.isExpressionStatement(firstStatement) &&
      ts.isStringLiteral(firstStatement.expression) &&
      firstStatement.expression.text.trim() === 'use server'
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Statically analyzes a source file for directives ("use client", "use server")
 * at both module and function level, and extracts discovered Server Action entrypoints.
 */
export function detectDirectives(filePath: string, fileContent: string): DirectiveAnalysis {
  const sourceFile = ts.createSourceFile(
    filePath,
    fileContent,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  let isClient = false;
  let hasModuleUseServer = false;

  // 1. Module-level directive prologue check
  for (const statement of sourceFile.statements) {
    if (ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)) {
      const text = statement.expression.text.trim();
      if (text === 'use client') {
        isClient = true;
      } else if (text === 'use server') {
        hasModuleUseServer = true;
      }
    } else {
      break;
    }
  }

  const actions: DiscoveredServerAction[] = [];
  let hasFunctionUseServer = false;

  // 2. Discover exported declarations and functions
  for (const statement of sourceFile.statements) {
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    const isExported =
      modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
    const isDefault =
      modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false;

    // Exported function declaration
    if (ts.isFunctionDeclaration(statement)) {
      const fnName = statement.name?.text ?? (isDefault ? 'default' : undefined);
      const isActionFunction =
        hasModuleUseServer || hasFunctionServerDirective(statement);

      if (hasFunctionServerDirective(statement)) {
        hasFunctionUseServer = true;
      }

      if (isExported && isActionFunction && fnName) {
        const exportName = isDefault ? 'default' : fnName;
        const signature = normalizeAstSignature(statement, sourceFile);
        const astSignatureHash = crypto.createHash('sha256').update(signature).digest('hex');
        const actionId = computeActionId(filePath, exportName, signature);

        actions.push({
          actionId,
          exportName,
          ...(fnName !== 'default' && fnName !== undefined ? { functionName: fnName } : {}),
          astSignatureHash,
          isModuleLevel: hasModuleUseServer,
          isMutating: true,
          start: statement.getStart(sourceFile),
          end: statement.getEnd(),
        });
      }
    }

    // Exported variable statement (e.g. export const myAction = async () => { ... })
    if (ts.isVariableStatement(statement) && isExported) {
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          const varName = decl.name.text;
          const init = decl.initializer;
          const isActionInit =
            hasModuleUseServer || (init ? hasFunctionServerDirective(init) : false);

          if (init && hasFunctionServerDirective(init)) {
            hasFunctionUseServer = true;
          }

          if (isActionInit) {
            const signature = init
              ? normalizeAstSignature(init, sourceFile)
              : normalizeAstSignature(decl, sourceFile);
            const astSignatureHash = crypto.createHash('sha256').update(signature).digest('hex');
            const actionId = computeActionId(filePath, varName, signature);

            actions.push({
              actionId,
              exportName: varName,
              functionName: varName,
              astSignatureHash,
              isModuleLevel: hasModuleUseServer,
              isMutating: true,
              start: statement.getStart(sourceFile),
              end: statement.getEnd(),
            });
          }
        }
      }
    }

    // Default export assignment (e.g. export default async function() { ... })
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      const expr = statement.expression;
      const isAction = hasModuleUseServer || hasFunctionServerDirective(expr);
      if (hasFunctionServerDirective(expr)) {
        hasFunctionUseServer = true;
      }

      if (isAction) {
        const signature = normalizeAstSignature(expr, sourceFile);
        const astSignatureHash = crypto.createHash('sha256').update(signature).digest('hex');
        const actionId = computeActionId(filePath, 'default', signature);

        actions.push({
          actionId,
          exportName: 'default',
          astSignatureHash,
          isModuleLevel: hasModuleUseServer,
          isMutating: true,
          start: statement.getStart(sourceFile),
          end: statement.getEnd(),
        });
      }
    }
  }

  // Sort actions deterministically by exportName
  actions.sort((a, b) => a.exportName.localeCompare(b.exportName));

  return {
    isClient,
    hasUseServer: hasModuleUseServer || hasFunctionUseServer,
    hasModuleUseServer,
    actions,
  };
}

/**
 * Convenience helper: returns true if the module has a top-level "use client" directive prologue.
 */
export function isClientDirective(filePath: string, fileContent: string): boolean {
  return detectDirectives(filePath, fileContent).isClient;
}
