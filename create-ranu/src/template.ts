import type { PackageManager, TemplateName, SupportedAdapter } from './types.js';
import { getRunCommand } from './package-manager.js';

export interface TemplateFileMap {
  [relativePath: string]: string;
}

export interface GenerateTemplateOptions {
  template?: TemplateName | undefined;
  adapter?: string | undefined;
  tests?: boolean | undefined;
}

/**
 * Generates the deterministic in-memory file tree for a new Ranu.js project
 * based on selected template, adapter, and test options.
 *
 * @param projectName - The validated project package name.
 * @param packageManager - The package manager chosen for running scripts.
 * @param options - Additional options including template name, adapter, and test configuration.
 * @returns Map of relative file paths to their utf-8 text contents.
 */
export function generateTemplateFiles(
  projectName: string,
  packageManager: PackageManager = 'npm',
  options: GenerateTemplateOptions = {}
): TemplateFileMap {
  const template: TemplateName = options.template ?? 'default';
  const adapter = options.adapter;
  const includeTests = options.tests === true;

  const devCmd = getRunCommand(packageManager, 'dev');
  const buildCmd = getRunCommand(packageManager, 'build');
  const startCmd = getRunCommand(packageManager, 'start');

  const files: TemplateFileMap = {};

  // 1. Shared TypeScript configuration
  const tsconfig = JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        lib: ['DOM', 'DOM.Iterable', 'ES2022'],
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        jsx: 'react-jsx',
        strict: true,
        skipLibCheck: true,
        esModuleInterop: true,
        isolatedModules: true,
        resolveJsonModule: true,
      },
      include: ['app/**/*', 'ranu.config.ts', ...(includeTests ? ['test/**/*'] : [])],
    },
    null,
    2
  );

  // 2. Shared .gitignore
  const gitignore = `# Dependencies
node_modules/

# Production & Development Build Caches
.ranu/
dist/

# Environment Files
.env*.local

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# System Files
.DS_Store
Thumbs.db
`;

  // 3. Shared Root Layout (used by default, cloudflare, node-docker, api-routes)
  const rootLayout = `import type { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${projectName} — Ranu.js</title>
      </head>
      <body>{children}</body>
    </html>
  );
}
`;

  // Determine dependencies and scripts based on template and options
  const dependencies: Record<string, string> = {
    '@ranujs/core': '^0.1.6',
    react: '^19.0.0',
    'react-dom': '^19.0.0',
  };

  const devDependencies: Record<string, string> = {
    '@types/node': '^22.0.0',
    '@types/react': '^19.0.0',
    '@types/react-dom': '^19.0.0',
    typescript: '^5.0.0',
  };

  const scripts: Record<string, string> = {
    dev: 'ranu dev',
    build: 'ranu build',
    start: 'ranu start',
  };

  if (includeTests) {
    scripts['test'] = 'vitest run';
    devDependencies['vitest'] = '^4.0.0';
  }

  // --- TEMPLATE SPECIFIC LOGIC ---

  if (template === 'minimal') {
    // MINIMAL TEMPLATE
    const minimalConfig = `import { defineConfig } from '@ranujs/core/config';

export default defineConfig({
  server: {
    port: 3000,
  },
});
`;

    const minimalPage = `export default function MinimalPage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>${projectName}</h1>
      <p>Minimal Ranu.js Application</p>
    </main>
  );
}
`;

    const minimalReadme = `# ${projectName}

A minimal Ranu.js application.

## Getting Started

\`\`\`bash
${devCmd}
\`\`\`
`;

    files['package.json'] = `${JSON.stringify({ name: projectName, version: '0.1.0', private: true, type: 'module', scripts, dependencies, devDependencies }, null, 2)}\n`;
    files['ranu.config.ts'] = minimalConfig;
    files['app/page.tsx'] = minimalPage;
    files['tsconfig.json'] = `${tsconfig}\n`;
    files['.gitignore'] = gitignore;
    files['README.md'] = minimalReadme;

  } else if (template === 'cloudflare' || adapter === 'cloudflare') {
    // CLOUDFLARE WORKERS TEMPLATE
    dependencies['@ranujs/adapter-cloudflare'] = '^0.1.6';

    const cloudflareConfig = `import { defineConfig } from '@ranujs/core/config';
import cloudflare from '@ranujs/adapter-cloudflare';

export default defineConfig({
  server: {
    port: 3000,
  },
  deployment: {
    adapter: cloudflare(),
  },
});
`;

    const cloudflarePage = `export default function CloudflarePage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem 1.5rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '2.5rem', color: '#f38020' }}>Cloudflare Workers App</h1>
      <p style={{ color: '#4b5563', margin: '1rem 0' }}>
        Ultra-low latency SSR running on Cloudflare edge network.
      </p>
    </main>
  );
}
`;

    const wranglerToml = `name = "${projectName}"
main = ".ranu/server/index.js"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = ".ranu/client"
binding = "ASSETS"
`;

    const cloudflareReadme = `# ${projectName}

Ranu.js application optimized for Cloudflare Workers.

## Development

\`\`\`bash
${devCmd}
\`\`\`

## Deployment

Deploy using Wrangler:

\`\`\`bash
${buildCmd}
npx wrangler deploy
\`\`\`
`;

    files['package.json'] = `${JSON.stringify({ name: projectName, version: '0.1.0', private: true, type: 'module', scripts, dependencies, devDependencies }, null, 2)}\n`;
    files['ranu.config.ts'] = cloudflareConfig;
    files['wrangler.toml'] = wranglerToml;
    files['app/layout.tsx'] = rootLayout;
    files['app/page.tsx'] = cloudflarePage;
    files['tsconfig.json'] = `${tsconfig}\n`;
    files['.gitignore'] = gitignore;
    files['README.md'] = cloudflareReadme;
    files['public/robots.txt'] = `User-agent: *\nAllow: /\n`;

  } else if (template === 'node-docker' || adapter === 'node') {
    // NODE DOCKER TEMPLATE
    dependencies['@ranujs/adapter-node'] = '^0.1.6';

    scripts['docker:build'] = `docker build -t ${projectName} .`;
    scripts['docker:run'] = `docker run -p 3000:3000 ${projectName}`;

    const dockerConfig = `import { defineConfig } from '@ranujs/core/config';
import nodeAdapter from '@ranujs/adapter-node';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  deployment: {
    adapter: nodeAdapter(),
  },
});
`;

    const dockerPage = `export default function DockerPage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem 1.5rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '2.5rem', color: '#2496ed' }}>Node.js Standalone & Docker</h1>
      <p style={{ color: '#4b5563', margin: '1rem 0' }}>
        Containerized production-grade full-stack SSR runtime.
      </p>
    </main>
  );
}
`;

    const dockerfile = `# Multi-stage production container for Ranu.js
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci || npm install
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
COPY package*.json ./
RUN npm ci --omit=dev || npm install --production
COPY --from=builder /app/.ranu ./.ranu
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["npm", "start"]
`;

    const dockerignore = `node_modules/
.ranu/
dist/
.git/
.env*.local
*.log
`;

    const dockerReadme = `# ${projectName}

Ranu.js containerized standalone Node.js server.

## Local Development

\`\`\`bash
${devCmd}
\`\`\`

## Docker Build & Run

\`\`\`bash
npm run docker:build
npm run docker:run
\`\`\`
`;

    files['package.json'] = `${JSON.stringify({ name: projectName, version: '0.1.0', private: true, type: 'module', scripts, dependencies, devDependencies }, null, 2)}\n`;
    files['ranu.config.ts'] = dockerConfig;
    files['Dockerfile'] = dockerfile;
    files['.dockerignore'] = dockerignore;
    files['app/layout.tsx'] = rootLayout;
    files['app/page.tsx'] = dockerPage;
    files['tsconfig.json'] = `${tsconfig}\n`;
    files['.gitignore'] = gitignore;
    files['README.md'] = dockerReadme;
    files['public/robots.txt'] = `User-agent: *\nAllow: /\n`;

  } else if (template === 'api-routes') {
    // API ROUTES TEMPLATE
    const apiConfig = `import { defineConfig } from '@ranujs/core/config';

export default defineConfig({
  server: {
    port: 3000,
  },
});
`;

    const apiRoute = `export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get('name') || 'World';
  return Response.json({
    message: \`Hello, \${name}!\`,
    timestamp: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    return Response.json({
      received: body,
      status: 'success',
    });
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
}
`;

    const apiPage = `export default function ApiRoutesPage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem 1.5rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '2.5rem', color: '#111827' }}>Ranu.js API Routes</h1>
      <p style={{ color: '#4b5563', margin: '1rem 0 2rem' }}>
        Standard Web Request/Response API handlers co-located with SSR React pages.
      </p>
      <section style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>Sample Endpoints</h2>
        <ul style={{ lineHeight: '1.8' }}>
          <li><code>GET /app/api/hello?name=Ranu</code> — Returns JSON message</li>
          <li><code>POST /app/api/hello</code> — Accepts and validates JSON payload</li>
        </ul>
      </section>
    </main>
  );
}
`;

    const apiReadme = `# ${projectName}

Ranu.js application with full-stack API route handlers.

## Getting Started

\`\`\`bash
${devCmd}
\`\`\`

Test the API endpoint:

\`\`\`bash
curl http://localhost:3000/app/api/hello?name=Developer
\`\`\`
`;

    files['package.json'] = `${JSON.stringify({ name: projectName, version: '0.1.0', private: true, type: 'module', scripts, dependencies, devDependencies }, null, 2)}\n`;
    files['ranu.config.ts'] = apiConfig;
    files['app/api/hello/route.ts'] = apiRoute;
    files['app/layout.tsx'] = rootLayout;
    files['app/page.tsx'] = apiPage;
    files['tsconfig.json'] = `${tsconfig}\n`;
    files['.gitignore'] = gitignore;
    files['README.md'] = apiReadme;
    files['public/robots.txt'] = `User-agent: *\nAllow: /\n`;

  } else if (adapter === 'bun' || (template as string) === 'bun') {
    // BUN TEMPLATE
    dependencies['@ranujs/adapter-bun'] = '^0.1.6';

    const bunConfig = `import { defineConfig } from '@ranujs/core/config';
import bunAdapter from '@ranujs/adapter-bun';

export default defineConfig({
  server: {
    port: 3000,
  },
  deployment: {
    adapter: bunAdapter(),
  },
});
`;

    const bunPage = `export default function BunPage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem 1.5rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '2.5rem', color: '#fbf0df' }}>Bun Server App</h1>
      <p style={{ color: '#4b5563', margin: '1rem 0' }}>
        High-performance SSR runtime powered by native Bun.serve.
      </p>
    </main>
  );
}
`;

    const bunReadme = `# ${projectName}

Ranu.js application powered by the Bun deployment adapter.

## Getting Started

\`\`\`bash
${devCmd}
\`\`\`
`;

    files['package.json'] = `${JSON.stringify({ name: projectName, version: '0.1.0', private: true, type: 'module', scripts, dependencies, devDependencies }, null, 2)}\n`;
    files['ranu.config.ts'] = bunConfig;
    files['app/layout.tsx'] = rootLayout;
    files['app/page.tsx'] = bunPage;
    files['tsconfig.json'] = `${tsconfig}\n`;
    files['.gitignore'] = gitignore;
    files['README.md'] = bunReadme;
    files['public/robots.txt'] = `User-agent: *\nAllow: /\n`;

  } else if (adapter === 'deno' || (template as string) === 'deno') {
    // DENO TEMPLATE
    dependencies['@ranujs/adapter-deno'] = '^0.1.6';

    const denoConfig = `import { defineConfig } from '@ranujs/core/config';
import denoAdapter from '@ranujs/adapter-deno';

export default defineConfig({
  server: {
    port: 3000,
  },
  deployment: {
    adapter: denoAdapter(),
  },
});
`;

    const denoJson = `${JSON.stringify(
      {
        tasks: {
          start: 'deno run -A .ranu/server/index.js',
        },
      },
      null,
      2
    )}\n`;

    const denoPage = `export default function DenoPage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem 1.5rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '2.5rem', color: '#000000' }}>Deno Server App</h1>
      <p style={{ color: '#4b5563', margin: '1rem 0' }}>
        Secure, modern SSR runtime powered by Deno.serve.
      </p>
    </main>
  );
}
`;

    const denoReadme = `# ${projectName}

Ranu.js application powered by the Deno deployment adapter.

## Getting Started

\`\`\`bash
${devCmd}
\`\`\`
`;

    files['package.json'] = `${JSON.stringify({ name: projectName, version: '0.1.0', private: true, type: 'module', scripts, dependencies, devDependencies }, null, 2)}\n`;
    files['ranu.config.ts'] = denoConfig;
    files['deno.json'] = denoJson;
    files['app/layout.tsx'] = rootLayout;
    files['app/page.tsx'] = denoPage;
    files['tsconfig.json'] = `${tsconfig}\n`;
    files['.gitignore'] = gitignore;
    files['README.md'] = denoReadme;
    files['public/robots.txt'] = `User-agent: *\nAllow: /\n`;

  } else if (adapter === 'netlify' || (template as string) === 'netlify') {
    // NETLIFY TEMPLATE
    dependencies['@ranujs/adapter-netlify'] = '^0.1.6';

    const netlifyConfig = `import { defineConfig } from '@ranujs/core/config';
import netlifyAdapter from '@ranujs/adapter-netlify';

export default defineConfig({
  server: {
    port: 3000,
  },
  deployment: {
    adapter: netlifyAdapter(),
  },
});
`;

    const netlifyToml = `[build]
  command = "npm run build"
  publish = ".ranu/client"
`;

    const netlifyPage = `export default function NetlifyPage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem 1.5rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '2.5rem', color: '#00ad9f' }}>Netlify Functions & Edge</h1>
      <p style={{ color: '#4b5563', margin: '1rem 0' }}>
        Serverless & edge deployment on Netlify.
      </p>
    </main>
  );
}
`;

    const netlifyReadme = `# ${projectName}

Ranu.js application configured for Netlify deployment.

## Getting Started

\`\`\`bash
${devCmd}
\`\`\`
`;

    files['package.json'] = `${JSON.stringify({ name: projectName, version: '0.1.0', private: true, type: 'module', scripts, dependencies, devDependencies }, null, 2)}\n`;
    files['ranu.config.ts'] = netlifyConfig;
    files['netlify.toml'] = netlifyToml;
    files['app/layout.tsx'] = rootLayout;
    files['app/page.tsx'] = netlifyPage;
    files['tsconfig.json'] = `${tsconfig}\n`;
    files['.gitignore'] = gitignore;
    files['README.md'] = netlifyReadme;
    files['public/robots.txt'] = `User-agent: *\nAllow: /\n`;

  } else {
    // DEFAULT TEMPLATE
    if (adapter === 'vercel') {
      dependencies['@ranujs/adapter-vercel'] = '^0.1.6';
    }

    const ranuConfig = adapter === 'vercel'
      ? `import { defineConfig } from '@ranujs/core/config';
import vercel from '@ranujs/adapter-vercel';

export default defineConfig({
  server: {
    port: 3000,
  },
  deployment: {
    adapter: vercel(),
  },
});
`
      : `import { defineConfig } from '@ranujs/core/config';

export default defineConfig({
  server: {
    port: 3000,
  },
});
`;

    const homePage = `export default function HomePage() {
  return (
    <main style={{ fontFamily: 'system-ui, -apple-system, sans-serif', padding: '3rem 1.5rem', textAlign: 'center' }}>
      <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem', color: '#111827' }}>Welcome to Ranu.js</h1>
      <p style={{ fontSize: '1.25rem', color: '#4b5563', maxWidth: '600px', margin: '0 auto 2rem' }}>
        Get started by editing <code style={{ backgroundColor: '#f3f4f6', padding: '0.2rem 0.4rem', borderRadius: '4px' }}>app/page.tsx</code>.
      </p>
    </main>
  );
}
`;

    const readme = `# ${projectName}

A modern full-stack web application built with [Ranu.js](https://github.com/hoslift/ranu.js).

## Getting Started

Run the development server:

\`\`\`bash
${devCmd}
\`\`\`

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Scripts

- \`${devCmd}\` — Start development server with Fast Refresh & HMR
- \`${buildCmd}\` — Create an optimized production build
- \`${startCmd}\` — Start the production server
`;

    const robotsTxt = `User-agent: *
Allow: /
`;

    files['package.json'] = `${JSON.stringify({ name: projectName, version: '0.1.0', private: true, type: 'module', scripts, dependencies, devDependencies }, null, 2)}\n`;
    files['ranu.config.ts'] = ranuConfig;
    files['app/layout.tsx'] = rootLayout;
    files['app/page.tsx'] = homePage;
    files['tsconfig.json'] = `${tsconfig}\n`;
    files['.gitignore'] = gitignore;
    files['README.md'] = readme;
    files['public/robots.txt'] = robotsTxt;
  }

  // Include automated test template if requested
  if (includeTests) {
    files['test/page.test.tsx'] = `import { describe, it, expect } from 'vitest';
import HomePage from '../app/page.js';

describe('${projectName} Smoke Test', () => {
  it('exports valid component definition', () => {
    expect(HomePage).toBeDefined();
    expect(typeof HomePage).toBe('function');
  });
});
`;
  }

  return files;
}
