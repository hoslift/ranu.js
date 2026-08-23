import { describe, it, expect } from 'vitest';
import {
  categorizeChangedFile,
  shouldIgnoreFile,
} from '../src/watcher.js';

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
