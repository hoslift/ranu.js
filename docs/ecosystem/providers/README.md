# Verified Infrastructure & Hosting Providers

**Ranu.js** is engineered from the ground up to be host-agnostic. 

Because the framework targets W3C Web Standards and standard Node.js runtimes, applications can run smoothly on modern cloud platforms without code rewrites.

This directory outlines verified infrastructure providers and partner deployment patterns.

---

## 1. Hosting Architecture Matrix

| Platform Tier | Example Providers | Deployment Method | Ranu Status |
| :--- | :--- | :--- | :---: |
| **Serverless Platforms** | Vercel | `@ranujs/adapter-vercel` | **Officially Supported** |
| **Edge Compute (V8)** | Cloudflare Workers, Fastly | `RanuDeploymentAdapter` / Worker | **Compatible (Custom Adapter)** |
| **Container Clouds** | AWS ECS, Google Cloud Run, Railway | Multi-stage `Dockerfile` | **Officially Supported** |
| **Virtual Servers (VMs)**| Ubuntu / Debian, DigitalOcean, Hetzner | `ranu start` + PM2 / systemd | **Officially Supported** |

---

## 2. Serverless Cloud: Vercel

* **Adapter Package:** `@ranujs/adapter-vercel`
* **Specification:** Vercel Build Output API v3
* **Execution:** Automatic serverless function splitting, edge streaming SSR, and static asset distribution.
* **Runbook:** See [Vercel Deployment Guide](../../guides/deployment/04_VERCEL_ADAPTER.md).

---

## 3. Containerized Clouds: AWS, GCP, Railway

* **Image Base:** `node:22-alpine` (multi-stage)
* **Execution:** Production Node.js server (`ranu start`) listening on `0.0.0.0:3000` with non-root security.
* **Health Probes:** `/api/health` HTTP liveness checks.
* **Runbook:** See [Docker Containerization Guide](../../guides/deployment/02_DOCKER_CONTAINER.md).

---

## 4. Edge Compute: Cloudflare Workers

* **Runtime:** Distributed V8 Isolates
* **Execution:** Direct W3C `Request` and `Response` streaming handling without Node.js emulation overhead.
* **Runbook:** See [Edge Runtimes Guide](../../guides/deployment/03_EDGE_PLATFORMS.md).

---

## 5. Managed Database Partners

Ranu.js applications pair natively with modern serverless and cloud-native databases:

* **PostgreSQL (Serverless & Pooling):** Neon, Supabase, Railway, AWS RDS Aurora.
* **SQLite / Edge Relational:** LibSQL (Turso), Cloudflare D1, embedded Better-SQLite3.
* **Database Guide:** See [Database & ORM Integrations](../../guides/database/01_SQLITE_LOCAL.md).

---

## 6. Provider Verification Criteria

For hosting platforms or cloud providers seeking official verified status in the Ranu.js ecosystem:

1. **W3C Web Standards Support:** Native support for `Request`, `Response`, `Headers`, and chunked `ReadableStream`.
2. **Streaming SSR:** Must support unbuffered chunked HTTP transfers without terminating streaming responses early.
3. **Graceful Shutdown:** Must emit standard termination signals (`SIGINT` or `SIGTERM`) allowing up to 5 seconds for in-flight socket draining.
4. **Environment Variables:** Secure separation between private server runtime variables and public client bundles.
