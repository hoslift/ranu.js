import type { PackageManager, TemplateName, SupportedAdapter, AIEngineName } from './types.js';
import { getRunCommand } from './package-manager.js';
import { generateAgentContextFiles } from './agent-context.js';

export interface TemplateFileMap {
  [relativePath: string]: string;
}

export interface GenerateTemplateOptions {
  template?: TemplateName | undefined;
  adapter?: string | undefined;
  tests?: boolean | undefined;
  ai?: AIEngineName | undefined;
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
      include: [
        'app/**/*',
        'ranu.config.ts',
        ...(template === 'saas' ? ['drizzle.config.ts'] : []),
        ...(includeTests ? ['test/**/*'] : []),
      ],
    },
    null,
    2
  );

  // 2. Shared .gitignore
  const gitignore = `# Dependencies
node_modules/

# Production & Development Build Caches
.ranu/*
!.ranu/AGENT_GUIDE.md
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
    '@ranujs/core': '^0.2.0',
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

  const aiEngine = options.ai && options.ai !== 'none' ? options.ai : undefined;
  if (aiEngine) {
    dependencies['@ranu/ai'] = '^0.1.0';
    dependencies[`@ranu/ai-${aiEngine}`] = '^0.1.0';
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
    dependencies['@ranujs/adapter-cloudflare'] = '^0.1.0';

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
    dependencies['@ranujs/adapter-node'] = '^0.1.0';

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

  } else if (template === 'saas') {
    // SAAS TURNKEY PRESET
    dependencies['tailwindcss'] = '^4.0.0';
    dependencies['@tailwindcss/vite'] = '^4.0.0';
    dependencies['drizzle-orm'] = '^0.39.0';
    dependencies['better-sqlite3'] = '^11.0.0';

    devDependencies['@types/better-sqlite3'] = '^7.6.0';
    devDependencies['drizzle-kit'] = '^0.30.0';

    scripts['db:push'] = 'drizzle-kit push';
    scripts['db:studio'] = 'drizzle-kit studio';

    const saasConfig = `import { defineConfig } from '@ranujs/core/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  server: {
    port: 3000,
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
`;

    const drizzleConfig = `import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './app/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: 'sqlite.db',
  },
});
`;

    const dbSchema = `import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
});
`;

    const dbClient = `import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema.js';

const sqlite = new Database(process.env['DATABASE_URL'] || 'sqlite.db');
export const db = drizzle(sqlite, { schema });
`;

    const authRoute = `export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return Response.json({ authenticated: false, user: null }, { status: 401 });
  }
  return Response.json({
    authenticated: true,
    user: {
      id: 'usr_demo',
      email: 'founder@hoslift.com',
      name: 'Founder',
      role: 'admin',
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email } = body as { email?: string };
    if (!email) {
      return Response.json({ error: 'Email is required' }, { status: 400 });
    }
    return Response.json({
      success: true,
      token: 'session_token_demo',
      user: { email, name: email.split('@')[0] },
    });
  } catch {
    return Response.json({ error: 'Invalid session payload' }, { status: 400 });
  }
}
`;

    const globalsCss = `@import "tailwindcss";
`;

    const saasLayout = `import type { ReactNode } from 'react';
import './globals.css';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${projectName} — SaaS</title>
      </head>
      <body className="bg-slate-50 text-slate-900 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
`;

    const saasPage = `export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl text-slate-900">
        Welcome to ${projectName}
      </h1>
      <p className="mt-4 text-lg text-slate-600 max-w-xl">
        Turnkey full-stack SaaS baseline powered by Ranu.js, React 19 streaming SSR, Tailwind v4, and Drizzle ORM.
      </p>
      <div className="mt-8 flex gap-4">
        <a
          href="/dashboard"
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors"
        >
          Go to Dashboard
        </a>
        <a
          href="/app/api/auth/session"
          className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
        >
          Inspect Auth API
        </a>
      </div>
    </main>
  );
}
`;

    const dashboardPage = `export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <h1 className="text-xl font-bold text-slate-900">${projectName} Dashboard</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">founder@hoslift.com</span>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
              Active
            </span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Monthly Recurring Revenue</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">$12,450</p>
            <p className="mt-1 text-xs text-emerald-600">+14% from last month</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Active Subscriptions</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">428</p>
            <p className="mt-1 text-xs text-emerald-600">+8 new this week</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-500">SSR Latency (p99)</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">12ms</p>
            <p className="mt-1 text-xs text-slate-500">Streaming React 19</p>
          </div>
        </div>
      </main>
    </div>
  );
}
`;

    const saasReadme = `# ${projectName}

