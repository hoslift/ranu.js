# Containerization with Docker

Containerizing a **Ranu.js** application ensures immutable, reproducible deployments across Kubernetes, AWS ECS, Google Cloud Run, and Docker Swarm environments.

This guide provides an optimized, multi-stage `Dockerfile` leveraging unprivileged non-root execution, minimal image footprints, and container health checks.

---

## 1. `.dockerignore` Configuration

Before creating the `Dockerfile`, create a `.dockerignore` file in your project root to prevent unnecessary files and secrets from entering the Docker build context:

```dockerignore
# .dockerignore
node_modules
.git
.gitignore
.ranu
.env*.local
*.log
dist
coverage
```

---

## 2. Multi-Stage `Dockerfile`

Create `Dockerfile` in the root of your project:

```dockerfile
# -------------------------------------------------------------
# Stage 1: Base & Dependencies
# -------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

# Enable Corepack for pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy dependency manifests
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# -------------------------------------------------------------
# Stage 2: Production Build
# -------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set production environment for build optimization
ENV NODE_ENV=production

# Compile Ranu.js production artifacts into .ranu/build/
RUN pnpm ranu build --clean

# -------------------------------------------------------------
# Stage 3: Production Runner
# -------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Create an unprivileged user and group for security hardening
RUN addgroup --system --gid 1001 ranugroup && \
    adduser --system --uid 1001 ranuuser

# Copy built artifacts and runtime dependencies
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.ranu ./.ranu
COPY --from=builder /app/public ./public

# Assign ownership to unprivileged user
RUN chown -R ranuuser:ranugroup /app

# Switch to non-root user
USER ranuuser

# Expose default HTTP port
EXPOSE 3000

# Health check probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

# Start production server
CMD ["node", "node_modules/.bin/ranu", "start"]
```

---

## 3. Implementing the Health Check Endpoint

In your application, add a lightweight health check endpoint at `app/api/health/route.ts`:

```typescript
// app/api/health/route.ts
export async function GET(): Promise<Response> {
  return Response.json(
    {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
```

---

## 4. Building and Running the Docker Image

Build the container image:

```bash
docker build -t my-ranu-app:latest .
```

Run the container locally:

```bash
docker run -p 3000:3000 --rm --name ranu-app my-ranu-app:latest
```

Test the container in your terminal:

```bash
curl http://localhost:3000/api/health
```

---

## 5. Orchestration with Docker Compose

For local multi-service development or small production clusters with a database:

```yaml
# docker-compose.yml
version: '3.8'

services:
  web:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATABASE_URL=postgres://postgres:secret@db:5432/ranu_db
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: ranu_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  postgres_data:
```

---

## 6. Container Hardening Checklist

| Security Control | Implementation | Purpose |
| :--- | :--- | :--- |
| **Non-Root Execution** | `USER ranuuser` | Mitigates container breakout vulnerabilities |
| **Alpine Base Image** | `node:22-alpine` | Minimizes attack surface and reduces image size |
| **Multi-Stage Build** | 3-stage separation | Discards build tools, compilers, and source files |
| **Liveness Probes** | `HEALTHCHECK` | Automates container restarts upon process deadlock |
