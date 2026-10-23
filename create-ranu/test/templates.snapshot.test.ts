import { describe, it, expect } from 'vitest';
import { generateTemplateFiles } from '../src/template.js';
import { parseArgs } from '../src/bin/create-ranu.js';
import type { TemplateName } from '../src/types.js';

describe('create-ranu multi-template scaffolding', () => {
  const templates: TemplateName[] = ['default', 'minimal', 'cloudflare', 'node-docker', 'api-routes', 'saas'];

  it.each(templates)('generates valid deterministic file tree for template: %s', (template) => {
    const files = generateTemplateFiles('my-test-app', 'pnpm', { template });
    const fileKeys = Object.keys(files).sort();

    // Verify mandatory baseline files present across all templates
    expect(fileKeys).toContain('package.json');
    expect(fileKeys).toContain('ranu.config.ts');
    expect(fileKeys).toContain('app/page.tsx');
    expect(fileKeys).toContain('tsconfig.json');
    expect(fileKeys).toContain('.gitignore');
    expect(fileKeys).toContain('README.md');
    expect(fileKeys).toContain('.cursorrules');
    expect(fileKeys).toContain('AGENTS.md');
    expect(fileKeys).toContain('CLAUDE.md');
    expect(fileKeys).toContain('.ranu/AGENT_GUIDE.md');

    // Verify package.json is valid JSON
    const pkg = JSON.parse(files['package.json']!);
    expect(pkg.name).toBe('my-test-app');
    expect(pkg.dependencies['@ranujs/core']).toBeDefined();

    // Snapshot deterministic file list
    expect(fileKeys).toMatchSnapshot();
  });

  const aiEngines = ['gemini', 'groq', 'claude', 'openai', 'custom'] as const;
  it.each(aiEngines)('generates valid deterministic file tree with --ai %s', (ai) => {
    const files = generateTemplateFiles('my-ai-app', 'pnpm', { template: 'default', ai });
    const fileKeys = Object.keys(files).sort();

    expect(fileKeys).toContain('app/routes/api.ai.ts');
    expect(fileKeys).toContain('.env.example');
    expect(fileKeys).toContain('.cursorrules');
    expect(fileKeys).toContain('AGENTS.md');
    expect(fileKeys).toContain('CLAUDE.md');
    expect(fileKeys).toContain('.ranu/AGENT_GUIDE.md');
    expect(fileKeys).toMatchSnapshot();
  });

  it('scaffolds default template with layout, robots.txt, and SSR home page', () => {
    const files = generateTemplateFiles('default-app', 'npm', { template: 'default' });

    expect(files['app/layout.tsx']).toContain('RootLayout');
    expect(files['public/robots.txt']).toContain('User-agent: *');
    expect(files['ranu.config.ts']).toContain('defineConfig');
    expect(files['app/page.tsx']).toContain('Welcome to Ranu.js');
  });

  it('scaffolds minimal template with ultra-lean configuration', () => {
    const files = generateTemplateFiles('minimal-app', 'npm', { template: 'minimal' });

    expect(files['app/layout.tsx']).toBeUndefined();
    expect(files['public/robots.txt']).toBeUndefined();
    expect(files['ranu.config.ts']).toContain('port: 3000');
    expect(files['app/page.tsx']).toContain('Minimal Ranu.js Application');
  });

  it('scaffolds cloudflare template with wrangler.toml and @ranujs/adapter-cloudflare', () => {
    const files = generateTemplateFiles('cf-app', 'pnpm', { template: 'cloudflare' });

    expect(files['wrangler.toml']).toBeDefined();
    expect(files['wrangler.toml']).toContain('compatibility_flags = ["nodejs_compat"]');
    expect(files['wrangler.toml']).toContain('directory = ".ranu/client"');

    const pkg = JSON.parse(files['package.json']!);
    expect(pkg.dependencies['@ranujs/adapter-cloudflare']).toBeDefined();

    expect(files['ranu.config.ts']).toContain('@ranujs/adapter-cloudflare');
    expect(files['ranu.config.ts']).toContain('adapter: cloudflare()');
  });

  it('scaffolds node-docker template with Dockerfile, .dockerignore, and @ranujs/adapter-node', () => {
    const files = generateTemplateFiles('docker-app', 'bun', { template: 'node-docker' });

    expect(files['Dockerfile']).toBeDefined();
    expect(files['Dockerfile']).toContain('FROM node:22-alpine AS builder');
    expect(files['Dockerfile']).toContain('FROM node:22-alpine AS runner');
    expect(files['.dockerignore']).toBeDefined();

    const pkg = JSON.parse(files['package.json']!);
    expect(pkg.dependencies['@ranujs/adapter-node']).toBeDefined();
    expect(pkg.scripts['docker:build']).toContain('docker build');
    expect(pkg.scripts['docker:run']).toContain('docker run');

    expect(files['ranu.config.ts']).toContain('@ranujs/adapter-node');
    expect(files['ranu.config.ts']).toContain('adapter: nodeAdapter()');
  });

  it('scaffolds api-routes template with app/api/hello/route.ts Web-standard handlers', () => {
    const files = generateTemplateFiles('api-app', 'npm', { template: 'api-routes' });

    expect(files['app/api/hello/route.ts']).toBeDefined();
    const routeContent = files['app/api/hello/route.ts']!;
    expect(routeContent).toContain('export async function GET(request: Request)');
    expect(routeContent).toContain('export async function POST(request: Request)');
    expect(routeContent).toContain('Response.json');

    expect(files['app/page.tsx']).toContain('Ranu.js API Routes');
  });

  it('scaffolds turnkey saas template with tailwind v4, drizzle orm, auth routes, and dashboard', () => {
    const files = generateTemplateFiles('saas-app', 'pnpm', { template: 'saas' });

    expect(files['ranu.config.ts']).toContain('@tailwindcss/vite');
    expect(files['drizzle.config.ts']).toBeDefined();
    expect(files['app/db/schema.ts']).toContain('sqliteTable');
    expect(files['app/db/index.ts']).toContain('better-sqlite3');
    expect(files['app/api/auth/session/route.ts']).toBeDefined();
    expect(files['app/globals.css']).toContain('@import "tailwindcss"');
    expect(files['app/layout.tsx']).toContain('globals.css');
    expect(files['app/page.tsx']).toContain('Welcome to saas-app');
    expect(files['app/dashboard/page.tsx']).toContain('Dashboard');
    expect(files['tsconfig.json']).toContain('drizzle.config.ts');
    expect(files['.gitignore']).toContain('sqlite.db');

    const pkg = JSON.parse(files['package.json']!);
    expect(pkg.dependencies['tailwindcss']).toBeDefined();
    expect(pkg.dependencies['@tailwindcss/vite']).toBeDefined();
    expect(pkg.dependencies['drizzle-orm']).toBeDefined();
    expect(pkg.dependencies['better-sqlite3']).toBeDefined();
    expect(pkg.devDependencies['drizzle-kit']).toBeDefined();
    expect(pkg.scripts['db:push']).toBe('drizzle-kit push');
  });

  it('configures automated test suite when tests option is enabled', () => {
    const files = generateTemplateFiles('tested-app', 'pnpm', { template: 'default', tests: true });

    expect(files['test/page.test.tsx']).toBeDefined();
    expect(files['test/page.test.tsx']).toContain("import { describe, it, expect } from 'vitest'");

    const pkg = JSON.parse(files['package.json']!);
    expect(pkg.scripts['test']).toBe('vitest run');
    expect(pkg.devDependencies['vitest']).toBeDefined();

    const tsconfig = JSON.parse(files['tsconfig.json']!);
    expect(tsconfig.include).toContain('test/**/*');
  });

  it('scaffolds bun template with @ranujs/adapter-bun and bunAdapter', () => {
    const files = generateTemplateFiles('bun-app', 'bun', { adapter: 'bun' });

    expect(files['ranu.config.ts']).toContain('@ranujs/adapter-bun');
    expect(files['ranu.config.ts']).toContain('adapter: bunAdapter()');

    const pkg = JSON.parse(files['package.json']!);
    expect(pkg.dependencies['@ranujs/adapter-bun']).toBeDefined();
    expect(files['app/page.tsx']).toContain('Bun Server App');
  });

  it('scaffolds deno template with deno.json, @ranujs/adapter-deno, and denoAdapter', () => {
    const files = generateTemplateFiles('deno-app', 'npm', { adapter: 'deno' });

    expect(files['deno.json']).toBeDefined();
    expect(files['deno.json']).toContain('deno run -A .ranu/server/index.js');

    expect(files['ranu.config.ts']).toContain('@ranujs/adapter-deno');
    expect(files['ranu.config.ts']).toContain('adapter: denoAdapter()');

    const pkg = JSON.parse(files['package.json']!);
    expect(pkg.dependencies['@ranujs/adapter-deno']).toBeDefined();
    expect(files['app/page.tsx']).toContain('Deno Server App');
  });

  it('scaffolds netlify template with netlify.toml, @ranujs/adapter-netlify, and netlifyAdapter', () => {
    const files = generateTemplateFiles('netlify-app', 'npm', { adapter: 'netlify' });

    expect(files['netlify.toml']).toBeDefined();
    expect(files['netlify.toml']).toContain('[build]');
    expect(files['netlify.toml']).toContain('publish = ".ranu/client"');

    expect(files['ranu.config.ts']).toContain('@ranujs/adapter-netlify');
    expect(files['ranu.config.ts']).toContain('adapter: netlifyAdapter()');

    const pkg = JSON.parse(files['package.json']!);
    expect(pkg.dependencies['@ranujs/adapter-netlify']).toBeDefined();
    expect(files['app/page.tsx']).toContain('Netlify Functions & Edge');
  });

  it('scaffolds vercel adapter with @ranujs/adapter-vercel in default template', () => {
    const files = generateTemplateFiles('vercel-app', 'npm', { adapter: 'vercel' });

    expect(files['ranu.config.ts']).toContain('@ranujs/adapter-vercel');
    expect(files['ranu.config.ts']).toContain('adapter: vercel()');

    const pkg = JSON.parse(files['package.json']!);
    expect(pkg.dependencies['@ranujs/adapter-vercel']).toBeDefined();
  });

  describe('CLI parseArgs flags', () => {
    it('parses --template and -t flags correctly', () => {
      const parsed1 = parseArgs(['my-app', '--template', 'cloudflare']);
      expect(parsed1.template).toBe('cloudflare');

      const parsed2 = parseArgs(['my-app', '-t', 'node-docker']);
      expect(parsed2.template).toBe('node-docker');

      const parsed3 = parseArgs(['my-app', '--template', 'saas']);
      expect(parsed3.template).toBe('saas');
    });

    it('throws descriptive error on invalid template', () => {
      expect(() => parseArgs(['my-app', '--template', 'unknown-tmpl'])).toThrow(
        /Invalid template "unknown-tmpl"/
      );
    });

    it('parses --adapter and -a flags correctly', () => {
      const parsed1 = parseArgs(['my-app', '--adapter', 'cloudflare']);
      expect(parsed1.adapter).toBe('cloudflare');

      const parsed2 = parseArgs(['my-app', '-a', 'node']);
      expect(parsed2.adapter).toBe('node');
    });

    it('parses all 6 valid adapters via --adapter and -a', () => {
      const adapters = ['cloudflare', 'node', 'netlify', 'bun', 'deno', 'vercel'] as const;
      for (const a of adapters) {
        expect(parseArgs(['my-app', '--adapter', a]).adapter).toBe(a);
        expect(parseArgs(['my-app', '-a', a]).adapter).toBe(a);
      }
    });

    it('throws descriptive error on invalid adapter', () => {
      expect(() => parseArgs(['my-app', '--adapter', 'invalid-adapter'])).toThrow(
        /Invalid adapter "invalid-adapter"/
      );
    });

    it('parses --tests and --no-tests flags correctly', () => {
      const parsed1 = parseArgs(['my-app', '--tests']);
      expect(parsed1.tests).toBe(true);

      const parsed2 = parseArgs(['my-app', '--no-tests']);
      expect(parsed2.tests).toBe(false);
    });
  });
});
