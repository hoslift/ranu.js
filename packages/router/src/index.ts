import fs from 'fs';
import path from 'path';
import type { RouteKind, RenderMode, RanuMode, RanuCommand, HttpMethod } from '@ranu/core';
import type { RanuDiagnostic } from '@ranu/diagnostics';
import { ROUTE_MANIFEST_SCHEMA_VERSION } from '@ranu/manifests';
import type { RouteManifest, RouteManifestEntry } from '@ranu/manifests';

/** Supported route segment types */
export type RouteSegmentType =
  | 'static'
  | 'dynamic'
  | 'catch-all'
  | 'optional-catch-all'
  | 'group'
  | 'private';

/** A parsed route segment */
export interface RouteSegment {
  raw: string;
  type: RouteSegmentType;
  param?: string;
}

/** Structured route pattern segment representation */
export interface CompiledRouteSegment {
  kind: 'static' | 'dynamic' | 'catch-all' | 'optional-catch-all';
  value?: string;
  param?: string;
}

/** Structured compiled route pattern */
export interface CompiledRoutePattern {
  segments: CompiledRouteSegment[];
}

/** Compiled Route Matcher Record */
export interface CompiledApiRouteRecord {
  routeId: string;
  kind: 'api';
  pattern: CompiledRoutePattern;
  pathnameTemplate: string;
  params: string[];
  methods: HttpMethod[]; // Required and non-empty
  layouts: [];          // Explicitly empty for API routes
  loading: undefined;   // Explicitly undefined for API routes
  errors: [];           // Explicitly empty for API routes
  notFound: undefined;  // Explicitly undefined for API routes
}

export interface CompiledPageRouteRecord {
  routeId: string;
  kind: 'page';
  pattern: CompiledRoutePattern;
  pathnameTemplate: string;
  params: string[];
  layouts: string[];
  loading?: string | undefined;
  errors: string[];
  notFound?: string[] | undefined;
}

export type CompiledRouteRecord = CompiledApiRouteRecord | CompiledPageRouteRecord;


/** Match Result Contract */
export interface RouteMatch {
  routeId: string;
  kind: RouteKind;
  params: Record<string, string | string[]>;
  pathname: string;
}

/** Node representation in the routing tree */
export interface RouteTreeNode {
  id: string;
  filePath: string; // Relative to app root
  segment: string; // Raw folder segment name
  parsedSegment: RouteSegment;
  parentId?: string;
  children: string[];
  page?: string;
  route?: string;
  layout?: string;
  loading?: string;
  error?: string;
  notFound?: string;
}

/** Parse a route segment string into a structured segment */
export function parseSegment(segment: string): RouteSegment {
  if (segment === '_ranu' || segment.startsWith('_ranu') || segment.startsWith('(_ranu)')) {
    throw new Error('RANU_ROUTE_INVALID_SEGMENT: Application route cannot claim reserved framework namespace');
  }
  if (segment.startsWith('_')) {
    return { raw: segment, type: 'private' };
  }
  if (segment.startsWith('(') && segment.endsWith(')')) {
    const groupName = segment.slice(1, -1);
    if (!groupName) {
      throw new Error('RANU_ROUTE_INVALID_SEGMENT: Group segment name cannot be empty');
    }
    return { raw: segment, type: 'group' };
  }
  if (segment.startsWith('[[') && segment.endsWith(']]')) {
    const content = segment.slice(2, -2);
    if (!content.startsWith('...')) {
      throw new Error('RANU_ROUTE_INVALID_SEGMENT: Optional catch-all must start with "..."');
    }
    const paramName = content.slice(3);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(paramName)) {
      throw new Error('RANU_ROUTE_INVALID_PARAM: Invalid parameter name syntax');
    }
    return { raw: segment, type: 'optional-catch-all', param: paramName };
  }
  if (segment.startsWith('[') && segment.endsWith(']')) {
    const content = segment.slice(1, -1);
    if (content.startsWith('...')) {
      const paramName = content.slice(3);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(paramName)) {
        throw new Error('RANU_ROUTE_INVALID_PARAM: Invalid parameter name syntax');
      }
      return { raw: segment, type: 'catch-all', param: paramName };
    } else {
      const paramName = content;
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(paramName)) {
        throw new Error('RANU_ROUTE_INVALID_PARAM: Invalid parameter name syntax');
      }
      return { raw: segment, type: 'dynamic', param: paramName };
    }
  }
  
  if (segment.includes('[') || segment.includes(']') || segment.includes('(') || segment.includes(')')) {
    throw new Error('RANU_ROUTE_INVALID_SEGMENT: Unbalanced or malformed brackets/parentheses');
  }

  return { raw: segment, type: 'static' };
}

