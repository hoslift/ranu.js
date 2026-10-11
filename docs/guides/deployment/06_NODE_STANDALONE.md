# Standalone Node.js Daemon & Custom Server Integration

**Ranu.js** provides an enterprise-grade standalone runtime host (`@ranu/runtime-node`) powered by native `node:http` and `node:http2` modules. While serverless environments spin up ephemeral compute instances on demand, deploying Ranu.js as a **persistent standalone daemon** allows developers to maintain long-lived database connection pools, eliminate cold starts entirely, utilize local in-memory caches, and integrate directly with custom Node.js frameworks such as Express and Fastify.

This runbook covers the persistent daemon architecture, V8 heap memory tuning, garbage collection stall mitigation, buffer slab retention traps, libuv threadpool optimization, reverse proxy setups (Nginx & Caddy), multi-core cluster supervisors, and deterministic graceful shutdown protocols.

---

## 1. Persistent Daemon Host Architecture

In a persistent standalone deployment, Ranu.js runs as a long-lived process managed by an operating system supervisor (such as systemd, Docker, Kubernetes, or PM2):

```
┌────────────────────────────────────────────────────────────────────────┐
│                    Operating System / Linux Host                       │
│                                                                        │
│  ┌───────────────────────┐          ┌───────────────────────────────┐  │
│  │     Reverse Proxy     │          │    Multi-Core Node Daemon     │  │
│  │   (Nginx or Caddy)    │          │                               │  │
│  │                       │  HTTP/1  │   ┌────────────────────────┐  │  │
│  │  Terminates TLS 1.3   │ ───────► │   │ Primary Process        │  │  │
│  │  Bypasses Asset Cache │          │   │ (Cluster Supervisor)   │  │  │
│  │  Buffers Ingress TCP  │          │   └──────────┬─────────────┘  │  │
│  └───────────────────────┘                         │ IPC            │  │
│                                           ┌────────┴────────┐       │  │
│                                           ▼                 ▼       │  │
│                                      Worker #1         Worker #2    │  │
│                                    (@ranu/runtime)   (@ranu/runtime)│  │
│                                      Pool: 20 conns    Pool: 20 conns│ │
└────────────────────────────────────────────────────────────────────────┘
```

### Serverless vs. Persistent Daemon Mental Model

| Dimension                 | Serverless MicroVM (Vercel / AWS Lambda)         | Persistent Daemon Host (`@ranu/runtime-node`)         |
| :------------------------ | :----------------------------------------------- | :---------------------------------------------------- |
| **Process Lifetime**      | Ephemeral (milliseconds to minutes)              | Continuous (days, weeks, months)                      |
| **Cold Starts**           | 150ms – 2,000ms on scaling spikes                | **0ms** (server remains warm indefinitely)            |
| **Connection Pooling**    | Must use connection pooler (PgBouncer); `max: 1` | Direct relational pooling (`max: 20` per worker)      |
| **Memory Leak Impact**    | Low (container destroyed after few requests)     | **Critical** (small leaks accumulate and trigger OOM) |
| **V8 Garbage Collection** | Short-lived generation; rarely triggers full GC  | Heavy Old Space accumulation; full GC stalls possible |
| **In-Memory State**       | Discarded between invocations                    | Preserved across millions of HTTP requests            |

---

## 2. Memory Management, V8 Heap & GC Stalls

In long-lived Node.js daemons, unmonitored heap expansion and un-tuned V8 garbage collection can severely degrade request throughput and introduce unacceptable P99 latency spikes.

### 2.1 V8 Heap Ceilings & Tuning

By default, 64-bit Node.js runtimes configure an Old Space heap limit of approximately ~1.4 GB to ~4 GB depending on available host memory. When your daemon approaches this limit, V8 executes emergency synchronous Mark-Sweep-Compact garbage collection cycles.

During a full Mark-Sweep-Compact cycle, the single-threaded JavaScript event loop is **completely paused for 100ms to 800ms**. All in-flight HTTP requests and streaming SSR chunks are frozen during this stall.

**Production Tuning Flag:** Configure `--max-old-space-size` to match 75% of your container or host RAM allocation, leaving 25% for the operating system, C++ bindings, and libuv buffers:

```bash
# Example for a 4 GB RAM container (reserve 1 GB for OS / C++ buffers)
node --max-old-space-size=3072 server.mjs
```

### 2.2 Daemon Memory Leak Vectors & Defenses

Because the daemon process survives indefinitely, memory leaks that go unnoticed in serverless functions will crash production servers over time:

1. **Unbounded Cache Maps:** Storing session tokens, API responses, or route data in global `Map` or `Set` instances without an eviction strategy.
   - _Defense:_ Always use bounded LRU caches (such as `lru-cache`) with strict maximum size thresholds (`max: 1000`) and TTL expiration.
