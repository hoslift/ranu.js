import fs from 'node:fs';
import path from 'node:path';
import type { RanuDiagnostic } from '@ranu/diagnostics';
import type { BuildContext } from '../build-config.js';
import type { ManifestStageResult } from './stage-manifests.js';

export interface ValidationStageResult {
  success: boolean;
  diagnostics: RanuDiagnostic[];
}

/**
 * Artifact Integrity Validation Stage (Stage 17).
 * Verifies that all output files referenced in manifests actually exist on disk before promoting.
 */
export function runValidationStage(
  ctx: BuildContext,
  manifestResult: ManifestStageResult
): ValidationStageResult {
  const diagnostics: RanuDiagnostic[] = [];

  // 1. Verify build.json exists on disk
  const buildJsonPath = path.join(ctx.tempOutDir, 'build.json');
  if (!fs.existsSync(buildJsonPath)) {
    diagnostics.push({
      code: 'RANU_BUILD_MANIFEST_INVALID',
      severity: 'error',
      message: 'Integrity check failed: build.json was not written to output.',
    });
  }

  // 2. Verify all server entries exist on disk
  for (const entry of manifestResult.serverManifest.routes) {
    const entryPath = path.join(ctx.tempOutDir, entry.serverEntry);
    if (!fs.existsSync(entryPath)) {
      diagnostics.push({
        code: 'RANU_BUILD_MANIFEST_INVALID',
        severity: 'error',
        message: `Integrity check failed: Server entry file for route "${entry.routeId}" was not found on disk at: ${entry.serverEntry}`,
      });
    }
  }

  // 3. Verify all client assets exist on disk
  for (const [entryId, group] of Object.entries(manifestResult.clientManifest.assets)) {
    for (const jsFile of group.js) {
      // jsFile is URL-relative, e.g. /_ranu/assets/c_abc.js -> static/assets/c_abc.js
      const relFsPath = jsFile.replace(/^\/_ranu\//, 'static/');
      const filePath = path.join(ctx.tempOutDir, relFsPath);
      if (!fs.existsSync(filePath)) {
        diagnostics.push({
          code: 'RANU_BUILD_MANIFEST_INVALID',
          severity: 'error',
          message: `Integrity check failed: Client JS asset for "${entryId}" not found at: ${relFsPath}`,
        });
      }
    }
  }

  // 4. Verify production server entry exists
  const entryMjsPath = path.join(ctx.serverOutDir, 'entry.mjs');
  if (!fs.existsSync(entryMjsPath)) {
    diagnostics.push({
      code: 'RANU_BUILD_MANIFEST_INVALID',
      severity: 'error',
      message: 'Integrity check failed: Production server entry (.ranu/build/server/entry.mjs) was not generated.',
    });
  }

  // 5. Verify BUILD_ID file
  const buildIdPath = path.join(ctx.tempOutDir, 'BUILD_ID');
  if (!fs.existsSync(buildIdPath)) {
    diagnostics.push({
      code: 'RANU_BUILD_MANIFEST_INVALID',
      severity: 'error',
      message: 'Integrity check failed: BUILD_ID file was not generated.',
    });
  } else {
    const content = fs.readFileSync(buildIdPath, 'utf8').trim();
    if (content !== ctx.buildId) {
      diagnostics.push({
        code: 'RANU_BUILD_MANIFEST_INVALID',
        severity: 'error',
        message: `Integrity check failed: BUILD_ID content "${content}" does not match context buildId "${ctx.buildId}".`,
      });
    }
  }

  return {
    success: diagnostics.length === 0,
    diagnostics,
  };
}
