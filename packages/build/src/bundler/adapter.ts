import type { Plugin as EsbuildPlugin } from 'esbuild';

/** Options passed to the bundler abstraction */
export interface BundleOptions {
  entryPoints: Record<string, string> | string[];
  outdir: string;
  platform: 'node' | 'browser';
  format: 'esm';
  target?: string | string[] | undefined;
  splitting?: boolean | undefined;
  sourcemap?: boolean | 'inline' | 'external' | 'both' | undefined;
  minify?: boolean | undefined;
  external?: string[] | undefined;
  define?: Record<string, string> | undefined;
  plugins?: EsbuildPlugin[] | undefined;
  jsx?: 'automatic' | 'transform' | undefined;
  jsxImportSource?: string | undefined;
  treeShaking?: boolean | undefined;
  conditions?: string[] | undefined;
  mainFields?: string[] | undefined;
  assetNames?: string | undefined;
  chunkNames?: string | undefined;
  entryNames?: string | undefined;
  outExtension?: Record<string, string> | undefined;
  alias?: Record<string, string> | undefined;
  nodePaths?: string[] | undefined;
}

/** Output result from bundler execution */
export interface BundleOutput {
  success: boolean;
  outputFiles?: Array<{ path: string; contents: Uint8Array; text: string }> | undefined;
  metafile?: any;
  errors: any[];
  warnings: any[];
}

/** Abstraction layer separating framework orchestration from specific bundler */
export interface BundlerAdapter {
  bundle(options: BundleOptions): Promise<BundleOutput>;
}