/** Safe Segment Decoding Helper */
export function safeDecodeSegment(segment: string): string | null {
  try {
    const decoded = decodeURIComponent(segment);
    // Enforce path containment and prevent traversal bypasses
    if (decoded.includes('/') || decoded.includes('\\') || decoded === '.' || decoded === '..') {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

/** Discover all route modules in the configured app directory */
export interface DiscoverRoutesOptions {
  fsModule?: any;
  analyzeRouteMethods?: (filePath: string, fileContent: string) => { methods: HttpMethod[]; diagnostics: RanuDiagnostic[] };
}

/** Discover all route modules in the configured app directory */
export function discoverRoutes(appDir: string, options: DiscoverRoutesOptions = {}): {
  tree: Record<string, RouteTreeNode>;
  records: CompiledRouteRecord[];
  diagnostics: RanuDiagnostic[];
  rootNotFound?: string;
} {
  const fsModule = options.fsModule || fs;
  const analyzeRouteMethods = options.analyzeRouteMethods;
  const tree: Record<string, RouteTreeNode> = {};
  const diagnostics: RanuDiagnostic[] = [];
  const resolvedAppDir = path.resolve(appDir);

  const supportedExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];
  const reservedRoles = ['page', 'layout', 'route', 'loading', 'error', 'not-found'];

  function checkContainment(p: string): boolean {
    const resolved = path.resolve(p);
    return resolved.startsWith(resolvedAppDir);
  }

  function crawl(dirPath: string, parentId?: string) {
    if (!checkContainment(dirPath)) {
      return; // Stop traversal
    }

    let stats: fs.Stats;
    try {
      stats = fsModule.lstatSync(dirPath);
    } catch {
      return;
    }

    if (stats.isSymbolicLink()) {
      return; // Skip symbolic links in V1
    }

    const items = fsModule.readdirSync(dirPath);
    const lowercaseMap: Record<string, string[]> = {};
    for (const item of items) {
      const lower = item.toLowerCase();
      if (!lowercaseMap[lower]) {
        lowercaseMap[lower] = [];
      }
      lowercaseMap[lower].push(item);
    }

    // Check Case Portability Collision
    for (const [lower, actuals] of Object.entries(lowercaseMap)) {
      if (actuals.length > 1) {
        // Find if they are subdirectories
        const dirs = actuals.filter(act => {
          try {
            return fsModule.statSync(path.join(dirPath, act)).isDirectory();
          } catch {
            return false;
          }
        });
        if (dirs.length > 1) {
          diagnostics.push({
            code: 'RANU_ROUTE_CASE_COLLISION',
            severity: 'error',
            message: `Case portability collision: Sibling directories differ only in casing: ${dirs.join(', ')}`,
            location: { file: path.relative(resolvedAppDir, path.join(dirPath, dirs[0]!)) }
          });
        }
      }
    }

    const relativeDirPath = path.relative(resolvedAppDir, dirPath).replace(/\\/g, '/');
    const segmentName = path.basename(dirPath);

    let parsedSegment: RouteSegment;
    try {
      parsedSegment = parentId ? parseSegment(segmentName) : { raw: '', type: 'static' };
    } catch (err: any) {
      diagnostics.push({
        code: err.message.includes('INVALID_PARAM') ? 'RANU_ROUTE_INVALID_PARAM' : 'RANU_ROUTE_INVALID_SEGMENT',
        severity: 'error',
        message: err.message || 'Invalid route segment syntax',
        location: { file: relativeDirPath || '.' }
      });
      return; // Skip invalid segment subtree
    }

    const node: RouteTreeNode = {
      id: relativeDirPath || '/',
      filePath: relativeDirPath,
      segment: segmentName,
      parsedSegment,
      children: []
    };
    if (parentId !== undefined) {
      node.parentId = parentId;
    }

    // Analyze files inside the current folder
    const filesByRole: Record<string, string[]> = {};
    for (const item of items) {
      const full = path.join(dirPath, item);
      let itemStats: fs.Stats;
      try {
        itemStats = fsModule.lstatSync(full);
      } catch {
        continue;
      }
      if (itemStats.isFile()) {
        const ext = path.extname(item);
        if (supportedExtensions.includes(ext)) {
          const role = path.basename(item, ext);
          const lowerRole = role.toLowerCase();
          if (reservedRoles.includes(lowerRole)) {
            if (role !== lowerRole) {
              // Casing mismatch: ignored silently for route module registry
              continue;
            }
            if (!filesByRole[lowerRole]) {
              filesByRole[lowerRole] = [];
            }
            filesByRole[lowerRole].push(path.relative(resolvedAppDir, full).replace(/\\/g, '/'));
          }
        }
      }
    }

    // Check duplicate modules
    for (const [role, paths] of Object.entries(filesByRole)) {
      if (paths.length > 1) {
        diagnostics.push({
          code: 'RANU_ROUTE_DUPLICATE_MODULE',
          severity: 'error',
          message: `Multiple files found for the same reserved role "${role}" in directory: ${relativeDirPath || '.'}`,
          location: { file: paths[0]! }
        });
      }
      const canonicalPath = paths[0]!;
      if (role === 'page') node.page = canonicalPath;
      else if (role === 'route') node.route = canonicalPath;
      else if (role === 'layout') node.layout = canonicalPath;
      else if (role === 'loading') node.loading = canonicalPath;
      else if (role === 'error') node.error = canonicalPath;
      else if (role === 'not-found') node.notFound = canonicalPath;
    }

    // Check private directory endpoint misuse
    const isInsidePrivateDir = relativeDirPath.split('/').some(s => s.startsWith('_'));
    if (isInsidePrivateDir) {
      if (node.page) {
        diagnostics.push({
          code: 'RANU_ROUTE_INVALID_SEGMENT',
          severity: 'error',
          message: `Reserved route module 'page' was found inside private directory: ${node.page}. Reserved files inside private directories do not become public routes.`,
          location: { file: node.page }
        });
        delete node.page;
      }
      if (node.route) {
        diagnostics.push({
          code: 'RANU_ROUTE_INVALID_SEGMENT',
          severity: 'error',
          message: `Reserved route module 'route' was found inside private directory: ${node.route}. Reserved files inside private directories do not become public routes.`,
          location: { file: node.route }
        });
        delete node.route;
      }
    }

    // Kind collision check
    if (node.page && node.route) {
      diagnostics.push({
        code: 'RANU_ROUTE_KIND_COLLISION',
        severity: 'error',
        message: `Route kind collision: Both page and route own the same URL endpoint in directory: ${relativeDirPath || '.'}`,
        location: { file: node.page }
      });
    }

    const nodeId = node.id;
    tree[nodeId] = node;

    // Recurse into directories
    for (const item of items) {
      const full = path.join(dirPath, item);
      let itemStats: fs.Stats;
      try {
        itemStats = fsModule.lstatSync(full);
      } catch {
        continue;
      }
      if (itemStats.isDirectory() && !item.startsWith('.')) {
        node.children.push(path.relative(resolvedAppDir, full).replace(/\\/g, '/'));
        crawl(full, nodeId);
      }
    }
  }

  if (fsModule.existsSync(resolvedAppDir)) {
    crawl(resolvedAppDir);
  }

  // Derive Endpoints & Records
  const records: CompiledRouteRecord[] = [];
  const endpointSignatures: Record<string, { routeId: string; filePath: string }[]> = {};

  // Traversal to resolve endpoints
  function resolveEndpoints(
    nodeId: string,
    ancestorLayouts: string[],
    ancestorErrors: string[],
    currentLoading: string | undefined,
    ancestorNotFound: string[]
  ) {
    const node = tree[nodeId];
    if (!node) return;

    const localLayouts = [...ancestorLayouts];
    if (node.layout) localLayouts.push(node.layout);

    const localErrors = node.error ? [node.error, ...ancestorErrors] : ancestorErrors;
    const localLoading = node.loading || currentLoading;
    const localNotFound = node.notFound ? [node.notFound, ...ancestorNotFound] : ancestorNotFound;

    // Derive Route details if page or route exists
    if ((node.page || node.route) && !(node.page && node.route)) {
      const kind: RouteKind = node.page ? 'page' : 'api';
      const fileTarget = node.page || node.route!;

      // Project path URL segments (remove groups and private folders)
      const pathParts = node.id === '/' ? [] : node.id.split('/');
      const urlSegments: string[] = [];
      const paramsList: string[] = [];
      let isCatchAllTerminal = false;

      for (const p of pathParts) {
        const seg = parseSegment(p);
        if (seg.type !== 'group' && seg.type !== 'private') {
          urlSegments.push(p);
          if (seg.param) {
            paramsList.push(seg.param);
          }
          if (seg.type === 'catch-all' || seg.type === 'optional-catch-all') {
            isCatchAllTerminal = true;
          }
        }
      }

      // Check Catch-All terminal placement rule
      if (isCatchAllTerminal) {
        const idx = urlSegments.findIndex(p => {
          const seg = parseSegment(p);
          return seg.type === 'catch-all' || seg.type === 'optional-catch-all';
        });
        if (idx !== -1 && idx < urlSegments.length - 1) {
          diagnostics.push({
            code: 'RANU_ROUTE_INVALID_CATCH_ALL',
            severity: 'error',
            message: `Catch-all segment must be the terminal segment in path: ${node.id}`,
            location: { file: fileTarget }
          });
        }
      }

      // Check duplicate parameters
      const duplicates = paramsList.filter((item, index) => paramsList.indexOf(item) !== index);
      if (duplicates.length > 0) {
        diagnostics.push({
          code: 'RANU_ROUTE_DUPLICATE_PARAM',
          severity: 'error',
          message: `Duplicate parameter name "${duplicates[0]}" along the route path: ${node.id}`,
          location: { file: fileTarget }
        });
      }

      const patternSegments: CompiledRouteSegment[] = urlSegments.map(p => {
        const parsed = parseSegment(p);
        if (parsed.type === 'dynamic') {
          return { kind: 'dynamic', param: parsed.param! };
        } else if (parsed.type === 'catch-all') {
          return { kind: 'catch-all', param: parsed.param! };
        } else if (parsed.type === 'optional-catch-all') {
          return { kind: 'optional-catch-all', param: parsed.param! };
        }
        return { kind: 'static', value: p };
      });

      const pathnameTemplate = '/' + urlSegments.join('/');
      const routeId = `${kind}:${pathnameTemplate}`;

      // Check reserved namespace /_ranu/
      if (pathnameTemplate === '/_ranu' || pathnameTemplate.startsWith('/_ranu/')) {
        diagnostics.push({
          code: 'RANU_ROUTE_INVALID_SEGMENT',
          severity: 'error',
          message: `Application route cannot claim reserved framework namespace: "${pathnameTemplate}"`,
          location: { file: fileTarget }
        });
      }

      // Collision signature generation (parameter-name-independent)
      const sigParts = urlSegments.map(p => {
        const parsed = parseSegment(p);
        if (parsed.type === 'dynamic') return 'D';
        if (parsed.type === 'catch-all') return 'C';
        if (parsed.type === 'optional-catch-all') return 'OC';
        return `S:${p}`;
      });
      const signature = '/' + sigParts.join('/');

      if (!endpointSignatures[signature]) {
        endpointSignatures[signature] = [];
      }
      endpointSignatures[signature].push({ routeId, filePath: fileTarget });

      if (kind === 'api') {
        let discoveredMethods: HttpMethod[] = [];
        if (analyzeRouteMethods) {
          try {
            const fileContent = fsModule.readFileSync(path.join(resolvedAppDir, fileTarget), 'utf8');
            const analysis = analyzeRouteMethods(fileTarget, fileContent);
            discoveredMethods = analysis.methods;
            diagnostics.push(...analysis.diagnostics);
          } catch (err: any) {
            diagnostics.push({
              code: 'RANU_ROUTE_FILE_READ_ERROR',
              severity: 'error',
              message: `Failed to read API route file: ${err.message}`,
              location: { file: fileTarget }
            });
          }
        }

        // Assert non-empty methods for V2 API route compilation, unless a syntax error was already reported
        const hasSyntaxError = diagnostics.some(d => d.location?.file === fileTarget && d.code === 'RANU_ROUTE_SYNTAX_ERROR');
        if (discoveredMethods.length === 0 && !hasSyntaxError) {
          diagnostics.push({
            code: 'RANU_ROUTE_NO_METHODS',
            severity: 'error',
            message: `API route module has no supported HTTP method exports. An API route must export at least one HTTP method (GET, POST, etc.).`,
            location: { file: fileTarget }
          });
        }

        records.push({
          routeId,
          kind: 'api',
          pattern: { segments: patternSegments },
          pathnameTemplate,
          params: paramsList,
          methods: discoveredMethods,
          layouts: [],
          loading: undefined,
          errors: [],
          notFound: undefined
        });
      } else {
        records.push({
          routeId,
          kind: 'page',
          pattern: { segments: patternSegments },
          pathnameTemplate,
          params: paramsList,
          layouts: localLayouts,
          loading: localLoading,
          errors: localErrors,
          notFound: localNotFound.length > 0 ? localNotFound : undefined
        });
      }
    }

    for (const childId of node.children) {
      resolveEndpoints(childId, localLayouts, localErrors, localLoading, localNotFound);
    }
  }

  resolveEndpoints('/', [], [], undefined, []);

  // Check Collisions and Sibling Ambiguities
  for (const [signature, matches] of Object.entries(endpointSignatures)) {
    if (matches.length > 1) {
      const files = matches.map(m => m.filePath);
      const hasPage = matches.some(m => m.routeId.startsWith('page:'));
      const hasApi = matches.some(m => m.routeId.startsWith('api:'));

      if (hasPage && hasApi) {
        diagnostics.push({
          code: 'RANU_ROUTE_KIND_COLLISION',
          severity: 'error',
          message: `Route kind collision: Both page and route own the same URL endpoint: ${signature}. Conflicting files: ${files.join(', ')}`,
          location: { file: files[0]! }
        });
      } else {
        diagnostics.push({
          code: 'RANU_ROUTE_COLLISION',
          severity: 'error',
          message: `Route collision: Multiple endpoints resolve to the same public URL signature: ${signature}. Conflicting files: ${files.join(', ')}`,
          location: { file: files[0]! }
        });
      }
    }
  }

  // Sibling catch-all / optional catch-all ambiguity check
  for (const [nodeId, node] of Object.entries(tree)) {
    const childSegments = node.children.map(cId => tree[cId]).filter((c): c is RouteTreeNode => !!c);
    let hasCatchAll = false;
    let hasOptionalCatchAll = false;
    let conflictFile = '';

    for (const child of childSegments) {
      if (child.parsedSegment.type === 'catch-all') {
        hasCatchAll = true;
        if (child.page || child.route) conflictFile = child.page || child.route!;
      }
      if (child.parsedSegment.type === 'optional-catch-all') {
        hasOptionalCatchAll = true;
        if (child.page || child.route) conflictFile = child.page || child.route!;
      }
    }

    if (hasCatchAll && hasOptionalCatchAll) {
      const diag: RanuDiagnostic = {
        code: 'RANU_ROUTE_AMBIGUOUS',
        severity: 'error',
        message: `Ambiguous sibling catch-all/optional catch-all under path: ${node.id}`
      };
      if (conflictFile) {
        diag.location = { file: conflictFile };
      }
      diagnostics.push(diag);
    }
  }

  // Missing Root Layout Validation
  const hasPageRoutes = records.some(r => r.kind === 'page');
  const rootNode = tree['/'];
  const hasRootLayout = rootNode && rootNode.layout;

  if (hasPageRoutes && !hasRootLayout) {
    diagnostics.push({
      code: 'RANU_ROUTE_MISSING_ROOT_LAYOUT',
      severity: 'error',
      message: 'Page routes exist, but no root layout file ("layout.*") was found in the app directory root.'
    });
  }

  // Precedence Sorting
  records.sort((a, b) => {
    const segsA = a.pattern.segments;
    const segsB = b.pattern.segments;
    const maxLen = Math.max(segsA.length, segsB.length);

    const kindPriority = {
      'static': 4,
      'dynamic': 3,
      'catch-all': 2,
      'optional-catch-all': 1
    };

    for (let i = 0; i < maxLen; i++) {
      const segA = segsA[i];
      const segB = segsB[i];

      if (segA && segB) {
        const prioA = kindPriority[segA.kind];
        const prioB = kindPriority[segB.kind];
        if (prioA !== prioB) {
          return prioB - prioA; // Higher priority first
        }
        if (segA.kind === 'static' && segB.kind === 'static') {
          const comp = segA.value!.localeCompare(segB.value!);
          if (comp !== 0) return comp;
        }
      } else if (!segA && segB) {
        return -1; // Shorter path comes first (ranks higher)
      } else if (segA && !segB) {
        return 1;
      }
    }

    return a.pathnameTemplate.localeCompare(b.pathnameTemplate);
  });

  const rootNotFound = tree['/']?.notFound;

  const result: {
    tree: Record<string, RouteTreeNode>;
    records: CompiledRouteRecord[];
    diagnostics: RanuDiagnostic[];
    rootNotFound?: string;
  } = {
    tree,
    records,
    diagnostics
  };

  if (rootNotFound !== undefined) {
    result.rootNotFound = rootNotFound;
  }

  return result;
}

/** Runtime Matcher */
export function matchRoute(pathname: string, records: CompiledRouteRecord[]): RouteMatch | null {
  // Normalize path
  let normalPath = pathname.split('?')[0]!;
  if (normalPath !== '/' && normalPath.endsWith('/')) {
    normalPath = normalPath.slice(0, -1);
  }

  const rawSegments = normalPath.split('/').filter(Boolean);
  const pathSegments: string[] = [];

  for (const s of rawSegments) {
    const decoded = safeDecodeSegment(s);
    if (decoded === null) {
      return null; // Graceful match failure on malformed percent encoding or directory traversal bypass
    }
    pathSegments.push(decoded);
  }

  for (const record of records) {
    const patternsegs = record.pattern.segments;
    const params: Record<string, string | string[]> = {};
    let pIdx = 0;
    let rIdx = 0;
    let matchSucceeded = true;

    while (rIdx < patternsegs.length) {
      const seg = patternsegs[rIdx]!;

      if (seg.kind === 'static') {
        if (pIdx >= pathSegments.length || pathSegments[pIdx] !== seg.value) {
          matchSucceeded = false;
          break;
        }
        pIdx++;
      } else if (seg.kind === 'dynamic') {
        if (pIdx >= pathSegments.length) {
          matchSucceeded = false;
          break;
        }
        params[seg.param!] = pathSegments[pIdx]!;
        pIdx++;
      } else if (seg.kind === 'catch-all') {
        if (pIdx >= pathSegments.length) {
          matchSucceeded = false;
          break;
        }
        params[seg.param!] = pathSegments.slice(pIdx);
        pIdx = pathSegments.length;
      } else if (seg.kind === 'optional-catch-all') {
        if (pIdx >= pathSegments.length) {
          params[seg.param!] = [];
        } else {
          params[seg.param!] = pathSegments.slice(pIdx);
          pIdx = pathSegments.length;
        }
      }
      rIdx++;
    }

    if (matchSucceeded && pIdx === pathSegments.length) {
      return {
        routeId: record.routeId,
        kind: record.kind,
        params,
        pathname
      };
    }
  }

  return null;
}

/** Generate RouteManifest from compiled records */
export function generateRouteManifest(records: CompiledRouteRecord[], buildId: string): RouteManifest {
  const routes: RouteManifestEntry[] = records.map(r => {
    if (r.kind === 'api') {
      return {
        id: r.routeId,
        kind: 'api',
        pattern: r.pathnameTemplate,
        params: r.params,
        methods: r.methods
      };
    } else {
      return {
        id: r.routeId,
        kind: 'page',
        pattern: r.pathnameTemplate,
        params: r.params
      };
    }
  });

  // Sort alphabetically by pattern as required by validateRouteManifest
  routes.sort((a, b) => a.pattern.localeCompare(b.pattern));

  return {
    schemaVersion: ROUTE_MANIFEST_SCHEMA_VERSION,
    buildId,
    routes
  };
}
