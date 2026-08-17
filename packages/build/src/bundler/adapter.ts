import type { Plugin as EsbuildPlugin } from 'esbuild';

/** Options passed to the bundler abstraction */
export interface BundleOptions {
  entryPoints: Record<string, string> | string[];
  outdir: string;
  platform: 'node' | 'browser';
  format: 'esm';
  target?: string | string[];
  splitting?: boolean;
  sourcemap?: boolean | 'inline' | 'external' | 'both';
  minify?: boolean;
  external?: string[];
  define?: Record<string, string>;
  plugins?: EsbuildPlugin[];
  jsx?: 'automatic' | 'transform';
  jsxImportSource?: string;
  treeShaking?: boolean;
  conditions?: string[];
  mainFields?: string[];
  assetNames?: string;
  chunkNames?: string;
  entryNames?: string;
}

/** Output result from bundler execution */
export interface BundleOutput {
  success: boolean;
  outputFiles?: Array<{ path: string; contents: Uint8Array; text: string }>;
  metafile?: any;
  errors: any[];
  warnings: any[];
}

/** Abstraction layer separating framework orchestration from specific bundler */
export interface BundlerAdapter {
  bundle(options: BundleOptions): Promise<BundleOutput>;
}
