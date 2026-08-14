import type { RouteKind, RenderMode, HttpMethod } from '@ranu/core';
import type { RanuDiagnostic } from '@ranu/diagnostics';

/** Schema version for manifests */
export const MANIFEST_SCHEMA_VERSION = 1;
export const ROUTE_MANIFEST_SCHEMA_VERSION = 2;

/** Build Descriptor */
export interface BuildDescriptor {
  schemaVersion: number;
  buildId: string;
  frameworkVersion: string;
  runtime: 'node';
  manifests: {
    routes: string;
    server: string;
    client: string;
    static: string;
  };
}

/** Route Manifest Entry (discriminated union for V2) */
export interface ApiRouteManifestEntry {
  id: string;
  kind: 'api';
  pattern: string;
  params: string[];
  methods?: HttpMethod[]; // Optional in V1, required in V2
}

export interface PageRouteManifestEntry {
  id: string;
  kind: 'page';
  pattern: string;
  params: string[];
  renderMode?: RenderMode;
  methods?: never;        // Forbidden for pages
}

export type RouteManifestEntry = ApiRouteManifestEntry | PageRouteManifestEntry;

/** Route Manifest */
export interface RouteManifest {
  schemaVersion: number;
  buildId: string;
  routes: RouteManifestEntry[];
}


/** Server Manifest Entry */
export interface ServerManifestEntry {
  routeId: string;
  serverEntry: string;
}

/** Server Manifest */
export interface ServerManifest {
  schemaVersion: number;
  buildId: string;
  routes: ServerManifestEntry[];
}

/** Client Asset Group */
export interface ClientAssetGroup {
  js: string[];
  css: string[];
}

/** Client Manifest */
export interface ClientManifest {
  schemaVersion: number;
  buildId: string;
  assets: Record<string, ClientAssetGroup>;
}

/** Static Manifest Entry */
export interface StaticManifestEntry {
  pathname: string;
  routeId: string;
  file: string;
  status?: number;
}

/** Static Manifest */
export interface StaticManifest {
  schemaVersion: number;
  buildId: string;
  routes: StaticManifestEntry[];
}

/**
 * Helper to check if a path is absolute.
 * Absolute filesystem paths (e.g. starting with C:\ or / on Unix) are disallowed in manifests.
 */
