import ts from 'typescript';

export interface DirectiveAnalysis {
  isClient: boolean;
  hasUseServer: boolean;
}

/**
 * Statically analyzes a source file for directive prologues ("use client").
 *
 * Directive Prologue Rules:
 * - Must appear at the very beginning of the source file (before any import, statement, or declaration)
 * - May be preceded by comments or whitespace
 * - Must be an ExpressionStatement containing a single StringLiteral ("use client" or 'use client')
 * - Directives appearing after import statements, functions, or other statements are NOT valid directive prologues
 */
export function detectDirectives(filePath: string, fileContent: string): DirectiveAnalysis {
  const sourceFile = ts.createSourceFile(
    filePath,
    fileContent,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  let isClient = false;
  let hasUseServer = false;

  for (const statement of sourceFile.statements) {
    if (ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)) {
      const text = statement.expression.text.trim();
      if (text === 'use client') {
        isClient = true;
      } else if (text === 'use server') {
        hasUseServer = true;
      }
    } else {
      // First non-directive statement marks the end of the directive prologue.
      break;
    }
  }

  return {
    isClient,
    hasUseServer,
  };
}

/**
 * Convenience helper: returns true if the module has a top-level "use client" directive prologue.
 */
export function isClientDirective(filePath: string, fileContent: string): boolean {
  return detectDirectives(filePath, fileContent).isClient;
}
