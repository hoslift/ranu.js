import { createRequire } from 'node:module';
import path from 'node:path';
import * as esbuild from 'esbuild';
import type { BundlerAdapter, BundleOptions, BundleOutput } from './adapter.js';

export class EsbuildAdapter implements BundlerAdapter {
  async bundle(options: BundleOptions): Promise<BundleOutput> {
    const isNode = options.platform === 'node';
    const req = createRequire(import.meta.url);

    // Default node externals
    const external = [...(options.external ?? [])];
    if (isNode) {
      if (!external.includes('node:*')) {
        external.push('node:*');
      }
    }

    let alias: Record<string, string> = { ...(options.alias ?? {}) };
    const nodePaths: string[] = [];
    if (isNode) {
      try {
        const reactPath = req.resolve('react');
        alias = {
          'react': reactPath,
          'react/jsx-runtime': req.resolve('react/jsx-runtime'),
          'react/jsx-dev-runtime': req.resolve('react/jsx-dev-runtime'),
          'react-dom': req.resolve('react-dom'),
          'react-dom/server.edge': req.resolve('react-dom/server.edge'),
          ...alias,
        };
        nodePaths.push(path.dirname(reactPath), path.resolve(process.cwd(), 'node_modules'));
      } catch {
        // Fall back if cannot resolve directly
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
      target: options.target ?? (isNode ? 'node22' : 'es2022'),
      jsx: options.jsx ?? 'automatic',
      jsxImportSource: options.jsxImportSource ?? 'react',
      treeShaking: options.treeShaking ?? true,
      external,
      alias,
      nodePaths,
      define: options.define ?? {},
      plugins: options.plugins ?? [],
      metafile: true,
      write: true,
      conditions: options.conditions ?? (isNode ? ['node', 'import', 'default'] : ['browser', 'import', 'default']),
      mainFields: options.mainFields ?? (isNode ? ['module', 'main'] : ['browser', 'module', 'main']),
      assetNames: options.assetNames ?? 'assets/[name]-[hash]',
      chunkNames: options.chunkNames ?? 'chunks/[name]-[hash]',
      entryNames: options.entryNames ?? '[name]',
      ...(options.outExtension ? { outExtension: options.outExtension } : {}),
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
