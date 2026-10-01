import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterAll } from 'vitest';
import { runCommand, cleanupAllProcesses } from '../helpers/process.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const cliBin = path.join(rootDir, 'packages/cli/dist/bin/ranu.js');
const tscBin = path.join(rootDir, 'node_modules/typescript/bin/tsc');
const cliEnv = { ...process.env, NODE_ENV: 'production' };

const OFFICIAL_EXAMPLES = [
  'hello-world',
  'routing',
  'dynamic-routing',
  'ssr',
  'ssg',
  'api-routes',
  'middleware',
  'client-components',
  'full-stack-dashboard',
  'deployment-node',
  'deployment-vercel',
  'plugin-basic',
] as const;

const FORBIDDEN_IMPORT_PATTERNS = [
  /@ranu\/core/,
  /@ranu\/router/,
  /@ranu\/runtime/,
  /@ranu\/runtime-node/,
  /@ranu\/manifests/,
  /@ranu\/diagnostics/,
  /@ranu\/build/,
  /@ranu\/dev/,
  /ranu\/dist\//,
  /ranu\/src\//,
];

function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (
      entry.name === 'node_modules' ||
      entry.name === '.ranu' ||
      entry.name === '.vercel' ||
      entry.name.startsWith('.')
    ) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(fullPath));
    } else if (entry.isFile() && /\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('Phase 31 — Official Examples Suite and Conformance Harness', () => {
  afterAll(async () => {
    await cleanupAllProcesses();
  });

  describe('1. Structure and Manifest Integrity across all 12 Examples', () => {
    it.each(OFFICIAL_EXAMPLES)('validates project files for example "%s"', (exampleName) => {
      const exampleDir = path.join(rootDir, 'examples', exampleName);
      expect(fs.existsSync(exampleDir)).toBe(true);

      // Package.json integrity
      const pkgPath = path.join(exampleDir, 'package.json');
      expect(fs.existsSync(pkgPath)).toBe(true);
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      expect(pkg.name).toBe(`example-${exampleName}`);
      expect(pkg.private).toBe(true);
      expect(pkg.type).toBe('module');
      expect(pkg.scripts?.dev).toBe('ranu dev');
      expect(pkg.scripts?.build).toBe('ranu build');
      expect(pkg.scripts?.start).toBe('ranu start');

      // Dependencies should include ranu
      expect(pkg.dependencies?.ranu).toBeDefined();

      // tsconfig.json integrity
      const tsconfigPath = path.join(exampleDir, 'tsconfig.json');
      expect(fs.existsSync(tsconfigPath)).toBe(true);
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
      expect(tsconfig.compilerOptions?.jsx).toBe('react-jsx');
      expect(String(tsconfig.compilerOptions?.moduleResolution).toLowerCase()).toBe('bundler');

      // ranu.config.ts integrity
      const configPath = path.join(exampleDir, 'ranu.config.ts');
      expect(fs.existsSync(configPath)).toBe(true);
      const configContent = fs.readFileSync(configPath, 'utf8');
      expect(configContent).toContain('defineConfig');

      // README.md integrity
      const readmePath = path.join(exampleDir, 'README.md');
      expect(fs.existsSync(readmePath)).toBe(true);
      const readmeContent = fs.readFileSync(readmePath, 'utf8');
      expect(readmeContent.length).toBeGreaterThan(100);
      expect(readmeContent).toMatch(/^# /m);
      expect(readmeContent).toContain('pnpm');
    });
  });

  describe('2. Public API Conformance & Boundary Isolation', () => {
    it.each(OFFICIAL_EXAMPLES)(
      'ensures "%s" uses only canonical public APIs and does not leak internal modules',
      (exampleName) => {
        const exampleDir = path.join(rootDir, 'examples', exampleName);
        const sourceFiles = collectSourceFiles(exampleDir);
        expect(sourceFiles.length).toBeGreaterThan(0);

        for (const file of sourceFiles) {
          const content = fs.readFileSync(file, 'utf8');
          for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
            const matches = content.match(pattern);
            expect(
              matches,
              `File "${path.relative(rootDir, file)}" imports forbidden internal module matching ${pattern}`,
            ).toBeNull();
          }
        }
      },
    );
  });

  describe('3. TypeScript Typecheck for All 12 Examples', () => {
    it.each(OFFICIAL_EXAMPLES)(
      'passes tsc typecheck cleanly for "%s"',
      async (exampleName) => {
        const exampleDir = path.join(rootDir, 'examples', exampleName);
        const tsconfigPath = path.join(exampleDir, 'tsconfig.json');

        const res = await runCommand(process.execPath, [tscBin, '--noEmit', '-p', tsconfigPath], {
          cwd: rootDir,
        });
        expect(res.code).toBe(0);
      },
      30000,
    );
  });

  describe('4. CLI Build & Artifact Generation for All 12 Examples', () => {
    it.each(OFFICIAL_EXAMPLES)(
      'builds "%s" successfully into production artifacts',
      async (exampleName) => {
        const exampleDir = path.join(rootDir, 'examples', exampleName);

        const buildRes = await runCommand(
          process.execPath,
          [cliBin, 'build', '--clean', '-r', exampleDir],
          { cwd: rootDir, env: cliEnv },
        );
        expect(buildRes.code).toBe(0);

        const buildDir = path.join(exampleDir, '.ranu', 'build');
        expect(fs.existsSync(buildDir)).toBe(true);

        // build.json validation
        const buildJsonPath = path.join(buildDir, 'build.json');
        expect(fs.existsSync(buildJsonPath)).toBe(true);
        const buildJson = JSON.parse(fs.readFileSync(buildJsonPath, 'utf8'));
        expect(buildJson.schemaVersion).toBe(1);
        expect(buildJson.buildId).toBeDefined();

        // routes.json manifest validation
        const routesJsonPath = path.join(buildDir, 'manifest', 'routes.json');
        expect(fs.existsSync(routesJsonPath)).toBe(true);
        const routesJson = JSON.parse(fs.readFileSync(routesJsonPath, 'utf8'));
        expect(Array.isArray(routesJson.routes)).toBe(true);
        expect(routesJson.routes.length).toBeGreaterThan(0);

        // client.json manifest validation
        const clientJsonPath = path.join(buildDir, 'manifest', 'client.json');
        expect(fs.existsSync(clientJsonPath)).toBe(true);
        const clientJson = JSON.parse(fs.readFileSync(clientJsonPath, 'utf8'));
        expect(clientJson.schemaVersion).toBe(1);
      },
      60000,
    );
  });

  describe('5. Feature-Specific Assertions', () => {
    it('verifies dynamic routing segments in "dynamic-routing" manifest', () => {
      const routesJsonPath = path.join(
        rootDir,
        'examples/dynamic-routing/.ranu/build/manifest/routes.json',
      );
      const routesJson = JSON.parse(fs.readFileSync(routesJsonPath, 'utf8'));
      const patterns = routesJson.routes.map((r: { pattern: string }) => r.pattern);

      expect(patterns.some((p: string) => p.includes(':id') || p.includes('[id]'))).toBe(true);
      expect(
        patterns.some(
          (p: string) =>
            (p.includes(':category') && p.includes(':productId')) ||
            (p.includes('[category]') && p.includes('[productId]')),
        ),
      ).toBe(true);
      expect(patterns.some((p: string) => p.includes('*') || p.includes('[...slug]'))).toBe(true);
    });

    it('verifies SSR rendering strategy in "ssr" manifest', () => {
      const routesJsonPath = path.join(rootDir, 'examples/ssr/.ranu/build/manifest/routes.json');
      const routesJson = JSON.parse(fs.readFileSync(routesJsonPath, 'utf8'));
      const ssrRoute = routesJson.routes.find((r: { pattern: string }) => r.pattern === '/');
      expect(ssrRoute).toBeDefined();
      expect(ssrRoute.renderMode).toBe('server');
    });

    it('verifies SSG rendering strategy and static HTML output in "ssg"', () => {
      const routesJsonPath = path.join(rootDir, 'examples/ssg/.ranu/build/manifest/routes.json');
      const routesJson = JSON.parse(fs.readFileSync(routesJsonPath, 'utf8'));
      const ssgRoute = routesJson.routes.find((r: { pattern: string }) => r.pattern === '/');
      expect(ssgRoute).toBeDefined();
      expect(ssgRoute.renderMode).toBe('static');

      const staticManifestPath = path.join(
        rootDir,
        'examples/ssg/.ranu/build/manifest/static.json',
      );
      expect(fs.existsSync(staticManifestPath)).toBe(true);
    });

    it('verifies API routes in "api-routes" manifest', () => {
      const routesJsonPath = path.join(
        rootDir,
        'examples/api-routes/.ranu/build/manifest/routes.json',
      );
      const routesJson = JSON.parse(fs.readFileSync(routesJsonPath, 'utf8'));
      const apiRoutes = routesJson.routes.filter((r: { kind: string }) => r.kind === 'api');
      expect(apiRoutes.length).toBeGreaterThanOrEqual(2);
      const patterns = apiRoutes.map((r: { pattern: string }) => r.pattern);
      expect(patterns).toContain('/api/hello');
      expect(patterns).toContain('/api/users');
    });

    it('verifies Node deployment artifacts in "deployment-node"', () => {
      const dockerfilePath = path.join(rootDir, 'examples/deployment-node/Dockerfile');
      const dockerignorePath = path.join(rootDir, 'examples/deployment-node/.dockerignore');

      expect(fs.existsSync(dockerfilePath)).toBe(true);
      expect(fs.existsSync(dockerignorePath)).toBe(true);

      const dockerfile = fs.readFileSync(dockerfilePath, 'utf8');
      expect(dockerfile).toContain('AS builder');
      expect(dockerfile).toContain('AS runner');
      expect(dockerfile).toContain('EXPOSE 3000');

      const dockerignore = fs.readFileSync(dockerignorePath, 'utf8');
      expect(dockerignore).toContain('node_modules');
      expect(dockerignore).toContain('.git');
    });

    it('verifies Vercel deployment adapter execution in "deployment-vercel"', async () => {
      const deployRes = await runCommand(
        process.execPath,
        [cliBin, 'deploy', '-r', path.join(rootDir, 'examples/deployment-vercel')],
        { cwd: rootDir, env: cliEnv },
      );
      expect(deployRes.code).toBe(0);

      const vercelConfig = path.join(
        rootDir,
        'examples/deployment-vercel/.vercel/output/config.json',
      );
      expect(fs.existsSync(vercelConfig)).toBe(true);
      const config = JSON.parse(fs.readFileSync(vercelConfig, 'utf8'));
      expect(config.version).toBe(3);

      const vcConfig = path.join(
        rootDir,
        'examples/deployment-vercel/.vercel/output/functions/index.func/.vc-config.json',
      );
      expect(fs.existsSync(vcConfig)).toBe(true);
    });
  });
});
