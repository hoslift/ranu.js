# @ranujs/adapter-bun

Native Bun deployment adapter for Ranu.js.

> **Public Alpha (v0.1.5)**: Native deployment adapter enabling Ranu.js applications on Bun.

## Installation

```bash
npm install @ranujs/adapter-bun
```

## Usage

Configure the adapter in `ranu.config.ts`:

```typescript
import { defineConfig } from '@ranujs/core/config';
import bunAdapter from '@ranujs/adapter-bun';

export default defineConfig({
  deployment: {
    adapter: bunAdapter(),
  },
});
```

Build and deploy:

```bash
ranu build
ranu deploy
```

Run with Bun:

```bash
bun run dist/server.mjs
```

## License

MIT
