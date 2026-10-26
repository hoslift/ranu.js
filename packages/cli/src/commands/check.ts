import fs from 'node:fs';
import path from 'node:path';
import { discoverConfig, validateUserConfig, loadConfig } from '@ranu/config';
import { discoverRoutes, type CompiledRouteRecord } from '@ranu/router';
import {
  analyzeRouteMethods,
  buildModuleGraph,
  validateGraphBoundaries,
  validateGraphEnvAccess,
  validateNonSerializableProps,
} from '@ranu/build';
import type { RanuDiagnostic } from '@ranu/diagnostics';
import { formatDiagnosticsReport, type DiagnosticReport } from '@ranu/diagnostics';
import type { ParsedCliArgs, CliLogger } from '../types.js';
import {
  discoverProjectRoot,
  cleanProjectArtifacts,
  validateNodeVersion,
} from '../context.js';

/**
 * Executes the `ranu check` command for sub-second in-memory dry-run validation.
 *
 * Checks:
 * 1. Configuration discovery and schema validation.
 * 2. Routing tree discovery, roles, precedence, and casing collisions.
 * 3. Module graph boundary rules (server-only imports, Node built-ins in client code).
 * 4. Client environment variable whitelist access (process.env.RANU_PUBLIC_*).
 * 5. Static non-serializable props across Server-to-Client JSX boundaries.
 *
 * @param args - CLI arguments (supports `--format json` / `--json`)
 * @param logger - CLI logger instance
 * @returns 0 on success (0 errors), 1 if any error diagnostics exist
 */
