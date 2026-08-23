import fs from 'node:fs';
import path from 'node:path';
import type { RanuDiagnostic } from '@ranu/diagnostics';
import {
  discoverConfig,
  loadConfig,
  validateUserConfig,
  loadEnv,
} from '@ranu/config';
import {
  runRouteStage,
  buildModuleGraph,
  validateGraphBoundaries,
  validateGraphEnvAccess,
  runServerGraphStage,
  runClientGraphStage,
  runManifestStage,
  copyPublicDirectory,
  type RouteEntryInfo,
  type BuildContext,
} from '@ranu/build';
import type { DevBuildState, DevServerOptions } from './types.js';

export interface CoordinatorOptions {
  readonly options: DevServerOptions;
  readonly onBuildComplete: (state: DevBuildState) => void;
  readonly onConfigRestart?: (reason: string) => void;
}

export class RebuildCoordinator {
  private readonly projectRoot: string;
  private readonly outDir: string;
  private readonly staticOutDir: string;
  private readonly serverOutDir: string;
  private readonly onBuildComplete: (state: DevBuildState) => void;
  private readonly onConfigRestart?: (reason: string) => void;

  private generation = 0;
  private isBuilding = false;
  private pendingRebuild = false;
  private lastState: DevBuildState | null = null;
  private lastGoodState: DevBuildState | null = null;

  constructor(options: CoordinatorOptions) {
    this.projectRoot = path.resolve(options.options.projectRoot);
    this.outDir = path.resolve(options.options.outDir ?? path.join(this.projectRoot, '.ranu', 'dev'));
    this.staticOutDir = path.join(this.outDir, 'static');
    this.serverOutDir = path.join(this.outDir, 'server');
    this.onBuildComplete = options.onBuildComplete;
    this.onConfigRestart = options.onConfigRestart;
  }

  get currentState(): DevBuildState | null {
    return this.lastState;
  }

  get currentGoodState(): DevBuildState | null {
    return this.lastGoodState;
  }

  get isBusy(): boolean {
    return this.isBuilding;
  }

  /**
   * Executes a development build or queues a pending rebuild if already in progress.
   */
  async triggerRebuild(_reason?: string): Promise<DevBuildState> {
    if (this.isBuilding) {
      this.pendingRebuild = true;
      return this.lastState!;
    }

    this.isBuilding = true;
    this.generation++;
    const buildId = `dev-${this.generation}-${Date.now().toString(36)}`;
    const diagnostics: RanuDiagnostic[] = [];
    let discoveredRoutes: RouteEntryInfo[] = [];

    try {
      // 1. Ensure output directories exist
      fs.mkdirSync(this.outDir, { recursive: true });
      fs.mkdirSync(this.staticOutDir, { recursive: true });
      fs.mkdirSync(this.serverOutDir, { recursive: true });

      // 2. Discover and load configuration
      const configPath = discoverConfig(this.projectRoot);
      const rawUserConfig = configPath ? await loadConfig(configPath) : {};
      const { config: validatedUserConfig, diagnostics: configDiags } = validateUserConfig(rawUserConfig);
      diagnostics.push(...configDiags);

      const envResult = loadEnv(this.projectRoot, 'development');
      const resolvedConfig = {
        ...validatedUserConfig,
        mode: 'development' as const,
      };

      const manifestOutDir = path.join(this.outDir, 'manifest');
      fs.mkdirSync(manifestOutDir, { recursive: true });

      const ctx: BuildContext = {
        projectRoot: this.projectRoot,
        outDir: this.outDir,
        tempOutDir: this.outDir, // In dev, compile directly to dev outDir
        serverOutDir: this.serverOutDir,
        staticOutDir: this.staticOutDir,
        manifestOutDir,
        diagnostics,
        config: {
          projectRoot: this.projectRoot,
          mode: 'development',
          outDir: this.outDir,
          clean: false,
          minify: false,
          sourceMaps: true,
        },
        resolvedConfig,
        buildId,
      };

      // 3. Stage 1: Route discovery
      const routeResult = await runRouteStage(ctx);
      diagnostics.push(...routeResult.diagnostics);
      discoveredRoutes = routeResult.routes;

      if (!diagnostics.some(d => d.severity === 'error')) {
        // 4. Stage 2: Module graph classification & boundary validation
        const moduleGraph = await buildModuleGraph(this.projectRoot, routeResult.routes);
        const boundaryDiags = validateGraphBoundaries(moduleGraph, this.projectRoot);
        diagnostics.push(...boundaryDiags);

        const envDiags = validateGraphEnvAccess(moduleGraph, this.projectRoot, envResult.publicEnv);
        diagnostics.push(...envDiags);

        if (!diagnostics.some(d => d.severity === 'error')) {
          // 5. Stage 3: Server graph compilation
          const serverResult = await runServerGraphStage(ctx, routeResult.routes);
          diagnostics.push(...serverResult.diagnostics);

          // 6. Stage 4: Client graph compilation & CSS extraction
          const clientResult = await runClientGraphStage(ctx, moduleGraph, routeResult.routes);
          diagnostics.push(...clientResult.diagnostics);

          // 7. Stage 5: Copy public directory
          const publicResult = copyPublicDirectory(this.projectRoot, this.staticOutDir, routeResult.routes);
          diagnostics.push(...publicResult.diagnostics);

          // 8. Stage 6: Manifest generation
          const manifestResult = runManifestStage(
            ctx,
            routeResult.routes,
            clientResult.assets,
            []
          );
          diagnostics.push(...manifestResult.diagnostics);
        }
      }
    } catch (err: unknown) {
      diagnostics.push({
        code: 'RANU_DEV_BUILD_FAILED',
        severity: 'error',
        message: `Dev compilation error: ${(err as Error).stack ?? (err as Error).message ?? String(err)}`,
      });
    } finally {
      this.isBuilding = false;
    }

    const hasErrors = diagnostics.some(d => d.severity === 'error');
    const newState: DevBuildState = {
      generation: this.generation,
      buildId,
      success: !hasErrors,
      diagnostics,
      outDir: this.outDir,
      routes: discoveredRoutes,
      timestamp: Date.now(),
    };

    this.lastState = newState;
    if (newState.success) {
      this.lastGoodState = newState;
    }

    this.onBuildComplete(newState);

    // If more file changes arrived while building, trigger follow-up rebuild immediately
    if (this.pendingRebuild) {
      this.pendingRebuild = false;
      return this.triggerRebuild('queued changes');
    }

    return newState;
  }
}
