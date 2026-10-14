# Deploying as a Standalone Node.js Daemon

**Ranu.js** provides a high-performance standalone server host powered by native `node:http` and `node:http2`. While serverless environments spin up ephemeral compute instances on demand, deploying Ranu.js as a **persistent standalone daemon** allows developers to maintain long-lived relational database connection pools, eliminate cold starts entirely (0ms latency), leverage local in-memory caches, and utilize all available CPU cores via clustering.

This guide covers the persistent daemon architecture, V8 heap memory tuning, reverse proxy configurations (Nginx and Caddy), multi-core cluster management with PM2, Docker containerization, and graceful shutdown handling.

---

## 1. Overview & Platform Prerequisites

### Platform Overview & Execution Model

In a persistent standalone deployment, Ranu.js runs as a long-lived process managed by an operating system supervisor (such as systemd, Docker, Kubernetes, or PM2):

- **0ms Cold Starts:** The server process remains permanently loaded in memory, eliminating cold start delays.
- **Persistent Connection Pooling:** Maintains long-lived TCP connection pools directly to PostgreSQL, MySQL, Redis, or Kafka without needing an external connection pooler.
- **In-Memory Caching:** Preserves bounded in-memory LRU caches across millions of incoming requests.
- **Multi-Core Scaling:** Scales across all host CPU cores using cluster supervisors or multiple container replicas.

### Serverless vs. Persistent Daemon Mental Model

| Dimension                 | Serverless MicroVM (Vercel / AWS Lambda)              | Persistent Daemon Host (Node.js 22 LTS)                   |
| :------------------------ | :---------------------------------------------------- | :-------------------------------------------------------- |
| **Process Lifetime**      | Ephemeral (milliseconds to minutes)                   | Continuous (days, weeks, months)                          |
| **Cold Starts**           | 150ms – 2,000ms on scaling bursts                     | **0ms** (server remains warm permanently)                 |
| **Connection Pooling**    | Requires connection pooler (e.g. PgBouncer); `max: 1` | Direct relational pooling (`max: 20` per worker instance) |
| **Memory Leak Impact**    | Low (container recycled frequently)                   | **Critical** (small leaks accumulate and trigger OOM)     |
| **V8 Garbage Collection** | Short-lived; rarely triggers full GC                  | Continuous heap allocation; requires proper heap sizing   |
| **In-Memory State**       | Discarded between invocations                         | Preserved across requests                                 |

### Host Prerequisites & Developer Tools

- A **Linux Host** (Ubuntu 22.04/24.04 LTS, Debian 12, or Alpine Linux) or container environment.
- **Node.js 22 LTS** installed.
- A **Reverse Proxy** (Nginx or Caddy) to handle TLS termination, request rate limiting, and direct static asset serving.
- A **Process Manager** (PM2, Docker, or systemd) to monitor processes and handle automatic restarts.

---

## 2. Package Installation

Install `@ranujs/core` and React 19 in your application directory:

### Using pnpm

```bash
# Runtime dependencies
pnpm add @ranujs/core react react-dom

# Development dependencies
pnpm add -D typescript @types/node @types/react @types/react-dom
```

### Using npm

```bash
# Runtime dependencies
npm install @ranujs/core react react-dom

# Development dependencies
npm install -D typescript @types/node @types/react @types/react-dom
```

### Using yarn

```bash
# Runtime dependencies
yarn add @ranujs/core react react-dom

# Development dependencies
yarn add -D typescript @types/node @types/react @types/react-dom
```

---

## 3. Configuration in `ranu.config.ts`

Configure host bindings and proxy trust in `ranu.config.ts`:

```typescript
// ranu.config.ts
import { defineConfig } from '@ranujs/core/config';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000,
    trustProxy: true, // Reads X-Forwarded-* headers from reverse proxy
  },
  build: {
    sourceMaps: false,
    minify: true,
  },
});
```

### Configuration Options Reference

| Option              | Type      | Default     | Description                                                                                                                 |
| :------------------ | :-------- | :---------- | :-------------------------------------------------------------------------------------------------------------------------- |
| `server.host`       | `string`  | `'0.0.0.0'` | Host address to bind the HTTP server to. Use `'127.0.0.1'` when behind a local reverse proxy.                               |
| `server.port`       | `number`  | `3000`      | Port number for the HTTP server to listen on.                                                                               |
| `server.trustProxy` | `boolean` | `false`     | When `true`, parses `X-Forwarded-For`, `X-Forwarded-Proto`, and `X-Forwarded-Host` to construct accurate W3C `Request.url`. |
| `build.sourceMaps`  | `boolean` | `false`     | Emits source maps for production debugging when enabled.                                                                    |
| `build.minify`      | `boolean` | `true`      | Minifies client and server JavaScript bundles for production efficiency.                                                    |

### Production Node Runtime Tuning

Before starting Node.js in production, configure these two essential environment settings:

1. **Expand libuv Threadpool Size (`UV_THREADPOOL_SIZE=64`):** Node.js executes DNS lookups (`dns.lookup`), cryptographic operations (`node:crypto`), compression (`zlib`), and filesystem I/O on an internal libuv threadpool. The default is only 4 threads. Setting `UV_THREADPOOL_SIZE=64` prevents DNS lookups and compression from stalling under concurrent load.
2. **Tune V8 Heap Allocation (`--max-old-space-size`):** Allocate approximately 75% of available container/host RAM to Node.js, leaving the remainder for the OS and native buffers. For a 4 GB RAM host:
   ```bash
   node --max-old-space-size=3072 ./node_modules/.bin/ranu start
   ```

---

## 4. Build & Local Preview Commands

### Step 1: Compile Application Build

Compile your application source code into production artifacts:

```bash
pnpm ranu build
```

This compiles client and server graphs into `.ranu/build/`:

- `.ranu/build/static/assets/`: Hashed immutable client JavaScript and CSS bundles.
- `.ranu/build/static/pages/`: Pre-rendered static HTML pages.
- `.ranu/build/server/`: Compiled server route bundles and SSR runtime.

### Step 2: Start the Production Server

Launch the built application using Ranu's built-in production server:

```bash
# Start server on default port 3000
pnpm ranu start

# Or customize host and port via CLI arguments
npx ranu start --port 3000 --host 0.0.0.0
```

Verify that the application starts cleanly and serves pages with sub-10ms TTFB at `http://localhost:3000`.

---

## 5. Deployment Commands & CLI Workflows

### Option A: Multi-Stage Dockerfile Containerization

Create a lightweight, multi-stage `Dockerfile` based on Alpine Linux:

```dockerfile
# Dockerfile
FROM node:22-alpine AS builder
WORKDIR /app

# Enable Corepack and install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Cache dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and compile production build
COPY . .
ENV NODE_ENV=production
RUN pnpm ranu build

# Production Runner Stage
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV UV_THREADPOOL_SIZE=64

# Run as non-root unprivileged user for security
USER node

# Copy compiled artifacts and production dependencies
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.ranu/build ./.ranu/build
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["npx", "ranu", "start"]
```

Build and run the container:

```bash
# Build Docker image
docker build -t my-ranu-app:latest .

# Run container with resource limits and port mapping
docker run -d \
  --name my-ranu-app \
  --restart unless-stopped \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:pass@db:5432/production" \
  --memory="2g" \
  --cpus="2" \
  my-ranu-app:latest
```

---

### Option B: PM2 Multi-Core Cluster Supervisor

PM2 runs your application across all available CPU cores, automatically restarts crashed workers, and supports zero-downtime rolling reloads:

Create `ecosystem.config.cjs` in your project root:

```javascript
// ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'ranu-production-daemon',
      script: './node_modules/.bin/ranu',
      args: 'start',
      instances: 'max', // Scale to all available CPU cores
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOST: '127.0.0.1',
        UV_THREADPOOL_SIZE: '64',
      },
      node_args: '--max-old-space-size=3072',
      max_memory_restart: '3200M',
      kill_timeout: 7000, // Allow 5-second graceful shutdown drain
      listen_timeout: 8000,
      autorestart: true,
      max_restarts: 10,
    },
  ],
};
```

Control the PM2 cluster:

```bash
# Start the cluster
pm2 start ecosystem.config.cjs

# Perform zero-downtime rolling reload
pm2 reload all

# Monitor live CPU and memory metrics
pm2 monit
```

---

### Option C: Reverse Proxy Configuration (Nginx & Caddy)

Place a reverse proxy in front of the Ranu.js daemon to terminate TLS, serve static assets directly from disk, and forward dynamic traffic.

#### 1. Nginx Configuration

Notice the static asset path points directly to `.ranu/build/static/assets/`:

