# @ranujs/adapter-node

Node.js standalone production deployment adapter for Ranu.js.

> **Public Alpha (v0.1.0)**: Official deployment adapter enabling standalone long-lived Node.js servers with backpressure-aware streaming, graceful shutdown handling, and Docker container recipes.

## Installation

```bash
npm install -D @ranujs/adapter-node
```

## Usage

Configure the adapter in `ranu.config.ts`:

```typescript
import { defineConfig } from '@ranujs/core/config';
import nodeAdapter from '@ranujs/adapter-node';

export default defineConfig({
  deployment: {
    adapter: nodeAdapter({
      port: 3000,
      host: '0.0.0.0',
      shutdownTimeout: 5000,
    }),
  },
});
```

Build and adapt:

```bash
ranu build
ranu deploy
```

Run the standalone production server:

```bash
node dist/server.mjs
```

Or run via Docker:

```bash
docker build -t my-app .
docker run -p 3000:3000 my-app
```

## License

MIT
