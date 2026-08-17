import type { Plugin } from 'esbuild';
import type { RanuDiagnostic } from '@ranu/diagnostics';

export interface RanuPluginOptions {
  platform: 'node' | 'browser';
  publicEnv?: Record<string, string>;
  onDiagnostic?: (diagnostic: RanuDiagnostic) => void;
}

/**
 * esbuild plugin for Ranu.js framework conventions and boundaries.
 */
export function createRanuEsbuildPlugin(options: RanuPluginOptions): Plugin {
  return {
    name: 'ranu-framework-plugin',
    setup(build) {
      // 1. Virtual module for ranu/server-only
      build.onResolve({ filter: /^ranu\/server-only$/ }, args => {
        if (options.platform === 'browser') {
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
    },
  };
}
