import * as esbuild from 'esbuild';
import type { BundlerAdapter, BundleOptions, BundleOutput } from './adapter.js';

export class EsbuildAdapter implements BundlerAdapter {
  async bundle(options: BundleOptions): Promise<BundleOutput> {
    const isNode = options.platform === 'node';

    // Default node externals
    const external = [...(options.external ?? [])];
    if (isNode) {
      if (!external.includes('node:*')) {
        external.push('node:*');
      }
    }

    const buildOptions: esbuild.BuildOptions = {
      entryPoints: options.entryPoints,
      outdir: options.outdir,
      platform: options.platform,
      format: options.format,
      bundle: true,
      splitting: options.splitting ?? (options.format === 'esm'),
      sourcemap: options.sourcemap ?? (isNode ? 'external' : false),
      minify: options.minify ?? (!isNode),
      target: options.target ?? (isNode ? 'node22' : ['chrome90', 'safari14', 'firefox90']),
      jsx: options.jsx ?? 'automatic',
      jsxImportSource: options.jsxImportSource ?? 'react',
      treeShaking: options.treeShaking ?? true,
      external,
      define: options.define ?? {},
      plugins: options.plugins ?? [],
      metafile: true,
      write: true,
      conditions: options.conditions ?? (isNode ? ['node', 'import', 'default'] : ['browser', 'import', 'default']),
      mainFields: options.mainFields ?? (isNode ? ['module', 'main'] : ['browser', 'module', 'main']),
      assetNames: options.assetNames ?? 'assets/[name]-[hash]',
      chunkNames: options.chunkNames ?? 'chunks/[name]-[hash]',
      entryNames: options.entryNames ?? '[name]',
    };

    try {
      const result = await esbuild.build(buildOptions);
      return {
        success: result.errors.length === 0,
        metafile: result.metafile,
        errors: result.errors,
        warnings: result.warnings,
      };
    } catch (err: any) {
      return {
        success: false,
        errors: err.errors ?? [{ text: err.message ?? String(err) }],
        warnings: err.warnings ?? [],
      };
    }
  }
}
