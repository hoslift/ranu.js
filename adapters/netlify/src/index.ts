import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtinModules } from 'node:module';
import { build } from 'esbuild';
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

export const adapterName = 'netlify';
export const ADAPTER_API_VERSION = 1;

/**
 * Declared capabilities for Netlify deployment target.
 */
export const NETLIFY_CAPABILITIES: DeploymentCapabilities = {
  runtime: 'edge',
  ssr: true,
  apiRoutes: true,
  middleware: false,
  streaming: true,
  staticFiles: true,
  runtimeEnvironment: true,
  writableFilesystem: 'none',
  longLivedProcess: false,
  supportsWaitUntil: false,
};

/**
 * Standard Node.js built-in modules externalized from Netlify Functions bundle.
 */
export const NODE_BUILTIN_EXTERNALS: readonly string[] = [
  ...builtinModules,
  ...builtinModules.map((mod) => `node:${mod}`),
];

export interface HeaderRule {
  for: string;
  values: Record<string, string>;
}

export interface RedirectRule {
  from: string;
  to: string;
  status?: number | undefined;
  force?: boolean | undefined;
}

export interface NetlifyAdapterOptions {
  /** Output directory for Netlify deployment artifacts (default: '.netlify') */
  outputDir?: string | undefined;
  /** Directory for published static assets (default: path.join(outputDir, 'publish')) */
  publishDir?: string | undefined;
  /** Directory for generated Netlify Functions (default: path.join(outputDir, 'functions-internal')) */
  functionsDir?: string | undefined;
  /** Name of the generated SSR function (default: 'server') */
  functionName?: string | undefined;
  /** Target execution mode: 'serverless' or 'edge' (default: 'serverless') */
  target?: 'serverless' | 'edge' | undefined;
  /** Clean output directory before generating artifacts (default: true) */
  clean?: boolean | undefined;
  /** Minify generated function script bundle (default: false) */
  minify?: boolean | undefined;
  /** External module specifiers excluded from function bundling */
  external?: string[] | undefined;
  /** Custom headers to append to _headers and netlify.toml */
  customHeaders?: HeaderRule[] | undefined;
  /** Custom redirects to prepend to _redirects and netlify.toml */
  customRedirects?: RedirectRule[] | undefined;
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
 * Asserts that header names and values do not contain carriage returns or newlines (CRLF injection prevention).
 */
export function validateHeaderSafety(headers: Headers | Record<string, string>): void {
  if (headers instanceof Headers) {
    for (const [key, value] of headers.entries()) {
      if (/[\r\n]/.test(key) || /[\r\n]/.test(value)) {
        throw new Error(`CRLF injection detected in header "${key}": "${value}".`);
      }
    }
  } else if (typeof headers === 'object' && headers !== null) {
    for (const [key, value] of Object.entries(headers)) {
      if (/[\r\n]/.test(key) || (typeof value === 'string' && /[\r\n]/.test(value))) {
        throw new Error(`CRLF injection detected in header "${key}": "${value}".`);
      }
    }
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
      return (
        entry.name.startsWith(forbidden) ||
        entry.name.endsWith(forbidden) ||
        entry.name === forbidden
      );
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
 * Generates Netlify _headers content.
 */
export function generateHeaders(customHeaders: readonly HeaderRule[] = []): string {
  const lines: string[] = [
    '# Netlify HTTP Headers',
    '# Generated by @ranujs/adapter-netlify',
    '',
    '/_ranu/assets/*',
    '  Cache-Control: public, max-age=31536000, immutable',
  ];

  for (const rule of customHeaders) {
    lines.push('');
    lines.push(rule.for);
    for (const [key, val] of Object.entries(rule.values)) {
      validateHeaderSafety({ [key]: val });
      lines.push(`  ${key}: ${val}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Generates Netlify _redirects content.
 */
export function generateRedirects(
  functionName = 'server',
  customRedirects: readonly RedirectRule[] = [],
): string {
  const lines: string[] = [
    '# Netlify Redirects',
    '# Generated by @ranujs/adapter-netlify',
    '',
    '# Framework immutable static assets passthrough',
    '/_ranu/assets/*  /_ranu/assets/:splat  200!',
  ];

  for (const rule of customRedirects) {
    const status = rule.status ?? 200;
    const forceStr = rule.force ? '!' : '';
    lines.push(`${rule.from}  ${rule.to}  ${status}${forceStr}`);
  }

  lines.push('');
  lines.push('# Fallback dynamic SSR and API routes to Netlify Function');
  lines.push(`/*  /.netlify/functions/${functionName}  200`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Generates netlify.toml configuration content.
 */
export function generateNetlifyToml(
  publishDirRelative: string,
  functionsDirRelative: string,
  functionName = 'server',
  customHeaders: readonly HeaderRule[] = [],
  customRedirects: readonly RedirectRule[] = [],
): string {
  const publishNorm = publishDirRelative.replace(/\\/g, '/');
  const functionsNorm = functionsDirRelative.replace(/\\/g, '/');

  const lines: string[] = [
    '# Netlify Configuration for Ranu.js',
    '# Generated by @ranujs/adapter-netlify',
    '',
    '[build]',
    `  publish = "${publishNorm}"`,
    `  functions = "${functionsNorm}"`,
    '',
    '[[headers]]',
    '  for = "/_ranu/assets/*"',
    '  [headers.values]',
    '    Cache-Control = "public, max-age=31536000, immutable"',
  ];

  for (const header of customHeaders) {
    lines.push('');
    lines.push('[[headers]]');
    lines.push(`  for = "${header.for}"`);
    lines.push('  [headers.values]');
    for (const [key, val] of Object.entries(header.values)) {
      validateHeaderSafety({ [key]: val });
      lines.push(`    ${key} = "${val}"`);
    }
  }

  lines.push('');
  lines.push('[[redirects]]');
  lines.push('  from = "/_ranu/assets/*"');
  lines.push('  to = "/_ranu/assets/:splat"');
  lines.push('  status = 200');
  lines.push('  force = true');

  for (const redirect of customRedirects) {
    lines.push('');
    lines.push('[[redirects]]');
    lines.push(`  from = "${redirect.from}"`);
    lines.push(`  to = "${redirect.to}"`);
    lines.push(`  status = ${redirect.status ?? 200}`);
    if (redirect.force) {
      lines.push('  force = true');
    }
  }

  lines.push('');
  lines.push('[[redirects]]');
  lines.push('  from = "/*"');
  lines.push(`  to = "/.netlify/functions/${functionName}"`);
  lines.push('  status = 200');
  lines.push('');

  return lines.join('\n');
}

/**
 * Creates a Netlify deployment adapter instance for Ranu.js.
 */
export function createNetlifyAdapter(options: NetlifyAdapterOptions = {}): RanuDeploymentAdapter {
  return {
    name: adapterName,
    apiVersion: ADAPTER_API_VERSION,
    capabilities: NETLIFY_CAPABILITIES,

    async adapt(context: DeploymentAdapterContext): Promise<DeploymentResult> {
      await Promise.resolve();

      const projectRoot = path.resolve(context.projectRoot ?? process.cwd());
      const buildDir = path.resolve(context.buildDir ?? path.join(projectRoot, '.ranu', 'build'));
      const outputDir = path.resolve(
        options.outputDir ?? context.outputDir ?? path.join(projectRoot, '.netlify'),
      );

      // Validate outputDir safety
      const relToRoot = path.relative(outputDir, projectRoot);
      const relToBuild = path.relative(outputDir, buildDir);
      if (
        outputDir === projectRoot ||
        outputDir === buildDir ||
        relToRoot === '' ||
        relToBuild === ''
      ) {
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
          `Cannot adapt for netlify: No production build found at "${buildDir}". Run "ranu build" first.`,
        );
      }

      const buildDescriptor: BuildDescriptor = JSON.parse(
        fs.readFileSync(buildDescriptorPath, 'utf8'),
      );

      // 2. Validate capability compatibility
      const buildRuntime = String(buildDescriptor.runtime);
      if (buildRuntime !== 'node' && buildRuntime !== 'edge') {
        throw new Error(
          `Netlify adapter requires build runtime target "node" or "edge", but received "${buildRuntime}".`,
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
      const staticManifestPath = buildDescriptor.manifests.static
        ? path.resolve(buildDir, buildDescriptor.manifests.static)
        : '';
      const clientManifestPath = buildDescriptor.manifests.client
        ? path.resolve(buildDir, buildDescriptor.manifests.client)
        : '';

      const routeManifest: RouteManifest = JSON.parse(fs.readFileSync(routesManifestPath, 'utf8'));
      const serverManifest: ServerManifest = JSON.parse(fs.readFileSync(serverManifestPath, 'utf8'));
      const staticManifest: StaticManifest =
        staticManifestPath && fs.existsSync(staticManifestPath)
          ? JSON.parse(fs.readFileSync(staticManifestPath, 'utf8'))
          : { schemaVersion: 1, buildId: buildDescriptor.buildId, routes: [] };
      const clientManifest: ClientManifest =
        clientManifestPath && fs.existsSync(clientManifestPath)
          ? JSON.parse(fs.readFileSync(clientManifestPath, 'utf8'))
          : { schemaVersion: 1, buildId: buildDescriptor.buildId, assets: {} };

      // 4. Prepare clean output directory
      if (options.clean !== false && fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true, force: true });
      }
      fs.mkdirSync(outputDir, { recursive: true });

      const publishDir = path.resolve(options.publishDir ?? path.join(outputDir, 'publish'));
      const functionsDir = path.resolve(
        options.functionsDir ?? path.join(outputDir, 'functions-internal'),
      );
      const functionName = options.functionName ?? 'server';

      fs.mkdirSync(publishDir, { recursive: true });
      fs.mkdirSync(functionsDir, { recursive: true });

      const emittedFiles: string[] = [];
      const forbiddenStaticPatterns = ['.env', '.git', '.DS_Store', '.map', 'server'];

      // 5. Copy pre-rendered static assets and static HTML pages
      const buildStaticAssetsDir = path.join(buildDir, 'static', 'assets');
      if (fs.existsSync(buildStaticAssetsDir)) {
        const ranuAssetsDest = path.join(publishDir, '_ranu', 'assets');
        const copied = copyDirectorySafe(
          buildStaticAssetsDir,
          ranuAssetsDest,
          publishDir,
          forbiddenStaticPatterns,
        );
        emittedFiles.push(...copied);

        const copiedRoot = copyDirectorySafe(
          buildStaticAssetsDir,
          publishDir,
          publishDir,
          forbiddenStaticPatterns,
        );
        emittedFiles.push(...copiedRoot);
      }

      const buildStaticPagesDir = path.join(buildDir, 'static', 'pages');
      if (fs.existsSync(buildStaticPagesDir)) {
        const copiedPages = copyDirectorySafe(
          buildStaticPagesDir,
          publishDir,
          publishDir,
          forbiddenStaticPatterns,
        );
        emittedFiles.push(...copiedPages);
      }

      const publicDir = path.join(projectRoot, 'public');
      if (fs.existsSync(publicDir)) {
        const copiedPublic = copyDirectorySafe(
          publicDir,
          publishDir,
          publishDir,
          forbiddenStaticPatterns,
        );
        emittedFiles.push(...copiedPublic);
      }

      // 6. Emit _headers and _redirects into publishDir
      const headersContent = generateHeaders(options.customHeaders ?? []);
      const headersPath = path.join(publishDir, '_headers');
      fs.writeFileSync(headersPath, headersContent, 'utf8');
      emittedFiles.push(headersPath);

      const redirectsContent = generateRedirects(functionName, options.customRedirects ?? []);
      const redirectsPath = path.join(publishDir, '_redirects');
      fs.writeFileSync(redirectsPath, redirectsContent, 'utf8');
      emittedFiles.push(redirectsPath);

      // Also copy _headers and _redirects to outputDir root if publishDir is nested
      if (publishDir !== outputDir) {
        const rootHeadersPath = path.join(outputDir, '_headers');
        fs.writeFileSync(rootHeadersPath, headersContent, 'utf8');
        emittedFiles.push(rootHeadersPath);

        const rootRedirectsPath = path.join(outputDir, '_redirects');
        fs.writeFileSync(rootRedirectsPath, redirectsContent, 'utf8');
        emittedFiles.push(rootRedirectsPath);
      }

      // 7. Emit netlify.toml
      const relPublish = isPathContained(publishDir, projectRoot)
        ? path.relative(projectRoot, publishDir)
        : path.relative(outputDir, publishDir);
      const relFunctions = isPathContained(functionsDir, projectRoot)
        ? path.relative(projectRoot, functionsDir)
        : path.relative(outputDir, functionsDir);

      const tomlContent = generateNetlifyToml(
        relPublish,
        relFunctions,
        functionName,
        options.customHeaders ?? [],
        options.customRedirects ?? [],
      );
      const tomlPath = path.join(outputDir, 'netlify.toml');
      fs.writeFileSync(tomlPath, tomlContent, 'utf8');
      emittedFiles.push(tomlPath);

      // 8. Generate Netlify Functions v2 handler
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

      const functionSource = `// Netlify Functions v2 Entrypoint for Ranu.js
// Generated by @ranujs/adapter-netlify (Build ID: ${buildDescriptor.buildId})

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

const netlifyScopeStorage = new AsyncLocalStorage();

class NetlifyRequestContextStore {
  constructor() {
    this.contextStorage = new AsyncLocalStorage();
  }

  run(context, callback) {
    const scope = netlifyScopeStorage.getStore();
    if (scope) {
      if (scope.context !== undefined) {
        context.locals.set('netlify', scope.context);
        context.locals.set('context', scope.context);
        if (scope.context.geo !== undefined) {
          context.locals.set('geo', scope.context.geo);
        }
        if (scope.context.ip !== undefined) {
          context.locals.set('ip', scope.context.ip);
        }
        if (scope.context.site !== undefined) {
          context.locals.set('site', scope.context.site);
        }
        if (scope.context.account !== undefined) {
          context.locals.set('account', scope.context.account);
        }
        if (scope.context.cookies !== undefined) {
          context.locals.set('cookies', scope.context.cookies);
        }
        if (scope.context.requestId !== undefined) {
          context.locals.set('requestId', scope.context.requestId);
        }
        if (scope.context.server !== undefined) {
          context.locals.set('server', scope.context.server);
        }
      }
      context.locals.set('env', process.env);
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
const contextStore = new NetlifyRequestContextStore();

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

function sanitizeAndPreserveResponse(response, method) {
  const sanitizedHeaders = new Headers();

  const setCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [];

  for (const [key, value] of response.headers.entries()) {
    if (/[\\r\\n]/.test(key) || /[\\r\\n]/.test(value)) {
      throw new Error('CRLF injection detected in header "' + key + '": "' + value + '".');
    }
    if (key.toLowerCase() === 'set-cookie') {
      continue;
    }
    sanitizedHeaders.set(key, value);
  }

  if (setCookies.length > 0) {
    for (const cookie of setCookies) {
      if (/[\\r\\n]/.test(cookie)) {
        throw new Error('CRLF injection detected in Set-Cookie: "' + cookie + '".');
      }
      sanitizedHeaders.append('Set-Cookie', cookie);
    }
  } else {
    const singleSetCookie = response.headers.get('set-cookie');
    if (singleSetCookie) {
      if (/[\\r\\n]/.test(singleSetCookie)) {
        throw new Error('CRLF injection detected in Set-Cookie: "' + singleSetCookie + '".');
      }
      sanitizedHeaders.set('Set-Cookie', singleSetCookie);
    }
  }

  const isBodyless = method === 'HEAD' || response.status === 204 || response.status === 304;
  const body = isBodyless ? null : response.body;

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: sanitizedHeaders,
  });
}

export default async function handler(request, context = {}) {
  try {
    const method = (request.method || 'GET').toUpperCase();
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Direct static page fallback
    const staticPage =
      staticPages[pathname] || (pathname !== '/' && staticPages[pathname + '.html']);
    if (staticPage && (method === 'GET' || method === 'HEAD')) {
      const pageHeaders = new Headers({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=0, must-revalidate',
      });
      return new Response(method === 'HEAD' ? null : staticPage.content, {
        status: staticPage.status ?? 200,
        headers: pageHeaders,
      });
    }

    const response = await netlifyScopeStorage.run({ request, context }, async () => {
      return await runtime.handle(request);
    });

    return sanitizeAndPreserveResponse(response, method);
  } catch (err) {
    return new Response('Internal Server Error: ' + (err?.message || 'Unknown error'), {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

export { handler };

export const config = {
  path: '/*',
  preferStatic: true,
};
`;

      const sourceDir = path.dirname(fileURLToPath(import.meta.url));
      const handlerOutPath = path.join(functionsDir, `${functionName}.mjs`);

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

      try {
        await build({
          stdin: {
            contents: functionSource,
            loader: 'js',
            resolveDir: fs.existsSync(workspaceRuntimeEntry) ? sourceDir : projectRoot,
            sourcefile: `${functionName}.mjs`,
          },
          outfile: handlerOutPath,
          bundle: true,
          format: 'esm',
          target: 'es2022',
          platform: 'node',
          alias: workspacePackageAliases,
          external: [...NODE_BUILTIN_EXTERNALS, ...(options.external ?? [])],
          minify: options.minify ?? false,
          logLevel: 'silent',
        });
      } catch {
        fs.writeFileSync(handlerOutPath, functionSource, 'utf8');
      }

      emittedFiles.push(handlerOutPath);

      // Also emit ranu-ssr.mjs alias if functionName is not already ranu-ssr
      if (functionName !== 'ranu-ssr') {
        const aliasPath = path.join(functionsDir, 'ranu-ssr.mjs');
        const aliasContent = `export * from './${functionName}.mjs';\nexport { default } from './${functionName}.mjs';\n`;
        fs.writeFileSync(aliasPath, aliasContent, 'utf8');
        emittedFiles.push(aliasPath);
      }

      // 9. Generate completion descriptor under .ranu/deploy/netlify
      const ranuDeployDir = path.join(projectRoot, '.ranu', 'deploy', 'netlify');
      fs.mkdirSync(ranuDeployDir, { recursive: true });

      const deployManifest = {
        schemaVersion: 1,
        adapter: 'netlify',
        adapterVersion: '1.0.0',
        buildId: buildDescriptor.buildId,
        target: 'netlify',
        outputDirectory: outputDir,
        publishDirectory: publishDir,
        functionsDirectory: functionsDir,
        entrypoint: `${functionName}.mjs`,
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
        target: 'netlify',
        outputDirectory: outputDir,
        files: emittedFiles,
      };
    },
  };
}

export const netlifyAdapter = createNetlifyAdapter;
export default createNetlifyAdapter;