2. **Lingering Event Emitters:** Attaching event listeners inside request handlers without removing them upon response completion:
   ```typescript
   // ❌ MEMORY LEAK: Listener retains req and res closures indefinitely
   globalEmitter.on('metric', () => res.write(data));

   // ✅ SAFE: Listener explicitly cleaned up in finally block
   const onMetric = () => res.write(data);
   globalEmitter.on('metric', onMetric);
   res.on('close', () => globalEmitter.off('metric', onMetric));
   ```
3. **Closure Scope Retention:** Keeping references to large request bodies inside long-lived promises or async queues.

### 2.3 The Buffer Slab Retention Trap

Node.js manages allocations smaller than 8 KB (`Buffer.poolSize = 8192`) using an internal shared pre-allocated memory slab:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   Internal 8 KB Buffer Pool (Slab)                     │
│                                                                        │
│  ┌───────────────┐ ┌────────────────────────────────────────────────┐  │
│  │ 16-Byte Chunk │ │           8,176 Unused Allocated Bytes         │  │
│  │ (Retained)    │ │           (PINNED IN MEMORY - CANNOT FREE)     │  │
│  └───────────────┘ └────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

If your handler extracts a small 16-byte slice from a request body and stores it inside a persistent cache:

```typescript
// ❌ SLAB TRAP: Retaining this 16-byte slice prevents the entire 8KB slab from being GC'd!
const token = requestBuffer.subarray(0, 16);
longLivedSessionCache.set(userId, token);
```

**The Mitigation:** Clone the buffer slice when storing it beyond the request lifecycle:

```typescript
// ✅ SAFE: Buffer.from() creates an independent allocation, releasing the 8KB slab
const token = Buffer.from(requestBuffer.subarray(0, 16));
longLivedSessionCache.set(userId, token);
```

---

## 3. Libuv Threadpool Starvation & Asynchronous I/O

While network I/O in Node.js uses non-blocking kernel event notifications (`epoll` on Linux, `kqueue` on macOS), several fundamental operations execute synchronously on the internal **libuv threadpool**:

- Local filesystem access (`node:fs`)
- Cryptographic calculations (`node:crypto`)
- Compression and decompression (`node:zlib`, gzip, brotli)
- **Hostname DNS Resolution (`dns.lookup`)**

### 3.1 The Starvation Bottleneck

The default libuv threadpool size is only **4 threads** (`UV_THREADPOOL_SIZE = 4`).

If an application is concurrently compressing 4 streaming SSR responses with gzip, **all 4 libuv threads are fully saturated**. If any route handler simultaneously attempts to resolve an external API hostname (e.g., `fetch('https://api.stripe.com')`), the DNS lookup is blocked waiting for a free threadpool slot, stalling the request for hundreds of milliseconds.

### 3.2 Mitigation Strategies

1. **Expand the Threadpool Size:** Always set `UV_THREADPOOL_SIZE=64` in your production process environment before starting Node.js:
   ```bash
   export UV_THREADPOOL_SIZE=64
   node server.mjs
   ```
2. **Utilize Non-Blocking DNS Resolution:** When configuring database or HTTP clients, use IP addresses or configure non-blocking DNS resolution (`dns.promises.resolve4`) rather than relying on libc's blocking `getaddrinfo()` via `dns.lookup()`.

---

## 4. Reverse Proxy Configuration

Production Node.js daemons should always sit behind a hardened reverse proxy (such as Nginx or Caddy) to handle TLS termination, request rate limiting, and static asset offloading.

### 4.1 Configuring `trustProxy` in Ranu.js

When behind a reverse proxy, the client's direct socket IP is `127.0.0.1`. Enable `trustProxy: true` in `ranu.config.ts` so that `@ranu/runtime-node` reads the `X-Forwarded-For`, `X-Forwarded-Proto`, and `X-Forwarded-Host` headers to construct the accurate W3C `Request.url`:

```typescript
// ranu.config.ts
import { defineConfig } from '@ranujs/core/config';

export default defineConfig({
  server: {
    trustProxy: true,
    port: 3000,
    host: '127.0.0.1',
  },
});
```

### 4.2 Production Nginx Configuration

