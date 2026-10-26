import fs from 'node:fs';
import path from 'node:path';
import { discoverConfig, validateUserConfig, loadConfig } from '@ranu/config';
import { discoverRoutes } from '@ranu/router';
import {
  analyzeRouteMethods,
  buildModuleGraph,
  validateGraphBoundaries,
  validateGraphEnvAccess,
  validateNonSerializableProps,
} from '@ranu/build';
import type { RanuDiagnostic } from '@ranu/diagnostics';
import type { ParsedCliArgs, CliLogger } from '../types.js';
import { discoverProjectRoot, validateNodeVersion } from '../context.js';

export interface CodePatch {
  file: string;
  code: string;
  description: string;
  diff: string;
}

export interface FixResult {
  success: boolean;
  fixedCount: number;
  unfixedCount: number;
  patches: CodePatch[];
  diagnosticsRemaining: RanuDiagnostic[];
}

/**
 * Resolves a diagnostic file path against project root and app directory.
 */
function resolveFilePath(file: string, projectRoot: string): string | null {
  if (path.isAbsolute(file) && fs.existsSync(file)) return file;
  const inRoot = path.resolve(projectRoot, file);
  if (fs.existsSync(inRoot)) return inRoot;
  const inApp = path.resolve(projectRoot, 'app', file);
  if (fs.existsSync(inApp)) return inApp;
  return null;
}

/**
 * Generates a unified diff representation for console or JSON logging.
 */
function createUnifiedDiff(filePath: string, original: string, modified: string): string {
  const origLines = original.split(/\r?\n/);
  const modLines = modified.split(/\r?\n/);
  const diffLines: string[] = [
    `--- a/${filePath.replace(/\\/g, '/')}`,
    `+++ b/${filePath.replace(/\\/g, '/')}`,
  ];

  let i = 0;
  let j = 0;
  while (i < origLines.length || j < modLines.length) {
    if (origLines[i] === modLines[j]) {
      i++;
      j++;
    } else {
      if (i < origLines.length && !modLines.includes(origLines[i]!)) {
        diffLines.push(`- ${origLines[i]}`);
        i++;
      } else if (j < modLines.length && !origLines.includes(modLines[j]!)) {
        diffLines.push(`+ ${modLines[j]}`);
        j++;
      } else {
        if (i < origLines.length) {
          diffLines.push(`- ${origLines[i]}`);
          i++;
        }
        if (j < modLines.length) {
          diffLines.push(`+ ${modLines[j]}`);
          j++;
        }
      }
    }
  }

  return diffLines.join('\n');
}

/**
 * Collects diagnostics across configuration, routing, and module graph invariants.
 */
async function collectDiagnostics(projectRoot: string): Promise<RanuDiagnostic[]> {
  const diagnostics: RanuDiagnostic[] = [];
  const appDir = path.join(projectRoot, 'app');

  // 1. Config validation
  const { configPath, diagnostic: configDiscoveryDiag } = discoverConfig(projectRoot);
  if (configDiscoveryDiag) {
    diagnostics.push(configDiscoveryDiag);
  } else if (configPath) {
    try {
      const userConfig = await loadConfig(configPath);
      const validation = validateUserConfig(userConfig);
      for (const diag of validation.diagnostics) {
        if (!diag.location) {
          diag.location = { file: configPath };
        }
        diagnostics.push(diag);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      diagnostics.push({
        code: 'RANU_CONFIG_LOAD_FAILED',
        severity: 'error',
        message: `Failed to load config: ${message}`,
        location: { file: configPath },
      });
    }
  }

  // 2. Route Discovery
  if (fs.existsSync(appDir)) {
    const routeRes = discoverRoutes(appDir, { analyzeRouteMethods });
    diagnostics.push(...routeRes.diagnostics);
  }

  // 3. Module Graph Invariants
  const serverRootFiles: string[] = [];
  function collectFiles(dir: string) {
    if (!fs.existsSync(dir)) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          collectFiles(full);
        } else if (entry.isFile() && /\.(tsx|ts|jsx|js|mjs)$/.test(entry.name)) {
          serverRootFiles.push(full);
        }
      }
    } catch {
      // Ignore
    }
  }

  collectFiles(appDir);

  if (serverRootFiles.length > 0) {
    const moduleGraph = buildModuleGraph(serverRootFiles, projectRoot);
    diagnostics.push(...validateGraphBoundaries(moduleGraph).diagnostics);
    diagnostics.push(...validateGraphEnvAccess(moduleGraph).diagnostics);
    diagnostics.push(...validateNonSerializableProps(moduleGraph).diagnostics);
  }

  return diagnostics;
}

