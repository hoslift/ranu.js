# @ranujs/adapter-vercel

Vercel deployment adapter for Ranu.js.

> **Public Alpha (v0.1.5)**: Community deployment adapter enabling Ranu.js applications on the Vercel platform.

## Installation

```bash
npm install -D @ranujs/adapter-vercel
# or
pnpm add -D @ranujs/adapter-vercel
yarn add -D @ranujs/adapter-vercel
```

## Usage

Configure the adapter in `ranu.config.ts`:

```typescript
import { defineConfig } from '@ranujs/core/config';
import vercelAdapter from '@ranujs/adapter-vercel';

export default defineConfig({
  deployment: {
    adapter: vercelAdapter(),
  },
});
```

Build and deploy:

```bash
ranu build
ranu deploy
```

## License

MIT