```nginx
# /etc/nginx/sites-available/ranu-app.conf
upstream ranu_cluster {
    server 127.0.0.1:3000 max_fails=3 fail_timeout=10s;
    keepalive 64; # Maintain persistent connection pool to Node.js
}

server {
    listen 443 ssl http2;
    server_name example.com;

    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # 1. Directly serve immutable static assets from filesystem
    location /_ranu/assets/ {
        alias /var/www/my-app/.ranu/build/client/;
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

        # Mandatory for streaming SSR: Disable proxy buffering!
        proxy_buffering off;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;

        # WebSocket & Connection headers
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Forward original client headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

> [!NOTE]
> Setting `proxy_buffering off;` is critical for streaming SSR. If proxy buffering is left enabled, Nginx buffers the initial HTML layout shell until several kilobytes are received, negating React 19's sub-10ms TTFB streaming advantages.

### 4.3 Production Caddy Configuration

```caddyfile
# Caddyfile
example.com {
    encode zstd gzip

    # Serve static assets directly from disk
    handle /_ranu/assets/* {
        root * /var/www/my-app/.ranu/build/client
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

## 5. Custom Framework Integration Recipes

Ranu.js applications can be mounted cleanly into existing Express or Fastify enterprise services via `@ranu/runtime-node`.

### 5.1 Express Integration

Use `createNodeRequestHandler` to bridge Node's `(req, res)` into Ranu's W3C request pipeline:

```typescript
// server.ts
import express from 'express';
import path from 'node:path';
import { createProductionRuntime, createNodeRequestHandler } from '@ranu/runtime-node';

async function bootstrap() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  // 1. Initialize Ranu production runtime
  const buildDir = path.resolve(process.cwd(), '.ranu/build');
  const runtime = await createProductionRuntime({ buildDir });
  const ranuHandler = createNodeRequestHandler(runtime);

  // 2. Custom Express middleware (e.g. enterprise auth, metrics)
  app.use('/metrics', (req, res) => {
    res.json({ status: 'healthy', timestamp: Date.now() });
  });

  // 3. Mount Ranu.js as the primary full-stack handler
  app.use((req, res, next) => {
    ranuHandler(req, res).catch(next);
  });

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Express + Ranu.js daemon running at http://0.0.0.0:${port}`);
  });

  return server;
}

bootstrap();
```

### 5.2 Fastify Integration

Fastify provides high throughput and low overhead:

```typescript
// server.ts
import Fastify from 'fastify';
import path from 'node:path';
import { createProductionRuntime, createNodeRequestHandler } from '@ranu/runtime-node';

async function bootstrap() {
  const fastify = Fastify({ logger: true });
  const port = Number(process.env.PORT) || 3000;

  const buildDir = path.resolve(process.cwd(), '.ranu/build');
  const runtime = await createProductionRuntime({ buildDir });
  const ranuHandler = createNodeRequestHandler(runtime);

  // Health check endpoint
  fastify.get('/health', async () => ({ status: 'ok' }));

  // Route all other requests to Ranu.js
  fastify.all('/*', (request, reply) => {
    // Delegate using raw Node IncomingMessage and ServerResponse
    return ranuHandler(request.raw, reply.raw);
  });

  await fastify.listen({ port, host: '0.0.0.0' });
}

bootstrap();
```

### 5.3 Dual-Stream Backpressure in `@ranu/runtime-node`

When streaming data to slow clients, `@ranu/runtime-node`'s `writeWebResponse` utility automatically checks whether the OS kernel socket buffer is full:

```typescript
// Inside @ranu/runtime-node/src/response.ts
const reader = response.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const ok = res.write(value);
  if (!ok) {
    // Socket buffer saturated: pause stream reading until 'drain' event fires!
    await new Promise((resolve) => res.once('drain', resolve));
  }
}
res.end();
```

This prevents unconstrained memory buffering inside Node.js when clients download large streaming responses slowly.

---

## 6. Multi-Core Cluster Supervisor

Because Node.js executes JavaScript on a single thread, deploying to multi-core production servers requires spawning worker processes across all available CPU cores.

### 6.1 Native `node:cluster` Implementation

```typescript
// cluster.mjs
import cluster from 'node:cluster';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const numCPUs = os.cpus().length;

if (cluster.isPrimary) {
  console.log(`[Supervisor] Primary process ${process.pid} is running`);
  console.log(`[Supervisor] Forking ${numCPUs} worker processes...`);

  // Fork worker per CPU core
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  // Handle worker termination and automatic respawning
  cluster.on('exit', (worker, code, signal) => {
    console.warn(`[Supervisor] Worker ${worker.process.pid} died (code: ${code}, signal: ${signal}). Respawning...`);
    cluster.fork();
  });

  // Forward termination signals to all workers
  const forwardSignal = (signal) => {
    for (const id in cluster.workers) {
      cluster.workers[id]?.process.kill(signal);
    }
  };

  process.on('SIGTERM', () => forwardSignal('SIGTERM'));
  process.on('SIGINT', () => forwardSignal('SIGINT'));
} else {
  // Worker process imports and runs the Ranu standalone server
  await import('./server.mjs');
  console.log(`[Worker] Started worker process ${process.pid}`);
}
```

### 6.2 Production PM2 Cluster Configuration

PM2 manages multi-core clustering, process monitoring, log rotation, and zero-downtime rolling reloads:

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
      // Allow Ranu's 5-second graceful shutdown drain to complete cleanly
      kill_timeout: 7000,
      listen_timeout: 8000,
      autorestart: true,
      max_restarts: 10,
    },
  ],
};
```

Commands:

```bash
# Start cluster
pm2 start ecosystem.config.cjs

# Zero-downtime rolling reload (reloads workers sequentially)
pm2 reload all

# View real-time memory and CPU metrics
pm2 monit
```

---

## 7. Deterministic Graceful `SIGTERM` Shutdown Protocol

When Kubernetes, Docker, or systemd stops or replaces a container during rolling deployments, it transmits a `SIGTERM` signal. Ranu.js implements a deterministic 4-step teardown to ensure zero dropped requests.

```
Incoming SIGTERM
       │
       ▼
[Step 1: Stop Ingress] ────────► server.close() (Stop accepting new connections)
       │
       ▼
[Step 2: Close Idle Sockets] ──► server.closeIdleConnections() (Terminate keep-alives)
       │
       ▼
[Step 3: Drain In-Flight] ─────► Wait for active responses to flush (bounded 5000ms timer)
       │
       ▼
[Step 4: Close Upstreams] ────► await dbPool.end(); await redis.quit();
       │
       ▼
Exit Process (code: 0)
```

### 7.1 Custom Server Implementation

```typescript
// server.mjs
import http from 'node:http';
import { createProductionRuntime, createNodeRequestHandler } from '@ranu/runtime-node';

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5000;

const runtime = await createProductionRuntime();
const handler = createNodeRequestHandler(runtime);
const server = http.createServer((req, res) => handler(req, res));

// Track active sockets
const activeSockets = new Set();
server.on('connection', (socket) => {
  activeSockets.add(socket);
  socket.on('close', () => activeSockets.delete(socket));
});

server.listen(3000, '0.0.0.0');

let isShuttingDown = false;

async function handleShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[Shutdown] Received ${signal}. Initiating graceful draining...`);

  // Forceful exit timer in case requests fail to drain
  const forceTimer = setTimeout(() => {
    console.error(
      `[Shutdown] Bounded timeout (${DEFAULT_SHUTDOWN_TIMEOUT_MS}ms) expired. Forcefully destroying ${activeSockets.size} open sockets.`,
    );
    for (const socket of activeSockets) {
      socket.destroy();
    }
    process.exit(1);
  }, DEFAULT_SHUTDOWN_TIMEOUT_MS);
  forceTimer.unref();

  // Step 1: Stop accepting new TCP connections
  server.close(async () => {
    console.log('[Shutdown] HTTP ingress closed.');

    // Step 4: Close database pools and external connections
    try {
      // await db.end();
      console.log('[Shutdown] Database connection pool closed.');
    } catch (err) {
      console.error('[Shutdown] Error closing database pool:', err);
    }

    clearTimeout(forceTimer);
    process.exit(0);
  });

  // Step 2: Immediately destroy idle keep-alive sockets
  if (typeof server.closeIdleConnections === 'function') {
    server.closeIdleConnections();
  }
}

process.once('SIGTERM', () => handleShutdown('SIGTERM'));
process.once('SIGINT', () => handleShutdown('SIGINT'));
```

---

## 8. Verification & Operational Observability

Ensure your persistent daemon is production-ready using this verification checklist:

| Verification Target            | Test Method                                                          | Expected Result                                                          |
| :----------------------------- | :------------------------------------------------------------------- | :----------------------------------------------------------------------- |
| **Streaming SSR Backpressure** | `curl -N -H "Accept: text/html" http://127.0.0.1:3000/dashboard`     | Layout shell arrives in <10ms; chunks stream without buffering           |
| **Trust Proxy Verification**   | Inspect `request.url` and client IP behind Nginx                     | Protocol is `https://` and client IP matches public client address       |
| **Threadpool Sizing**          | Inspect `process.env.UV_THREADPOOL_SIZE` in running process          | Configured to `64`; DNS lookups do not stall under concurrent load       |
| **Graceful SIGTERM Drain**     | Trigger `kill -SIGTERM <pid>` while running a long streaming request | Current stream completes cleanly; new connections receive `ECONNREFUSED` |
| **Zero Memory Leak Leakage**   | Run Apache Bench (`ab -n 10000 -c 50 http://127.0.0.1:3000/`)        | V8 heap returns to baseline after GC; no unbounded heap creep            |
| **Cluster Respawn**            | Trigger `kill -9 <worker-pid>` on child worker                       | Supervisor detects worker death and immediately spawns a replacement     |