Turnkey production-ready SaaS application built with [Ranu.js](https://github.com/hoslift/ranu.js).

## Stack

- **Framework:** Ranu.js (React 19 Streaming SSR)
- **Styling:** Tailwind CSS v4
- **Database:** Drizzle ORM (SQLite / libSQL ready)
- **Authentication:** Session Auth API endpoints (\`/app/api/auth/session\`)
- **Dashboard:** Production metrics and admin panel (\`/dashboard\`)

## Getting Started

\`\`\`bash
${devCmd}
\`\`\`

## Database Migrations

\`\`\`bash
${getRunCommand(packageManager, 'db:push')}
\`\`\`
`;

    files['package.json'] = `${JSON.stringify({ name: projectName, version: '0.1.0', private: true, type: 'module', scripts, dependencies, devDependencies }, null, 2)}\n`;
    files['ranu.config.ts'] = saasConfig;
    files['drizzle.config.ts'] = drizzleConfig;
    files['app/db/schema.ts'] = dbSchema;
    files['app/db/index.ts'] = dbClient;
    files['app/api/auth/session/route.ts'] = authRoute;
    files['app/globals.css'] = globalsCss;
    files['app/layout.tsx'] = saasLayout;
    files['app/page.tsx'] = saasPage;
    files['app/dashboard/page.tsx'] = dashboardPage;
    files['tsconfig.json'] = `${tsconfig}\n`;
    files['.gitignore'] = `${gitignore}\nsqlite.db\nsqlite.db-journal\n`;
    files['README.md'] = saasReadme;
    files['public/robots.txt'] = `User-agent: *\nAllow: /\n`;

  } else if (adapter === 'bun' || (template as string) === 'bun') {
    // BUN TEMPLATE
    dependencies['@ranujs/adapter-bun'] = '^0.1.0';

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
    dependencies['@ranujs/adapter-deno'] = '^0.1.0';

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
    dependencies['@ranujs/adapter-netlify'] = '^0.1.0';

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
      dependencies['@ranujs/adapter-vercel'] = '^0.1.5';
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

  // Include AI streaming route and environment variables template if AI engine selected
  if (aiEngine) {
    files['app/routes/api.ai.ts'] = getAIRouteTemplate(aiEngine);
    files['.env.example'] = getEnvExample(aiEngine);
  }

  // Merge automated agent context files across all templates
  const agentContextFiles = generateAgentContextFiles({
    projectName,
    packageManager,
    aiEngine: options.ai ?? 'none',
    template,
    adapter,
    tests: includeTests,
  });
  Object.assign(files, agentContextFiles);

  return files;
}

/**
 * Returns canonical W3C streaming handler template for chosen AI provider.
 */
function getAIRouteTemplate(ai: AIEngineName): string {
  switch (ai) {
    case 'gemini':
      return `import { streamAI } from '@ranu/ai';
import { gemini } from '@ranu/ai-gemini';

export async function POST(request: Request): Promise<Response> {
  const { messages, prompt } = (await request.json().catch(() => ({}))) as {
    messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    prompt?: string;
  };

  const inputPrompt = prompt || messages?.[messages.length - 1]?.content || 'Hello, Gemini!';

  return streamAI({
    model: gemini('gemini-1.5-pro'),
    prompt: inputPrompt,
    messages,
    signal: request.signal,
  });
}

export async function GET(): Promise<Response> {
  return Response.json({
    status: 'ready',
    provider: 'gemini',
    model: 'gemini-1.5-pro',
  });
}
`;
    case 'groq':
      return `import { streamAI } from '@ranu/ai';
import { groq } from '@ranu/ai-groq';

export async function POST(request: Request): Promise<Response> {
  const { messages, prompt } = (await request.json().catch(() => ({}))) as {
    messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    prompt?: string;
  };

  const inputPrompt = prompt || messages?.[messages.length - 1]?.content || 'Hello, Groq!';

  return streamAI({
    model: groq('llama-3.3-70b-versatile'),
    prompt: inputPrompt,
    messages,
    signal: request.signal,
  });
}

export async function GET(): Promise<Response> {
  return Response.json({
    status: 'ready',
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
  });
}
`;
    case 'claude':
      return `import { streamAI } from '@ranu/ai';
import { claude } from '@ranu/ai-claude';

export async function POST(request: Request): Promise<Response> {
  const { messages, prompt } = (await request.json().catch(() => ({}))) as {
    messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    prompt?: string;
  };

  const inputPrompt = prompt || messages?.[messages.length - 1]?.content || 'Hello, Claude!';

  return streamAI({
    model: claude('claude-3-5-sonnet-20241022'),
    prompt: inputPrompt,
    messages,
    signal: request.signal,
  });
}

export async function GET(): Promise<Response> {
  return Response.json({
    status: 'ready',
    provider: 'claude',
    model: 'claude-3-5-sonnet-20241022',
  });
}
`;
    case 'openai':
      return `import { streamAI } from '@ranu/ai';
import { openai } from '@ranu/ai-openai';

export async function POST(request: Request): Promise<Response> {
  const { messages, prompt } = (await request.json().catch(() => ({}))) as {
    messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    prompt?: string;
  };

  const inputPrompt = prompt || messages?.[messages.length - 1]?.content || 'Hello, OpenAI!';

  return streamAI({
    model: openai('gpt-4o'),
    prompt: inputPrompt,
    messages,
    signal: request.signal,
  });
}

export async function GET(): Promise<Response> {
  return Response.json({
    status: 'ready',
    provider: 'openai',
    model: 'gpt-4o',
  });
}
`;
    case 'custom':
      return `import { streamAI } from '@ranu/ai';
import { createCustomAI } from '@ranu/ai-custom';

const customAI = createCustomAI({
  baseURL: process.env.CUSTOM_AI_ENDPOINT || 'http://localhost:11434',
  apiKey: process.env.CUSTOM_AI_KEY,
});

export async function POST(request: Request): Promise<Response> {
  const { messages, prompt, model: reqModel } = (await request.json().catch(() => ({}))) as {
    messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    prompt?: string;
    model?: string;
  };

  const inputPrompt = prompt || messages?.[messages.length - 1]?.content || 'Hello, Custom AI!';
  const selectedModel = reqModel || process.env.CUSTOM_AI_MODEL || 'llama3';

  return streamAI({
    model: customAI(selectedModel),
    prompt: inputPrompt,
    messages,
    signal: request.signal,
  });
}

export async function GET(): Promise<Response> {
  return Response.json({
    status: 'ready',
    provider: 'custom',
    endpoint: process.env.CUSTOM_AI_ENDPOINT || 'http://localhost:11434',
    defaultModel: process.env.CUSTOM_AI_MODEL || 'llama3',
  });
}
`;
    default:
      return '';
  }
}

/**
 * Returns environment configuration template for chosen AI provider.
 */
function getEnvExample(ai: AIEngineName): string {
  switch (ai) {
    case 'gemini':
      return `PORT=3000\nGEMINI_API_KEY=your_gemini_api_key_here\n`;
    case 'groq':
      return `PORT=3000\nGROQ_API_KEY=your_groq_api_key_here\n`;
    case 'claude':
      return `PORT=3000\nANTHROPIC_API_KEY=your_anthropic_api_key_here\n`;
    case 'openai':
      return `PORT=3000\nOPENAI_API_KEY=your_openai_api_key_here\n`;
    case 'custom':
      return `PORT=3000\nCUSTOM_AI_ENDPOINT=http://localhost:11434\nCUSTOM_AI_KEY=your_custom_ai_key_here\n`;
    default:
      return '';
  }
}