export async function runCheckCommand(args: ParsedCliArgs, logger: CliLogger): Promise<number> {
  const startTime = Date.now();
  const diagnostics: RanuDiagnostic[] = [];

  // Directly resolve project root without throwing on broken configuration
  try {
    validateNodeVersion();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    diagnostics.push({
      code: 'RANU_NODE_VERSION_UNSUPPORTED',
      severity: 'error',
      message,
      hint: 'Upgrade your Node.js runtime to version 22 or higher.',
    });
  }

  const cwd = process.cwd();
  const rawRoot = args.root ? path.resolve(cwd, args.root) : discoverProjectRoot(cwd);
  const projectRoot = path.resolve(rawRoot);

  if (!fs.existsSync(projectRoot)) {
    diagnostics.push({
      code: 'RANU_PROJECT_ROOT_NOT_FOUND',
      severity: 'error',
      message: `Project root directory does not exist: "${projectRoot}"`,
    });
  } else if (!fs.statSync(projectRoot).isDirectory()) {
    diagnostics.push({
      code: 'RANU_PROJECT_ROOT_INVALID',
      severity: 'error',
      message: `Project root path is not a directory: "${projectRoot}"`,
    });
  }

  if (args.clean && fs.existsSync(projectRoot)) {
    cleanProjectArtifacts(projectRoot);
    logger.debug(`Cleaned .ranu directory in ${projectRoot}`);
  }

  const appDir = path.join(projectRoot, 'app');

  // 1. Configuration Validation
  if (fs.existsSync(projectRoot) && fs.statSync(projectRoot).isDirectory()) {
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
        let code = 'RANU_CONFIG_LOAD_FAILED';
        let message = 'Failed to load configuration file';
        let location: { file: string; line?: number; column?: number } | undefined = { file: configPath };

        if (typeof err === 'object' && err !== null) {
          const errObj = err as Record<string, unknown>;
          if (typeof errObj.code === 'string') {
            code = errObj.code;
          }
          if (typeof errObj.message === 'string') {
            message = errObj.message;
          } else if (err instanceof Error) {
            message = err.message;
          }
          if (errObj.location && typeof errObj.location === 'object') {
            location = errObj.location as { file: string; line?: number; column?: number };
          }
        } else if (typeof err === 'string') {
          message = err;
        } else if (typeof err === 'number' || typeof err === 'boolean' || typeof err === 'bigint') {
          message = String(err);
        }

        const formattedMessage = message.includes(configPath)
          ? message
          : `Failed to load configuration file "${configPath}": ${message.replace(/^Failed to load configuration file:?\s*/, '')}`;

        diagnostics.push({
          code,
          severity: 'error',
          message: formattedMessage,
          location,
          hint: 'Fix configuration syntax or exports in ranu.config.ts.',
        });
      }
    }
  }

  // 2. Route Discovery & Routing Invariants
  let records: CompiledRouteRecord[] = [];
  if (fs.existsSync(appDir)) {
    const routeRes = discoverRoutes(appDir, { analyzeRouteMethods });
    records = routeRes.records;
    diagnostics.push(...routeRes.diagnostics);
  }

  // 3. Module Graph & Static Boundary Invariants
  const serverRootFiles: string[] = [];
  function collectAppFiles(dir: string) {
    if (!fs.existsSync(dir)) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          collectAppFiles(full);
        } else if (entry.isFile() && /\.(tsx|ts|jsx|js|mjs)$/.test(entry.name)) {
          serverRootFiles.push(full);
        }
      }
    } catch {
      // Ignore directory read errors
    }
  }

  collectAppFiles(appDir);

  if (serverRootFiles.length > 0) {
    const moduleGraph = buildModuleGraph(serverRootFiles, projectRoot);

    // 3a. Graph Boundary Validation
    const boundaryRes = validateGraphBoundaries(moduleGraph);
    diagnostics.push(...boundaryRes.diagnostics);

    // 3b. Environment Security Validation
    const envRes = validateGraphEnvAccess(moduleGraph);
    diagnostics.push(...envRes.diagnostics);

    // 3c. Non-Serializable Props Validation
    const propsRes = validateNonSerializableProps(moduleGraph);
    diagnostics.push(...propsRes.diagnostics);
  }

  const durationMs = Date.now() - startTime;
  const errors = diagnostics.filter((d) => d.severity === 'error');
  const warnings = diagnostics.filter((d) => d.severity === 'warning');
  const success = errors.length === 0;

  if (args.format === 'json' || args.json) {
    const reportString = formatDiagnosticsReport(diagnostics);
    const parsedReport: DiagnosticReport = JSON.parse(reportString);
    logger.json(parsedReport);
  } else {
    if (success) {
      logger.success(
        `Check passed in ${durationMs}ms across ${records.length} route${records.length === 1 ? '' : 's'} (0 errors, ${warnings.length} warning${warnings.length === 1 ? '' : 's'})`
      );
      for (const warn of warnings) {
        logger.warn(`  [${warn.code}] ${warn.message}`);
        if (warn.location?.file) {
          logger.log(
            `    at ${warn.location.file}${warn.location.line ? `:${warn.location.line}` : ''}${warn.location.column ? `:${warn.location.column}` : ''}`
          );
        }
        if (warn.hint) {
          logger.log(`    hint: ${warn.hint}`);
        }
      }
    } else {
      logger.error(
        `Check failed with ${errors.length} error${errors.length === 1 ? '' : 's'} and ${warnings.length} warning${warnings.length === 1 ? '' : 's'} in ${durationMs}ms:`
      );
      for (const diag of diagnostics) {
        if (diag.severity === 'error') {
          logger.error(`  [${diag.code}] ${diag.message}`);
        } else {
          logger.warn(`  [${diag.code}] ${diag.message}`);
        }
        if (diag.location?.file) {
          logger.log(
            `    at ${diag.location.file}${diag.location.line ? `:${diag.location.line}` : ''}${diag.location.column ? `:${diag.location.column}` : ''}`
          );
        }
        if (diag.importChain && diag.importChain.length > 0) {
          logger.log(`    import trace: ${diag.importChain.join(' -> ')}`);
        }
        if (diag.hint) {
          logger.log(`    hint: ${diag.hint}`);
        }
      }
    }
  }

  return success ? 0 : 1;
}
