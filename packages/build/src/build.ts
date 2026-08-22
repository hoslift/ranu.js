import fs from 'node:fs';
import path from 'node:path';
import type { RanuDiagnostic } from '@ranu/diagnostics';
import {
  discoverConfig,
  loadConfig,
  validateUserConfig,
  loadEnv,
  type ResolvedRanuConfig,
} from '@ranu/config';
import { generateBuildId } from './build-id.js';
import type { BuildConfig, BuildContext } from './build-config.js';
import type { BuildResult } from './build-result.js';
import {
  isPathContained,
  promoteBuildArtifacts,
  cleanupTempArtifacts,
} from './output/artifact-writer.js';
import { generateProductionEntrySource } from './output/production-entry.js';
import { runRouteStage } from './pipeline/stage-routes.js';
import { runServerGraphStage } from './pipeline/stage-server-graph.js';
import { runClientGraphStage } from './pipeline/stage-client-graph.js';
import { runStaticGenerationStage } from './pipeline/stage-static.js';
import { runManifestStage } from './pipeline/stage-manifests.js';
import { runValidationStage } from './pipeline/stage-validate.js';
import { buildModuleGraph } from './graph/module-classifier.js';
import { validateGraphBoundaries } from './graph/boundary-validator.js';
import { validateGraphEnvAccess } from './env/env-validator.js';

/**
 * Main Ranu.js production build orchestrator.
 */
