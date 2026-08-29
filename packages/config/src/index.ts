import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import type { RanuMode, RouteKind, RenderMode, RanuCommand, RanuDeploymentAdapter } from '@ranu/core';
import type { RanuDiagnostic } from '@ranu/diagnostics';
import dotenv from 'dotenv';

/** User Config Shape */
export interface RanuUserConfig {
  plugins?: any[];
  build?: {
    sourceMaps?: boolean;
    minify?: boolean;
  };
  server?: {
    host?: string;
    port?: number;
    trustProxy?: boolean;
  };
  routing?: {
    trailingSlash?: 'always' | 'never' | 'ignore';
    basePath?: string;
  };
  rendering?: {
    defaultMode?: RenderMode;
  };
  deployment?: {
    adapter?: RanuDeploymentAdapter;
  };
  env?: {
    files?: boolean;
  };
}

/** Resolved Config Shape (Immutable) */
export interface ResolvedRanuConfig {
  readonly root: string;
  readonly mode: RanuMode;
  readonly plugins: readonly any[];
  readonly build: {
    readonly sourceMaps: boolean;
    readonly minify: boolean;
  };
  readonly server: {
    readonly host: string;
    readonly port: number;
    readonly trustProxy: boolean;
  };
  readonly routing: {
    readonly trailingSlash: 'always' | 'never' | 'ignore';
    readonly basePath?: string;
  };
  readonly rendering: {
    readonly defaultMode: RenderMode;
  };
  readonly deployment: {
    readonly adapter?: RanuDeploymentAdapter;
  };
}

export interface RanuConfigContext {
  mode: RanuMode;
  command: RanuCommand;
}

/**
 * defineConfig helper.
 * Provides TypeScript type assistance without runtime side effects.
 */
export function defineConfig(config: RanuUserConfig | ((ctx: RanuConfigContext) => RanuUserConfig)): any {
  return config;
}

/**
 * Discover configuration file in the project root.
 * Canonical search order: .ts -> .js -> .mjs -> .cjs
 * Throws RANU_CONFIG_AMBIGUOUS if multiple are found.
 */
export function discoverConfig(projectRoot: string): { configPath?: string; diagnostic?: RanuDiagnostic } {
  const candidates = [
    'ranu.config.ts',
    'ranu.config.js',
    'ranu.config.mjs',
    'ranu.config.cjs'
  ];

  const found: string[] = [];
  for (const name of candidates) {
    const p = path.join(projectRoot, name);
    if (fs.existsSync(p)) {
      found.push(p);
    }
  }

  const first = found[0];
  if (found.length > 1) {
    const diagnostic: RanuDiagnostic = {
      code: 'RANU_CONFIG_AMBIGUOUS',
      severity: 'error',
      message: `Multiple configuration files discovered in project root: ${found.map(f => path.basename(f)).join(', ')}. Only one config file is allowed.`,
    };
    if (first !== undefined) {
      diagnostic.location = { file: first };
    }
    return { diagnostic };
  }

  if (first !== undefined) {
    return { configPath: first };
  }
  return {};
}

/**
 * Dynamically evaluate TypeScript or JavaScript configurations.
 * TypeScript configuration is transpiled on-the-fly using the typescript compiler package.
 */
export async function loadConfig(configPath: string): Promise<any> {
  const ext = path.extname(configPath);

  try {
    if (ext === '.ts') {
      const ts = (await import('typescript')).default;
      const content = fs.readFileSync(configPath, 'utf8');
      const transpiled = ts.transpileModule(content, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        }
      });

      const tempFile = path.join(path.dirname(configPath), `.ranu.config.temp.${Date.now()}.mjs`);
      fs.writeFileSync(tempFile, transpiled.outputText);

      try {
        const module = await import(pathToFileURL(tempFile).href);
        return module.default;
      } finally {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    } else {
      const module = await import(pathToFileURL(configPath).href);
      return module.default;
    }
  } catch (err: any) {
    if (err && err.code === 'RANU_CONFIG_AMBIGUOUS') {
      throw err;
    }
    throw {
      code: 'RANU_CONFIG_LOAD_FAILED',
      severity: 'error',
      message: `Failed to load configuration file: ${err.message || err}`,
      location: { file: configPath }
    };
  }
}

