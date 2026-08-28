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
  /** Whether the npm project has package-lock.json or npm-shrinkwrap.json. */
  npmLockfile?: boolean | undefined;
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

  let installCommand = options.npmLockfile ? 'RUN npm ci' : 'RUN npm install';
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
  const generatedOptions =
    (options.packageManager ?? 'npm') === 'npm'
      ? {
          ...options,
          npmLockfile:
            fs.existsSync(path.join(projectRoot, 'package-lock.json')) ||
            fs.existsSync(path.join(projectRoot, 'npm-shrinkwrap.json')),
        }
      : options;

  const writeNoFollow = (filePath: string, contents: string): boolean => {
    try {
      if (fs.lstatSync(filePath).isSymbolicLink()) {
        throw new Error(`Refusing to write container artifact through symlink: "${filePath}".`);
      }
    } catch (error: unknown) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        throw error;
      }
    }

    const flags =
      fs.constants.O_WRONLY |
      fs.constants.O_CREAT |
      fs.constants.O_NOFOLLOW |
      (overwrite ? fs.constants.O_TRUNC : fs.constants.O_EXCL);
    let fd: number | undefined;

    try {
      fd = fs.openSync(filePath, flags, 0o666);
      fs.writeFileSync(fd, contents, 'utf8');
      return true;
    } catch (error: unknown) {
      if (!overwrite && error instanceof Error && 'code' in error && error.code === 'EEXIST') {
        return false;
      }
      throw error;
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
  };

  written = writeNoFollow(dockerfilePath, generateDockerfile(generatedOptions)) || written;
  written = writeNoFollow(dockerignorePath, generateDockerignore()) || written;

  return {
    dockerfilePath,
    dockerignorePath,
    written,
  };
}
