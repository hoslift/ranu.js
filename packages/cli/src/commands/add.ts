import fs from 'node:fs';
import path from 'node:path';
import type { ParsedCliArgs, CliLogger } from '../types.js';
import { discoverProjectRoot } from '../context.js';

export interface AddOnResult {
  readonly success: boolean;
  readonly addon: string;
  readonly filesCreated: readonly string[];
  readonly dependencies: readonly string[];
  readonly devDependencies: readonly string[];
  readonly error?: string;
}

const SUPPORTED_ADDONS = ['tailwind', 'tailwindcss', 'drizzle', 'auth'] as const;

export async function runAddCommand(args: ParsedCliArgs, logger: CliLogger): Promise<number> {
  const isJson = Boolean(args.json);
  const isDryRun = Boolean(args.dryRun);
  const addonName = args.args[0]?.toLowerCase().trim();

  if (!addonName) {
    const errorMsg = 'Missing add-on name. Available add-ons: tailwind, drizzle, auth';
    if (isJson) {
      console.log(JSON.stringify({ success: false, error: errorMsg }));
    } else {
      logger.error(errorMsg);
      logger.info('Usage: ranu add <tailwind|drizzle|auth> [--dry-run]');
    }
    return 1;
  }

  if (!SUPPORTED_ADDONS.includes(addonName as any)) {
    const errorMsg = `Unsupported add-on "${addonName}". Available add-ons: tailwind, drizzle, auth`;
    if (isJson) {
      console.log(JSON.stringify({ success: false, error: errorMsg }));
    } else {
      logger.error(errorMsg);
    }
    return 1;
  }

  const cwd = process.cwd();
  const projectRoot = args.root ? path.resolve(cwd, args.root) : discoverProjectRoot(cwd);
  const filesCreated: string[] = [];
  const dependencies: string[] = [];
  const devDependencies: string[] = [];

  function safeWriteFile(filePath: string, content: string): void {
    filesCreated.push(path.relative(projectRoot, filePath));
    if (!isDryRun) {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, content, 'utf8');
    }
  }

  if (addonName === 'tailwind' || addonName === 'tailwindcss') {
    devDependencies.push('@tailwindcss/postcss', 'postcss', 'tailwindcss');

    // 1. Write app/globals.css
    const globalsCssPath = path.join(projectRoot, 'app', 'globals.css');
    safeWriteFile(globalsCssPath, '@import "tailwindcss";\n');

    // 2. Wire globals.css into root layout if present
    const layoutCandidates = ['layout.tsx', 'layout.jsx', 'layout.ts', 'layout.js'];
    for (const cand of layoutCandidates) {
      const layoutPath = path.join(projectRoot, 'app', cand);
      if (fs.existsSync(layoutPath)) {
        const layoutContent = fs.readFileSync(layoutPath, 'utf8');
        if (!layoutContent.includes('globals.css')) {
          const updated = `import './globals.css';\n${layoutContent}`;
          filesCreated.push(path.relative(projectRoot, layoutPath));
          if (!isDryRun) {
            fs.writeFileSync(layoutPath, updated, 'utf8');
          }
        }
        break;
      }
    }

    // 3. Write postcss.config.mjs
    const postcssPath = path.join(projectRoot, 'postcss.config.mjs');
    safeWriteFile(
      postcssPath,
      `export default {\n  plugins: {\n    "@tailwindcss/postcss": {},\n  },\n};\n`,
    );
  } else if (addonName === 'drizzle') {
    dependencies.push('drizzle-orm');
    devDependencies.push('drizzle-kit');

    // 1. Write db/schema.ts
    const schemaPath = path.join(projectRoot, 'db', 'schema.ts');
    safeWriteFile(
      schemaPath,
      `import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';\n\n` +
        `export const users = pgTable('users', {\n` +
        `  id: serial('id').primaryKey(),\n` +
        `  name: text('name').notNull(),\n` +
        `  email: text('email').notNull().unique(),\n` +
        `  createdAt: timestamp('created_at').defaultNow().notNull(),\n` +
        `});\n`,
    );

    // 2. Write db/index.ts
    const dbIndexPath = path.join(projectRoot, 'db', 'index.ts');
    safeWriteFile(dbIndexPath, `export * from './schema.js';\n`);

    // 3. Write drizzle.config.ts
    const drizzleConfigPath = path.join(projectRoot, 'drizzle.config.ts');
    safeWriteFile(
      drizzleConfigPath,
      `import { defineConfig } from 'drizzle-kit';\n\n` +
        `export default defineConfig({\n` +
        `  schema: './db/schema.ts',\n` +
        `  out: './drizzle',\n` +
        `  dialect: 'postgresql',\n` +
        `});\n`,
    );
  } else if (addonName === 'auth') {
    // 1. Write app/api/auth/[...auth]/route.ts
    const authRoutePath = path.join(projectRoot, 'app', 'api', 'auth', '[...auth]', 'route.ts');
    safeWriteFile(
      authRoutePath,
      `import { cookies } from '@ranu/server';\n\n` +
        `export async function GET() {\n` +
        `  return Response.json({ status: 'authenticated', session: null });\n` +
        `}\n\n` +
        `export async function POST() {\n` +
        `  const cookieStore = await cookies();\n` +
        `  cookieStore.set('session', 'active', {\n` +
        `    httpOnly: true,\n` +
        `    secure: true,\n` +
        `    sameSite: 'lax',\n` +
        `  });\n` +
        `  return Response.json({ success: true });\n` +
        `}\n`,
    );

    // 2. Write lib/auth.ts
    const libAuthPath = path.join(projectRoot, 'lib', 'auth.ts');
    safeWriteFile(
      libAuthPath,
      `import { cookies } from '@ranu/server';\n\n` +
        `export async function getSession() {\n` +
        `  const cookieStore = await cookies();\n` +
        `  const sessionCookie = cookieStore.get('session');\n` +
        `  if (!sessionCookie) return null;\n` +
        `  return { id: 'session_active', valid: true };\n` +
        `}\n`,
    );
  }

  // Record package.json changes
  const pkgJsonPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(pkgJsonPath) && (dependencies.length > 0 || devDependencies.length > 0)) {
    try {
      const pkgContent = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      if (dependencies.length > 0) {
        pkgContent.dependencies = pkgContent.dependencies || {};
        for (const dep of dependencies) {
          pkgContent.dependencies[dep] = '^0.0.0';
        }
      }
      if (devDependencies.length > 0) {
        pkgContent.devDependencies = pkgContent.devDependencies || {};
        for (const dep of devDependencies) {
          pkgContent.devDependencies[dep] = '^0.0.0';
        }
      }
      if (!isDryRun) {
        fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgContent, null, 2) + '\n', 'utf8');
      }
      filesCreated.push('package.json');
    } catch {
      // Non-fatal if package.json cannot be parsed
    }
  }

  const result: AddOnResult = {
    success: true,
    addon: addonName,
    filesCreated,
    dependencies,
    devDependencies,
  };

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    logger.success(`Successfully configured add-on "${addonName}"${isDryRun ? ' (dry-run)' : ''}!`);
    if (filesCreated.length > 0) {
      logger.info('Files configured:');
      filesCreated.forEach((f) => logger.info(`  + ${f}`));
    }
    if (dependencies.length > 0 || devDependencies.length > 0) {
      logger.info('Added packages:');
      [...dependencies, ...devDependencies].forEach((p) => logger.info(`  • ${p}`));
    }
  }

  return 0;
}