/**
 * Validate user configuration structure.
 * Rejects unknown fields and invalid value types with diagnostics.
 */
export function validateUserConfig(config: any): { success: boolean; diagnostics: RanuDiagnostic[] } {
  const diagnostics: RanuDiagnostic[] = [];

  if (!config) return { success: true, diagnostics };

  if (typeof config !== 'object' || Array.isArray(config)) {
    diagnostics.push({
      code: 'RANU_CONFIG_INVALID',
      severity: 'error',
      message: 'Configuration must be a valid key-value object.',
    });
    return { success: false, diagnostics };
  }

  const allowedTopLevels = ['plugins', 'build', 'server', 'routing', 'rendering', 'deployment', 'env'];
  for (const key of Object.keys(config)) {
    if (!allowedTopLevels.includes(key)) {
      diagnostics.push({
        code: 'RANU_CONFIG_UNKNOWN_FIELD',
        severity: 'error',
        message: `Unknown top-level configuration namespace: "${key}".`,
      });
    }
  }

  // 1. Plugins
  if (config.plugins !== undefined) {
    if (!Array.isArray(config.plugins)) {
      diagnostics.push({
        code: 'RANU_CONFIG_INVALID',
        severity: 'error',
        message: 'Namespace "plugins" must be an array.',
      });
    }
  }

  // 2. Build
  if (config.build !== undefined) {
    if (typeof config.build !== 'object' || Array.isArray(config.build)) {
      diagnostics.push({
        code: 'RANU_CONFIG_INVALID',
        severity: 'error',
        message: 'Namespace "build" must be a key-value object.',
      });
    } else {
      const allowedBuilds = ['sourceMaps', 'minify'];
      for (const k of Object.keys(config.build)) {
        if (!allowedBuilds.includes(k)) {
          diagnostics.push({
            code: 'RANU_CONFIG_UNKNOWN_FIELD',
            severity: 'error',
            message: `Unknown configuration field under "build": "${k}".`,
          });
        }
      }
      if (config.build.sourceMaps !== undefined && typeof config.build.sourceMaps !== 'boolean') {
        diagnostics.push({
          code: 'RANU_CONFIG_INVALID',
          severity: 'error',
          message: 'Field "build.sourceMaps" must be a boolean.',
        });
      }
      if (config.build.minify !== undefined && typeof config.build.minify !== 'boolean') {
        diagnostics.push({
          code: 'RANU_CONFIG_INVALID',
          severity: 'error',
          message: 'Field "build.minify" must be a boolean.',
        });
      }
    }
  }

  // 3. Server
  if (config.server !== undefined) {
    if (typeof config.server !== 'object' || Array.isArray(config.server)) {
      diagnostics.push({
        code: 'RANU_CONFIG_INVALID',
        severity: 'error',
        message: 'Namespace "server" must be a key-value object.',
      });
    } else {
      const allowedServers = ['host', 'port', 'trustProxy'];
      for (const k of Object.keys(config.server)) {
        if (!allowedServers.includes(k)) {
          diagnostics.push({
            code: 'RANU_CONFIG_UNKNOWN_FIELD',
            severity: 'error',
            message: `Unknown configuration field under "server": "${k}".`,
          });
        }
      }
      if (config.server.host !== undefined && typeof config.server.host !== 'string') {
        diagnostics.push({
          code: 'RANU_CONFIG_INVALID',
          severity: 'error',
          message: 'Field "server.host" must be a string.',
        });
      }
      if (config.server.port !== undefined) {
        const port = config.server.port;
        if (typeof port !== 'number' || port < 1 || port > 65535 || !Number.isInteger(port)) {
          diagnostics.push({
            code: 'RANU_CONFIG_INVALID',
            severity: 'error',
            message: 'Field "server.port" must be a valid integer between 1 and 65535.',
          });
        }
      }
      if (config.server.trustProxy !== undefined && typeof config.server.trustProxy !== 'boolean') {
        diagnostics.push({
          code: 'RANU_CONFIG_INVALID',
          severity: 'error',
          message: 'Field "server.trustProxy" must be a boolean.',
        });
      }
    }
  }

  // 4. Routing
  if (config.routing !== undefined) {
    if (typeof config.routing !== 'object' || Array.isArray(config.routing)) {
      diagnostics.push({
        code: 'RANU_CONFIG_INVALID',
        severity: 'error',
        message: 'Namespace "routing" must be a key-value object.',
      });
    } else {
      const allowedRoutings = ['trailingSlash', 'basePath'];
      for (const k of Object.keys(config.routing)) {
        if (!allowedRoutings.includes(k)) {
          diagnostics.push({
            code: 'RANU_CONFIG_UNKNOWN_FIELD',
            severity: 'error',
            message: `Unknown configuration field under "routing": "${k}".`,
          });
        }
      }
      if (config.routing.trailingSlash !== undefined) {
        const val = config.routing.trailingSlash;
        if (val !== 'always' && val !== 'never' && val !== 'ignore') {
          diagnostics.push({
            code: 'RANU_CONFIG_INVALID',
            severity: 'error',
            message: 'Field "routing.trailingSlash" must be "always", "never", or "ignore".',
          });
        }
      }
      if (config.routing.basePath !== undefined && typeof config.routing.basePath !== 'string') {
        diagnostics.push({
          code: 'RANU_CONFIG_INVALID',
          severity: 'error',
          message: 'Field "routing.basePath" must be a string.',
        });
      }
    }
  }

  // 5. Rendering
  if (config.rendering !== undefined) {
    if (typeof config.rendering !== 'object' || Array.isArray(config.rendering)) {
      diagnostics.push({
        code: 'RANU_CONFIG_INVALID',
        severity: 'error',
        message: 'Namespace "rendering" must be a key-value object.',
      });
    } else {
      const allowedRenderings = ['defaultMode'];
      for (const k of Object.keys(config.rendering)) {
        if (!allowedRenderings.includes(k)) {
          diagnostics.push({
            code: 'RANU_CONFIG_UNKNOWN_FIELD',
            severity: 'error',
            message: `Unknown configuration field under "rendering": "${k}".`,
          });
        }
      }
      if (config.rendering.defaultMode !== undefined) {
        const val = config.rendering.defaultMode;
        if (val !== 'server' && val !== 'static' && val !== 'client') {
          diagnostics.push({
            code: 'RANU_CONFIG_INVALID',
            severity: 'error',
            message: 'Field "rendering.defaultMode" must be "server", "static", or "client".',
          });
        }
      }
    }
  }

  // 6. Deployment
  if (config.deployment !== undefined) {
    if (typeof config.deployment !== 'object' || Array.isArray(config.deployment)) {
      diagnostics.push({
        code: 'RANU_CONFIG_INVALID',
        severity: 'error',
        message: 'Namespace "deployment" must be a key-value object.',
      });
    } else {
      const allowedDeployments = ['adapter'];
      for (const k of Object.keys(config.deployment)) {
        if (!allowedDeployments.includes(k)) {
          diagnostics.push({
            code: 'RANU_CONFIG_UNKNOWN_FIELD',
            severity: 'error',
            message: `Unknown configuration field under "deployment": "${k}".`,
          });
        }
      }
    }
  }

  // 7. Env
  if (config.env !== undefined) {
    if (typeof config.env !== 'object' || Array.isArray(config.env)) {
      diagnostics.push({
        code: 'RANU_CONFIG_INVALID',
        severity: 'error',
        message: 'Namespace "env" must be a key-value object.',
      });
    } else {
      const allowedEnvs = ['files'];
      for (const k of Object.keys(config.env)) {
        if (!allowedEnvs.includes(k)) {
          diagnostics.push({
            code: 'RANU_CONFIG_UNKNOWN_FIELD',
            severity: 'error',
            message: `Unknown configuration field under "env": "${k}".`,
          });
        }
      }
      if (config.env.files !== undefined && typeof config.env.files !== 'boolean') {
        diagnostics.push({
          code: 'RANU_CONFIG_INVALID',
          severity: 'error',
          message: 'Field "env.files" must be a boolean.',
        });
      }
    }
  }

  return { success: diagnostics.length === 0, diagnostics };
}

