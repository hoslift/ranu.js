import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { RanuDeploymentAdapter } from '@ranu/core';
import type { RanuDiagnostic } from '@ranu/diagnostics';

/** Canonical mapping from shorthand provider names to first-party packages */
export const KNOWN_ADAPTER_SHORTHANDS: Readonly<Record<string, string>> = {
  vercel: '@ranujs/adapter-vercel',
  cloudflare: '@ranujs/adapter-cloudflare',
  node: '@ranujs/adapter-node',
  bun: '@ranujs/adapter-bun',
  deno: '@ranujs/adapter-deno',
  netlify: '@ranujs/adapter-netlify',
};

export type AdapterResolutionKind = 'shorthand' | 'package' | 'local-file';

export interface ResolveAdapterOptions {
  readonly projectRoot: string;
}

export interface ResolvedAdapterSpecifier {
  readonly rawSpecifier: string;
  readonly kind: AdapterResolutionKind;
  readonly resolvedTarget: string;
  readonly importSpecifier: string;
  readonly filePath?: string | undefined;
}

export interface LoadAdapterOptions {
  readonly projectRoot: string;
  readonly importer?: ((specifier: string) => Promise<unknown>) | undefined;
}

export interface LoadAdapterSuccess {
  readonly success: true;
  readonly adapter: RanuDeploymentAdapter;
  readonly specifier: ResolvedAdapterSpecifier;
}

export interface LoadAdapterFailure {
  readonly success: false;
  readonly error: string;
  readonly diagnostic: RanuDiagnostic;
  readonly specifier?: ResolvedAdapterSpecifier | undefined;
}

export type LoadAdapterResult = LoadAdapterSuccess | LoadAdapterFailure;

interface AdapterLike {
  readonly adapt: unknown;
  readonly [key: string]: unknown;
}

function isAdapterInstance(val: unknown): val is RanuDeploymentAdapter {
  return (
    typeof val === 'object' &&
    val !== null &&
    'adapt' in val &&
    typeof (val as AdapterLike).adapt === 'function'
  );
}

/**
 * Resolves an adapter specifier (shorthand, package name, or file path) into an import target.
 */
export function resolveAdapterSpecifier(
  specifier: string,
  options: ResolveAdapterOptions,
): ResolvedAdapterSpecifier {
  const trimmed = specifier.trim();
  const lower = trimmed.toLowerCase();

  // 1. Shorthand resolution (case-insensitive)
  if (Object.hasOwn(KNOWN_ADAPTER_SHORTHANDS, lower)) {
    const pkg = KNOWN_ADAPTER_SHORTHANDS[lower]!;
    return {
      rawSpecifier: trimmed,
      kind: 'shorthand',
      resolvedTarget: pkg,
      importSpecifier: pkg,
    };
  }

  // 2. Local file path resolution
  const isExplicitRelative =
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('.\\') ||
    trimmed.startsWith('..\\');
  const isAbsolute = path.isAbsolute(trimmed);
  const hasFileExt = /\.[mc]?[jt]sx?$/i.test(trimmed);

  if (isExplicitRelative || isAbsolute || hasFileExt) {
    const absolutePath = isAbsolute
      ? path.resolve(trimmed)
      : path.resolve(options.projectRoot, trimmed);
    const fileUrl = pathToFileURL(absolutePath).href;
    return {
      rawSpecifier: trimmed,
      kind: 'local-file',
      resolvedTarget: absolutePath,
      importSpecifier: fileUrl,
      filePath: absolutePath,
    };
  }

  // 3. Custom npm package specifier
  return {
    rawSpecifier: trimmed,
    kind: 'package',
    resolvedTarget: trimmed,
    importSpecifier: trimmed,
  };
}

/**
 * Extracts and validates a RanuDeploymentAdapter instance from an imported module.
 *
 * Evaluates candidate exports in priority order:
 * 1. Direct adapter instance implementing adapt()
 * 2. Direct factory function
 * 3. Named provider factory (e.g. createVercelAdapter, createCloudflareAdapter, createAdapter)
 * 4. Default export (factory function or adapter object)
 * 5. Named adapter export (factory function or adapter object)
 * 6. Any exported object implementing adapt()
 */
