export type ModuleClassification =
  | 'server-only'
  | 'client-entry'
  | 'client-reachable'
  | 'shared'
  | 'server-reachable'
  | 'build-only'
  | 'invalid';

export interface ModuleImport {
  specifier: string;
  resolvedPath?: string | undefined;
  isNodeBuiltin: boolean;
  isDynamic: boolean;
  line: number;
  column: number;
}

export interface ModuleNode {
  id: string; // Normalized relative or package specifier
  filePath?: string | undefined; // Absolute path if local file
  classification: ModuleClassification;
  isClientEntry: boolean;
  isServerOnly: boolean;
  serverOnlyReason?: 'server-directory' | 'server-only-import' | undefined;
  imports: ModuleImport[];
  importedBy: string[]; // Node IDs that import this node
}

export interface ModuleGraph {
  nodes: Map<string, ModuleNode>;
  serverRoots: string[];
  clientEntries: string[];
}
