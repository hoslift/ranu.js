import fs from 'node:fs';
import ts from 'typescript';
import type { RanuDiagnostic } from '@ranu/diagnostics';
import type { ModuleGraph } from '../graph/graph-types.js';

export interface PropsValidationResult {
  success: boolean;
  diagnostics: RanuDiagnostic[];
}

/**
 * Validates JSX attributes in a source file passed to Client Components.
 * Detects non-serializable props (inline functions, function expressions, server functions, class instances).
 */
export function validateSourceNonSerializableProps(
  filePath: string,
  fileContent: string,
  clientComponentNames: Set<string>
): RanuDiagnostic[] {
  if (clientComponentNames.size === 0) {
    return [];
  }

  // Fast check: must contain JSX tags
  if (!fileContent.includes('<')) {
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

  // Helper to unwrap parentheses and type assertions
  function unwrapExpression(expr: ts.Expression): ts.Expression {
    while (
      ts.isParenthesizedExpression(expr) ||
      ts.isAsExpression(expr) ||
      ts.isNonNullExpression(expr) ||
      ts.isTypeAssertionExpression(expr)
    ) {
      expr = expr.expression;
    }
    return expr;
  }

  // Detect Symbol call expressions and property accesses
  function isSymbolExpression(expr: ts.Expression): boolean {
    if (ts.isCallExpression(expr)) {
      const callTarget = unwrapExpression(expr.expression);
      // Symbol('id') or Symbol()
      if (ts.isIdentifier(callTarget) && callTarget.text === 'Symbol') {
        return true;
      }
      // Symbol.for('key') or Symbol.keyFor(...)
      if (
        ts.isPropertyAccessExpression(callTarget) &&
        ts.isIdentifier(callTarget.expression) &&
        callTarget.expression.text === 'Symbol'
      ) {
        return true;
      }
    }
    // Symbol.iterator, Symbol.asyncIterator, etc.
    if (
      ts.isPropertyAccessExpression(expr) &&
      ts.isIdentifier(expr.expression) &&
      expr.expression.text === 'Symbol'
    ) {
      return true;
    }
    return false;
  }

  // Scope tracking interface
  interface Scope {
    functions: Set<string>;
    classInstances: Set<string>;
    nonFunctions: Set<string>;
  }

  const scopeStack: Scope[] = [];

  // Track imported identifiers at file level
  const importedIdentifiers = new Set<string>();
  for (const stmt of sourceFile.statements) {
    if (ts.isImportDeclaration(stmt) && stmt.importClause) {
      if (stmt.importClause.name) {
        importedIdentifiers.add(stmt.importClause.name.text);
      }
      if (stmt.importClause.namedBindings) {
        if (ts.isNamedImports(stmt.importClause.namedBindings)) {
          for (const el of stmt.importClause.namedBindings.elements) {
            importedIdentifiers.add(el.name.text);
          }
        } else if (ts.isNamespaceImport(stmt.importClause.namedBindings)) {
          importedIdentifiers.add(stmt.importClause.namedBindings.name.text);
        }
      }
    }
  }

  function isClientComponent(tagName: string): boolean {
    if (clientComponentNames.has(tagName)) {
      return true;
    }
    if (tagName.includes('.')) {
      const root = tagName.split('.')[0]!;
      if (clientComponentNames.has(root)) {
        return true;
      }
    }
    return false;
  }

  interface NonSerializableResult {
    type: string;
    path: string;
    node: ts.Node;
  }

  function inspectExpression(
    expr: ts.Expression,
    currentPropName: string,
    pathPrefix: string = ''
  ): NonSerializableResult | undefined {
    expr = unwrapExpression(expr);

    if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
      return {
        type: 'function',
        path: pathPrefix || currentPropName,
        node: expr,
      };
    }

    if (ts.isIdentifier(expr)) {
      // Resolve identifier through lexical scope stack (innermost to outermost)
      let resolvedType: 'function' | 'class instance' | undefined;
      for (let i = scopeStack.length - 1; i >= 0; i--) {
        const s = scopeStack[i];
        if (!s) {
          continue;
        }
        if (s.functions.has(expr.text)) {
          resolvedType = 'function';
          break;
        }
        if (s.classInstances.has(expr.text)) {
          resolvedType = 'class instance';
          break;
        }
        if (s.nonFunctions.has(expr.text)) {
          // Shadowed by non-function / non-class variable in closer scope
          break;
        }
      }

      if (resolvedType === 'function') {
        return {
          type: 'function reference',
          path: pathPrefix || currentPropName,
          node: expr,
        };
      }
      if (resolvedType === 'class instance') {
        return {
          type: 'class instance',
          path: pathPrefix || currentPropName,
          node: expr,
        };
      }

      // Check imported callbacks passed to event props
      if (importedIdentifiers.has(expr.text) && /^on[A-Z]/.test(currentPropName)) {
        return {
          type: 'function reference',
          path: pathPrefix || currentPropName,
          node: expr,
        };
      }

      return undefined;
    }

    if (ts.isNewExpression(expr)) {
      return {
        type: 'class instance',
        path: pathPrefix || currentPropName,
        node: expr,
      };
    }

    if (isSymbolExpression(expr)) {
      return {
        type: 'symbol',
        path: pathPrefix || currentPropName,
        node: expr,
      };
    }

    if (ts.isObjectLiteralExpression(expr)) {
      for (const prop of expr.properties) {
        if (ts.isPropertyAssignment(prop)) {
          const keyName = prop.name.getText(sourceFile);
          const nextPath = pathPrefix ? `${pathPrefix}.${keyName}` : `${currentPropName}.${keyName}`;
          const found = inspectExpression(prop.initializer, keyName, nextPath);
          if (found) {
            return found;
          }
        } else if (ts.isShorthandPropertyAssignment(prop)) {
          const keyName = prop.name.text;
          const nextPath = pathPrefix ? `${pathPrefix}.${keyName}` : `${currentPropName}.${keyName}`;
          const found = inspectExpression(prop.name, keyName, nextPath);
          if (found) {
            return found;
          }
        } else if (ts.isSpreadAssignment(prop)) {
          const found = inspectExpression(prop.expression, currentPropName, pathPrefix);
          if (found) {
            return found;
          }
        }
      }
      return undefined;
    }

    if (ts.isArrayLiteralExpression(expr)) {
      for (let idx = 0; idx < expr.elements.length; idx++) {
        const elem = expr.elements[idx]!;
        const nextPath = pathPrefix ? `${pathPrefix}[${idx}]` : `${currentPropName}[${idx}]`;
        const found = inspectExpression(elem, currentPropName, nextPath);
        if (found) {
          return found;
        }
      }
      return undefined;
    }

    return undefined;
  }

  function reportDiagnostic(
    nonSerializableType: string,
    propPath: string,
    tagName: string,
    node: ts.Node
  ) {
    const { line, character } = ts.getLineAndCharacterOfPosition(
      sourceFile,
      node.getStart(sourceFile)
    );
    diagnostics.push({
      code: 'RANU_BUILD_NON_SERIALIZABLE_PROP',
      severity: 'error',
      message: `Cannot pass non-serializable ${nonSerializableType} prop "${propPath}" to Client Component <${tagName}> across the Server/Client boundary in ${filePath}.`,
      location: {
        file: filePath,
        line: line + 1,
        column: character + 1,
      },
      hint: 'Move event handlers and stateful logic inside the Client Component ("use client"), or pass plain JSON-serializable data.',
    });
  }

  function walk(node: ts.Node) {
    let pushedScope = false;

    // Track function and variable declarations in SourceFile and Block scopes
    if (ts.isSourceFile(node) || ts.isBlock(node)) {
      pushedScope = true;
      const currentScope: Scope = {
        functions: new Set<string>(),
        classInstances: new Set<string>(),
        nonFunctions: new Set<string>(),
      };

      for (const stmt of node.statements) {
        if (ts.isFunctionDeclaration(stmt) && stmt.name) {
          currentScope.functions.add(stmt.name.text);
        } else if (ts.isVariableStatement(stmt)) {
          for (const decl of stmt.declarationList.declarations) {
            if (ts.isIdentifier(decl.name)) {
              if (decl.initializer) {
                const init = unwrapExpression(decl.initializer);
                if (
                  ts.isArrowFunction(init) ||
                  ts.isFunctionExpression(init)
                ) {
                  currentScope.functions.add(decl.name.text);
                } else if (ts.isNewExpression(init)) {
                  currentScope.classInstances.add(decl.name.text);
                } else {
                  currentScope.nonFunctions.add(decl.name.text);
                }
              } else {
                currentScope.nonFunctions.add(decl.name.text);
              }
            }
          }
        }
      }
      scopeStack.push(currentScope);
    }

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      if (isClientComponent(tagName)) {
        for (const prop of node.attributes.properties) {
          if (ts.isJsxAttribute(prop) && prop.initializer) {
            const propName = prop.name.getText(sourceFile);
            if (ts.isJsxExpression(prop.initializer) && prop.initializer.expression) {
              const found = inspectExpression(prop.initializer.expression, propName, '');
              if (found) {
                reportDiagnostic(found.type, found.path || propName, tagName, found.node);
              }
            }
          } else if (ts.isJsxSpreadAttribute(prop)) {
            const found = inspectExpression(prop.expression, 'spread', '');
            if (found) {
              reportDiagnostic(found.type, found.path || 'spread', tagName, found.node);
            }
          }
        }
      }
    }

    if (ts.isJsxElement(node)) {
      const tagName = node.openingElement.tagName.getText(sourceFile);
      if (isClientComponent(tagName)) {
        for (const child of node.children) {
          if (ts.isJsxExpression(child) && child.expression) {
            const found = inspectExpression(child.expression, 'children', '');
            if (found) {
              reportDiagnostic(found.type, found.path || 'children', tagName, found.node);
            }
          }
        }
      }
    }

    ts.forEachChild(node, walk);

    if (pushedScope) {
      scopeStack.pop();
    }
  }

  walk(sourceFile);
  return diagnostics;
}

