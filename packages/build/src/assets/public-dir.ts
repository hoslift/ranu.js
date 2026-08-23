import fs from 'node:fs';
import path from 'node:path';
import type { RanuDiagnostic } from '@ranu/diagnostics';
import type { RouteEntryInfo } from '../pipeline/stage-routes.js';

export interface CopyPublicDirectoryResult {
  readonly success: boolean;
  readonly copiedFiles: readonly string[];
  readonly diagnostics: readonly RanuDiagnostic[];
}

/**
 * Copies static assets from public/ into build static output directory with collision detection.
 */
export function copyPublicDirectory(
  projectRoot: string,
  staticOutDir: string,
  routes: readonly RouteEntryInfo[] = []
): CopyPublicDirectoryResult {
  const diagnostics: RanuDiagnostic[] = [];
  const copiedFiles: string[] = [];

  const publicDir = path.join(projectRoot, 'public');
  if (!fs.existsSync(publicDir)) {
    return {
      success: true,
      copiedFiles,
      diagnostics,
    };
  }

  // Set of route pathname templates (e.g. /about, /api/user)
  const routePatterns = new Set(routes.map(r => r.pathnameTemplate));

  function crawl(currentDir: string, relativeDir = ''): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const entryRelative = path.join(relativeDir, entry.name).replace(/\\/g, '/');
      const srcPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        // Prevent reserved _ranu namespace in public/
        if (entry.name === '_ranu' || entryRelative === '_ranu') {
          diagnostics.push({
            code: 'RANU_BUILD_PUBLIC_RESERVED_NAMESPACE',
            severity: 'error',
            message: `Public directory cannot contain reserved framework namespace: "/${entryRelative}".`,
            location: { file: srcPath },
          });
          continue;
        }
        crawl(srcPath, entryRelative);
      } else if (entry.isFile()) {
        const publicUrlPath = `/${entryRelative}`;

        // 1. Reserved namespace check
        if (publicUrlPath.startsWith('/_ranu/') || publicUrlPath === '/_ranu') {
          diagnostics.push({
            code: 'RANU_BUILD_PUBLIC_RESERVED_NAMESPACE',
            severity: 'error',
            message: `Public asset "${publicUrlPath}" uses reserved framework namespace "/_ranu".`,
            location: { file: srcPath },
          });
          continue;
        }

        // 2. Collision check with application routes
        const urlWithoutExt = publicUrlPath.replace(/\.[^.]+$/, '');
        if (routePatterns.has(publicUrlPath) || routePatterns.has(urlWithoutExt)) {
          diagnostics.push({
            code: 'RANU_BUILD_PUBLIC_ROUTE_COLLISION',
            severity: 'error',
            message: `Public asset "${publicUrlPath}" collides with an existing application route.`,
            location: { file: srcPath },
          });
          continue;
        }

        // 3. Copy file to staticOutDir
        const destPath = path.join(staticOutDir, entryRelative);
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }

        fs.copyFileSync(srcPath, destPath);
        copiedFiles.push(publicUrlPath);
      }
    }
  }

  try {
    crawl(publicDir);
  } catch (err: unknown) {
    diagnostics.push({
      code: 'RANU_BUILD_PUBLIC_COPY_FAILED',
      severity: 'error',
      message: `Failed to copy public assets: ${(err as Error).message ?? String(err)}`,
    });
  }

  return {
    success: !diagnostics.some(d => d.severity === 'error'),
    copiedFiles,
    diagnostics,
  };
}
