import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { build } from '@ranu/build';
import { createRouteLoader } from '@ranu/react';

describe('Integration: CSS Modules and Route Transitions', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-css-int-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('generates SSG static HTML containing extracted stylesheet links', async () => {
    const appDir = path.join(tempDir, 'app');
    fs.mkdirSync(appDir, { recursive: true });

    fs.writeFileSync(
      path.join(appDir, 'layout.tsx'),
      `import React from 'react';
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html><head></head><body>{children}</body></html>;
}`,
    );

    fs.writeFileSync(
      path.join(appDir, 'About.module.css'),
      '.title { color: crimson; font-weight: bold; }',
    );

    fs.writeFileSync(
      path.join(appDir, 'page.tsx'),
      `import React from 'react';
import styles from './About.module.css';

export const render = 'static';

export default function StaticAboutPage() {
  return <h1 className={styles.title}>About Us</h1>;
}`,
    );

    const buildResult = await build({
      projectRoot: tempDir,
      mode: 'production',
    });

    expect(buildResult.success).toBe(true);

    const staticHtmlPath = path.join(buildResult.outDir, 'static', 'pages', 'index.html');
    expect(fs.existsSync(staticHtmlPath)).toBe(true);

    const html = fs.readFileSync(staticHtmlPath, 'utf8');
    expect(html).toContain('<link rel="stylesheet"');
    expect(html).toMatch(/href="\/_ranu\/assets\/.*\.css"/);
    expect(html).toMatch(/class="About_title__[a-zA-Z0-9_-]{5}"/);
  }, 60_000);

  it('creates client RouteLoader that exposes and preloads route CSS', async () => {
    const registry = {
      buildId: 'test-build-123',
      assets: {
        'page:/dashboard': {
          js: ['/_ranu/assets/c_dashboard-123.js'],
          css: ['/_ranu/assets/c_dashboard-456.css'],
        },
      },
    };

    const loader = createRouteLoader({
      registry,
      importFn: async (_url) => ({
        default: () => null,
      }),
    });

    const routeAssets = loader.getRouteAssets('page:/dashboard');
    expect(routeAssets).toBeDefined();
    expect(routeAssets?.css).toEqual(['/_ranu/assets/c_dashboard-456.css']);

    const mod = await loader.loadRouteModule('page:/dashboard');
    expect(mod.default).toBeDefined();
  });
});