/**
 * Validates module graph for non-serializable props passed across Server-to-Client JSX boundaries.
 */
export function validateNonSerializableProps(
  graphOrFile: ModuleGraph | string,
  contentOrNames?: string | Set<string>
): PropsValidationResult {
  if (typeof graphOrFile === 'string') {
    const filePath = graphOrFile;
    const fileContent = typeof contentOrNames === 'string' ? contentOrNames : '';
    const clientNames = contentOrNames instanceof Set ? contentOrNames : new Set<string>();
    const diagnostics = validateSourceNonSerializableProps(filePath, fileContent, clientNames);
    return {
      success: diagnostics.length === 0,
      diagnostics,
    };
  }

  const graph = graphOrFile;
  const diagnostics: RanuDiagnostic[] = [];

  // Identify all client entry file paths
  const clientEntryPaths = new Set(
    Array.from(graph.nodes.values())
      .filter((n) => (n.isClientEntry || n.classification === 'client-entry') && n.filePath)
      .map((n) => n.filePath!)
  );

  // Inspect server-only and server-reachable modules that import client entries
  for (const node of graph.nodes.values()) {
    if (node.isClientEntry || node.classification === 'client-entry' || !node.filePath || !fs.existsSync(node.filePath)) {
      continue;
    }

    const fileContent = fs.readFileSync(node.filePath, 'utf8');
    if (!fileContent.includes('<')) {
      continue; // Fast check for JSX
    }

    const sourceFile = ts.createSourceFile(
      node.filePath,
      fileContent,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );

    // Map imported client identifiers
    const clientComponentIdentifiers = new Set<string>();
    for (const stmt of sourceFile.statements) {
      if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
        const specifierText = (stmt.moduleSpecifier as ts.StringLiteral).text;
        const imp = node.imports.find((i) => i.specifier === specifierText);
        if (imp?.resolvedPath && clientEntryPaths.has(imp.resolvedPath)) {
          if (stmt.importClause?.name) {
            clientComponentIdentifiers.add(stmt.importClause.name.text);
          }
          if (stmt.importClause?.namedBindings) {
            if (ts.isNamedImports(stmt.importClause.namedBindings)) {
              for (const elem of stmt.importClause.namedBindings.elements) {
                clientComponentIdentifiers.add(elem.name.text);
              }
            } else if (ts.isNamespaceImport(stmt.importClause.namedBindings)) {
              clientComponentIdentifiers.add(stmt.importClause.namedBindings.name.text);
            }
          }
        }
      }
    }

    if (clientComponentIdentifiers.size > 0) {
      const fileDiagnostics = validateSourceNonSerializableProps(
        node.filePath,
        fileContent,
        clientComponentIdentifiers
      );
      diagnostics.push(...fileDiagnostics);
    }
  }

  return {
    success: diagnostics.length === 0,
    diagnostics,
  };
}
