import type {
  RanuDeploymentAdapter,
  DeploymentCapabilities,
  DeploymentAdapterContext,
  DeploymentResult,
} from '@ranu/core';

export const adapterName = 'custom-platform';
export const ADAPTER_API_VERSION = 1;

export const capabilities: DeploymentCapabilities = {
  runtime: 'node',
  ssr: true,
  apiRoutes: true,
  middleware: true,
  streaming: true,
  staticFiles: true,
  runtimeEnvironment: true,
  writableFilesystem: 'temporary',
  longLivedProcess: false,
  supportsWaitUntil: false,
};

export interface CustomAdapterOptions {
  outputDir?: string | undefined;
}

export function createAdapter(options: CustomAdapterOptions = {}): RanuDeploymentAdapter {
  return {
    name: adapterName,
    apiVersion: ADAPTER_API_VERSION,
    capabilities,
    async adapt(context: DeploymentAdapterContext): Promise<DeploymentResult> {
      await Promise.resolve();
      const outputDirectory = options.outputDir ?? context.outputDir ?? 'dist';
      return {
        success: true,
        target: adapterName,
        outputDirectory,
        files: ['index.js'],
      };
    },
  };
}

export default createAdapter;
