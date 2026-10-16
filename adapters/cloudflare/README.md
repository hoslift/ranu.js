# @ranujs/adapter-cloudflare

Cloudflare Pages and Workers deployment adapter for Ranu.js.

> **Public Alpha (v0.1.0)**: Official deployment adapter enabling Ranu.js applications on Cloudflare Workers and Cloudflare Pages.

## Installation

```bash
npm install -D @ranujs/adapter-cloudflare
```

## Usage

Configure the adapter in `ranu.config.ts`:

```typescript
import { defineConfig } from '@ranujs/core/config';
import cloudflareAdapter from '@ranujs/adapter-cloudflare';

export default defineConfig({
  deployment: {
    adapter: cloudflareAdapter({
      compatibilityDate: '2026-10-01',
      compatibilityFlags: ['nodejs_compat'],
    }),
  },
});
```

Build and deploy:

```bash
ranu build
ranu deploy
```

Deploying to Cloudflare Pages or Workers with Wrangler:

```bash
npx wrangler pages deploy .cloudflare
```

## License

MIT
