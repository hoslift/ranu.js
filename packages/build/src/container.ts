import fs from 'node:fs';
import path from 'node:path';

export interface DockerfileOptions {
  /** Node.js base image tag (default: '22-alpine') */
  nodeVersion?: string | undefined;
  /** Package manager used in the project ('npm' | 'pnpm' | 'yarn') */
  packageManager?: 'npm' | 'pnpm' | 'yarn' | undefined;
  /** Port exposed by the container (default: 3000) */
  port?: number | undefined;
  /** Custom run command (default: '["node", ".ranu/build/server/entry.mjs"]') */
  cmd?: string[] | undefined;
  /** Whether to run as non-root user (default: true) */
  nonRoot?: boolean | undefined;
}

/**
 * Generates a production-ready, multi-stage Dockerfile for Ranu.js applications.
 */
export function generateDockerfile(options: DockerfileOptions = {}): string {
  const nodeVersion = options.nodeVersion ?? '22-alpine';
  const packageManager = options.packageManager ?? 'npm';
  const port = options.port ?? 3000;
  const nonRoot = options.nonRoot !== false;
  const cmd = options.cmd ?? ['node', '.ranu/build/server/entry.mjs'];

  let installCommand = 'RUN npm ci';
  let copyLock = 'COPY package*.json ./';
  let buildCommand = 'RUN npm run build';
  let pruneCommand = 'RUN npm prune --production';

  if (packageManager === 'pnpm') {
    copyLock = 'COPY package.json pnpm-lock.yaml ./';
    installCommand = 'RUN corepack enable && pnpm install --frozen-lockfile';
    buildCommand = 'RUN pnpm run build';
    pruneCommand = 'RUN pnpm prune --prod';
  } else if (packageManager === 'yarn') {
    copyLock = 'COPY package.json yarn.lock ./';
    installCommand = 'RUN yarn install --frozen-lockfile';
    buildCommand = 'RUN yarn run build';
    pruneCommand = 'RUN yarn install --production --ignore-scripts --prefer-offline';
  }

  const userDirective = nonRoot ? 'USER node\n' : '';

  return `# Multi-stage production Dockerfile for Ranu.js
# Stage 1: Build stage
FROM node:${nodeVersion} AS build
WORKDIR /app

${copyLock}
${installCommand}

COPY . .
${buildCommand}
${pruneCommand}

# Stage 2: Minimal production runtime stage
FROM node:${nodeVersion} AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=${port}
ENV HOST=0.0.0.0

COPY --from=build /app/.ranu/build ./.ranu/build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

${userDirective}EXPOSE ${port}

CMD ${JSON.stringify(cmd)}
`;
}

/**
 * Generates standard .dockerignore content for Ranu.js applications.
 */
export function generateDockerignore(): string {
  return `# Ranu.js Docker Ignore Rules
.git
.github
node_modules
.ranu/dev
.ranu/cache
.env
.env.*
*.log
coverage
dist
`;
}

/**
 * Writes container deployment configuration (Dockerfile and .dockerignore) into project root.
 */
export function writeContainerArtifacts(
  projectRoot: string,
  options: DockerfileOptions = {},
  overwrite = false,
): { dockerfilePath: string; dockerignorePath: string; written: boolean } {
  const dockerfilePath = path.join(projectRoot, 'Dockerfile');
  const dockerignorePath = path.join(projectRoot, '.dockerignore');

  let written = false;

  if (!fs.existsSync(dockerfilePath) || overwrite) {
    fs.writeFileSync(dockerfilePath, generateDockerfile(options), 'utf8');
    written = true;
  }

  if (!fs.existsSync(dockerignorePath) || overwrite) {
    fs.writeFileSync(dockerignorePath, generateDockerignore(), 'utf8');
    written = true;
  }

  return {
    dockerfilePath,
    dockerignorePath,
    written,
  };
}
