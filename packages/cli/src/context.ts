import fs from 'node:fs';
import path from 'node:path';
import {
  discoverConfig,
  loadConfig,
  validateUserConfig,
  resolveConfig,
  type ResolvedRanuConfig,
  type RanuMode,
} from '@ranu/config';
import type { ParsedCliArgs, CliLogger, CliContext } from './types.js';

export const MIN_NODE_VERSION = 22;

/**
 * Validates that current Node.js version meets the framework minimum (>= 22.0.0).
 */
export function validateNodeVersion(): void {
  const match = process.version.match(/^v?(\d+)/);
  if (match) {
    const major = parseInt(match[1], 10);
    if (major < MIN_NODE_VERSION) {
      throw new Error(
        `RANU_NODE_VERSION_UNSUPPORTED: Ranu.js requires Node.js >= ${MIN_NODE_VERSION}.0.0 (currently running ${process.version}). Please upgrade your Node.js runtime.`
      );
    }
  }
}

/**
 * Discovers the project root directory.
 */
export function discoverProjectRoot(startDir: string): string {
  let current = path.resolve(startDir);

  while (true) {
    const hasConfig =
      fs.existsSync(path.join(current, 'ranu.config.ts')) ||
      fs.existsSync(path.join(current, 'ranu.config.js')) ||
      fs.existsSync(path.join(current, 'ranu.config.mjs')) ||
      fs.existsSync(path.join(current, 'ranu.config.cjs'));

    const hasApp = fs.existsSync(path.join(current, 'app')) && fs.statSync(path.join(current, 'app')).isDirectory();

    if (hasConfig || hasApp) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      // Reached filesystem root
      break;
    }
    current = parent;
  }

  return path.resolve(startDir);
}

/**
 * Safely removes framework-owned temporary and build caches in `.ranu/`.
 */
export function cleanProjectArtifacts(projectRoot: string): void {
  const dotRanu = path.join(projectRoot, '.ranu');
  if (fs.existsSync(dotRanu)) {
    fs.rmSync(dotRanu, { recursive: true, force: true });
  }
}

/**
 * Resolves full CLI execution context.
 */
export async function resolveProjectContext(
  args: ParsedCliArgs,
  logger: CliLogger,
  defaultMode: RanuMode
): Promise<CliContext> {
  validateNodeVersion();

  const cwd = process.cwd();
  const rawRoot = args.root ? path.resolve(cwd, args.root) : discoverProjectRoot(cwd);
  const projectRoot = path.resolve(rawRoot);

  if (!fs.existsSync(projectRoot)) {
    throw new Error(`Project root directory does not exist: "${projectRoot}"`);
  }

  if (!fs.statSync(projectRoot).isDirectory()) {
    throw new Error(`Project root path is not a directory: "${projectRoot}"`);
  }

  if (args.clean) {
    cleanProjectArtifacts(projectRoot);
    logger.debug(`Cleaned .ranu directory in ${projectRoot}`);
  }

  const { configPath, diagnostic } = discoverConfig(projectRoot);
  if (diagnostic) {
    throw new Error(diagnostic.message);
  }

  let userConfig: any = {};
  if (configPath) {
    try {
      userConfig = await loadConfig(configPath);
      const validation = validateUserConfig(userConfig);
      if (!validation.success) {
        const diags = validation.diagnostics.map((d) => `  - ${d.message}`).join('\n');
        throw new Error(`Invalid configuration in "${configPath}":\n${diags}`);
      }
    } catch (err: unknown) {
      let message = 'Unknown error';
      if (err instanceof Error) {
        message = err.message;
      } else if (typeof err === 'object' && err !== null && 'message' in err) {
        message = String((err as { message: unknown }).message);
      } else {
        message = String(err);
      }
      throw new Error(`Failed to load configuration "${configPath}": ${message}`);
    }
  }

  const { config: resolvedConfig } = resolveConfig(
    userConfig,
    projectRoot,
    defaultMode,
    {
      port: args.port,
      host: args.host,
    }
  );

  const isCI = Boolean(process.env.CI && process.env.CI !== '0' && process.env.CI !== 'false');

  return {
    cwd,
    projectRoot,
    configFile: configPath,
    config: resolvedConfig,
    mode: defaultMode,
    logger,
    isCI,
  };
}
