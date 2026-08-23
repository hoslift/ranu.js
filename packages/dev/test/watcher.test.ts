import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  categorizeChangedFile,
  shouldIgnoreFile,
  ProjectWatcher,
} from '../src/watcher.js';
import type { DevFileEvent } from '../src/types.js';

describe('ProjectWatcher Categorization and Filtering', () => {
  it('categorizes route files in app directory', () => {
    expect(categorizeChangedFile('app/page.tsx')).toBe('route');
    expect(categorizeChangedFile('app/layout.tsx')).toBe('route');
    expect(categorizeChangedFile('app/about/page.tsx')).toBe('route');
    expect(categorizeChangedFile('app/blog/[slug]/page.tsx')).toBe('route');
    expect(categorizeChangedFile('app/api/users/route.ts')).toBe('route');
    expect(categorizeChangedFile('app/loading.tsx')).toBe('route');
    expect(categorizeChangedFile('app/error.tsx')).toBe('route');
    expect(categorizeChangedFile('app/not-found.tsx')).toBe('route');
  });

  it('categorizes CSS and CSS Module files', () => {
    expect(categorizeChangedFile('app/global.css')).toBe('css');
    expect(categorizeChangedFile('app/Button.module.css')).toBe('css');
    expect(categorizeChangedFile('app/components/Card.module.css')).toBe('css');
  });

  it('categorizes imported static assets', () => {
    expect(categorizeChangedFile('app/logo.png')).toBe('asset');
    expect(categorizeChangedFile('app/hero.jpg')).toBe('asset');
    expect(categorizeChangedFile('app/icon.svg')).toBe('asset');
    expect(categorizeChangedFile('app/fonts/inter.woff2')).toBe('asset');
    expect(categorizeChangedFile('app/video.mp4')).toBe('asset');
  });

  it('categorizes public assets', () => {
    expect(categorizeChangedFile('public/favicon.ico')).toBe('public');
    expect(categorizeChangedFile('public/images/banner.png')).toBe('public');
  });

  it('categorizes config and environment files', () => {
    expect(categorizeChangedFile('ranu.config.ts')).toBe('config');
    expect(categorizeChangedFile('ranu.config.js')).toBe('config');
    expect(categorizeChangedFile('package.json')).toBe('config');
    expect(categorizeChangedFile('tsconfig.json')).toBe('config');
    expect(categorizeChangedFile('.env')).toBe('env');
    expect(categorizeChangedFile('.env.local')).toBe('env');
    expect(categorizeChangedFile('.env.development')).toBe('env');
  });

  it('categorizes general components and utility files', () => {
    expect(categorizeChangedFile('app/components/Button.tsx')).toBe('other');
    expect(categorizeChangedFile('app/utils/math.ts')).toBe('other');
  });

  it('ignores node_modules, .git, .ranu, dist, and temporary editor files', () => {
    expect(shouldIgnoreFile('node_modules/react/index.js')).toBe(true);
    expect(shouldIgnoreFile('.git/HEAD')).toBe(true);
    expect(shouldIgnoreFile('.ranu/dev/server/routes/page.mjs')).toBe(true);
    expect(shouldIgnoreFile('dist/bundle.js')).toBe(true);
    expect(shouldIgnoreFile('docs/specifications/01_SPEC.md')).toBe(true);
    expect(shouldIgnoreFile('app/.page.tsx.swp')).toBe(true);
    expect(shouldIgnoreFile('app/page.tsx~')).toBe(true);
    expect(shouldIgnoreFile('app/#page.tsx#')).toBe(true);

    expect(shouldIgnoreFile('app/page.tsx')).toBe(false);
    expect(shouldIgnoreFile('public/logo.png')).toBe(false);
  });
});

async function waitFor(predicate: () => boolean, timeoutMs = 4000, intervalMs = 20): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

