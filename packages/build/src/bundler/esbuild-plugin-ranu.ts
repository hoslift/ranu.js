import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'esbuild';
import type { RanuDiagnostic } from '@ranu/diagnostics';
import { transformCssModule } from '../assets/css-modules.js';
import {
  isStaticAssetFile,
  emitStaticAsset,
  rewriteCssUrls,
} from '../assets/asset-emitter.js';

export interface RanuPluginOptions {
  platform: 'node' | 'browser';
  projectRoot: string;
  staticOutDir: string;
  tempOutDir: string;
  publicEnv?: Record<string, string>;
  onDiagnostic?: (diagnostic: RanuDiagnostic) => void;
}

const STATIC_ASSET_FILTER = /\.(png|jpe?g|svg|webp|gif|avif|ico|woff2?|ttf|otf|eot|mp4|webm|mp3|wav|ogg)$/i;

/**
 * esbuild plugin for Ranu.js framework conventions, security boundaries, CSS, and static assets.
 */
export function createRanuEsbuildPlugin(options: RanuPluginOptions): Plugin {
  const { platform, projectRoot, staticOutDir, tempOutDir } = options;

  return {
    name: 'ranu-framework-plugin',
    setup(build) {
      // 1. Virtual module for ranu/server-only
      build.onResolve({ filter: /^ranu\/server-only$/ }, args => {
        if (platform === 'browser') {
          return {
            errors: [
              {
                text: `RANU_BUILD_SERVER_ONLY_CLIENT: Module "${args.path}" is marked server-only and cannot be imported from client-reachable code.`,
                location: {
                  file: args.importer,
                  line: 1,
                  column: 1,
                  length: 0,
                  lineText: '',
                  namespace: 'file',
                  suggestion: 'Remove server-only import or move code to server graph',
                },
              },
            ],
          };
        }

        return {
          path: args.path,
          namespace: 'ranu-virtual-server-only',
        };
      });

      build.onLoad({ filter: /.*/, namespace: 'ranu-virtual-server-only' }, () => {
        return {
          contents: 'export {};',
          loader: 'js',
        };
      });

      // 2. Static Asset Imports (.png, .svg, .woff2, etc.)
      build.onLoad({ filter: STATIC_ASSET_FILTER }, args => {
        try {
          const emitted = emitStaticAsset(args.path, staticOutDir, projectRoot);
          return {
            contents: `export default ${JSON.stringify(emitted.publicUrl)};`,
            loader: 'js',
          };
        } catch (err: unknown) {
          return {
            errors: [
              {
                text: `Failed to process static asset "${args.path}": ${(err as Error).message ?? String(err)}`,
                location: {
                  file: args.path,
                  line: 1,
                  column: 1,
                  length: 0,
                  lineText: '',
                  namespace: 'file',
                },
              },
            ],
          };
        }
      });

      // 3. CSS Modules (*.module.css)
      build.onLoad({ filter: /\.module\.css$/ }, args => {
        try {
          const rawContent = fs.readFileSync(args.path, 'utf8');
          const transformed = transformCssModule(args.path, rawContent, projectRoot);
          const rewritten = rewriteCssUrls(transformed.code, args.path, staticOutDir, projectRoot);

          if (platform === 'node') {
            // Server graph: Export class mapping object only, do not execute CSS
            return {
              contents: `export default ${JSON.stringify(transformed.mapping)};`,
              loader: 'js',
            };
          }

          // Browser graph: Emit transformed scoped CSS file and export class mapping
          const relPath = path.relative(projectRoot, args.path).replace(/\\/g, '/').replace(/[^a-zA-Z0-9_-]/g, '_');
          const tempCssDir = path.join(tempOutDir, 'css_modules');
          if (!fs.existsSync(tempCssDir)) {
            fs.mkdirSync(tempCssDir, { recursive: true });
          }
          const tempCssFile = path.join(tempCssDir, `${relPath}.css`);
          fs.writeFileSync(tempCssFile, rewritten.code, 'utf8');

          const normalizedImport = tempCssFile.replace(/\\/g, '/');
          return {
            contents: `import ${JSON.stringify(normalizedImport)};\nexport default ${JSON.stringify(transformed.mapping)};`,
            loader: 'js',
            resolveDir: path.dirname(args.path),
          };
        } catch (err: unknown) {
          return {
            errors: [
              {
                text: `Failed to compile CSS Module "${args.path}": ${(err as Error).message ?? String(err)}`,
                location: {
                  file: args.path,
                  line: 1,
                  column: 1,
                  length: 0,
                  lineText: '',
                  namespace: 'file',
                },
              },
            ],
          };
        }
      });

      // 4. Global CSS (*.css excluding *.module.css)
      build.onLoad({ filter: /\.css$/ }, args => {
        if (args.path.endsWith('.module.css')) {
          return null;
        }

        try {
          if (platform === 'node') {
            // Server graph: No-op export for global CSS
            return {
              contents: 'export default {};',
              loader: 'js',
            };
          }

          const rawContent = fs.readFileSync(args.path, 'utf8');
          // If it's already a generated scoped temp CSS file, load directly
          if (args.path.includes('css_modules')) {
            return {
              contents: rawContent,
              loader: 'css',
            };
          }

          // Browser graph: Rewrite url(...) in global CSS and pass to CSS loader
          const rewritten = rewriteCssUrls(rawContent, args.path, staticOutDir, projectRoot);

          return {
            contents: rewritten.code,
            loader: 'css',
          };
        } catch (err: unknown) {
          return {
            errors: [
              {
                text: `Failed to process CSS file "${args.path}": ${(err as Error).message ?? String(err)}`,
                location: {
                  file: args.path,
                  line: 1,
                  column: 1,
                  length: 0,
                  lineText: '',
                  namespace: 'file',
                },
              },
            ],
          };
        }
      });
    },
  };
}
