import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { build } from '../src/build.js';

describe('Global CSS and CSS Extraction Pipeline', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-css-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('compiles and extracts global CSS imported from root layout', async () => {
    const appDir = path.join(tempDir, 'app');
    fs.mkdirSync(appDir, { recursive: true });

    // A legitimate project directory named css_modules must still have URLs rewritten.
    const cssDir = path.join(appDir, 'css_modules');
    fs.mkdirSync(cssDir, { recursive: true });
    fs.writeFileSync(path.join(appDir, 'bg.svg'), '<svg></svg>');
    fs.writeFileSync(
      path.join(cssDir, 'global.css'),
      'body { margin: 0; background-color: #f0f0f0; background-image: url(../bg.svg); }',
    );

    fs.writeFileSync(
      path.join(appDir, 'layout.tsx'),
      `import React from 'react';
import './css_modules/global.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html><head></head><body>{children}</body></html>;
}`,
    );

    fs.writeFileSync(
      path.join(appDir, 'page.tsx'),
      `import React from 'react';

export default function HomePage() {
  return <h1>Home</h1>;
}`,
    );

    const result = await build({
      projectRoot: tempDir,
      mode: 'production',
    });

    expect(result.success).toBe(true);

    const clientManifestPath = path.join(result.outDir, 'manifest', 'client.json');
    expect(fs.existsSync(clientManifestPath)).toBe(true);

    const clientManifest = JSON.parse(fs.readFileSync(clientManifestPath, 'utf8'));
    expect(clientManifest.assets['bootstrap']).toBeDefined();
    expect(clientManifest.assets['bootstrap'].css.length).toBeGreaterThan(0);
    expect(clientManifest.assets['bootstrap'].css[0]).toMatch(/^\/_ranu\/assets\/.*\.css$/);

    // Verify extracted CSS file on disk
    const extractedFileName = path.basename(clientManifest.assets['bootstrap'].css[0]);
    const extractedFilePath = path.join(result.outDir, 'static', 'assets', extractedFileName);
    expect(fs.existsSync(extractedFilePath)).toBe(true);

    const cssContent = fs.readFileSync(extractedFilePath, 'utf8');
    expect(cssContent).toContain('background-color:#f0f0f0');
    expect(cssContent).toMatch(/url\(\/?_ranu\/assets\/bg-[a-f0-9]{8}\.svg\)/);
  }, 60_000);

  it('compiles and extracts CSS modules with scoped class names in build output', async () => {
    const appDir = path.join(tempDir, 'app');
    fs.mkdirSync(appDir, { recursive: true });

    fs.writeFileSync(
      path.join(appDir, 'Home.module.css'),
      '.hero { color: rebeccapurple; font-size: 32px; }',
    );

    fs.writeFileSync(
      path.join(appDir, 'layout.tsx'),
      `import React from 'react';
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html><head></head><body>{children}</body></html>;
}`,
    );

    fs.writeFileSync(
      path.join(appDir, 'page.tsx'),
      `import React from 'react';
import styles from './Home.module.css';

export default function HomePage() {
  return <h1 className={styles.hero}>Hero Title</h1>;
}`,
    );

    const result = await build({
      projectRoot: tempDir,
      mode: 'production',
    });

    if (!result.success) {
      console.error('Build Diagnostics:', result.diagnostics);
    }
    expect(result.success).toBe(true);

    const clientManifestPath = path.join(result.outDir, 'manifest', 'client.json');
    const clientManifest = JSON.parse(fs.readFileSync(clientManifestPath, 'utf8'));

    expect(clientManifest.assets['page:/']).toBeDefined();
    expect(clientManifest.assets['page:/'].css.length).toBeGreaterThan(0);

    const extractedCssUrl = clientManifest.assets['page:/'].css[0];
    const extractedFileName = path.basename(extractedCssUrl);
    const extractedFilePath = path.join(result.outDir, 'static', 'assets', extractedFileName);
    expect(fs.existsSync(extractedFilePath)).toBe(true);

    const cssContent = fs.readFileSync(extractedFilePath, 'utf8');
    expect(cssContent).toMatch(/Home_hero__[a-zA-Z0-9_-]{5}/);
    expect(cssContent).toContain('font-size:32px');
  }, 60_000);
});
