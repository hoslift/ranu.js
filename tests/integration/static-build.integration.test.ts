import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { build } from '@ranu/build';

describe('Phase 15: Full Static Build Pipeline Integration Test', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-full-static-build-'));
    fs.mkdirSync(path.join(projectDir, 'app', 'about'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'app', 'blog', '[slug]'), { recursive: true });

    // Root layout
    fs.writeFileSync(
      path.join(projectDir, 'app', 'layout.tsx'),
      `import React from 'react';
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><title>Static App</title></head>
      <body>{children}</body>
    </html>
  );
}
`,
      'utf8'
    );

    // Root server page (render = "server")
    fs.writeFileSync(
      path.join(projectDir, 'app', 'page.tsx'),
      `import React from 'react';
export const render = 'server';
export default function HomePage() {
  return <h1>Server Home</h1>;
}
`,
      'utf8'
    );

    // Static literal page (render = "static")
    fs.writeFileSync(
      path.join(projectDir, 'app', 'about', 'page.tsx'),
      `import React from 'react';
export const render = 'static';
export const metadata = { title: 'About Us' };
export default function AboutPage() {
  return <h1>About Ranu SSG</h1>;
}
`,
      'utf8'
    );

    // Static dynamic page with generateStaticParams (render = "static")
    fs.writeFileSync(
      path.join(projectDir, 'app', 'blog', '[slug]', 'page.tsx'),
      `import React from 'react';
export const render = 'static';
export async function generateStaticParams() {
  return [{ slug: 'intro' }, { slug: 'release' }];
}
export function generateMetadata({ params }: { params: { slug: string } }) {
  return { title: 'Blog - ' + params.slug };
}
export default function BlogPost({ params }: { params: { slug: string } }) {
  return <article><h1>Blog: {params.slug}</h1></article>;
}
`,
      'utf8'
    );

    // Root not-found component
    fs.writeFileSync(
      path.join(projectDir, 'app', 'not-found.tsx'),
      `import React from 'react';
export default function NotFound() {
  return <div id="custom-404">Page Not Found</div>;
}
`,
      'utf8'
    );
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('runs full build, executes static site generation, and emits valid static.json and HTML documents', async () => {
    const result = await build({
      projectRoot: projectDir,
      mode: 'production',
    });

    expect(result.success).toBe(true);
    expect(result.diagnostics).toEqual([]);

    const outDir = path.join(projectDir, '.ranu', 'build');
    expect(fs.existsSync(outDir)).toBe(true);

    // 1. Verify BUILD_ID
    const buildIdFile = path.join(outDir, 'BUILD_ID');
    expect(fs.existsSync(buildIdFile)).toBe(true);
    const buildId = fs.readFileSync(buildIdFile, 'utf8').trim();
    expect(buildId).toBe(result.buildId);

    // 2. Verify static.json manifest
    const staticJsonPath = path.join(outDir, 'manifest', 'static.json');
    expect(fs.existsSync(staticJsonPath)).toBe(true);
    const staticManifest = JSON.parse(fs.readFileSync(staticJsonPath, 'utf8'));

    expect(staticManifest.schemaVersion).toBe(1);
    expect(staticManifest.buildId).toBe(result.buildId);

    const pathnames = staticManifest.routes.map((r: any) => r.pathname);
    expect(pathnames).toEqual(['/404', '/about', '/blog/intro', '/blog/release']);

    // 3. Verify physical static HTML files exist
    const aboutHtml = fs.readFileSync(path.join(outDir, 'static', 'pages', 'about.html'), 'utf8');
    expect(aboutHtml).toContain('About Ranu SSG');
    expect(aboutHtml).toContain('<title>About Us</title>');

    const blogIntroHtml = fs.readFileSync(path.join(outDir, 'static', 'pages', 'blog', 'intro.html'), 'utf8');
    expect(blogIntroHtml.replaceAll('<!-- -->', '')).toContain('Blog: intro');
    expect(blogIntroHtml).toContain('<title>Blog - intro</title>');

    const blogReleaseHtml = fs.readFileSync(path.join(outDir, 'static', 'pages', 'blog', 'release.html'), 'utf8');
    expect(blogReleaseHtml.replaceAll('<!-- -->', '')).toContain('Blog: release');
    expect(blogReleaseHtml).toContain('<title>Blog - release</title>');

    const fallback404Html = fs.readFileSync(path.join(outDir, 'static', 'pages', '404.html'), 'utf8');
    expect(fallback404Html).toContain('Page Not Found');

    // 4. Server page (/) should not be in static manifest or static pages
    expect(pathnames.includes('/')).toBe(false);
    expect(fs.existsSync(path.join(outDir, 'static', 'pages', 'index.html'))).toBe(false);
  }, 20_000);
});
