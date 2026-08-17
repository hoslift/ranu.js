import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { isClientDirective } from '../compiler/directive-detector.js';
import { isServerOnlyModule } from '../compiler/server-only-detector.js';
import type { ModuleGraph, ModuleNode, ModuleImport } from './graph-types.js';

const NODE_BUILTINS = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
  'events', 'fs', 'fs/promises', 'http', 'http2', 'https', 'inspector',
  'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode',
  'querystring', 'readline', 'repl', 'stream', 'stream/consumers',
  'stream/promises', 'stream/web', 'string_decoder', 'test', 'timers',
  'timers/promises', 'tls', 'trace_events', 'tty', 'url', 'util',
  'util/types', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib'
]);

export function isNodeBuiltinModule(specifier: string): boolean {
  if (specifier.startsWith('node:')) return true;
  return NODE_BUILTINS.has(specifier);
}

/**
 * Resolves a module import specifier to an absolute file path if it is a local relative import.
 */
export function resolveImportPath(
  importerFile: string,
  specifier: string,
  _projectRoot: string
): string | undefined {
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
    // Non-relative import (e.g. package or virtual module)
    return undefined;
  }

  const importerDir = path.dirname(importerFile);
  const targetBase = path.resolve(importerDir, specifier);

  const extensions = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs'];

  // 1. Direct file with extension
  if (fs.existsSync(targetBase) && fs.statSync(targetBase).isFile()) {
    return targetBase;
  }

  // 2. Try adding extensions
  for (const ext of extensions) {
    const candidate = `${targetBase}${ext}`;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  // 3. Try directory index file
  if (fs.existsSync(targetBase) && fs.statSync(targetBase).isDirectory()) {
    for (const ext of extensions) {
      const candidate = path.join(targetBase, `index${ext}`);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }
  }

  return undefined;
}

/**
 * Extracts all imports from a source file via TypeScript AST.
 */
export function extractModuleImports(filePath: string, fileContent: string, projectRoot: string): ModuleImport[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    fileContent,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  const imports: ModuleImport[] = [];

  function visit(node: ts.Node) {
    // Static imports: import ... from 'specifier'
    if (ts.isImportDeclaration(node)) {
      if (ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text;
        const resolvedPath = resolveImportPath(filePath, specifier, projectRoot);
        const { line, character } = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));
        imports.push({
          specifier,
          resolvedPath,
          isNodeBuiltin: isNodeBuiltinModule(specifier),
          isDynamic: false,
          line: line + 1,
          column: character + 1,
        });
      }
    }
    // Dynamic imports: import('specifier')
    else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) {
        const specifier = arg.text;
        const resolvedPath = resolveImportPath(filePath, specifier, projectRoot);
        const { line, character } = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart(sourceFile));
        imports.push({
          specifier,
          resolvedPath,
          isNodeBuiltin: isNodeBuiltinModule(specifier),
          isDynamic: true,
          line: line + 1,
          column: character + 1,
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return imports;
}

/**
 * Builds and classifies the full dependency graph for the build.
 */
export function buildModuleGraph(serverRootFiles: string[], projectRoot: string): ModuleGraph {
  const nodes = new Map<string, ModuleNode>();
  const serverRoots: string[] = [];
  const clientEntries: string[] = [];

  function getOrCreateNode(filePath: string): ModuleNode {
    const normPath = path.resolve(filePath);
    const relId = path.relative(projectRoot, normPath).replace(/\\/g, '/');

    if (nodes.has(relId)) {
      return nodes.get(relId)!;
    }

    let fileContent = '';
    try {
      fileContent = fs.readFileSync(normPath, 'utf8');
    } catch {
      fileContent = '';
    }

    const isClient = isClientDirective(normPath, fileContent);
    const serverOnlyCheck = isServerOnlyModule(normPath, fileContent, projectRoot);

    const node: ModuleNode = {
      id: relId,
      filePath: normPath,
      classification: isClient ? 'client-entry' : serverOnlyCheck.isServerOnly ? 'server-only' : 'shared',
      isClientEntry: isClient,
      isServerOnly: serverOnlyCheck.isServerOnly,
      serverOnlyReason: serverOnlyCheck.reason,
      imports: [],
      importedBy: [],
    };

    nodes.set(relId, node);

    // Parse imports recursively
    const imports = extractModuleImports(normPath, fileContent, projectRoot);
    node.imports = imports;

    for (const imp of imports) {
      if (imp.resolvedPath && fs.existsSync(imp.resolvedPath)) {
        const childNode = getOrCreateNode(imp.resolvedPath);
        if (!childNode.importedBy.includes(relId)) {
          childNode.importedBy.push(relId);
        }
      }
    }

    return node;
  }

  // 1. Crawl from all server roots
  for (const rootFile of serverRootFiles) {
    if (fs.existsSync(rootFile)) {
      const rootNode = getOrCreateNode(rootFile);
      serverRoots.push(rootNode.id);
    }
  }

  // 2. Discover all client-entries in the graph
  for (const node of nodes.values()) {
    if (node.isClientEntry) {
      clientEntries.push(node.id);
    }
  }

  // 3. Mark client-reachable modules (transitive BFS/DFS from client entries)
  const clientReachable = new Set<string>();
  const queue = [...clientEntries];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    clientReachable.add(currentId);
    const currentNode = nodes.get(currentId);
    if (!currentNode) continue;

    for (const imp of currentNode.imports) {
      if (imp.resolvedPath) {
        const childRelId = path.relative(projectRoot, imp.resolvedPath).replace(/\\/g, '/');
        if (!clientReachable.has(childRelId)) {
          clientReachable.add(childRelId);
          queue.push(childRelId);
        }
      }
    }
  }

  // 4. Mark server-reachable modules (transitive from server roots)
  const serverReachable = new Set<string>();
  const serverQueue = [...serverRoots];

  while (serverQueue.length > 0) {
    const currentId = serverQueue.shift()!;
    serverReachable.add(currentId);
    const currentNode = nodes.get(currentId);
    if (!currentNode) continue;

    for (const imp of currentNode.imports) {
      if (imp.resolvedPath) {
        const childRelId = path.relative(projectRoot, imp.resolvedPath).replace(/\\/g, '/');
        if (!serverReachable.has(childRelId)) {
          serverReachable.add(childRelId);
          serverQueue.push(childRelId);
        }
      }
    }
  }

  // 5. Finalize classifications
  for (const [id, node] of nodes.entries()) {
    if (node.isClientEntry) {
      node.classification = 'client-entry';
    } else if (node.isServerOnly) {
      node.classification = 'server-only';
    } else if (clientReachable.has(id) && serverReachable.has(id)) {
      node.classification = 'shared';
    } else if (clientReachable.has(id)) {
      node.classification = 'client-reachable';
    } else if (serverReachable.has(id)) {
      node.classification = 'server-reachable';
    } else {
      node.classification = 'build-only';
    }
  }

  return {
    nodes,
    serverRoots,
    clientEntries,
  };
}
