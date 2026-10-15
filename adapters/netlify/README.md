# @ranujs/adapter-netlify

Netlify deployment adapter for Ranu.js.

> **Public Alpha (v0.1.5)**: Official deployment adapter enabling Ranu.js applications on Netlify Functions and Netlify CDN.

## Installation

```bash
npm install -D @ranujs/adapter-netlify
```

## Usage

Configure the adapter in `ranu.config.ts`:

```typescript
import { defineConfig } from '@ranujs/core/config';
import netlifyAdapter from '@ranujs/adapter-netlify';

export default defineConfig({
  deployment: {
    adapter: netlifyAdapter(),
  },
});
```

Build and deploy:

```bash
ranu build
ranu deploy
```

Deploying to Netlify via Netlify CLI:

```bash
npx netlify deploy --prod
```

## License

MIT