export function isAbsolutePath(p: string): boolean {
  if (p.startsWith('/') || p.startsWith('\\')) return true;
  if (/^[a-zA-Z]:\\/.test(p) || /^[a-zA-Z]:\//.test(p)) return true;
  return false;
}

/**
 * Validator for BuildDescriptor
 */
export function validateBuildDescriptor(descriptor: any): { success: boolean; diagnostics: RanuDiagnostic[] } {
  const diagnostics: RanuDiagnostic[] = [];

  if (!descriptor || typeof descriptor !== 'object') {
    diagnostics.push({
      code: 'RANU_BUILD_MANIFEST_INVALID',
      severity: 'error',
      message: 'Build descriptor is missing or not a valid object.',
    });
    return { success: false, diagnostics };
  }

  if (descriptor.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    diagnostics.push({
      code: 'RANU_SERVER_MANIFEST_VERSION',
      severity: 'error',
      message: `Incompatible manifest schema version: expected ${MANIFEST_SCHEMA_VERSION}, received ${descriptor.schemaVersion}.`,
    });
  }

  if (typeof descriptor.buildId !== 'string' || !descriptor.buildId) {
    diagnostics.push({
      code: 'RANU_BUILD_MANIFEST_INVALID',
      severity: 'error',
      message: 'Build descriptor is missing a valid "buildId".',
    });
  }

  if (descriptor.runtime !== 'node') {
    diagnostics.push({
      code: 'RANU_BUILD_MANIFEST_INVALID',
      severity: 'error',
      message: `Unsupported build runtime target: "${descriptor.runtime}". Target must be provider-neutral "node".`,
    });
  }

  const manifestPaths = descriptor.manifests;
  if (!manifestPaths || typeof manifestPaths !== 'object') {
    diagnostics.push({
      code: 'RANU_BUILD_MANIFEST_INVALID',
      severity: 'error',
      message: 'Build descriptor is missing "manifests" mapping paths.',
    });
  } else {
    for (const key of ['routes', 'server', 'client', 'static']) {
      const p = manifestPaths[key];
      if (typeof p !== 'string' || !p) {
        diagnostics.push({
          code: 'RANU_BUILD_MANIFEST_INVALID',
          severity: 'error',
          message: `Build descriptor is missing path mapping for manifest: "${key}".`,
        });
      } else if (isAbsolutePath(p)) {
        diagnostics.push({
          code: 'RANU_BUILD_MANIFEST_INVALID',
          severity: 'error',
          message: `Build descriptor manifests path for "${key}" cannot be an absolute path: "${p}".`,
        });
      }
    }
  }

  return { success: diagnostics.length === 0, diagnostics };
}

/**
 * Common version and Build ID validation for sub-manifests
 */
function validateBaseManifest(
  manifest: any,
  expectedBuildId?: string,
  manifestName = 'Manifest',
  expectedVersion: number | number[] = MANIFEST_SCHEMA_VERSION
): RanuDiagnostic[] {
  const diagnostics: RanuDiagnostic[] = [];

  if (!manifest || typeof manifest !== 'object') {
    diagnostics.push({
      code: 'RANU_BUILD_MANIFEST_INVALID',
      severity: 'error',
      message: `${manifestName} is missing or not a valid object.`,
    });
    return diagnostics;
  }

  const versions = Array.isArray(expectedVersion) ? expectedVersion : [expectedVersion];
  if (!versions.includes(manifest.schemaVersion)) {
    diagnostics.push({
      code: 'RANU_SERVER_MANIFEST_VERSION',
      severity: 'error',
      message: `Incompatible ${manifestName} schema version: expected one of [${versions.join(', ')}], received ${manifest.schemaVersion}.`,
    });
  }

  if (typeof manifest.buildId !== 'string' || !manifest.buildId) {
    diagnostics.push({
      code: 'RANU_BUILD_MANIFEST_INVALID',
      severity: 'error',
      message: `${manifestName} is missing a valid "buildId".`,
    });
  } else if (expectedBuildId && manifest.buildId !== expectedBuildId) {
    diagnostics.push({
      code: 'RANU_BUILD_MANIFEST_INVALID',
      severity: 'error',
      message: `Build ID mismatch in ${manifestName}: expected "${expectedBuildId}", found "${manifest.buildId}".`,
    });
  }

  return diagnostics;
}

/**
 * Validator for RouteManifest (supports V1 and V2)
 */
export function validateRouteManifest(manifest: any, expectedBuildId?: string): { success: boolean; diagnostics: RanuDiagnostic[] } {
  const diagnostics = validateBaseManifest(manifest, expectedBuildId, 'RouteManifest', [1, 2]);
  if (diagnostics.length > 0 && !manifest) {
    return { success: false, diagnostics };
  }

  if (!Array.isArray(manifest.routes)) {
    diagnostics.push({
      code: 'RANU_BUILD_MANIFEST_INVALID',
      severity: 'error',
      message: 'RouteManifest "routes" field must be an array.',
    });
    return { success: false, diagnostics };
  }

  const schemaVersion = manifest.schemaVersion;
  const canonicalMethods = ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'];
  let prevPattern = '';
  let isSorted = true;

  manifest.routes.forEach((route: any, idx: number) => {
    if (!route || typeof route !== 'object') {
      diagnostics.push({
        code: 'RANU_BUILD_MANIFEST_INVALID',
        severity: 'error',
        message: `RouteManifest entry at index ${idx} is not an object.`,
      });
      return;
    }

    if (typeof route.id !== 'string' || !route.id) {
      diagnostics.push({
        code: 'RANU_BUILD_MANIFEST_INVALID',
        severity: 'error',
        message: `RouteManifest entry at index ${idx} is missing a valid "id".`,
      });
    }

    if (route.kind !== 'page' && route.kind !== 'api') {
      diagnostics.push({
        code: 'RANU_BUILD_MANIFEST_INVALID',
        severity: 'error',
        message: `RouteManifest entry at index ${idx} has invalid kind: "${route.kind}".`,
      });
    }

    if (typeof route.pattern !== 'string' || !route.pattern) {
      diagnostics.push({
        code: 'RANU_BUILD_MANIFEST_INVALID',
        severity: 'error',
        message: `RouteManifest entry at index ${idx} is missing a valid "pattern".`,
      });
    } else {
      // Validate deterministic sorting by pattern
      if (route.pattern < prevPattern) {
        isSorted = false;
      }
      prevPattern = route.pattern;
    }

    if (route.kind === 'page' && route.renderMode && route.renderMode !== 'server' && route.renderMode !== 'static' && route.renderMode !== 'client') {
      diagnostics.push({
        code: 'RANU_BUILD_MANIFEST_INVALID',
        severity: 'error',
        message: `RouteManifest entry at index ${idx} has invalid renderMode: "${route.renderMode}".`,
      });
    }

    if (!Array.isArray(route.params)) {
      diagnostics.push({
        code: 'RANU_BUILD_MANIFEST_INVALID',
        severity: 'error',
        message: `RouteManifest entry at index ${idx} "params" must be an array of strings.`,
      });
    }

    // Methods validation depending on RouteManifest version
    if (schemaVersion === 2) {
      if (route.kind === 'api') {
        if (!Array.isArray(route.methods)) {
          diagnostics.push({
            code: 'RANU_BUILD_MANIFEST_INVALID',
            severity: 'error',
            message: `RouteManifest API entry "${route.id || idx}" is missing required "methods" array in V2.`,
          });
        } else if (route.methods.length === 0) {
          diagnostics.push({
            code: 'RANU_BUILD_MANIFEST_INVALID',
            severity: 'error',
            message: `RouteManifest API entry "${route.id || idx}" has empty "methods" array in V2.`,
          });
        } else {
          // Check duplicates, canonical, and order
          let isSortedMethods = true;
          const seen = new Set<string>();
          route.methods.forEach((method: any, mIdx: number) => {
            if (typeof method !== 'string') {
              diagnostics.push({
                code: 'RANU_BUILD_MANIFEST_INVALID',
                severity: 'error',
                message: `RouteManifest API entry "${route.id || idx}" has non-string method at index ${mIdx}.`,
              });
              return;
            }
            if (!canonicalMethods.includes(method)) {
              diagnostics.push({
                code: 'RANU_BUILD_MANIFEST_INVALID',
                severity: 'error',
                message: `RouteManifest API entry "${route.id || idx}" has invalid HTTP method: "${method}".`,
              });
            }
            if (seen.has(method)) {
              diagnostics.push({
                code: 'RANU_BUILD_MANIFEST_INVALID',
                severity: 'error',
                message: `RouteManifest API entry "${route.id || idx}" has duplicate method: "${method}".`,
              });
            }
            seen.add(method);

            if (mIdx > 0 && method <= route.methods[mIdx - 1]) {
              isSortedMethods = false;
            }
          });

          if (!isSortedMethods) {
            diagnostics.push({
              code: 'RANU_BUILD_MANIFEST_INVALID',
              severity: 'error',
              message: `RouteManifest API entry "${route.id || idx}" methods are not ordered alphabetically in V2.`,
            });
          }
        }
      } else if (route.kind === 'page') {
        if (route.methods !== undefined) {
          diagnostics.push({
            code: 'RANU_BUILD_MANIFEST_INVALID',
            severity: 'error',
            message: `RouteManifest page entry "${route.id || idx}" contains forbidden "methods" property in V2.`,
          });
        }
      }
    } else if (schemaVersion === 1) {
      if (route.methods !== undefined && !Array.isArray(route.methods)) {
        diagnostics.push({
          code: 'RANU_BUILD_MANIFEST_INVALID',
          severity: 'error',
          message: `RouteManifest entry "${route.id || idx}" has non-array "methods" property in V1.`,
        });
      }
    }
  });

  if (!isSorted) {
    diagnostics.push({
      code: 'RANU_BUILD_MANIFEST_INVALID',
      severity: 'error',
      message: 'RouteManifest routes are not ordered deterministically (alphabetically by pattern).',
    });
  }

  return { success: diagnostics.length === 0, diagnostics };
}

/**
 * Validator for ServerManifest
 */
export function validateServerManifest(manifest: any, expectedBuildId?: string): { success: boolean; diagnostics: RanuDiagnostic[] } {
  const diagnostics = validateBaseManifest(manifest, expectedBuildId, 'ServerManifest');
  if (diagnostics.length > 0 && !manifest) {
    return { success: false, diagnostics };
  }

  if (!Array.isArray(manifest.routes)) {
    diagnostics.push({
      code: 'RANU_BUILD_MANIFEST_INVALID',
      severity: 'error',
      message: 'ServerManifest "routes" field must be an array.',
    });
    return { success: false, diagnostics };
  }

  let prevRouteId = '';
  let isSorted = true;

  manifest.routes.forEach((route: any, idx: number) => {
    if (!route || typeof route !== 'object') {
      diagnostics.push({
        code: 'RANU_BUILD_MANIFEST_INVALID',
        severity: 'error',
        message: `ServerManifest entry at index ${idx} is not an object.`,
      });
      return;
    }

    if (typeof route.routeId !== 'string' || !route.routeId) {
      diagnostics.push({
        code: 'RANU_BUILD_MANIFEST_INVALID',
        severity: 'error',
        message: `ServerManifest entry at index ${idx} is missing a valid "routeId".`,
      });
    } else {
      if (route.routeId < prevRouteId) {
        isSorted = false;
      }
      prevRouteId = route.routeId;
    }

    if (typeof route.serverEntry !== 'string' || !route.serverEntry) {
      diagnostics.push({
        code: 'RANU_BUILD_MANIFEST_INVALID',
        severity: 'error',
        message: `ServerManifest entry for "${route.routeId || idx}" is missing a valid "serverEntry" filepath.`,
      });
    } else if (isAbsolutePath(route.serverEntry)) {
      diagnostics.push({
        code: 'RANU_BUILD_MANIFEST_INVALID',
        severity: 'error',
        message: `ServerManifest entry for "${route.routeId}" contains an absolute path in "serverEntry": "${route.serverEntry}".`,
      });
    }
  });

  if (!isSorted) {
    diagnostics.push({
      code: 'RANU_BUILD_MANIFEST_INVALID',
      severity: 'error',
      message: 'ServerManifest routes are not ordered deterministically (alphabetically by routeId).',
    });
  }

  return { success: diagnostics.length === 0, diagnostics };
}

/**
 * Validator for ClientManifest
 */
export function validateClientManifest(manifest: any, expectedBuildId?: string): { success: boolean; diagnostics: RanuDiagnostic[] } {
  const diagnostics = validateBaseManifest(manifest, expectedBuildId, 'ClientManifest');
  if (diagnostics.length > 0 && !manifest) {
    return { success: false, diagnostics };
  }

  const assets = manifest.assets;
  if (!assets || typeof assets !== 'object' || Array.isArray(assets)) {
    diagnostics.push({
      code: 'RANU_BUILD_MANIFEST_INVALID',
      severity: 'error',
      message: 'ClientManifest "assets" field must be a key-value object.',
    });
    return { success: false, diagnostics };
  }

  for (const [key, assetGroup] of Object.entries(assets)) {
    if (!assetGroup || typeof assetGroup !== 'object') {
      diagnostics.push({
        code: 'RANU_BUILD_MANIFEST_INVALID',
        severity: 'error',
        message: `ClientManifest assets entry for "${key}" is not an object.`,
      });
      continue;
    }

    const group = assetGroup as any;

    if (!Array.isArray(group.js)) {
      diagnostics.push({
        code: 'RANU_BUILD_MANIFEST_INVALID',
        severity: 'error',
        message: `ClientManifest assets entry for "${key}" is missing a "js" assets array.`,
      });
    } else {
      group.js.forEach((p: any, idx: number) => {
        if (typeof p !== 'string') {
          diagnostics.push({
            code: 'RANU_BUILD_MANIFEST_INVALID',
            severity: 'error',
            message: `ClientManifest assets entry for "${key}" has a non-string JS path at index ${idx}.`,
          });
        } else if (isAbsolutePath(p)) {
          diagnostics.push({
            code: 'RANU_BUILD_MANIFEST_INVALID',
            severity: 'error',
            message: `ClientManifest assets entry for "${key}" contains an absolute path in JS assets: "${p}".`,
          });
        }
      });
    }

    if (!Array.isArray(group.css)) {
      diagnostics.push({
        code: 'RANU_BUILD_MANIFEST_INVALID',
        severity: 'error',
        message: `ClientManifest assets entry for "${key}" is missing a "css" assets array.`,
      });
    } else {
      group.css.forEach((p: any, idx: number) => {
        if (typeof p !== 'string') {
          diagnostics.push({
            code: 'RANU_BUILD_MANIFEST_INVALID',
            severity: 'error',
            message: `ClientManifest assets entry for "${key}" has a non-string CSS path at index ${idx}.`,
          });
        } else if (isAbsolutePath(p)) {
          diagnostics.push({
            code: 'RANU_BUILD_MANIFEST_INVALID',
            severity: 'error',
            message: `ClientManifest assets entry for "${key}" contains an absolute path in CSS assets: "${p}".`,
          });
        }
      });
    }
  }

  return { success: diagnostics.length === 0, diagnostics };
}

/**
 * Validator for StaticManifest
 */
export function validateStaticManifest(manifest: any, expectedBuildId?: string): { success: boolean; diagnostics: RanuDiagnostic[] } {
  const diagnostics = validateBaseManifest(manifest, expectedBuildId, 'StaticManifest');
  if (diagnostics.length > 0 && !manifest) {
    return { success: false, diagnostics };
  }

  if (!Array.isArray(manifest.routes)) {
    diagnostics.push({
      code: 'RANU_BUILD_MANIFEST_INVALID',
      severity: 'error',
      message: 'StaticManifest "routes" field must be an array.',
    });
    return { success: false, diagnostics };
  }

  let prevPathname = '';
  let isSorted = true;

  manifest.routes.forEach((route: any, idx: number) => {
    if (!route || typeof route !== 'object') {
      diagnostics.push({
        code: 'RANU_BUILD_MANIFEST_INVALID',
        severity: 'error',
        message: `StaticManifest entry at index ${idx} is not an object.`,
      });
      return;
    }

    if (typeof route.pathname !== 'string' || !route.pathname) {
      diagnostics.push({
        code: 'RANU_BUILD_MANIFEST_INVALID',
        severity: 'error',
        message: `StaticManifest entry at index ${idx} is missing a valid "pathname".`,
      });
    } else {
      if (route.pathname < prevPathname) {
        isSorted = false;
      }
      prevPathname = route.pathname;
    }

    if (typeof route.routeId !== 'string' || !route.routeId) {
      diagnostics.push({
        code: 'RANU_BUILD_MANIFEST_INVALID',
        severity: 'error',
        message: `StaticManifest entry for "${route.pathname || idx}" is missing a valid "routeId".`,
      });
    }

    if (typeof route.file !== 'string' || !route.file) {
      diagnostics.push({
        code: 'RANU_BUILD_MANIFEST_INVALID',
        severity: 'error',
        message: `StaticManifest entry for "${route.pathname || idx}" is missing a valid "file" target filepath.`,
      });
    } else if (isAbsolutePath(route.file)) {
      diagnostics.push({
        code: 'RANU_BUILD_MANIFEST_INVALID',
        severity: 'error',
        message: `StaticManifest entry for "${route.pathname}" contains an absolute path in "file": "${route.file}".`,
      });
    }
  });

  if (!isSorted) {
    diagnostics.push({
      code: 'RANU_BUILD_MANIFEST_INVALID',
      severity: 'error',
      message: 'StaticManifest routes are not ordered deterministically (alphabetically by pathname).',
    });
  }

  return { success: diagnostics.length === 0, diagnostics };
}