describe('ProjectWatcher live file watching', () => {
  let tempDir: string;
  let appDir: string;
  let watcher: ProjectWatcher | null;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-dev-watcher-'));
    appDir = path.join(tempDir, 'app');
    fs.mkdirSync(appDir, { recursive: true });
    watcher = null;
  });

  afterEach(() => {
    watcher?.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('emits a debounced change event when a watched file is modified', async () => {
    const pagePath = path.join(appDir, 'page.tsx');
    fs.writeFileSync(pagePath, 'export default function Page() { return null; }');

    const batches: DevFileEvent[][] = [];
    watcher = new ProjectWatcher({
      projectRoot: tempDir,
      debounceMs: 30,
      onChange: (events) => {
        batches.push(events);
      },
    });

    fs.writeFileSync(pagePath, 'export default function Page() { return "changed"; }');

    await waitFor(() => batches.length > 0);

    const [events] = batches;
    expect(events.length).toBeGreaterThanOrEqual(1);
    const pageEvent = events.find((e) => e.relativePath.endsWith('page.tsx'));
    expect(pageEvent).toBeDefined();
    expect(pageEvent!.type).toBe('change');
    expect(pageEvent!.category).toBe('route');
    expect(pageEvent!.fullPath).toBe(pagePath);
  }, 8000);

  it('coalesces multiple rapid writes to the same file into a single batched event', async () => {
    const pagePath = path.join(appDir, 'page.tsx');
    fs.writeFileSync(pagePath, 'v0');

    const batches: DevFileEvent[][] = [];
    watcher = new ProjectWatcher({
      projectRoot: tempDir,
      debounceMs: 100,
      onChange: (events) => {
        batches.push(events);
      },
    });

    fs.writeFileSync(pagePath, 'v1');
    fs.writeFileSync(pagePath, 'v2');
    fs.writeFileSync(pagePath, 'v3');

    // Give the debounce window enough time to flush exactly once.
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(batches.length).toBe(1);
    const pathsInBatch = batches[0].filter((e) => e.relativePath.endsWith('page.tsx'));
    expect(pathsInBatch.length).toBe(1);
  }, 8000);

  it('stops emitting events once close() has been called', async () => {
    const pagePath = path.join(appDir, 'page.tsx');
    fs.writeFileSync(pagePath, 'v0');

    let callCount = 0;
    watcher = new ProjectWatcher({
      projectRoot: tempDir,
      debounceMs: 30,
      onChange: () => {
        callCount++;
      },
    });

    watcher.close();
    fs.writeFileSync(pagePath, 'v1');

    // Wait past the debounce window; no callback should have fired.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(callCount).toBe(0);
  }, 8000);

  it('does not throw when only the project root exists (no app/public subdirectories)', () => {
    const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ranu-dev-watcher-bare-'));
    try {
      expect(() => {
        watcher = new ProjectWatcher({
          projectRoot: bareDir,
          onChange: () => {},
        });
      }).not.toThrow();
      expect(() => watcher!.close()).not.toThrow();
    } finally {
      fs.rmSync(bareDir, { recursive: true, force: true });
    }
  });

  it('filters out ignored paths (e.g. node_modules) before invoking onChange', async () => {
    const nodeModulesDir = path.join(tempDir, 'node_modules', 'some-pkg');
    fs.mkdirSync(nodeModulesDir, { recursive: true });
    const ignoredFile = path.join(nodeModulesDir, 'index.js');
    fs.writeFileSync(ignoredFile, 'v0');

    const pagePath = path.join(appDir, 'page.tsx');
    fs.writeFileSync(pagePath, 'v0');

    const batches: DevFileEvent[][] = [];
    watcher = new ProjectWatcher({
      projectRoot: tempDir,
      debounceMs: 30,
      onChange: (events) => {
        batches.push(events);
      },
    });

    // Modify the ignored file first, then a real route file to confirm the
    // watcher eventually fires — but only for the non-ignored path.
    fs.writeFileSync(ignoredFile, 'v1');
    fs.writeFileSync(pagePath, 'v1');

    await waitFor(() => batches.length > 0);

    const allEvents = batches.flat();
    expect(allEvents.some((e) => e.relativePath.includes('node_modules'))).toBe(false);
    expect(allEvents.some((e) => e.relativePath.endsWith('page.tsx'))).toBe(true);
  }, 8000);
});
