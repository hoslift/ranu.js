import fs from 'node:fs';
import ts from 'typescript';
import type { RanuDiagnostic } from '@ranu/diagnostics';
import type { ModuleGraph } from '../graph/graph-types.js';

export interface EnvValidationResult {
  success: boolean;
  diagnostics: RanuDiagnostic[];
}

interface EnvOrigin {
  kind: 'process.env' | 'import.meta.env' | 'alias';
  sourceText: string;
  aliasName?: string;
}
export const KNOWN_AI_SECRET_KEYS: ReadonlySet<string> = new Set([
  'GEMINI_API_KEY',
  'GROQ_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'CUSTOM_AI_KEY',
  'MISTRAL_API_KEY',
  'CEREBRAS_API_KEY',
  'COHERE_API_KEY',
  'PINECONE_API_KEY',
  'TOGETHER_API_KEY',
  'CLOUDFLARE_AI_KEY',
  'AI_API_KEY',
  'LLM_API_KEY',
]);

export function isKnownAiSecretKey(varName: string): boolean {
  if (KNOWN_AI_SECRET_KEYS.has(varName)) return true;
  const upper = varName.toUpperCase();
  return (
    upper.includes('GEMINI_API_KEY') ||
    upper.includes('GROQ_API_KEY') ||
    upper.includes('ANTHROPIC_API_KEY') ||
    upper.includes('OPENAI_API_KEY') ||
    upper.includes('CUSTOM_AI_KEY') ||
    upper.includes('MISTRAL_API_KEY') ||
    upper.includes('CEREBRAS_API_KEY') ||
    upper.includes('AI_API_KEY') ||
    upper.includes('LLM_API_KEY') ||
    upper.startsWith('AI_KEY') ||
    upper.endsWith('_AI_KEY')
  );
}

export function createPrivateEnvDiagnostic(
  varName: string,
  envOrigin: EnvOrigin,
  line: number,
  character: number,
  filePath: string
): RanuDiagnostic {
  if (isKnownAiSecretKey(varName)) {
    return {
      code: 'RANU_BUILD_AI_SECRET_CLIENT_LEAK',
      severity: 'error',
      message: `Security Breach Prevention: AI Provider API key "${varName}" detected in client bundle "${filePath}". Exposing AI credentials to the browser allows unauthorized inference billing and account compromise.`,
      location: {
        file: filePath,
        line: line + 1,
        column: character + 1,
      },
      hint: 'Move AI model calls to server route handlers (e.g. app/api/chat/route.ts) or server actions using @ranu/ai. Never expose AI API keys to client components.',
    };
  }

  const message =
    envOrigin.kind === 'alias'
      ? `Private server environment variable "${varName}" accessed via alias "${envOrigin.aliasName}" cannot be accessed in browser/client-reachable code. Only variables prefixed with "RANU_PUBLIC_" are exposed to client code.`
      : `Private server environment variable "${envOrigin.sourceText}.${varName}" cannot be accessed in browser/client-reachable code. Only variables prefixed with "RANU_PUBLIC_" are exposed to client code.`;

  const hint =
    envOrigin.kind === 'alias'
      ? 'Do not alias the environment object in client code. Access public environment variables directly via process.env.RANU_PUBLIC_VAR or import.meta.env.RANU_PUBLIC_VAR.'
      : `Prefix environment variable with "RANU_PUBLIC_" (e.g. RANU_PUBLIC_${varName}) to expose it to the browser, or access it only in server routes.`;

  return {
    code: 'RANU_BUILD_PRIVATE_ENV_CLIENT',
    severity: 'error',
    message,
    location: {
      file: filePath,
      line: line + 1,
      column: character + 1,
    },
    hint,
  };
}


