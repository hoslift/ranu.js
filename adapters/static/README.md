# @ranujs/adapter-static

Zero-runtime static deployment adapter for Ranu.js.

> **Public Beta (v0.1.6)**: Deployment adapter compiling static HTML, client asset bundles, and optional SPA fallbacks for hosting on GitHub Pages, Cloudflare Pages, Netlify, AWS S3, or any static HTTP web server.

## Installation

```bash
npm install -D @ranujs/adapter-static
```

## Usage

Configure the adapter in `ranu.config.ts`:

```typescript
import { defineConfig } from '@ranujs/core/config';
import staticAdapter from '@ranujs/adapter-static';

export default defineConfig({
  deployment: {
    adapter: staticAdapter({
      outputDir: 'dist',
      fallback: '200.html', // SPA fallback routing
      nojekyll: true,       // GitHub Pages compatibility
    }),
  },
});
```

Build and export:

```bash
ranu build
ranu deploy
```

The compiled static site will be written to `dist/`, ready for zero-runtime hosting.
