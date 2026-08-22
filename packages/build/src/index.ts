/**
 * @ranu/build
 *
 * Build orchestration, bundler adapter, graph analysis, server/client boundaries.
 * Internal package — not public application API.
 */

export { build } from './build.js';
export { generateBuildId, isValidBuildId } from './build-id.js';
export { analyzeRouteMethods } from './analyzer.js';
export { EsbuildAdapter } from './bundler/esbuild-adapter.js';
export { createRanuEsbuildPlugin } from './bundler/esbuild-plugin-ranu.js';
export {
  detectDirectives,
  isClientDirective,
} from './compiler/directive-detector.js';
export {
  hasServerOnlyImport,
  isServerDirectoryModule,
  isServerOnlyModule,
} from './compiler/server-only-detector.js';
export {
  buildModuleGraph,
  extractModuleImports,
  resolveImportPath,
  isNodeBuiltinModule,
} from './graph/module-classifier.js';
export {
  validateGraphBoundaries,
  findShortestImportChain,
} from './graph/boundary-validator.js';
export {
  validateClientSourceEnv,
  validateGraphEnvAccess,
  buildPublicEnvDefines,
} from './env/env-validator.js';
export {
  isPathContained,
  normalizePath,
  formatJson,
  promoteBuildArtifacts,
  cleanupTempArtifacts,
} from './output/artifact-writer.js';
export { generateProductionEntrySource } from './output/production-entry.js';
export {
  runRouteStage,
  analyzePageRenderMode,
  getRouteOutputRelativePath,
  type RouteEntryInfo,
  type RouteStageResult,
} from './pipeline/stage-routes.js';
export { runServerGraphStage, type ServerGraphResult } from './pipeline/stage-server-graph.js';
export { runClientGraphStage, type ClientGraphResult } from './pipeline/stage-client-graph.js';
export {
  runStaticGenerationStage,
  createBuildComponentLoader,
  type StaticStageResult,
} from './pipeline/stage-static.js';
export { runManifestStage, type ManifestStageResult } from './pipeline/stage-manifests.js';
export { runValidationStage, type ValidationStageResult } from './pipeline/stage-validate.js';

export type { BuildConfig, BuildContext } from './build-config.js';
export type { BuildResult } from './build-result.js';
export type { BundlerAdapter, BundleOptions, BundleOutput } from './bundler/adapter.js';
export type {
  ModuleClassification,
  ModuleNode,
  ModuleImport,
  ModuleGraph,
} from './graph/graph-types.js';
export {
  evaluateStaticRoute,
  isUnsafeSegmentValue,
  type EvaluatedStaticPath,
  type EvaluateStaticRouteOptions,
  type EvaluateStaticRouteResult,
} from './static/params-evaluator.js';
export {
  deriveStaticOutputPath,
  writeStaticPage,
} from './static/output.js';
export {
  renderStaticRoute,
  renderStaticRoutesInBatch,
  type StaticRouteArtifact,
  type RenderStaticRouteOptions,
} from './static/static-renderer.js';