/**
 * Resolve User Configuration into the read-only ResolvedRanuConfig structure.
 * Applies defaults and applies CLI overrides.
 */
export function resolveConfig(
  userConfig: any,
  projectRoot: string,
  mode: RanuMode,
  cliOverrides?: { port?: number; host?: string }
): { config: ResolvedRanuConfig; diagnostics: RanuDiagnostic[] } {
  const diagnostics: RanuDiagnostic[] = [];

  const validationResult = validateUserConfig(userConfig);
  diagnostics.push(...validationResult.diagnostics);

  const mergedBuild = {
    sourceMaps: userConfig?.build?.sourceMaps ?? false,
    minify: userConfig?.build?.minify ?? true,
  };

  const defaultPort = 3000;
  const defaultHost = '127.0.0.1';

  let port = userConfig?.server?.port ?? defaultPort;
  if (cliOverrides?.port !== undefined) {
    port = cliOverrides.port;
  }

  let host = userConfig?.server?.host ?? defaultHost;
  if (cliOverrides?.host !== undefined) {
    host = cliOverrides.host;
  }

  const mergedServer = {
    host,
    port,
    trustProxy: userConfig?.server?.trustProxy ?? false,
  };

  const mergedRouting = {
    trailingSlash: userConfig?.routing?.trailingSlash ?? 'ignore',
    basePath: userConfig?.routing?.basePath,
  };

  const mergedRendering = {
    defaultMode: userConfig?.rendering?.defaultMode ?? 'server',
  };

  const resolved: ResolvedRanuConfig = {
    root: projectRoot,
    mode,
    plugins: userConfig?.plugins ?? [],
    build: mergedBuild,
    server: mergedServer,
    routing: mergedRouting,
    rendering: mergedRendering,
    deployment: {
      adapter: userConfig?.deployment?.adapter,
    },
  };

  deepFreeze(resolved);

  return { config: resolved, diagnostics };
}