/**
 * Checks a client source file for private environment variable access (e.g. `process.env.DATABASE_URL` or `import.meta.env.SECRET`).
 *
 * Rules:
 * - Access to `process.env.RANU_PUBLIC_*` or `import.meta.env.RANU_PUBLIC_*` is permitted.
 * - Access to `process.env.NODE_ENV` or `import.meta.env.NODE_ENV` is permitted.
 * - Access to any non-public environment variable is a hard error (RANU_BUILD_PRIVATE_ENV_CLIENT).
 * - Bracket notation (`process['env']`, `import.meta['env']`) is inspected and enforced.
 * - Dynamic bracket notation on env objects is prohibited.
 * - Destructuring private variables or rest spreading is a hard error.
 * - Full env object usage (e.g. `console.log(process.env)` or spreading `...process.env`) is a hard error.
 * - Aliased pointers to process or env are tracked and verified.
 */
export function validateClientSourceEnv(filePath: string, fileContent: string): RanuDiagnostic[] {
  if (!fileContent.includes('process') && !fileContent.includes('import.meta')) {
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

  function unwrapExpression(expr: ts.Expression): ts.Expression {
    while (
      ts.isParenthesizedExpression(expr) ||
      ts.isAsExpression(expr) ||
      ts.isNonNullExpression(expr) ||
      ts.isTypeAssertionExpression(expr) ||
      (ts.isSatisfiesExpression && ts.isSatisfiesExpression(expr)) ||
      (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.CommaToken)
    ) {
      if (ts.isBinaryExpression(expr)) {
        expr = expr.right;
      } else {
        expr = expr.expression;
      }
    }
    return expr;
  }

  function getLiteralText(node: ts.Node | undefined): string | undefined {
    if (!node) return undefined;
    if (ts.isComputedPropertyName(node)) {
      node = node.expression;
    }
    if (ts.isExpression(node)) {
      node = unwrapExpression(node);
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return node.text;
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.PlusToken
    ) {
      const left = getLiteralText(node.left);
      const right = getLiteralText(node.right);
      if (left !== undefined && right !== undefined) {
        return left + right;
      }
    }
    if (ts.isTemplateExpression(node)) {
      let str = node.head.text;
      for (const span of node.templateSpans) {
        const spanText = getLiteralText(span.expression);
        if (spanText === undefined) return undefined;
        str += spanText + span.literal.text;
      }
      return str;
    }
    return undefined;
  }

  function isImportMeta(expr: ts.Expression, metaAliases?: ReadonlySet<string>): boolean {
    expr = unwrapExpression(expr);
    if (
      ts.isMetaProperty(expr) &&
      expr.keywordToken === ts.SyntaxKind.ImportKeyword &&
      expr.name.text === 'meta'
    ) {
      return true;
    }
    if (metaAliases && ts.isIdentifier(expr) && metaAliases.has(expr.text)) {
      return true;
    }
    return false;
  }

  function isProcessObject(expr: ts.Expression, processAliases: ReadonlySet<string>): boolean {
    expr = unwrapExpression(expr);
    if (ts.isIdentifier(expr)) {
      return expr.text === 'process' || processAliases.has(expr.text);
    }
    if (ts.isPropertyAccessExpression(expr)) {
      const inner = unwrapExpression(expr.expression);
      if (ts.isIdentifier(inner) && (inner.text === 'globalThis' || inner.text === 'window')) {
        return expr.name.text === 'process';
      }
    }
    if (ts.isElementAccessExpression(expr)) {
      const inner = unwrapExpression(expr.expression);
      const propName = getLiteralText(expr.argumentExpression);
      if (ts.isIdentifier(inner) && (inner.text === 'globalThis' || inner.text === 'window')) {
        return propName === 'process';
      }
    }
    return false;
  }

  function getEnvObjectOrigin(
    expr: ts.Expression,
    envAliases: ReadonlySet<string>,
    processAliases: ReadonlySet<string>,
    metaAliases?: ReadonlySet<string>
  ): EnvOrigin | undefined {
    expr = unwrapExpression(expr);

    if (ts.isIdentifier(expr) && envAliases.has(expr.text)) {
      return { kind: 'alias', sourceText: expr.text, aliasName: expr.text };
    }

    if (ts.isPropertyAccessExpression(expr)) {
      if (expr.name.text === 'env') {
        const target = unwrapExpression(expr.expression);
        if (isProcessObject(target, processAliases)) {
          const targetText = ts.isIdentifier(target) && target.text !== 'process' ? target.text : 'process';
          return { kind: 'process.env', sourceText: `${targetText}.env` };
        }
        if (isImportMeta(target, metaAliases)) {
          const targetText = ts.isIdentifier(target) ? target.text : 'import.meta';
          return { kind: 'import.meta.env', sourceText: `${targetText}.env` };
        }
      }
    }

    if (ts.isElementAccessExpression(expr)) {
      const propName = getLiteralText(expr.argumentExpression);
      if (propName === 'env') {
        const target = unwrapExpression(expr.expression);
        if (isProcessObject(target, processAliases)) {
          const targetText = ts.isIdentifier(target) && target.text !== 'process' ? target.text : 'process';
          return { kind: 'process.env', sourceText: `${targetText}['env']` };
        }
        if (isImportMeta(target, metaAliases)) {
          const targetText = ts.isIdentifier(target) ? target.text : 'import.meta';
          return { kind: 'import.meta.env', sourceText: `${targetText}['env']` };
        }
      }
    }

    return undefined;
  }

  function isWhitelistedEnvVar(name: string): boolean {
    return name === 'NODE_ENV' || name.startsWith('RANU_PUBLIC_');
  }

  function getEffectiveParent(node: ts.Node): ts.Node {
    let parent = node.parent;
    while (
      parent &&
      (ts.isParenthesizedExpression(parent) ||
        ts.isAsExpression(parent) ||
        ts.isNonNullExpression(parent) ||
        ts.isTypeAssertionExpression(parent) ||
        (ts.isSatisfiesExpression && ts.isSatisfiesExpression(parent)))
    ) {
      parent = parent.parent;
    }
    return parent;
  }

  // --- Pass 1: Alias Collection ---
  const processAliases = new Set<string>();
  const metaAliases = new Set<string>();
  const envAliases = new Set<string>();

  function collectAliasesFromBinding(name: ts.BindingName, initExpr: ts.Expression) {
    const init = unwrapExpression(initExpr);

    if (ts.isIdentifier(name)) {
      if (isProcessObject(init, processAliases)) {
        processAliases.add(name.text);
      } else if (isImportMeta(init, metaAliases)) {
        metaAliases.add(name.text);
      } else if (getEnvObjectOrigin(init, envAliases, processAliases, metaAliases)) {
        envAliases.add(name.text);
      }
    } else if (ts.isObjectBindingPattern(name)) {
      const isProc = isProcessObject(init, processAliases);
      const isMeta = isImportMeta(init, metaAliases);
      if (isProc || isMeta) {
        for (const elem of name.elements) {
          let propName: string | undefined;
          if (elem.propertyName) {
            propName = ts.isIdentifier(elem.propertyName)
              ? elem.propertyName.text
              : getLiteralText(elem.propertyName);
          } else if (ts.isIdentifier(elem.name)) {
            propName = elem.name.text;
          }
          if (propName === 'env' && ts.isIdentifier(elem.name)) {
            envAliases.add(elem.name.text);
          }
          if (elem.initializer) {
            collectAliasesFromBinding(elem.name, elem.initializer);
          }
        }
      } else {
        for (const elem of name.elements) {
          if (elem.initializer) {
            collectAliasesFromBinding(elem.name, elem.initializer);
          }
        }
      }
    } else if (ts.isArrayBindingPattern(name)) {
      if (ts.isArrayLiteralExpression(init)) {
        const minLen = Math.min(name.elements.length, init.elements.length);
        for (let i = 0; i < minLen; i++) {
          const bElem = name.elements[i];
          const iElem = init.elements[i];
          if (!bElem || ts.isOmittedExpression(bElem) || !iElem || ts.isOmittedExpression(iElem) || ts.isSpreadElement(iElem)) {
            continue;
          }
          if (ts.isBindingElement(bElem)) {
            collectAliasesFromBinding(bElem.name, iElem);
            if (bElem.initializer) {
              collectAliasesFromBinding(bElem.name, bElem.initializer);
            }
          }
        }
      } else {
        for (const bElem of name.elements) {
          if (ts.isBindingElement(bElem) && bElem.initializer) {
            collectAliasesFromBinding(bElem.name, bElem.initializer);
          }
        }
      }
    }
  }

  function collectAliasesFromNode(node: ts.Node) {
    // 1. Variable declaration
    if (ts.isVariableDeclaration(node) && node.initializer) {
      collectAliasesFromBinding(node.name, node.initializer);
    }

    // 2. Parameter declaration
    if (ts.isParameter(node)) {
      if (node.initializer) {
        collectAliasesFromBinding(node.name, node.initializer);
      } else if (ts.isObjectBindingPattern(node.name)) {
        for (const elem of node.name.elements) {
          if (elem.initializer) {
            collectAliasesFromBinding(elem.name, elem.initializer);
          }
        }
      } else if (ts.isArrayBindingPattern(node.name)) {
        for (const bElem of node.name.elements) {
          if (ts.isBindingElement(bElem) && bElem.initializer) {
            collectAliasesFromBinding(bElem.name, bElem.initializer);
          }
        }
      }
    }

    // 3. Assignment expression (e.g. p = process; env = process.env; [p] = [process])
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const right = unwrapExpression(node.right);
      if (ts.isIdentifier(node.left)) {
        if (isProcessObject(right, processAliases)) {
          processAliases.add(node.left.text);
        } else if (isImportMeta(right, metaAliases)) {
          metaAliases.add(node.left.text);
        } else if (getEnvObjectOrigin(right, envAliases, processAliases, metaAliases)) {
          envAliases.add(node.left.text);
        }
      } else if (ts.isObjectLiteralExpression(node.left)) {
        if (isProcessObject(right, processAliases) || isImportMeta(right, metaAliases)) {
          for (const prop of node.left.properties) {
            if (ts.isPropertyAssignment(prop)) {
              let propName: string | undefined;
              if (ts.isIdentifier(prop.name)) {
                propName = prop.name.text;
              } else {
                propName = getLiteralText(prop.name);
              }
              if (propName === 'env' && ts.isIdentifier(prop.initializer)) {
                envAliases.add(prop.initializer.text);
              }
            } else if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === 'env') {
              envAliases.add('env');
            }
          }
        }
      } else if (ts.isArrayLiteralExpression(node.left)) {
        if (ts.isArrayLiteralExpression(right)) {
          const minLen = Math.min(node.left.elements.length, right.elements.length);
          for (let i = 0; i < minLen; i++) {
            const leftElem = node.left.elements[i];
            const rightElemRaw = right.elements[i];
            if (!rightElemRaw || ts.isSpreadElement(rightElemRaw)) continue;
            const rightElem = unwrapExpression(rightElemRaw);
            if (leftElem && ts.isIdentifier(leftElem)) {
              if (isProcessObject(rightElem, processAliases)) {
                processAliases.add(leftElem.text);
              } else if (isImportMeta(rightElem, metaAliases)) {
                metaAliases.add(leftElem.text);
              } else if (getEnvObjectOrigin(rightElem, envAliases, processAliases, metaAliases)) {
                envAliases.add(leftElem.text);
              }
            }
          }
        }
      }
    }

    ts.forEachChild(node, collectAliasesFromNode);
  }

  // Run alias collection until sets stabilize
  let aliasChanged = true;
  while (aliasChanged) {
    const prevProcessSize = processAliases.size;
    const prevMetaSize = metaAliases.size;
    const prevEnvSize = envAliases.size;
    collectAliasesFromNode(sourceFile);
    aliasChanged =
      processAliases.size > prevProcessSize ||
      metaAliases.size > prevMetaSize ||
      envAliases.size > prevEnvSize;
  }

  // --- Pass 2: Invariant Validation & Diagnostic Emission ---

  function checkObjectBindingPattern(pattern: ts.ObjectBindingPattern, envOrigin: EnvOrigin) {
    for (const elem of pattern.elements) {
      if (elem.dotDotDotToken) {
        const { line, character } = ts.getLineAndCharacterOfPosition(
          sourceFile,
          elem.getStart(sourceFile)
        );
        diagnostics.push({
          code: 'RANU_BUILD_PRIVATE_ENV_CLIENT',
          severity: 'error',
          message: `Rest destructuring "...${elem.name.getText(sourceFile)}" on "${envOrigin.sourceText}" is prohibited in client-reachable code because it exposes all private server environment variables.`,
          location: {
            file: filePath,
            line: line + 1,
            column: character + 1,
          },
          hint: 'Access specific public environment variables directly (e.g. process.env.RANU_PUBLIC_VAR).',
        });
        continue;
      }

      if (elem.propertyName && ts.isComputedPropertyName(elem.propertyName)) {
        const literalText = getLiteralText(elem.propertyName);
        if (literalText === undefined) {
          const { line, character } = ts.getLineAndCharacterOfPosition(
            sourceFile,
            elem.propertyName.getStart(sourceFile)
          );
          diagnostics.push({
            code: 'RANU_BUILD_PRIVATE_ENV_CLIENT',
            severity: 'error',
            message: 'Computed property destructuring on environment object is prohibited in client-reachable code because it cannot be statically validated.',
            location: {
              file: filePath,
              line: line + 1,
              column: character + 1,
            },
            hint: 'Destructure specific public environment variables using static property names prefixed with "RANU_PUBLIC_".',
          });
          continue;
        }
      }

      let varName: string | undefined;
      if (elem.propertyName) {
        if (ts.isIdentifier(elem.propertyName)) {
          varName = elem.propertyName.text;
        } else {
          varName = getLiteralText(elem.propertyName);
        }
      } else if (ts.isIdentifier(elem.name)) {
        varName = elem.name.text;
      }

      if (varName) {
        if (!isWhitelistedEnvVar(varName)) {
          const { line, character } = ts.getLineAndCharacterOfPosition(
            sourceFile,
            elem.getStart(sourceFile)
          );
          diagnostics.push(createPrivateEnvDiagnostic(varName, envOrigin, line, character, filePath));
        }
      } else if (ts.isObjectBindingPattern(elem.name)) {
        checkObjectBindingPattern(elem.name, envOrigin);
      }
    }
  }

  function checkObjectLiteralDestructuring(objLit: ts.ObjectLiteralExpression, envOrigin: EnvOrigin) {
    for (const prop of objLit.properties) {
      if (ts.isSpreadAssignment(prop)) {
        const { line, character } = ts.getLineAndCharacterOfPosition(
          sourceFile,
          prop.getStart(sourceFile)
        );
        diagnostics.push({
          code: 'RANU_BUILD_PRIVATE_ENV_CLIENT',
          severity: 'error',
          message: `Rest destructuring "...${prop.expression.getText(sourceFile)}" on "${envOrigin.sourceText}" is prohibited in client-reachable code because it exposes all private server environment variables.`,
          location: {
            file: filePath,
            line: line + 1,
            column: character + 1,
          },
          hint: 'Access specific public environment variables directly (e.g. process.env.RANU_PUBLIC_VAR).',
        });
        continue;
      }

      if (ts.isPropertyAssignment(prop) && ts.isComputedPropertyName(prop.name)) {
        const literalText = getLiteralText(prop.name);
        if (literalText === undefined) {
          const { line, character } = ts.getLineAndCharacterOfPosition(
            sourceFile,
            prop.name.getStart(sourceFile)
          );
          diagnostics.push({
            code: 'RANU_BUILD_PRIVATE_ENV_CLIENT',
            severity: 'error',
            message: 'Computed property destructuring on environment object is prohibited in client-reachable code because it cannot be statically validated.',
            location: {
              file: filePath,
              line: line + 1,
              column: character + 1,
            },
            hint: 'Destructure specific public environment variables using static property names prefixed with "RANU_PUBLIC_".',
          });
          continue;
        }
      }

      let varName: string | undefined;
      if (ts.isShorthandPropertyAssignment(prop)) {
        varName = prop.name.text;
      } else if (ts.isPropertyAssignment(prop)) {
        if (ts.isIdentifier(prop.name)) {
          varName = prop.name.text;
        } else {
          varName = getLiteralText(prop.name);
        }
      }

      if (varName) {
        if (!isWhitelistedEnvVar(varName)) {
          const { line, character } = ts.getLineAndCharacterOfPosition(
            sourceFile,
            prop.getStart(sourceFile)
          );
          diagnostics.push(createPrivateEnvDiagnostic(varName, envOrigin, line, character, filePath));
        }
      } else if (ts.isPropertyAssignment(prop) && ts.isObjectLiteralExpression(prop.initializer)) {
        checkObjectLiteralDestructuring(prop.initializer, envOrigin);
      }
    }
  }

  function checkFullObjectAccess(node: ts.Expression, envOrigin: EnvOrigin) {
    const parent = getEffectiveParent(node);
    if (!parent) return;

    // If parent is a property access on this env object (e.g. process.env.VAR)
    if (ts.isPropertyAccessExpression(parent) && unwrapExpression(parent.expression) === unwrapExpression(node)) {
      return;
    }

    // If parent is an element access on this env object (e.g. process.env['VAR'])
    if (ts.isElementAccessExpression(parent) && unwrapExpression(parent.expression) === unwrapExpression(node)) {
      return;
    }

    // If parent is a variable declaration or parameter destructuring from this env object
    if (
      (ts.isVariableDeclaration(parent) || ts.isParameter(parent)) &&
      parent.initializer &&
      unwrapExpression(parent.initializer) === unwrapExpression(node) &&
      ts.isObjectBindingPattern(parent.name)
    ) {
      return;
    }

    // If parent is an assignment destructuring from this env object: ({ SECRET } = process.env)
    if (
      ts.isBinaryExpression(parent) &&
      parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      unwrapExpression(parent.right) === unwrapExpression(node) &&
      ts.isObjectLiteralExpression(parent.left)
    ) {
      return;
    }

    // Otherwise, this is a forbidden full object reference, spread, or alias assignment
    const { line, character } = ts.getLineAndCharacterOfPosition(
      sourceFile,
      node.getStart(sourceFile)
    );
    diagnostics.push({
      code: 'RANU_BUILD_PRIVATE_ENV_CLIENT',
      severity: 'error',
      message: `Private server environment variables cannot be accessed via full "${envOrigin.sourceText}" object reference or spread in browser/client-reachable code. Only variables prefixed with "RANU_PUBLIC_" are exposed to client code.`,
      location: {
        file: filePath,
        line: line + 1,
        column: character + 1,
      },
      hint: 'Access specific public environment variables directly (e.g. process.env.RANU_PUBLIC_VAR) or isolate server environment access to server routes.',
    });
  }

  function visit(node: ts.Node) {
    // 1. Destructuring declaration: const { SECRET } = process.env;
    if (
      (ts.isVariableDeclaration(node) || ts.isParameter(node)) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer
    ) {
      const init = unwrapExpression(node.initializer);
      const envOrigin = getEnvObjectOrigin(init, envAliases, processAliases, metaAliases);
      if (envOrigin) {
        checkObjectBindingPattern(node.name, envOrigin);
      } else if (isProcessObject(init, processAliases) || isImportMeta(init, metaAliases)) {
        const isMeta = isImportMeta(init, metaAliases);
        const sourceKind = isMeta ? 'import.meta.env' : 'process.env';
        const targetText = ts.isIdentifier(init) ? init.text : (isMeta ? 'import.meta' : 'process');
        // Nested destructuring: const { env: { SECRET } } = process;
        for (const elem of node.name.elements) {
          let propName: string | undefined;
          if (elem.propertyName) {
            if (ts.isIdentifier(elem.propertyName)) {
              propName = elem.propertyName.text;
            } else if (ts.isComputedPropertyName(elem.propertyName)) {
              const literalText = getLiteralText(elem.propertyName);
              if (literalText === undefined) {
                const { line, character } = ts.getLineAndCharacterOfPosition(
                  sourceFile,
                  elem.propertyName.getStart(sourceFile)
                );
                diagnostics.push({
                  code: 'RANU_BUILD_PRIVATE_ENV_CLIENT',
                  severity: 'error',
                  message: `Computed property destructuring on ${isMeta ? 'import.meta' : 'process'} object is prohibited in client-reachable code because it cannot be statically validated.`,
                  location: {
                    file: filePath,
                    line: line + 1,
                    column: character + 1,
                  },
                  hint: `Destructure specific properties statically (e.g. const { env: { RANU_PUBLIC_VAR } } = ${isMeta ? 'import.meta' : 'process'}).`,
                });
                continue;
              }
              propName = literalText;
            } else {
              propName = getLiteralText(elem.propertyName);
            }
          } else if (ts.isIdentifier(elem.name)) {
            propName = elem.name.text;
          }
          if (propName === 'env' && ts.isObjectBindingPattern(elem.name)) {
            checkObjectBindingPattern(elem.name, { kind: sourceKind, sourceText: `${targetText}.env` });
          }
        }
      }
    }

    // 2. Destructuring assignment: ({ SECRET } = process.env);
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isObjectLiteralExpression(node.left)
    ) {
      const right = unwrapExpression(node.right);
      const envOrigin = getEnvObjectOrigin(right, envAliases, processAliases, metaAliases);
      if (envOrigin) {
        checkObjectLiteralDestructuring(node.left, envOrigin);
      } else if (isProcessObject(right, processAliases) || isImportMeta(right, metaAliases)) {
        const isMeta = isImportMeta(right, metaAliases);
        const sourceKind = isMeta ? 'import.meta.env' : 'process.env';
        const targetText = ts.isIdentifier(right) ? right.text : (isMeta ? 'import.meta' : 'process');
        // Nested destructuring assignment: ({ env: { SECRET } } = process);
        for (const prop of node.left.properties) {
          if (ts.isPropertyAssignment(prop)) {
            let propName: string | undefined;
            if (ts.isIdentifier(prop.name)) {
              propName = prop.name.text;
            } else if (ts.isComputedPropertyName(prop.name)) {
              const literalText = getLiteralText(prop.name);
              if (literalText === undefined) {
                const { line, character } = ts.getLineAndCharacterOfPosition(
                  sourceFile,
                  prop.name.getStart(sourceFile)
                );
                diagnostics.push({
                  code: 'RANU_BUILD_PRIVATE_ENV_CLIENT',
                  severity: 'error',
                  message: `Computed property destructuring on ${isMeta ? 'import.meta' : 'process'} object is prohibited in client-reachable code because it cannot be statically validated.`,
                  location: {
                    file: filePath,
                    line: line + 1,
                    column: character + 1,
                  },
                  hint: `Destructure specific properties statically (e.g. ({ env: { RANU_PUBLIC_VAR } } = ${isMeta ? 'import.meta' : 'process'})).`,
                });
                continue;
              }
              propName = literalText;
            } else {
              propName = getLiteralText(prop.name);
            }
            if (propName === 'env' && ts.isObjectLiteralExpression(prop.initializer)) {
              checkObjectLiteralDestructuring(prop.initializer, { kind: sourceKind, sourceText: `${targetText}.env` });
            }
          }
        }
      }
    }

    // 3. Property access: envOrigin.SECRET
    if (ts.isPropertyAccessExpression(node)) {
      const envOrigin = getEnvObjectOrigin(node.expression, envAliases, processAliases, metaAliases);
      if (envOrigin) {
        const varName = node.name.text;
        if (!isWhitelistedEnvVar(varName)) {
          const { line, character } = ts.getLineAndCharacterOfPosition(
            sourceFile,
            node.getStart(sourceFile)
          );
          diagnostics.push(createPrivateEnvDiagnostic(varName, envOrigin, line, character, filePath));
        }
      }
    }

    // 4. Element access: envOrigin['SECRET'] or envOrigin[dynamicKey]
    if (ts.isElementAccessExpression(node)) {
      const envOrigin = getEnvObjectOrigin(node.expression, envAliases, processAliases, metaAliases);
      if (envOrigin) {
        const varName = getLiteralText(node.argumentExpression);
        const { line, character } = ts.getLineAndCharacterOfPosition(
          sourceFile,
          node.getStart(sourceFile)
        );

        if (varName === undefined) {
          // Dynamic bracket access
          diagnostics.push({
            code: 'RANU_BUILD_PRIVATE_ENV_CLIENT',
            severity: 'error',
            message: `Dynamic bracket-notation access on environment object "${envOrigin.sourceText}[...]" is prohibited in client-reachable code because it cannot be statically validated.`,
            location: {
              file: filePath,
              line: line + 1,
              column: character + 1,
            },
            hint: 'Access specific public environment variables directly with static property names (e.g. process.env.RANU_PUBLIC_VAR).',
          });
        } else if (!isWhitelistedEnvVar(varName)) {
          // Static private element access
          diagnostics.push(createPrivateEnvDiagnostic(varName, envOrigin, line, character, filePath));
        }
      } else if (isProcessObject(node.expression, processAliases) || isImportMeta(node.expression, metaAliases)) {
        const propName = getLiteralText(node.argumentExpression);
        if (propName === undefined) {
          const isMeta = isImportMeta(node.expression, metaAliases);
          const targetName = isMeta ? 'import.meta' : 'process';
          const { line, character } = ts.getLineAndCharacterOfPosition(
            sourceFile,
            node.getStart(sourceFile)
          );
          diagnostics.push({
            code: 'RANU_BUILD_PRIVATE_ENV_CLIENT',
            severity: 'error',
            message: `Dynamic bracket-notation access on ${targetName} object "${targetName}[...]" is prohibited in client-reachable code because it cannot be statically validated.`,
            location: {
              file: filePath,
              line: line + 1,
              column: character + 1,
            },
            hint: `Access specific public environment variables directly with static property names (e.g. ${targetName}.env.RANU_PUBLIC_VAR).`,
          });
        }
      }
    }

    // 5. Full environment object access / spread
    // Check if the current node itself is an environment object:
    // - process.env (PropertyAccessExpression)
    // - process['env'] (ElementAccessExpression)
    // - import.meta.env (PropertyAccessExpression)
    // - import.meta['env'] (ElementAccessExpression)
    // - aliased identifier
    if (
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node) ||
      ts.isIdentifier(node)
    ) {
      // For identifiers, make sure it's an expression and not the name of a variable declaration
      if (ts.isIdentifier(node)) {
        if (
          (ts.isVariableDeclaration(node.parent) && node.parent.name === node) ||
          (ts.isBindingElement(node.parent) && (node.parent.name === node || node.parent.propertyName === node)) ||
          (ts.isParameter(node.parent) && node.parent.name === node) ||
          (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) ||
          (ts.isPropertyAssignment(node.parent) && node.parent.name === node)
        ) {
          // Skip identifier declaration sites and property names
          ts.forEachChild(node, visit);
          return;
        }
      }

      const selfEnvOrigin = getEnvObjectOrigin(node, envAliases, processAliases, metaAliases);
      if (selfEnvOrigin) {
        checkFullObjectAccess(node, selfEnvOrigin);
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
