# @ranujs/adapter-deno

Native Deno deployment adapter for Ranu.js.

> **Public Alpha (v0.1.0)**: Native deployment adapter enabling Ranu.js applications on Deno.

## Installation

```bash
npm install @ranujs/adapter-deno
```

## Usage

Configure the adapter in `ranu.config.ts`:

```typescript
import { defineConfig } from '@ranujs/core/config';
import denoAdapter from '@ranujs/adapter-deno';

export default defineConfig({
  deployment: {
    adapter: denoAdapter(),
  },
});
```

Build and deploy:

```bash
ranu build
ranu deploy
```

Run with Deno:

```bash
deno task start
```

## License

MIT