/**
 * Executes the `ranu fix` command for self-healing diagnostic patch application.
 *
 * @param args - CLI arguments (supports `--dry-run`, `--format json`, `--yes`)
 * @param logger - CLI logger instance
 * @returns 0 on success, 1 if unfixable errors remain
 */
export async function runFixCommand(args: ParsedCliArgs, logger: CliLogger): Promise<number> {
  const isDryRun = Boolean(args.dryRun ?? args['dry-run']);
  const isJson = args.format === 'json' || Boolean(args.json);

  try {
    validateNodeVersion();
  } catch {
    // Continue
  }

  const cwd = process.cwd();
  const rawRoot = args.root ? path.resolve(cwd, args.root) : discoverProjectRoot(cwd);
  const projectRoot = path.resolve(rawRoot);

  if (!fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) {
    if (isJson) {
      logger.json({
        success: false,
        fixedCount: 0,
        unfixedCount: 1,
        patches: [],
        diagnosticsRemaining: [
          {
            code: 'RANU_PROJECT_ROOT_NOT_FOUND',
            severity: 'error',
            message: `Project root directory does not exist: "${projectRoot}"`,
          },
        ],
      });
    } else {
      logger.error(`Project root directory does not exist: "${projectRoot}"`);
    }
    return 1;
  }

  const initialDiagnostics = await collectDiagnostics(projectRoot);
  const patches: CodePatch[] = [];

  // Group actionable diagnostics by target file
  const fileFixMap = new Map<string, RanuDiagnostic[]>();
  for (const diag of initialDiagnostics) {
    if (diag.location?.file) {
      const fullPath = resolveFilePath(diag.location.file, projectRoot);
      if (fullPath) {
        const existing = fileFixMap.get(fullPath) || [];
        existing.push(diag);
        fileFixMap.set(fullPath, existing);
      }
    }
  }

  // Also collect all source files in app/ to detect proactive fixes (hooks without use client, secret leaks)
  const appDir = path.join(projectRoot, 'app');
  function findAppFiles(dir: string, out: string[]) {
    if (!fs.existsSync(dir)) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          findAppFiles(full, out);
        } else if (entry.isFile() && /\.(tsx|ts|jsx|js)$/.test(entry.name)) {
          out.push(full);
        }
      }
    } catch {
      // Ignore
    }
  }

  const allAppFiles: string[] = [];
  findAppFiles(appDir, allAppFiles);

  for (const filePath of allAppFiles) {
    if (!fileFixMap.has(filePath)) {
      fileFixMap.set(filePath, []);
    }
  }

  for (const [filePath, diags] of fileFixMap.entries()) {
    if (!fs.existsSync(filePath)) continue;
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    const appliedFixes: string[] = [];

    const isClientFile = content.includes("'use client'") || content.includes('"use client"');
    const usesClientHooks = /\b(useState|useEffect|useReducer|useRef|useLayoutEffect|useId|useContext)\b/.test(content);
    const isComponent = /\.(tsx|jsx)$/.test(filePath);

    // 1. Missing 'use client' directive
    const needsClientDirective =
      (!isClientFile && usesClientHooks && isComponent) ||
      diags.some(
        (d) =>
          d.code === 'RANU_BOUNDARY_CLIENT_MISSING_DIRECTIVE' ||
          d.code === 'RANU_REACT_CLIENT_DIRECTIVE_MISSING' ||
          (d.hint && d.hint.includes("Add 'use client'"))
      );

    if (needsClientDirective && !content.includes("'use client'") && !content.includes('"use client"')) {
      content = `'use client';\n\n` + content;
      appliedFixes.push("Prepend 'use client' directive");
    }

    // 2. Private env in client code
    const hasEnvDiagnostics =
      isClientFile ||
      content.includes("'use client'") ||
      diags.some(
        (d) =>
          d.code === 'RANU_BUILD_PRIVATE_ENV_CLIENT' ||
          d.code === 'RANU_ENV_CLIENT_LEAK' ||
          d.code === 'RANU_ENV_PRIVATE_IN_CLIENT' ||
          (d.message && d.message.includes('process.env') && d.message.includes('prohibited'))
      );

    if (hasEnvDiagnostics && (content.includes('process.env') || content.includes('import.meta.env') || content.includes("process['env']"))) {
      // Replace private variables with RANU_PUBLIC_ prefix
      const envRegex = /process\.env\.([A-Z0-9_]+)/g;
      let match: RegExpExecArray | null;
      const seenVars = new Set<string>();
      while ((match = envRegex.exec(content)) !== null) {
        const varName = match[1]!;
        if (!varName.startsWith('RANU_PUBLIC_') && varName !== 'NODE_ENV') {
          seenVars.add(varName);
        }
      }

      for (const varName of seenVars) {
        const publicVar = `RANU_PUBLIC_${varName}`;
        content = content.replace(new RegExp(`process\\.env\\.${varName}\\b`, 'g'), `process.env.${publicVar}`);
        content = content.replace(new RegExp(`process\\s*\\[\\s*['"]env['"]\\s*\\]\\s*\\[\\s*['"]${varName}['"]\\s*\\]`, 'g'), `process.env.${publicVar}`);
        content = content.replace(new RegExp(`import\\.meta\\.env\\.${varName}\\b`, 'g'), `import.meta.env.${publicVar}`);
        appliedFixes.push(`Replace private secret ${varName} with ${publicVar}`);
      }
    }

    // 3. Missing API Route Handler method export
    const isRouteFile = path.basename(filePath).startsWith('route.');
    const hasRouteDiag = diags.some(
      (d) =>
        d.code === 'RANU_ROUTE_NO_METHODS' ||
        d.code === 'RANU_ROUTER_MISSING_HANDLER_EXPORT' ||
        (d.message && d.message.includes('must export at least one HTTP method'))
    );

    if (isRouteFile && (hasRouteDiag || (!content.includes('export async function') && !content.includes('export function') && !content.includes('export const')))) {
      if (!content.includes('export async function GET') && !content.includes('export function GET') && !content.includes('export const GET')) {
        content = content.trimEnd() + `\n\nexport async function GET(request: Request): Promise<Response> {\n  return Response.json({ ok: true });\n}\n`;
        appliedFixes.push('Add default GET route handler export');
      }
    }

    // 4. Missing Page default export
    const isPageFile = path.basename(filePath).startsWith('page.');
    const hasPageDiag = diags.some(
      (d) =>
        d.code === 'RANU_PAGE_MISSING_DEFAULT_EXPORT' ||
        (d.message && d.message.includes('must have a default export'))
    );

    if (isPageFile && hasPageDiag && !content.includes('export default')) {
      content = content.trimEnd() + `\n\nexport default function Page() {\n  return <div>Page Content</div>;\n}\n`;
      appliedFixes.push('Add default export React component');
    }

    if (content !== originalContent) {
      const relPath = path.relative(projectRoot, filePath).replace(/\\/g, '/');
      const diff = createUnifiedDiff(relPath, originalContent, content);
      patches.push({
        file: relPath,
        code: diags.length > 0 ? diags.map((d) => d.code).join(', ') : 'AUTO_FIX',
        description: appliedFixes.join('; '),
        diff,
      });

      if (!isDryRun) {
        fs.writeFileSync(filePath, content, 'utf8');
      }
    }
  }

  // Re-run validation to evaluate post-fix status
  const postDiagnostics = isDryRun
    ? initialDiagnostics
    : await collectDiagnostics(projectRoot);

  const errorsRemaining = postDiagnostics.filter((d) => d.severity === 'error');
  const warningsRemaining = postDiagnostics.filter((d) => d.severity === 'warning');
  const success = errorsRemaining.length === 0;

  const result: FixResult = {
    success,
    fixedCount: patches.length,
    unfixedCount: errorsRemaining.length,
    patches,
    diagnosticsRemaining: postDiagnostics,
  };

  if (isJson) {
    logger.json(result);
  } else {
    if (patches.length === 0) {
      if (initialDiagnostics.length === 0) {
        logger.success('No issues found. Workspace is completely healthy.');
      } else {
        logger.warn(`Found ${initialDiagnostics.length} issue(s), but no automated patches could be safely applied.`);
      }
    } else {
      const actionVerb = isDryRun ? 'Would apply' : 'Applied';
      logger.success(`${actionVerb} ${patches.length} automated patch(es):`);
      for (const patch of patches) {
        logger.log(`\n  \x1b[36m● ${patch.file}\x1b[0m \x1b[90m(${patch.description})\x1b[0m`);
        logger.log(`    \x1b[90m${patch.diff.split('\n').slice(0, 8).join('\n    ')}\x1b[0m`);
      }
      if (isDryRun) {
        logger.log('\n\x1b[33mℹ Dry-run mode: no files were modified. Re-run without --dry-run to apply.\x1b[0m\n');
      } else {
        logger.log('');
        if (success) {
          logger.success(`Verification passed! All errors successfully resolved.`);
        } else {
          logger.warn(
            `Patches applied, but ${errorsRemaining.length} error(s) and ${warningsRemaining.length} warning(s) remain requiring manual inspection.`
          );
        }
      }
    }
  }

  return success ? 0 : 1;
}
