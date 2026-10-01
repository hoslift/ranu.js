# Ranu.js Node.js & Docker Production Deployment Example

This example demonstrates how to prepare, build, containerize, and run a **Ranu.js** application for production environments.

## Concepts Demonstrated

- **Standalone Node Server**: `ranu build` compiles server and static manifests; `ranu start` launches the high-performance HTTP production server
- **Containerization**: Multi-stage `Dockerfile` creating a lightweight, minimal Alpine Linux image
- **Healthcheck Probe**: `/api/health` providing readiness and liveness telemetry for Docker and Kubernetes

## Project Structure

```text
├── .dockerignore
├── Dockerfile              # Multi-stage production container build
├── app/
│   ├── api/health/route.ts # Healthcheck endpoint
│   ├── layout.tsx
│   └── page.tsx
├── package.json
├── ranu.config.ts
└── tsconfig.json
```

## Running Locally

```bash
pnpm build
pnpm start
```

## Building and Running with Docker

```bash
docker build -t ranu-app .
docker run -p 3000:3000 ranu-app
```
