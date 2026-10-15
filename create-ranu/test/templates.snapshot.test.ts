import { describe, it, expect } from 'vitest';
import { generateTemplateFiles } from '../src/template.js';
import { parseArgs } from '../src/bin/create-ranu.js';
import type { TemplateName } from '../src/types.js';

describe('create-ranu multi-template scaffolding', () => {
  const templates: TemplateName[] = ['default', 'minimal', 'cloudflare', 'node-docker', 'api-routes'];

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

    // Verify package.json is valid JSON
    const pkg = JSON.parse(files['package.json']!);
    expect(pkg.name).toBe('my-test-app');
    expect(pkg.dependencies['@ranujs/core']).toBeDefined();

    // Snapshot deterministic file list
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

  describe('CLI parseArgs flags', () => {
    it('parses --template and -t flags correctly', () => {
      const parsed1 = parseArgs(['my-app', '--template', 'cloudflare']);
      expect(parsed1.template).toBe('cloudflare');

      const parsed2 = parseArgs(['my-app', '-t', 'node-docker']);
      expect(parsed2.template).toBe('node-docker');
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

    it('parses --tests and --no-tests flags correctly', () => {
      const parsed1 = parseArgs(['my-app', '--tests']);
      expect(parsed1.tests).toBe(true);

      const parsed2 = parseArgs(['my-app', '--no-tests']);
      expect(parsed2.tests).toBe(false);
    });
  });
});