```nginx
# /etc/nginx/sites-available/ranu-app.conf
upstream ranu_cluster {
    server 127.0.0.1:3000 max_fails=3 fail_timeout=10s;
    keepalive 64;
}

server {
    listen 443 ssl http2;
    server_name example.com;

    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # 1. Directly serve hashed client assets from disk with 1-year cache
    location /_ranu/assets/ {
        alias /var/www/my-app/.ranu/build/static/assets/;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
        access_log off;
    }

    # 2. Directly serve pre-rendered public assets
    location /public/ {
        alias /var/www/my-app/public/;
        expires 7d;
        add_header Cache-Control "public, max-age=604800";
    }

    # 3. Forward dynamic SSR and API requests to Ranu.js daemon
    location / {
        proxy_pass http://ranu_cluster;
        proxy_http_version 1.1;

        # Mandatory for React 19 streaming SSR: Disable proxy buffering!
        proxy_buffering off;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;

        # WebSocket & connection headers
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Forward client identity
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

> **Critical Nginx Note:** `proxy_buffering off;` is essential for React 19 streaming SSR. If buffering remains enabled, Nginx blocks the initial HTML layout shell until several kilobytes accumulate, negating sub-10ms streaming benefits.

#### 2. Caddy Configuration

```caddyfile
# /etc/caddy/Caddyfile
example.com {
    encode zstd gzip

    # Serve static assets directly from disk
    handle /_ranu/assets/* {
        root * /var/www/my-app/.ranu/build/static/assets
        header Cache-Control "public, max-age=31536000, immutable"
        file_server
    }

    # Proxy dynamic requests to Ranu daemon with streaming enabled
    handle {
        reverse_proxy 127.0.0.1:3000 {
            header_up Host {host}
            header_up X-Real-IP {remote_host}
            header_up X-Forwarded-Proto {scheme}

            # Disable response buffering for streaming SSR
            flush_interval -1
        }
    }
}
```

---

### Automated CI/CD Pipeline (GitHub Actions)

Deploy Docker containers to your production host via SSH:

```yaml
# .github/workflows/deploy-node.yml
name: Build & Deploy Container

on:
  push:
    branches:
      - main

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ghcr.io/${{ github.repository }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Deploy to Production Server via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SERVER_SSH_KEY }}
          script: |
            docker pull ghcr.io/${{ github.repository }}:latest
            docker stop my-ranu-app || true
            docker rm my-ranu-app || true
            docker run -d \
              --name my-ranu-app \
              --restart unless-stopped \
              -p 3000:3000 \
              --env-file /etc/ranu/.env.production \
              ghcr.io/${{ github.repository }}:latest
```

---

## 6. Environment Variables & Secret Management

### Public vs. Server Secrets in Ranu.js

- **Public Variables (`RANU_PUBLIC_*`):** Embedded into client browser bundles during `ranu build` (e.g. `RANU_PUBLIC_API_URL`).
- **Server-Only Secrets:** Any variable without this prefix (e.g. `DATABASE_URL`, `JWT_SECRET`) remains accessible only on the Node server and is never sent to the browser.

### Managing Secrets in Standalone Environments

1. **Production `.env.production` File:** Store sensitive credentials in a secured `.env.production` file on your server (permissions `chmod 600 .env.production`):
   ```env
   NODE_ENV=production
   PORT=3000
   HOST=127.0.0.1
   DATABASE_URL="postgresql://user:password@localhost:5432/my_database"
   AUTH_SECRET="your-secure-random-32-byte-key"
   ```
2. **Relational Connection Pooling:** In a persistent Node.js daemon, you can configure larger connection pool sizes (e.g. `max: 20` per instance) because connections are reused indefinitely:
   ```typescript
   // lib/db.ts
   import { Pool } from 'pg';

   const pool = new Pool({
     connectionString: process.env.DATABASE_URL,
     max: 20, // Persistent daemon allows high-performance shared pooling
     idleTimeoutMillis: 30000,
   });

   export default pool;
   ```

---

## 7. Production Hosting Setup & Verification Checklist

### Deployment Setup Summary

- **Host Firewall:** Allow inbound traffic on ports `80` (HTTP) and `443` (HTTPS). Block direct external access to internal port `3000`.
- **System Service or Container:** Ensure your Docker container or PM2 daemon is configured with auto-restart (`restart: unless-stopped` or `pm2 startup`).

### Production Health & Verification Checklist

| Verification Target            | Test Method                                               | Expected Result                                                                                                              |
| :----------------------------- | :-------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------- |
| **Streaming SSR Backpressure** | `curl -i -N http://127.0.0.1:3000/`                       | Response headers contain `Transfer-Encoding: chunked`. Initial HTML shell returns in <10ms; chunks stream without buffering. |
| **Trust Proxy Verification**   | Inspect `request.url` behind Nginx                        | Protocol is `https://` and client IP matches public client address rather than `127.0.0.1`.                                  |
| **Threadpool Sizing**          | Check `process.env.UV_THREADPOOL_SIZE` in running process | Configured to `64`; DNS lookups and crypto do not stall under concurrent load.                                               |
| **Graceful SIGTERM Drain**     | Trigger `kill -SIGTERM <pid>` during an active request    | In-flight requests complete cleanly; subsequent connections receive `ECONNREFUSED`.                                          |
| **Zero Memory Leak Creep**     | Run load test (`ab -n 5000 -c 50 http://127.0.0.1:3000/`) | V8 heap returns to baseline after GC; no unbounded heap creep.                                                               |
| **Cluster Respawn**            | Execute `kill -9 <child-worker-pid>`                      | Supervisor detects worker termination and spawns an immediate replacement within <500ms.                                     |
| **Secret Isolation**           | Inspect client bundles in browser devtools                | Zero private server secrets or database passwords present in client JavaScript assets.                                       |
