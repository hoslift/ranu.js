import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Plugin } from 'esbuild';
import type {
  RanuDeploymentAdapter,
  DeploymentCapabilities,
  DeploymentAdapterContext,
  DeploymentResult,
} from '@ranu/core';
import type {
  BuildDescriptor,
  RouteManifest,
  ServerManifest,
  StaticManifest,
  ClientManifest,
} from '@ranu/manifests';

export const adapterName = 'cloudflare';
export const ADAPTER_API_VERSION = 1;

/**
 * Declared capabilities for Cloudflare workerd isolate deployment target.
 */
export const CLOUDFLARE_CAPABILITIES: DeploymentCapabilities = {
  runtime: 'workerd',
  ssr: true,
  apiRoutes: true,
  middleware: false,
  streaming: true,
  staticFiles: true,
  runtimeEnvironment: true,
  writableFilesystem: 'none',
  longLivedProcess: false,
  supportsWaitUntil: true,
};

export interface CloudflareAdapterOptions {
  /** Output directory for Cloudflare Pages / Workers artifacts (default: '.cloudflare') */
  outputDir?: string | undefined;
  /** Cloudflare compatibility date (default: '2026-10-01') */
  compatibilityDate?: string | undefined;
  /** Cloudflare compatibility flags (default: ['nodejs_compat']) */
  compatibilityFlags?: string[] | undefined;
  /** Cloudflare Pages routing rule configuration (_routes.json generation) */
  routesJson?: boolean | { include?: string[]; exclude?: string[] } | undefined;
  /** Clean output directory before generating artifacts (default: true) */
  clean?: boolean | undefined;
  /** Minify generated worker script bundle (default: false) */
  minify?: boolean | undefined;
  /** External module specifiers excluded from worker bundling */
  external?: string[] | undefined;
}

/**
 * Checks whether childPath is strictly contained inside parentDir (path traversal prevention).
 */
export function isPathContained(childPath: string, parentDir: string): boolean {
  const rel = path.relative(path.resolve(parentDir), path.resolve(childPath));
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Asserts that the destination or any parent directory is not a symbolic link.
 */
export function assertNoDestinationSymlink(destination: string, authorizedRoot: string): void {
  let current = path.resolve(destination);
  const root = path.resolve(authorizedRoot);

  while (isPathContained(current, root)) {
    if (fs.lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink()) {
      throw new Error(`Refusing to copy through symbolic link "${current}".`);
    }
    if (current === root) break;
    current = path.dirname(current);
  }
}

/**
 * Recursively copies a directory while safely skipping forbidden/sensitive files.
 */
export function copyDirectorySafe(
  srcDir: string,
  destDir: string,
  authorizedRoot: string,
  forbiddenNames: readonly string[] = [],
): string[] {
  const copiedFiles: string[] = [];
  if (!fs.existsSync(srcDir)) return copiedFiles;

  assertNoDestinationSymlink(destDir, authorizedRoot);

  fs.mkdirSync(destDir, { recursive: true });

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    const isForbidden = forbiddenNames.some((forbidden) => {
      if (forbidden.startsWith('.')) {
        return entry.name.startsWith(forbidden) || entry.name.endsWith(forbidden);
      }
      return entry.name.startsWith(forbidden) || entry.name === forbidden;
    });

    if (isForbidden) {
      continue;
    }

    if (!isPathContained(destPath, authorizedRoot)) {
      throw new Error(`Path traversal attempt detected when copying to "${destPath}".`);
    }

    if (entry.isDirectory()) {
      const nested = copyDirectorySafe(srcPath, destPath, authorizedRoot, forbiddenNames);
      copiedFiles.push(...nested);
    } else if (entry.isFile()) {
      assertNoDestinationSymlink(destPath, authorizedRoot);
      fs.copyFileSync(srcPath, destPath);
      copiedFiles.push(destPath);
    }
  }

  return copiedFiles;
}

/**
 * Creates an esbuild plugin that intercepts unsupported Node built-in modules
 * and resolves them to a safe runtime proxy stub.
 */
