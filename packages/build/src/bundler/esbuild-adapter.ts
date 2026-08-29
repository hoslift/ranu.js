import * as esbuild from 'esbuild';
import type { BundlerAdapter, BundleOptions, BundleOutput } from './adapter.js';

const aliasResolutionMarker = Symbol('ranu-plugin-alias-resolution');

function rewriteAlias(
  specifier: string,
  alias: NonNullable<BundleOptions['pluginAliases']>[number],
): string | undefined {
  if (typeof alias.find === 'string') {
    if (specifier !== alias.find && !specifier.startsWith(`${alias.find}/`)) {
      return undefined;
    }
    return `${alias.replacement}${specifier.slice(alias.find.length)}`;
  }

  return specifier.search(alias.find) === -1
    ? undefined
    : specifier.replace(alias.find, alias.replacement);
}

function createPluginAliasResolver(options: BundleOptions): esbuild.Plugin | undefined {
  const aliases = options.pluginAliases ?? [];
  if (aliases.length === 0) {
    return undefined;
  }

  return {
    name: 'ranu-plugin-build-extensions',
    setup(build) {
      build.onResolve({ filter: /.*/ }, async (args) => {
        const pluginData = args.pluginData as Record<PropertyKey, unknown> | undefined;
        if (pluginData?.[aliasResolutionMarker]) {
          return undefined;
        }

        for (const alias of aliases) {
          const rewritten = rewriteAlias(args.path, alias);
          if (rewritten === undefined) {
            continue;
          }

          return build.resolve(rewritten, {
            importer: args.importer,
            kind: args.kind,
            namespace: args.namespace,
            resolveDir: options.absWorkingDir ?? process.cwd(),
            pluginData: {
              ...pluginData,
              [aliasResolutionMarker]: true,
            },
          });
        }

        return undefined;
      });
    },
  };
}
export class EsbuildAdapter implements BundlerAdapter {
  async bundle(options: BundleOptions): Promise<BundleOutput> {
    const isNode = options.platform === 'node';

    const aliasResolver = createPluginAliasResolver(options);

    // Default node externals
    const external = [...(options.external ?? [])];
    if (isNode) {
      if (!external.includes('node:*')) {
        external.push('node:*');
      }
    }

    const buildOptions: esbuild.BuildOptions = {
      entryPoints: options.entryPoints,
      ...(options.absWorkingDir ? { absWorkingDir: options.absWorkingDir } : {}),
      outdir: options.outdir,
      platform: options.platform,
      format: options.format,
      bundle: true,
      splitting: options.splitting ?? options.format === 'esm',
      sourcemap: options.sourcemap ?? (isNode ? 'external' : false),
      minify: options.minify ?? !isNode,
      target: options.target ?? (isNode ? 'node22' : 'es2022'),
      jsx: options.jsx ?? 'automatic',
      jsxImportSource: options.jsxImportSource ?? 'react',
      treeShaking: options.treeShaking ?? true,
      external,
      ...(options.alias ? { alias: options.alias } : {}),
      ...(options.nodePaths && options.nodePaths.length > 0
        ? { nodePaths: options.nodePaths }
        : {}),
      define: options.define ?? {},
      plugins: aliasResolver
        ? [aliasResolver, ...(options.plugins ?? [])]
        : (options.plugins ?? []),
      metafile: true,
      write: true,
      conditions:
        options.conditions ??
        (isNode ? ['node', 'import', 'default'] : ['browser', 'import', 'default']),
      mainFields:
        options.mainFields ?? (isNode ? ['module', 'main'] : ['browser', 'module', 'main']),
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