function deepFreeze(obj: any) {
  if (obj && typeof obj === 'object') {
    Object.freeze(obj);
    for (const key of Object.keys(obj)) {
      deepFreeze(obj[key]);
    }
  }
}

/**
 * Parse dotenv format using the established dotenv package.
 * Supports comments, quotes, UTF-8, and empty values.
 */
export function parseDotenv(content: string): Record<string, string> {
  return dotenv.parse(content);
}

/**
 * Load environment configurations.
 * Dotenv load order: .env -> .env.<mode> -> .env.local -> .env.<mode>.local
 * Mutates process.env only if keys are not already defined (process.env wins).
 */
export function loadEnv(mode: RanuMode, projectRoot: string): Record<string, string> {
  const loaded: Record<string, string> = {};

  const envFiles = [
    '.env',
    `.env.${mode}`,
    '.env.local',
    `.env.${mode}.local`
  ];

  for (const file of envFiles) {
    const filePath = path.join(projectRoot, file);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const parsed = parseDotenv(content);
        Object.assign(loaded, parsed);
      } catch (err: any) {
        // Dotenv load error
      }
    }
  }

  // Override process.env
  for (const [key, val] of Object.entries(loaded)) {
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }

  return { ...loaded, ...process.env } as Record<string, string>;
}

/**
 * Return only environment variables starting with browser-public prefix RANU_PUBLIC_.
 */
export function filterPublicEnv(env: Record<string, string>): Record<string, string> {
  const filtered: Record<string, string> = {};
  for (const [key, val] of Object.entries(env)) {
    if (key.startsWith('RANU_PUBLIC_')) {
      filtered[key] = val;
    }
  }
  return filtered;
}
