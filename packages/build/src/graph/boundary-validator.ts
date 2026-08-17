import type { RanuDiagnostic } from '@ranu/diagnostics';
import type { ModuleGraph, ModuleNode } from './graph-types.js';

/**
 * Finds the shortest import chain from any client entry to the target module ID.
 * Returns an array of module IDs representing the path (e.g. ['app/Counter.tsx', 'app/utils.ts', 'server/db.ts']).
 */
export function findShortestImportChain(
  targetId: string,
  clientEntries: string[],
  graph: ModuleGraph
): string[] | undefined {
  if (clientEntries.includes(targetId)) {
    return [targetId];
  }

  // BFS search starting from client entries
  const queue: Array<{ id: string; path: string[] }> = clientEntries.map(id => ({
    id,
    path: [id],
  }));
  const visited = new Set<string>(clientEntries);

  while (queue.length > 0) {
    const { id, path } = queue.shift()!;
    const node = graph.nodes.get(id);
    if (!node) continue;

    for (const imp of node.imports) {
      const childId = imp.specifier.startsWith('.') && imp.resolvedPath
        ? node.imports.find(i => i.specifier === imp.specifier)?.specifier
        : imp.specifier;

      // Check resolved module node
      const resolvedNode = Array.from(graph.nodes.values()).find(
        n => n.filePath === imp.resolvedPath
      );
      const childKey = resolvedNode?.id ?? imp.specifier;

      if (childKey === targetId || imp.specifier === targetId) {
        return [...path, childKey];
      }

      if (resolvedNode && !visited.has(resolvedNode.id)) {
        visited.add(resolvedNode.id);
        queue.push({
          id: resolvedNode.id,
          path: [...path, resolvedNode.id],
        });
      }
    }
  }

  return undefined;
}

/**
 * Validates module graph boundaries between server and client worlds.
 */
export function validateGraphBoundaries(graph: ModuleGraph): {
  success: boolean;
  diagnostics: RanuDiagnostic[];
} {
  const diagnostics: RanuDiagnostic[] = [];

  // 1. Identify all client-reachable module nodes
  const clientReachableNodes = Array.from(graph.nodes.values()).filter(
    node => node.classification === 'client-entry' || node.classification === 'client-reachable' || node.classification === 'shared'
  );

  for (const node of clientReachableNodes) {
    // Check all imports from this client-reachable node
    for (const imp of node.imports) {
      // 1. Check for ranu/server-only import
      if (imp.specifier === 'ranu/server-only') {
        const chain = findShortestImportChain(node.id, graph.clientEntries, graph);
        const chainText = chain ? `\nImport chain: ${chain.join(' -> ')} -> ${imp.specifier}` : '';

        diagnostics.push({
          code: 'RANU_BUILD_SERVER_ONLY_CLIENT',
          severity: 'error',
          message: `Cannot import server-only module "${imp.specifier}" in client-reachable code: ${node.id}.${chainText}`,
          location: {
            file: node.filePath ?? node.id,
            line: imp.line,
            column: imp.column,
          },
        });
      }

      // 2. Check for Node built-in imports in client graph
      if (imp.isNodeBuiltin) {
        const chain = findShortestImportChain(node.id, graph.clientEntries, graph);
        const chainText = chain ? `\nImport chain: ${chain.join(' -> ')} -> ${imp.specifier}` : '';

        diagnostics.push({
          code: 'RANU_BUILD_NODE_BUILTIN_CLIENT',
          severity: 'error',
          message: `Node.js built-in module "${imp.specifier}" cannot be imported from client-reachable code: ${node.id}.${chainText}`,
          location: {
            file: node.filePath ?? node.id,
            line: imp.line,
            column: imp.column,
          },
        });
      }

      // 3. Check for importing a module that is server-only (e.g. located in server/ or imports ranu/server-only)
      if (imp.resolvedPath) {
        const resolvedNode = Array.from(graph.nodes.values()).find(
          n => n.filePath === imp.resolvedPath
        );
        if (resolvedNode?.isServerOnly) {
          const chain = findShortestImportChain(resolvedNode.id, graph.clientEntries, graph);
          const chainText = chain ? `\nImport chain: ${chain.join(' -> ')}` : '';

          diagnostics.push({
            code: 'RANU_BUILD_CLIENT_SERVER_BOUNDARY',
            severity: 'error',
            message: `Client module "${node.id}" cannot import server-only module "${resolvedNode.id}".${chainText}`,
            location: {
              file: node.filePath ?? node.id,
              line: imp.line,
              column: imp.column,
            },
          });
        }
      }
    }
  }

  return {
    success: diagnostics.length === 0,
    diagnostics,
  };
}
