# Deploying with Node.js & Process Managers

**Ranu.js** includes a high-performance HTTP production server (`@ranujs/core/server` & `@ranu/runtime-node`) designed to run on any standard Node.js (version 22+) runtime environment.

This runbook covers compiling production artifacts, configuring server bindings, setting up reverse proxies, and deploying with process managers like PM2 and systemd.

---

## 1. Production Build & Startup Workflow

Running a Ranu.js application in production requires two distinct phases:

### Step A: Build Optimized Artifacts
Compile client assets, server route handlers, SSR renderers, and static pages into `.ranu/build/`:

```bash
pnpm ranu build --clean
```

The build process emits:
- `.ranu/build/server/entry.mjs`: Server execution entrypoint.
- `.ranu/build/client/`: Minified client bundles, CSS, and chunks.
- `.ranu/build/build.json`: Build metadata manifest.

### Step B: Launch Production Server
Start the production runtime server using `ranu start`:

```bash
pnpm ranu start
```

By default, the server binds to `0.0.0.0:3000`.

---

## 2. Environment Variables & Network Configuration

Configure network bindings and execution modes using environment variables or command-line flags:

```bash
# Network Configuration
PORT=8080
HOST=0.0.0.0
NODE_ENV=production
```

You can also pass CLI arguments directly to `ranu start`:

```bash
pnpm ranu start --port 8080 --host 0.0.0.0
```

### Precedence Hierarchy:
1. CLI flags (`--port`, `--host`)
2. Environment variables (`PORT`, `HOST`)
3. `ranu.config.ts` (`server.port`, `server.host`)
4. Framework defaults (`0.0.0.0:3000`)

---

## 3. Reverse Proxy & Trust Proxy Setup

When running Ranu.js behind a reverse proxy (e.g., Nginx, Caddy, AWS ALB, Cloudflare), enable `trustProxy` in `ranu.config.ts` so request IP addresses and protocol schemes (`x-forwarded-for`, `x-forwarded-proto`) are parsed correctly:

```typescript
// ranu.config.ts
import { defineConfig } from '@ranujs/core/config';

export default defineConfig({
  server: {
    trustProxy: true,
  },
});
```

### Sample Nginx Configuration

```nginx
server {
    listen 80;
    server_name example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 4. Graceful Shutdown & Connection Draining

The Ranu.js production runtime intercepts termination signals (`SIGINT`, `SIGTERM`) automatically.

When a termination signal is received:
1. The server stops accepting new incoming HTTP connections.
2. Existing active requests are given up to **5,000 milliseconds** (`DEFAULT_SHUTDOWN_TIMEOUT_MS`) to finish cleanly.
3. Open keep-alive sockets are destroyed gracefully once requests complete.
4. The process exits with code `0`.

---

## 5. Production Process Management with PM2

**PM2** is a battle-tested production process manager for Node.js that enables zero-downtime reloads and multi-core clustering.

### Step A: Install PM2

```bash
pnpm add -g pm2
```

### Step B: Create `ecosystem.config.js`

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'ranu-production-app',
      script: 'node_modules/.bin/ranu',
      args: 'start',
      instances: 'max', // Scale to all available CPU cores
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      max_memory_restart: '1G',
      kill_timeout: 6000, // Slightly higher than Ranu's 5s internal shutdown drain
    },
  ],
};
```

### Step C: Start & Manage

```bash
# Start cluster
pm2 start ecosystem.config.js

# Monitor application status
pm2 status

# Zero-downtime reload
pm2 reload all
```

---

## 6. Linux Service Configuration (systemd)

For bare-metal or cloud VMs (Ubuntu / Debian), create a systemd service file at `/etc/systemd/system/ranu.service`:

```ini
[Unit]
Description=Ranu.js Production Server
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/var/www/my-ranu-app
ExecStart=/usr/bin/pnpm ranu start
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000

# Security Hardening
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable ranu
sudo systemctl start ranu
```
