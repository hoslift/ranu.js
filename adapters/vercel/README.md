# @ranujs/adapter-vercel

Vercel deployment adapter for Ranu.js.

> **Public Alpha (v0.1.5)**: Official Vercel deployment adapter for Ranu.js.

## Installation

```bash
npm install @ranujs/adapter-vercel
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