export async function build(config: BuildConfig): Promise<BuildResult> {
  const startTime = Date.now();
  const diagnostics: RanuDiagnostic[] = [];
  const projectRoot = path.resolve(config.projectRoot);

  // 1. Validate project root exists
  if (!fs.existsSync(projectRoot)) {
    return {
      success: false,
      buildId: '',
      outDir: '',
      diagnostics: [
        {
          code: 'RANU_BUILD_CONFIG_INVALID',
          severity: 'error',
          message: `Project root directory does not exist: ${projectRoot}`,
        },
      ],
      duration: Date.now() - startTime,
    };
  }

  // 2. Resolve output directories
  const outDir = config.outDir
    ? path.resolve(config.outDir)
    : path.join(projectRoot, '.ranu', 'build');

  // Verify outDir safety
  const dotRanuDir = path.join(projectRoot, '.ranu');
  if (!isPathContained(outDir, projectRoot) && !config.outDir) {
    return {
      success: false,
      buildId: '',
      outDir,
      diagnostics: [
        {
          code: 'RANU_BUILD_CONFIG_INVALID',
          severity: 'error',
          message: `Output directory "${outDir}" escapes the project root.`,
        },
      ],
      duration: Date.now() - startTime,
    };
  }

  // 3. Load and resolve configuration
  let resolvedConfig: ResolvedRanuConfig = {
    root: projectRoot,
    mode: config.mode ?? 'production',
    plugins: [],
    build: {
      sourceMaps: config.sourceMaps !== false,
      minify: config.minify ?? false,
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      trustProxy: false,
    },
    routing: {
      trailingSlash: 'never',
    },
    rendering: {
      defaultMode: 'server',
    },
    deployment: {},
  };

  const configDiscovery = discoverConfig(projectRoot);
  if (configDiscovery.diagnostic) {
    diagnostics.push(configDiscovery.diagnostic);
    return {
      success: false,
      buildId: '',
      outDir,
      diagnostics,
      duration: Date.now() - startTime,
    };
  }

  if (configDiscovery.configPath) {
    try {
      const userConfig = await loadConfig(configDiscovery.configPath);
      const val = validateUserConfig(userConfig);
      diagnostics.push(...val.diagnostics);
      if (!val.success) {
        return {
          success: false,
          buildId: '',
          outDir,
          diagnostics,
          duration: Date.now() - startTime,
        };
      }
      // Merge user config
      resolvedConfig = {
        ...resolvedConfig,
        build: {
          ...resolvedConfig.build,
          ...(userConfig?.build ?? {}),
        },
        rendering: {
          ...resolvedConfig.rendering,
          ...(userConfig?.rendering ?? {}),
        },
        server: {
          ...resolvedConfig.server,
          ...(userConfig?.server ?? {}),
        },
      };
    } catch (err: any) {
      diagnostics.push({
        code: err.code ?? 'RANU_CONFIG_LOAD_FAILED',
        severity: 'error',
        message: err.message ?? String(err),
      });
      return {
        success: false,
        buildId: '',
        outDir,
        diagnostics,
        duration: Date.now() - startTime,
      };
    }
  }

  // 4. Load environment variables (.env, .env.production)
  try {
    loadEnv('production', projectRoot);
  } catch {
    // Ignore optional env loading error
  }

  // 5. Generate Build ID
  const buildId = generateBuildId();

  // 6. Setup temporary build directory
  const tempOutDir = path.join(dotRanuDir, `.build_temp_${buildId}`);
  const serverOutDir = path.join(tempOutDir, 'server');
  const staticOutDir = path.join(tempOutDir, 'static');
  const manifestOutDir = path.join(tempOutDir, 'manifest');

  fs.mkdirSync(serverOutDir, { recursive: true });
  fs.mkdirSync(staticOutDir, { recursive: true });
  fs.mkdirSync(manifestOutDir, { recursive: true });

  const ctx: BuildContext = {
    config,
    resolvedConfig,
    buildId,
    projectRoot,
    outDir,
    tempOutDir,
    serverOutDir,
    staticOutDir,
    manifestOutDir,
    diagnostics,
  };

  try {
    // Stage 5-6: Discover & analyze routes
    const routeResult = await runRouteStage(ctx);
    diagnostics.push(...routeResult.diagnostics);
    if (diagnostics.some(d => d.severity === 'error')) {
      cleanupTempArtifacts(tempOutDir);
      return {
        success: false,
        buildId,
        outDir,
        diagnostics,
        duration: Date.now() - startTime,
      };
    }

    // Stage 7: Build & Classify Module Graph
    const serverRootFiles = routeResult.routes
      .map(r => r.sourceFile)
      .filter(f => Boolean(f) && fs.existsSync(f));

    // Also include root layout if present
    const rootLayoutCandidates = ['layout.tsx', 'layout.ts', 'layout.jsx', 'layout.js'];
    for (const cand of rootLayoutCandidates) {
      const full = path.join(projectRoot, 'app', cand);
      if (fs.existsSync(full) && !serverRootFiles.includes(full)) {
        serverRootFiles.push(full);
      }
    }

    const moduleGraph = buildModuleGraph(serverRootFiles, projectRoot);

    // Stage 8: Validate Graph Boundaries (server-only & node built-in rejection in client graph)
    const boundaryCheck = validateGraphBoundaries(moduleGraph);
    diagnostics.push(...boundaryCheck.diagnostics);
    if (diagnostics.some(d => d.severity === 'error')) {
      cleanupTempArtifacts(tempOutDir);
      return {
        success: false,
        buildId,
        outDir,
        diagnostics,
        duration: Date.now() - startTime,
      };
    }

    // Stage 8b: Validate Environment Security (reject private env access in client-reachable code)
    const envCheck = validateGraphEnvAccess(moduleGraph);
    diagnostics.push(...envCheck.diagnostics);
    if (diagnostics.some(d => d.severity === 'error')) {
      cleanupTempArtifacts(tempOutDir);
      return {
        success: false,
        buildId,
        outDir,
        diagnostics,
        duration: Date.now() - startTime,
      };
    }

    // Stage 10: Server graph compilation
    const serverResult = await runServerGraphStage(ctx, routeResult.routes);
    diagnostics.push(...serverResult.diagnostics);
    if (diagnostics.some(d => d.severity === 'error')) {
      cleanupTempArtifacts(tempOutDir);
      return {
        success: false,
        buildId,
        outDir,
        diagnostics,
        duration: Date.now() - startTime,
      };
    }

    // Stage 16: Generate production server entry (server/entry.mjs)
    const entrySource = generateProductionEntrySource(buildId);
    fs.writeFileSync(path.join(serverOutDir, 'entry.mjs'), entrySource, 'utf8');

    // Stage 11: Client graph compilation & browser bundling
    const clientResult = await runClientGraphStage(ctx, moduleGraph);
    diagnostics.push(...clientResult.diagnostics);
    if (diagnostics.some(d => d.severity === 'error')) {
      cleanupTempArtifacts(tempOutDir);
      return {
        success: false,
        buildId,
        outDir,
        diagnostics,
        duration: Date.now() - startTime,
      };
    }

    // Stage 15: Static Site Generation (SSG)
    const staticResult = await runStaticGenerationStage(ctx, routeResult.routes);
    diagnostics.push(...staticResult.diagnostics);
    if (diagnostics.some(d => d.severity === 'error')) {
      cleanupTempArtifacts(tempOutDir);
      return {
        success: false,
        buildId,
        outDir,
        diagnostics,
        duration: Date.now() - startTime,
      };
    }

    // Stage 15b: Manifest generation
    const manifestResult = runManifestStage(
      ctx,
      routeResult.routes,
      clientResult.assets,
      staticResult.staticRoutes
    );
    diagnostics.push(...manifestResult.diagnostics);
    if (diagnostics.some(d => d.severity === 'error')) {
      cleanupTempArtifacts(tempOutDir);
      return {
        success: false,
        buildId,
        outDir,
        diagnostics,
        duration: Date.now() - startTime,
      };
    }

    // Write BUILD_ID file
    fs.writeFileSync(path.join(tempOutDir, 'BUILD_ID'), `${buildId}\n`, 'utf8');

    // Stage 17: Artifact integrity validation
    const valResult = await runValidationStage(ctx, manifestResult);
    diagnostics.push(...valResult.diagnostics);
    if (diagnostics.some(d => d.severity === 'error')) {
      cleanupTempArtifacts(tempOutDir);
      return {
        success: false,
        buildId,
        outDir,
        diagnostics,
        duration: Date.now() - startTime,
      };
    }

    // Promote temp directory to final destination
    promoteBuildArtifacts(tempOutDir, outDir);

    return {
      success: true,
      buildId,
      outDir,
      diagnostics,
      duration: Date.now() - startTime,
    };
  } catch (err: any) {
    cleanupTempArtifacts(tempOutDir);
    diagnostics.push({
      code: 'RANU_BUILD_CONFIG_INVALID',
      severity: 'error',
      message: `Unexpected build failure: ${err.message ?? String(err)}`,
    });
    return {
      success: false,
      buildId,
      outDir,
      diagnostics,
      duration: Date.now() - startTime,
    };
  }
}