export function createWorkerdShimPlugin(): Plugin {
  return {
    name: 'workerd-shim-plugin',
    setup(build) {
      const unsupportedPattern =
        /^(?:node:)?(fs(?:\/promises)?|child_process|cluster|dgram|dns(?:\/promises)?|net|tls|v8|http|https|http2|worker_threads)(?:\/.*)?$/;

      build.onResolve({ filter: unsupportedPattern }, (args) => {
        return {
          path: args.path,
          namespace: 'workerd-unsupported-shim',
        };
      });

      build.onLoad({ filter: /.*/, namespace: 'workerd-unsupported-shim' }, (args) => {
        const moduleName = args.path;
        const contents = `
const createUnsupportedStub = (modName) => {
  const handler = {
    get(_target, prop) {
      if (prop === '__esModule') return true;
      if (prop === 'default') return stubProxy;
      return (...args) => {
        throw new Error('Module "' + modName + '" is not supported in the Cloudflare Workers workerd runtime.');
      };
    },
    apply() {
      throw new Error('Module "' + modName + '" is not supported in the Cloudflare Workers workerd runtime.');
    }
  };
  const stubProxy = new Proxy(() => {}, handler);
  return stubProxy;
};

const stub = createUnsupportedStub('${moduleName}');
export default stub;
export const readFile = stub;
export const readFileSync = stub;
export const writeFile = stub;
export const writeFileSync = stub;
export const existsSync = stub;
export const mkdirSync = stub;
export const statSync = stub;
export const lstatSync = stub;
export const readdirSync = stub;
export const rmSync = stub;
export const unlinkSync = stub;
export const createReadStream = stub;
export const createWriteStream = stub;
export const promises = stub;
export const exec = stub;
export const execSync = stub;
export const spawn = stub;
export const spawnSync = stub;
export const fork = stub;
export const createServer = stub;
export const connect = stub;
export const Socket = stub;
export const Server = stub;
export const request = stub;
export const get = stub;
export const lookup = stub;
`;
        return {
          contents,
          loader: 'js',
        };
      });
    },
  };
}

/**
 * Creates a Cloudflare Pages / Workers deployment adapter instance for Ranu.js.
 */
