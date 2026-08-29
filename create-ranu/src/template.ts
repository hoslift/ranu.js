import type { PackageManager } from './types.js';
import { getRunCommand } from './package-manager.js';

export interface TemplateFileMap {
  [relativePath: string]: string;
}

/**
 * Generates the deterministic in-memory file tree for a new Ranu.js project.
 *
 * @param projectName - The validated project package name.
 * @param packageManager - The package manager chosen for running scripts.
 * @returns Map of relative file paths to their utf-8 text contents.
 */
export function generateTemplateFiles(
  projectName: string,
  packageManager: PackageManager = 'npm'
): TemplateFileMap {
  const devCmd = getRunCommand(packageManager, 'dev');
  const buildCmd = getRunCommand(packageManager, 'build');
  const startCmd = getRunCommand(packageManager, 'start');

  const packageJson = JSON.stringify(
    {
      name: projectName,
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: {
        dev: 'ranu dev',
        build: 'ranu build',
        start: 'ranu start',
      },
      dependencies: {
        ranu: '^0.0.0',
        react: '^19.0.0',
        'react-dom': '^19.0.0',
      },
      devDependencies: {
        '@types/node': '^22.0.0',
        '@types/react': '^19.0.0',
        '@types/react-dom': '^19.0.0',
        typescript: '^5.0.0',
      },
    },
    null,
    2
  );

  const ranuConfig = `import { defineConfig } from 'ranu/config';

export default defineConfig({
  server: {
    port: 3000,
  },
});
`;

  const rootLayout = `import type { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Ranu.js App</title>
      </head>
      <body>{children}</body>
    </html>
  );
}
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
      include: ['app/**/*', 'ranu.config.ts'],
    },
    null,
    2
  );

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

  return {
    'package.json': `${packageJson}\n`,
    'ranu.config.ts': ranuConfig,
    'app/layout.tsx': rootLayout,
    'app/page.tsx': homePage,
    'tsconfig.json': `${tsconfig}\n`,
    '.gitignore': gitignore,
    'README.md': readme,
    'public/robots.txt': robotsTxt,
  };
}
