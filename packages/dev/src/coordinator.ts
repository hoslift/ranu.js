import fs from 'node:fs';
import path from 'node:path';
import type { RanuDiagnostic } from '@ranu/diagnostics';
import { discoverConfig, loadConfig, resolveConfig } from '@ranu/config';
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
import type { CompiledRouteRecord } from '@ranu/router';
import type { DevBuildState, DevServerOptions, DevFileEvent } from './types.js';
import { analyzeHmrUpdates } from './hmr/graph-invalidator.js';
import type { HmrAnalysisResult } from './hmr/types.js';

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
  private readonly onConfigRestart: ((reason: string) => void) | undefined;

  private generation = 0;
  private isBuilding = false;
  private pendingRebuild = false;
  private pendingEvents: DevFileEvent[] = [];
  private lastState: DevBuildState | null = null;
  private lastGoodState: DevBuildState | null = null;

  constructor(options: CoordinatorOptions) {
    this.projectRoot = path.resolve(options.options.projectRoot);
    this.outDir = path.resolve(
      options.options.outDir ?? path.join(this.projectRoot, '.ranu', 'dev'),
    );
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
  async triggerRebuild(_reason?: string, changedEvents?: DevFileEvent[]): Promise<DevBuildState> {
    if (changedEvents && changedEvents.length > 0) {
      this.pendingEvents.push(...changedEvents);
    }

    if (this.isBuilding) {
      this.pendingRebuild = true;
      return this.lastState!;
    }

    this.isBuilding = true;
    const currentEvents = [...this.pendingEvents];
    this.pendingEvents = [];

    this.generation++;
    const buildId = `dev-${this.generation}-${Date.now().toString(36)}`;
    const diagnostics: RanuDiagnostic[] = [];
    let discoveredRoutes: RouteEntryInfo[] = [];
    let discoveredRecords: CompiledRouteRecord[] = [];
    let hmrAnalysis: HmrAnalysisResult | undefined;

    try {
      // 1. Ensure output directories exist
      fs.mkdirSync(this.outDir, { recursive: true });
      fs.mkdirSync(this.staticOutDir, { recursive: true });
      fs.mkdirSync(this.serverOutDir, { recursive: true });

      // 2. Discover and load configuration
      const { configPath, diagnostic: configDiagnostic } = discoverConfig(this.projectRoot);
      if (configDiagnostic) {
        diagnostics.push(configDiagnostic);
      }
      const rawUserConfig = configPath ? await loadConfig(configPath) : {};
      const { config: resolvedConfig, diagnostics: configDiags } = resolveConfig(
        rawUserConfig,
        this.projectRoot,
        'development',
      );
      diagnostics.push(...configDiags);

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
          minify: false,
          sourceMaps: 'inline',
        },
        resolvedConfig,
        buildId,
      };

      // 3. Stage 1: Route discovery
      const routeResult = runRouteStage(ctx);
      diagnostics.push(...routeResult.diagnostics);
      discoveredRoutes = routeResult.routes;
      discoveredRecords = routeResult.records;

      if (!diagnostics.some((d) => d.severity === 'error')) {
        // 4. Stage 2: Module graph classification & boundary validation
        const serverRootFiles = routeResult.routes
          .map((route) => route.sourceFile)
          .filter((file) => Boolean(file) && fs.existsSync(file));
        for (const candidate of ['layout.tsx', 'layout.ts', 'layout.jsx', 'layout.js']) {
          const layoutPath = path.join(this.projectRoot, 'app', candidate);
          if (fs.existsSync(layoutPath) && !serverRootFiles.includes(layoutPath)) {
            serverRootFiles.push(layoutPath);
          }
        }
        for (const candidate of ['middleware.ts', 'middleware.js', 'middleware.mjs', 'middleware.cjs', 'src/middleware.ts', 'src/middleware.js']) {
          const middlewarePath = path.join(this.projectRoot, candidate);
          if (fs.existsSync(middlewarePath) && !serverRootFiles.includes(middlewarePath)) {
            serverRootFiles.push(middlewarePath);
          }
        }

        const moduleGraph = buildModuleGraph(serverRootFiles, this.projectRoot);
        diagnostics.push(...validateGraphBoundaries(moduleGraph).diagnostics);
        diagnostics.push(...validateGraphEnvAccess(moduleGraph).diagnostics);

        if (!diagnostics.some((d) => d.severity === 'error')) {
          // 5. Stage 3: Server graph compilation
          const serverResult = await runServerGraphStage(ctx, routeResult.routes);
          diagnostics.push(...serverResult.diagnostics);

          // 6. Stage 4: Client graph compilation & CSS extraction
          const clientResult = await runClientGraphStage(ctx, moduleGraph, routeResult.routes);
          diagnostics.push(...clientResult.diagnostics);

          // 7. Stage 5: Copy public directory
          const publicResult = copyPublicDirectory(
            this.projectRoot,
            this.staticOutDir,
            routeResult.routes,
          );
          diagnostics.push(...publicResult.diagnostics);

          // 8. Stage 6: Manifest generation
          const manifestResult = runManifestStage(ctx, routeResult.routes, clientResult.assets, []);
          diagnostics.push(...manifestResult.diagnostics);

          if (!diagnostics.some((d) => d.severity === 'error')) {
            hmrAnalysis = analyzeHmrUpdates({
              changedEvents: currentEvents,
              generation: this.generation,
              routeManifest: manifestResult.routeManifest,
              clientManifest: manifestResult.clientManifest,
            });
          }
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

    const hasErrors = diagnostics.some((d) => d.severity === 'error');
    const newState: DevBuildState = {
      generation: this.generation,
      buildId,
      success: !hasErrors,
      diagnostics,
      outDir: this.outDir,
      routes: discoveredRoutes,
      routeRecords: discoveredRecords,
      hmrAnalysis,
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