export function createCloudflareAdapter(options: CloudflareAdapterOptions = {}): RanuDeploymentAdapter {
  return {
    name: adapterName,
    apiVersion: ADAPTER_API_VERSION,
    capabilities: CLOUDFLARE_CAPABILITIES,

    async adapt(context: DeploymentAdapterContext): Promise<DeploymentResult> {
      await Promise.resolve();

      const projectRoot = path.resolve(context.projectRoot ?? process.cwd());
      const buildDir = path.resolve(context.buildDir ?? path.join(projectRoot, '.ranu', 'build'));
      const outputDir = path.resolve(
        options.outputDir ?? context.outputDir ?? path.join(projectRoot, '.cloudflare'),
      );

      // Validate outputDir safety
      const relToRoot = path.relative(outputDir, projectRoot);
      const relToBuild = path.relative(outputDir, buildDir);
      if (outputDir === projectRoot || outputDir === buildDir || relToRoot === '' || relToBuild === '') {
        throw new Error(
          `Invalid output directory "${outputDir}": output directory cannot be equal to project root or build directory.`,
        );
      }
      if (!relToRoot.startsWith('..') && !path.isAbsolute(relToRoot)) {
        throw new Error(
          `Invalid output directory "${outputDir}": output directory cannot contain the project root.`,
        );
      }
      if (!relToBuild.startsWith('..') && !path.isAbsolute(relToBuild)) {
        throw new Error(
          `Invalid output directory "${outputDir}": output directory cannot contain the build directory.`,
        );
      }

      // 1. Validate production build exists
      const buildDescriptorPath = path.join(buildDir, 'build.json');
      if (!fs.existsSync(buildDescriptorPath)) {
        throw new Error(
          `Cannot adapt for Cloudflare: No production build found at "${buildDir}". Run "ranu build" first.`,
        );
      }

      const buildDescriptor: BuildDescriptor = JSON.parse(
        fs.readFileSync(buildDescriptorPath, 'utf8'),
      );

      // 2. Validate capability compatibility
      const buildRuntime = String(buildDescriptor.runtime);
      if (buildRuntime !== 'node' && buildRuntime !== 'workerd') {
        throw new Error(
          `Cloudflare adapter requires build runtime target "node" or "workerd", but received "${buildRuntime}".`,
        );
      }

      // 3. Load manifests with containment validation
      const manifestChecks = [
        ['routes', buildDescriptor.manifests.routes],
        ['server', buildDescriptor.manifests.server],
        ['static', buildDescriptor.manifests.static],
        ['client', buildDescriptor.manifests.client],
      ] as const;

      for (const [name, relPath] of manifestChecks) {
        if (!relPath) continue;
        const resolvedPath = path.resolve(buildDir, relPath);
        if (!isPathContained(resolvedPath, buildDir)) {
          throw new Error(`Manifest path for "${name}" escapes build directory: "${relPath}".`);
        }
      }

      const routesManifestPath = path.resolve(buildDir, buildDescriptor.manifests.routes);
      const serverManifestPath = path.resolve(buildDir, buildDescriptor.manifests.server);
      const staticManifestPath = path.resolve(buildDir, buildDescriptor.manifests.static);
      const clientManifestPath = path.resolve(buildDir, buildDescriptor.manifests.client);

      const routeManifest: RouteManifest = JSON.parse(fs.readFileSync(routesManifestPath, 'utf8'));
      const serverManifest: ServerManifest = JSON.parse(fs.readFileSync(serverManifestPath, 'utf8'));
      const staticManifest: StaticManifest = fs.existsSync(staticManifestPath)
        ? JSON.parse(fs.readFileSync(staticManifestPath, 'utf8'))
        : { schemaVersion: 1, buildId: buildDescriptor.buildId, routes: [] };
      const clientManifest: ClientManifest = fs.existsSync(clientManifestPath)
        ? JSON.parse(fs.readFileSync(clientManifestPath, 'utf8'))
        : { schemaVersion: 1, buildId: buildDescriptor.buildId, assets: {} };

      // 4. Prepare clean output directory
      if (options.clean !== false && fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true, force: true });
      }
      fs.mkdirSync(outputDir, { recursive: true });

      const emittedFiles: string[] = [];

      // 5. Copy static files to output directory
      // Security guard: Never copy secrets, environment files, source maps, or server chunks
      const forbiddenStaticPatterns = ['.env', '.git', '.DS_Store', '.map', 'server'];

      // 5a. Copy static assets from .ranu/build/static/assets -> outputDir/_ranu/assets and outputDir/assets
      const buildStaticAssetsDir = path.join(buildDir, 'static', 'assets');
      if (fs.existsSync(buildStaticAssetsDir)) {
        const ranuAssetsDest = path.join(outputDir, '_ranu', 'assets');
        const copied = copyDirectorySafe(
          buildStaticAssetsDir,
          ranuAssetsDest,
          outputDir,
          forbiddenStaticPatterns,
        );
        emittedFiles.push(...copied);

        const copiedRootAssets = copyDirectorySafe(
          buildStaticAssetsDir,
          outputDir,
          outputDir,
          forbiddenStaticPatterns,
        );
        emittedFiles.push(...copiedRootAssets);
      }

      // 5b. Copy pre-rendered static HTML pages from .ranu/build/static/pages -> outputDir
      const buildStaticPagesDir = path.join(buildDir, 'static', 'pages');
      if (fs.existsSync(buildStaticPagesDir)) {
        const copiedPages = copyDirectorySafe(
          buildStaticPagesDir,
          outputDir,
          outputDir,
          forbiddenStaticPatterns,
        );
        emittedFiles.push(...copiedPages);
      }

      // 5c. Copy public/ directory files if present
      const publicDir = path.join(projectRoot, 'public');
      if (fs.existsSync(publicDir)) {
        const copiedPublic = copyDirectorySafe(
          publicDir,
          outputDir,
          outputDir,
          forbiddenStaticPatterns,
        );
        emittedFiles.push(...copiedPublic);
      }

      // 6. Emit _headers file for cache control on immutable assets
      const headersContent = `/_ranu/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n`;
      const headersPath = path.join(outputDir, '_headers');
      fs.writeFileSync(headersPath, headersContent, 'utf8');
      emittedFiles.push(headersPath);

      // 7. Emit _routes.json for Cloudflare Pages (excludes static assets, bounded to <100 rules)
      if (options.routesJson !== false) {
        const customConfig = typeof options.routesJson === 'object' ? options.routesJson : {};
        let includeRules = customConfig.include ? [...customConfig.include] : ['/*'];
        if (includeRules.length > 99) {
          includeRules = includeRules.slice(0, 99);
        }
        const excludeSet = new Set<string>();

        // Always exclude immutable framework assets
        excludeSet.add('/_ranu/assets/*');

        // Exclude pre-rendered static pages
        for (const st of staticManifest.routes) {
          if (st.pathname !== '/') {
            excludeSet.add(st.pathname);
            excludeSet.add(`${st.pathname}.html`);
          }
        }

        // Exclude public files at root
        if (fs.existsSync(publicDir)) {
          try {
            const publicEntries = fs.readdirSync(publicDir);
            for (const pName of publicEntries) {
              if (
                !forbiddenStaticPatterns.some((pattern) =>
                  pattern.startsWith('.')
                    ? pName.startsWith(pattern) || pName.endsWith(pattern)
                    : pName.startsWith(pattern) || pName === pattern,
                )
              ) {
                excludeSet.add(`/${pName}`);
              }
            }
          } catch {
            // ignore
          }
        }

        // Merge custom excludes
        if (customConfig.exclude) {
          for (const exc of customConfig.exclude) {
            excludeSet.add(exc);
          }
        }

        let excludeRules = Array.from(excludeSet);

        // Enforce Cloudflare Pages limit of 100 total rules (<100 rules, maximum 99 total rules)
        if (includeRules.length + excludeRules.length >= 100) {
          // Coalesce rules to top-level wildcards to guarantee < 100 rules
          const wildcards = new Set<string>();
          wildcards.add('/_ranu/assets/*');
          for (const rule of excludeRules) {
            const parts = rule.split('/').filter(Boolean);
            if (parts.length > 1) {
              wildcards.add(`/${parts[0]}/*`);
            } else {
              wildcards.add(rule);
            }
          }
          const maxExcludes = Math.max(0, 99 - includeRules.length);
          excludeRules = Array.from(wildcards).slice(0, Math.min(maxExcludes, 95));
        }

        if (includeRules.length + excludeRules.length >= 100) {
          excludeRules = excludeRules.slice(0, Math.max(0, 99 - includeRules.length));
        }

        const routesJsonConfig = {
          version: 1,
          include: includeRules,
          exclude: excludeRules,
        };

        const routesJsonPath = path.join(outputDir, '_routes.json');
        fs.writeFileSync(routesJsonPath, JSON.stringify(routesJsonConfig, null, 2), 'utf8');
        emittedFiles.push(routesJsonPath);
      }

      // 8. Generate and bundle self-contained _worker.js
      const importStatements: string[] = [];
      const serverModulesEntries: string[] = [];
      let routeIndex = 0;

      for (const sRoute of serverManifest.routes) {
        const fullServerPath = path.resolve(buildDir, sRoute.serverEntry);
        if (!isPathContained(fullServerPath, buildDir)) {
          throw new Error(`Server entry "${sRoute.serverEntry}" escapes build directory.`);
        }
        if (fs.existsSync(fullServerPath)) {
          const varName = `route_${routeIndex++}`;
          const normalizedPath = fullServerPath.replace(/\\/g, '/');
          importStatements.push(`import * as ${varName} from ${JSON.stringify(normalizedPath)};`);
          serverModulesEntries.push(`  ${JSON.stringify(sRoute.routeId)}: ${varName},`);
        }
      }

      const serverLayoutsDir = path.join(buildDir, 'server', 'layouts');
      if (fs.existsSync(serverLayoutsDir)) {
        const layoutFiles = fs.readdirSync(serverLayoutsDir, { withFileTypes: true });
        for (const file of layoutFiles) {
          if (file.isFile() && (file.name.endsWith('.mjs') || file.name.endsWith('.js'))) {
            const fullPath = path.join(serverLayoutsDir, file.name);
            const varName = `layout_${routeIndex++}`;
            const normalizedPath = fullPath.replace(/\\/g, '/');
            importStatements.push(`import * as ${varName} from ${JSON.stringify(normalizedPath)};`);
            serverModulesEntries.push(`  ${JSON.stringify('layout:' + file.name)}: ${varName},`);
          }
        }
      }

      const serverNotFoundDir = path.join(buildDir, 'server', 'not-found');
      if (fs.existsSync(serverNotFoundDir)) {
        const notFoundFiles = fs.readdirSync(serverNotFoundDir, { withFileTypes: true });
        for (const file of notFoundFiles) {
          if (file.isFile() && (file.name.endsWith('.mjs') || file.name.endsWith('.js'))) {
            const fullPath = path.join(serverNotFoundDir, file.name);
            const varName = `notfound_${routeIndex++}`;
            const normalizedPath = fullPath.replace(/\\/g, '/');
            importStatements.push(`import * as ${varName} from ${JSON.stringify(normalizedPath)};`);
            serverModulesEntries.push(`  ${JSON.stringify('notfound:' + file.name)}: ${varName},`);
          }
        }
      }

      let middlewareImport = '';
      let middlewareInstantiate = '';
      const middlewarePath = path.join(buildDir, 'server', 'middleware.mjs');
      if (fs.existsSync(middlewarePath)) {
        const normalizedMwPath = middlewarePath.replace(/\\/g, '/');
        middlewareImport = `import * as middlewareModule from ${JSON.stringify(normalizedMwPath)};`;
        middlewareInstantiate = `  middleware: createRuntimeMiddleware(middlewareModule),`;
      }

      const staticPagesEntries: string[] = [];
      for (const st of staticManifest.routes) {
        const fullHtmlPath = path.resolve(buildDir, st.file);
        let content = '';
        if (isPathContained(fullHtmlPath, buildDir) && fs.existsSync(fullHtmlPath)) {
          content = fs.readFileSync(fullHtmlPath, 'utf8');
        }
        staticPagesEntries.push(`  ${JSON.stringify(st.pathname)}: {
    content: ${JSON.stringify(content)},
    status: ${st.status ?? 200},
    routeId: ${JSON.stringify(st.routeId)},
    file: ${JSON.stringify(st.file)},
  },`);
      }

      const workerSource = `// Cloudflare Pages / Workers Entrypoint for Ranu.js
// Generated by @ranujs/adapter-cloudflare (Build ID: ${buildDescriptor.buildId})

import { AsyncLocalStorage } from 'node:async_hooks';
import { RanuServerRuntime, registerRequestContextStore, createRuntimeMiddleware } from '@ranu/runtime';
import { ReactRenderer } from '@ranu/react';
import { parseSegment } from '@ranu/router';

${importStatements.join('\n')}
${middlewareImport}

const serverModules = {
${serverModulesEntries.join('\n')}
};

const staticPages = {
${staticPagesEntries.join('\n')}
};

const routeManifest = ${JSON.stringify(routeManifest)};
const clientManifest = ${JSON.stringify(clientManifest)};
const buildDescriptor = ${JSON.stringify(buildDescriptor)};

function compileRoutePattern(pattern) {
  return {
    segments: pattern
      .split('/')
      .filter(Boolean)
      .map((rawSegment) => {
        const segment = parseSegment(rawSegment);
        switch (segment.type) {
          case 'static':
            return { kind: 'static', value: rawSegment };
          case 'dynamic':
            return { kind: 'dynamic', param: segment.param };
          case 'catch-all':
            return { kind: 'catch-all', param: segment.param };
          case 'optional-catch-all':
            return { kind: 'optional-catch-all', param: segment.param };
          default:
            throw new Error('Invalid deployable route segment "' + rawSegment + '" in "' + pattern + '".');
        }
      }),
  };
}

function compileManifestRoutes(manifest) {
  return manifest.routes.map((route) => {
    const common = {
      routeId: route.id,
      pattern: compileRoutePattern(route.pattern),
      pathnameTemplate: route.pattern,
      params: route.params ?? [],
    };
    if (route.kind === 'api') {
      return {
        ...common,
        kind: 'api',
        methods: route.methods ?? [],
        layouts: [],
        loading: undefined,
        errors: [],
        notFound: undefined,
      };
    }
    return {
      ...common,
      kind: 'page',
      layouts: route.layouts ?? [],
      loading: route.loading,
      errors: route.errors ?? [],
      notFound: route.notFound,
      renderMode: route.renderMode,
    };
  });
}

const fetchScopeStorage = new AsyncLocalStorage();

class CloudflareRequestContextStore {
  constructor() {
    this.contextStorage = new AsyncLocalStorage();
  }

  run(context, callback) {
    const scope = fetchScopeStorage.getStore();
    if (scope) {
      if (scope.env !== undefined) {
        context.locals.set('env', scope.env);
      }
      if (scope.request && scope.request.cf !== undefined) {
        context.locals.set('cf', scope.request.cf);
      }
      if (scope.ctx !== undefined) {
        context.locals.set('context', scope.ctx);
        context.locals.set('ctx', scope.ctx);
      }

      const backgroundPromises = [];
      context.waitUntilPromises = backgroundPromises;
      context.waitUntil = function (promise) {
        if (!promise || typeof promise.then !== 'function') {
          throw new TypeError('waitUntil() requires a valid Promise instance as its argument');
        }
        backgroundPromises.push(promise);
        if (scope.ctx && typeof scope.ctx.waitUntil === 'function') {
          scope.ctx.waitUntil(promise);
        }
      };
      context.locals.set('waitUntil', context.waitUntil);
    }
    return this.contextStorage.run(context, callback);
  }

  get() {
    return this.contextStorage.getStore();
  }
}

const componentModuleLoader = {
  async loadPage(entryKey) {
    const mod = serverModules[entryKey];
    if (!mod) {
      throw new Error('No server entry registered for route "' + entryKey + '".');
    }
    return mod;
  },
  async loadLayout(componentPath) {
    const key = 'layout:' + componentPath;
    return serverModules[key] ?? undefined;
  },
  async loadLoading(componentPath) {
    const key = 'loading:' + componentPath;
    return serverModules[key] ?? undefined;
  },
  async loadError(componentPath) {
    const key = 'error:' + componentPath;
    return serverModules[key] ?? undefined;
  },
  async loadNotFound(componentPath) {
    const key = 'notfound:' + componentPath;
    return serverModules[key] ?? undefined;
  },
};

const renderer = new ReactRenderer({
  loader: componentModuleLoader,
  mode: 'production',
  buildId: buildDescriptor.buildId,
  clientAssets: clientManifest.assets,
});

const apiDispatcher = {
  async dispatch(request, context, target) {
    const mod = serverModules[target.routeId];
    if (!mod || typeof mod !== 'object') {
      throw new Error('Route module for ' + target.routeId + ' did not export a valid module object.');
    }

    const method = (request.method ?? 'GET').toUpperCase();

    if (method === 'OPTIONS') {
      if (typeof mod.OPTIONS === 'function') {
        const res = await mod.OPTIONS(request, context);
        if (!(res instanceof Response)) {
          throw new Error('OPTIONS handler for ' + target.routeId + ' did not return a valid Web Response.');
        }
        return res;
      }
      const allowed = target.methods && target.methods.length > 0 ? target.methods.join(', ') : 'GET, HEAD, OPTIONS';
      return new Response(null, {
        status: 204,
        headers: { Allow: allowed },
      });
    }

    if (method === 'HEAD') {
      if (typeof mod.HEAD === 'function') {
        const res = await mod.HEAD(request, context);
        if (!(res instanceof Response)) {
          throw new Error('HEAD handler for ' + target.routeId + ' did not return a valid Web Response.');
        }
        return new Response(null, {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
        });
      }
      if (typeof mod.GET === 'function') {
        const res = await mod.GET(request, context);
        if (!(res instanceof Response)) {
          throw new Error('GET handler (implicit HEAD) for ' + target.routeId + ' did not return a valid Web Response.');
        }
        return new Response(null, {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
        });
      }
      throw new Error('Method HEAD is not supported by route module for ' + target.routeId + '.');
    }

    const handler = mod[method];
    if (typeof handler !== 'function') {
      throw new Error('Method ' + method + ' is not implemented by route module for ' + target.routeId + '.');
    }

    const res = await handler(request, context);
    if (!(res instanceof Response)) {
      throw new Error('Method handler ' + method + ' for ' + target.routeId + ' returned invalid value (' + typeof res + '); expected a Web standard Response object.');
    }
    return res;
  },
};

const staticDispatcher = {
  async dispatch(_req, _ctx, match) {
    const record = staticPages[match.pathname];
    if (!record) {
      return new Response('Not Found', { status: 404 });
    }
    return new Response(record.content, {
      status: record.status ?? 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=0, must-revalidate',
      },
    });
  },
};

const routeRecords = compileManifestRoutes(routeManifest);
const contextStore = new CloudflareRequestContextStore();

const runtime = new RanuServerRuntime({
  routeRecords,
  contextStore,
  apiDispatcher,
  staticDispatcher,
  renderer,
  staticManifest: {
    schemaVersion: 1,
    buildId: buildDescriptor.buildId,
    routes: Object.entries(staticPages).map(([pathname, p]) => ({
      pathname,
      routeId: p.routeId,
      file: p.file,
      status: p.status,
    })),
  },
${middlewareInstantiate}
  config: { mode: 'production' },
});

export default {
  async fetch(request, env = {}, ctx = {}) {
    try {
      const method = (request.method || 'GET').toUpperCase();
      if ((method === 'GET' || method === 'HEAD') && env && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
        try {
          const assetRes = await env.ASSETS.fetch(request.clone());
          if (assetRes && assetRes.status !== 404) {
            return assetRes;
          }
        } catch {
          // Fall through to SSR
        }
      }

      return await fetchScopeStorage.run({ request, env, ctx }, async () => {
        return await runtime.handle(request);
      });
    } catch (err) {
      console.error('[Cloudflare Worker Error]', err);
      return new Response('Internal Server Error', {
        status: 500,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  },
};
`;

      const sourceDir = path.dirname(fileURLToPath(import.meta.url));
      const workerOutPath = path.join(outputDir, '_worker.js');

      const workspaceRuntimeEntry = path.resolve(
        sourceDir,
        '../../../packages/runtime/src/index.ts',
      );
      const workspacePackageAliases: Record<string, string> = fs.existsSync(workspaceRuntimeEntry)
        ? {
            '@ranu/core': path.resolve(sourceDir, '../../../packages/core/src/index.ts'),
            '@ranu/diagnostics': path.resolve(
              sourceDir,
              '../../../packages/diagnostics/src/index.ts',
            ),
            '@ranu/manifests': path.resolve(sourceDir, '../../../packages/manifests/src/index.ts'),
            '@ranu/react': path.resolve(sourceDir, '../../../packages/react/src/index.ts'),
            '@ranu/router': path.resolve(sourceDir, '../../../packages/router/src/index.ts'),
            '@ranu/runtime': workspaceRuntimeEntry,
          }
        : {};

      await build({
        stdin: {
          contents: workerSource,
          loader: 'js',
          resolveDir: fs.existsSync(workspaceRuntimeEntry) ? sourceDir : projectRoot,
          sourcefile: '_worker.js',
        },
        outfile: workerOutPath,
        bundle: true,
        format: 'esm',
        target: 'es2022',
        platform: 'neutral',
        conditions: ['workerd', 'worker', 'browser', 'import'],
        plugins: [createWorkerdShimPlugin()],
        external: [
          'assert',
          'node:assert',
          'async_hooks',
          'node:async_hooks',
          'buffer',
          'node:buffer',
          'crypto',
          'node:crypto',
          'diagnostics_channel',
          'node:diagnostics_channel',
          'events',
          'node:events',
          'path',
          'node:path',
          'process',
          'node:process',
          'stream',
          'node:stream',
          'string_decoder',
          'node:string_decoder',
          'util',
          'node:util',
          'zlib',
          'node:zlib',
          'cloudflare:*',
          ...(options.external ?? []),
        ],
        alias: workspacePackageAliases,
        minify: options.minify ?? false,
        logLevel: 'silent',
      });

      emittedFiles.push(workerOutPath);

      // 9. Generate completion descriptor under .ranu/deploy/cloudflare
      const ranuDeployDir = path.join(projectRoot, '.ranu', 'deploy', 'cloudflare');
      fs.mkdirSync(ranuDeployDir, { recursive: true });

      const deployManifest = {
        schemaVersion: 1,
        adapter: 'cloudflare',
        adapterVersion: '1.0.0',
        buildId: buildDescriptor.buildId,
        target: 'cloudflare',
        outputDirectory: outputDir,
        routesCount: routeManifest.routes.length,
        serverRoutesCount: serverManifest.routes.length,
        staticRoutesCount: staticManifest.routes.length,
        timestamp: new Date().toISOString(),
      };

      const deployManifestPath = path.join(ranuDeployDir, 'deployment.json');
      fs.writeFileSync(deployManifestPath, JSON.stringify(deployManifest, null, 2), 'utf8');
      emittedFiles.push(deployManifestPath);

      return {
        success: true,
        target: 'cloudflare',
        outputDirectory: outputDir,
        files: emittedFiles,
      };
    },
  };
}

export const cloudflareAdapter = createCloudflareAdapter;
export default createCloudflareAdapter;