export function resolveAdapterInstance(mod: unknown): RanuDeploymentAdapter | null {
  if (!mod || (typeof mod !== 'object' && typeof mod !== 'function')) {
    return null;
  }

  // Direct factory function
  if (typeof mod === 'function') {
    const candidate = (mod as () => unknown)();
    if (isAdapterInstance(candidate)) {
      return candidate;
    }
  }

  const m = mod as Record<string, unknown>;
  const keys = Object.keys(m);

  // A. Direct adapter instance (only inspect if 'adapt' is an existing property)
  if (keys.includes('adapt') && typeof m.adapt === 'function') {
    return m as unknown as RanuDeploymentAdapter;
  }

  // B. Named provider factory: create<Provider>Adapter or createAdapter
  const factoryKey = keys.find(
    (key) => /^create([A-Z]\w*)?Adapter$/.test(key) && typeof m[key] === 'function',
  );
  if (factoryKey) {
    const candidate = (m[factoryKey] as () => unknown)();
    if (isAdapterInstance(candidate)) {
      return candidate;
    }
  }

  // C. Default export (factory function or adapter object)
  if (keys.includes('default') && m.default !== undefined && m.default !== null) {
    if (typeof m.default === 'function') {
      const candidate = (m.default as () => unknown)();
      if (isAdapterInstance(candidate)) {
        return candidate;
      }
    } else if (isAdapterInstance(m.default)) {
      return m.default;
    }
  }

  // D. Named adapter export (factory function or adapter object)
  if (keys.includes('adapter') && m.adapter !== undefined && m.adapter !== null) {
    if (typeof m.adapter === 'function') {
      const candidate = (m.adapter as () => unknown)();
      if (isAdapterInstance(candidate)) {
        return candidate;
      }
    } else if (isAdapterInstance(m.adapter)) {
      return m.adapter;
    }
  }

  // E. Any other exported object implementing adapt()
  for (const key of keys) {
    if (key === 'default' || key === 'adapter' || /^create([A-Z]\w*)?Adapter$/.test(key)) {
      continue;
    }
    const val = m[key];
    if (isAdapterInstance(val)) {
      return val;
    }
  }

  return null;
}

/**
 * Dynamically loads and validates a deployment adapter by shorthand, package, or file path.
 */
export async function loadDeploymentAdapter(
  specifier: string,
  options: LoadAdapterOptions,
): Promise<LoadAdapterResult> {
  let resolved = resolveAdapterSpecifier(specifier, { projectRoot: options.projectRoot });
  const importer = options.importer ?? ((id: string) => import(id));

  // Check local file existence before importing
  if (resolved.kind === 'local-file' && resolved.filePath) {
    let targetPath = resolved.filePath;
    if (!fs.existsSync(targetPath)) {
      const candidateExts = ['.ts', '.js', '.mjs', '.cjs'];
      for (const ext of candidateExts) {
        if (fs.existsSync(`${targetPath}${ext}`)) {
          targetPath = `${targetPath}${ext}`;
          resolved = {
            ...resolved,
            resolvedTarget: targetPath,
            filePath: targetPath,
            importSpecifier: pathToFileURL(targetPath).href,
          };
          break;
        }
      }
    }

    if (!fs.existsSync(targetPath)) {
      const err = `Deployment adapter file not found at "${resolved.filePath}".`;
      return {
        success: false,
        specifier: resolved,
        error: err,
        diagnostic: {
          code: 'RANU_DEPLOY_ADAPTER_FILE_NOT_FOUND',
          severity: 'error',
          message: err,
          location: { file: targetPath },
          hint: `Ensure the file path is correct relative to project root "${options.projectRoot}".`,
        },
      };
    }
  }

  let mod: unknown;
  let adapter: RanuDeploymentAdapter | null = null;
  try {
    mod = await importer(resolved.importSpecifier);
    adapter = resolveAdapterInstance(mod);
  } catch (err: unknown) {
    const errObj = err as Error & { code?: string };
    const errMsg = errObj?.message ?? String(err);
    const isNotFound =
      errObj?.code === 'ERR_MODULE_NOT_FOUND' ||
      errMsg.includes('Cannot find package') ||
      errMsg.includes('Cannot find module');

    if (isNotFound) {
      const hint =
        resolved.kind === 'shorthand'
          ? `Install the official adapter package: npm install -D ${resolved.resolvedTarget} (or pnpm add -D ${resolved.resolvedTarget})`
          : resolved.kind === 'package'
            ? `Ensure the package is installed in your project: npm install -D ${resolved.resolvedTarget}`
            : `Verify that "${resolved.resolvedTarget}" exists and is accessible.`;

      return {
        success: false,
        specifier: resolved,
        error: `Failed to load adapter "${specifier}": ${errMsg}`,
        diagnostic: {
          code: 'RANU_DEPLOY_ADAPTER_NOT_FOUND',
          severity: 'error',
          message: `Failed to load deployment adapter "${resolved.resolvedTarget}": module not found.`,
          hint,
        },
      };
    }

    return {
      success: false,
      specifier: resolved,
      error: `Failed to load adapter "${specifier}": ${errMsg}`,
      diagnostic: {
        code: 'RANU_DEPLOY_ADAPTER_LOAD_FAILED',
        severity: 'error',
        message: `Failed to load deployment adapter "${resolved.resolvedTarget}": ${errMsg}`,
        hint: 'Check the adapter module for syntax or runtime initialization errors.',
      },
    };
  }

  if (!adapter || typeof adapter.adapt !== 'function') {
    const err = `The configured deployment adapter "${specifier}" does not implement a valid adapt() method.`;
    return {
      success: false,
      specifier: resolved,
      error: err,
      diagnostic: {
        code: 'RANU_DEPLOY_ADAPTER_INVALID',
        severity: 'error',
        message: `Deployment adapter "${specifier}" (${resolved.resolvedTarget}) does not implement a valid adapt() method.`,
        hint: 'Ensure the adapter exports a factory function or object implementing the RanuDeploymentAdapter interface with an adapt(context) method.',
      },
    };
  }

  return {
    success: true,
    adapter,
    specifier: resolved,
  };
}
