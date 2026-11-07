import fs from 'node:fs';
import path from 'node:path';
import type { ParsedCliArgs, CliLogger, AddOnResult } from '../types.js';
import { discoverProjectRoot } from '../context.js';
import { sanitizeTargetFilePath } from './ai.js';

export type { AddOnResult } from '../types.js';

const SUPPORTED_ADDONS = [
  'tailwind',
  'tailwindcss',
  'drizzle',
  'auth',
  'ai-gemini',
  'ai-groq',
  'ai-claude',
  'ai-codex',
  'ai-custom',
  'ai-openai',
  'gemini',
  'groq',
  'claude',
  'codex',
  'custom',
  'openai',
] as const;

/**
 * Checks whether a child path is safely contained within a parent directory.
 */
export function isPathContained(childPath: string, parentDir: string): boolean {
  const rel = path.relative(path.resolve(parentDir), path.resolve(childPath));
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Appends environment variables to .env.example idempotently without duplicating existing keys.
 */
function updateEnvExample(
  projectRoot: string,
  envVars: Record<string, string>,
  comment: string,
  isDryRun: boolean,
  filesCreated: string[],
): void {
  const envExamplePath = sanitizeTargetFilePath(projectRoot, '.env.example');
  let currentContent = '';
  if (fs.existsSync(envExamplePath)) {
    try {
      currentContent = fs.readFileSync(envExamplePath, 'utf8');
    } catch {
      currentContent = '';
    }
  }

  const linesToAdd: string[] = [];
  for (const [key, placeholder] of Object.entries(envVars)) {
    const regex = new RegExp(`^\\s*#?\\s*${key}\\s*=`, 'm');
    if (!regex.test(currentContent)) {
      linesToAdd.push(`${key}=${placeholder}`);
    }
  }

  if (linesToAdd.length > 0) {
    let newContent = currentContent;
    if (newContent.length > 0 && !newContent.endsWith('\n')) {
      newContent += '\n';
    }
    newContent += `# ${comment}\n${linesToAdd.join('\n')}\n`;

    filesCreated.push('.env.example');
    if (!isDryRun) {
      fs.writeFileSync(envExamplePath, newContent, 'utf8');
    }
  }
}

function getGeminiRouteTemplate(model: string): string {
  return `import { streamAI } from '@ranu/ai';
import { gemini } from '@ranu/ai-gemini';

export async function POST(request: Request): Promise<Response> {
  const { messages, prompt } = (await request.json().catch(() => ({}))) as {
    messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    prompt?: string;
  };

  const inputPrompt = prompt || messages?.[messages.length - 1]?.content || 'Hello, Gemini!';

  return streamAI({
    model: gemini('${model}'),
    prompt: inputPrompt,
    messages,
    signal: request.signal,
  });
}

export async function GET(): Promise<Response> {
  return Response.json({
    status: 'ready',
    provider: 'gemini',
    model: '${model}',
  });
}
`;
}

function getGroqRouteTemplate(model: string): string {
  return `import { streamAI } from '@ranu/ai';
import { groq } from '@ranu/ai-groq';

export async function POST(request: Request): Promise<Response> {
  const { messages, prompt } = (await request.json().catch(() => ({}))) as {
    messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    prompt?: string;
  };

  const inputPrompt = prompt || messages?.[messages.length - 1]?.content || 'Hello, Groq!';

  return streamAI({
    model: groq('${model}'),
    prompt: inputPrompt,
    messages,
    signal: request.signal,
  });
}

export async function GET(): Promise<Response> {
  return Response.json({
    status: 'ready',
    provider: 'groq',
    model: '${model}',
  });
}
`;
}

function getClaudeRouteTemplate(model: string): string {
  return `import { streamAI } from '@ranu/ai';
import { claude } from '@ranu/ai-claude';

export async function POST(request: Request): Promise<Response> {
  const { messages, prompt } = (await request.json().catch(() => ({}))) as {
    messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    prompt?: string;
  };

  const inputPrompt = prompt || messages?.[messages.length - 1]?.content || 'Hello, Claude!';

  return streamAI({
    model: claude('${model}'),
    prompt: inputPrompt,
    messages,
    signal: request.signal,
  });
}

export async function GET(): Promise<Response> {
  return Response.json({
    status: 'ready',
    provider: 'claude',
    model: '${model}',
  });
}
`;
}

function getCodexRouteTemplate(model: string): string {
  return `import { streamAI } from '@ranu/ai';
import { codex } from '@ranu/ai-codex';

export async function POST(request: Request): Promise<Response> {
  const { messages, prompt } = (await request.json().catch(() => ({}))) as {
    messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    prompt?: string;
  };

  const inputPrompt = prompt || messages?.[messages.length - 1]?.content || 'Hello, Codex!';

  return streamAI({
    model: codex('${model}'),
    prompt: inputPrompt,
    messages,
    signal: request.signal,
  });
}

export async function GET(): Promise<Response> {
  return Response.json({
    status: 'ready',
    provider: 'codex',
    model: '${model}',
  });
}
`;
}

function getOpenAIRouteTemplate(model: string): string {
  return `import { streamAI } from '@ranu/ai';
import { openai } from '@ranu/ai-openai';

export async function POST(request: Request): Promise<Response> {
  const { messages, prompt } = (await request.json().catch(() => ({}))) as {
    messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    prompt?: string;
  };

  const inputPrompt = prompt || messages?.[messages.length - 1]?.content || 'Hello, OpenAI!';

  return streamAI({
    model: openai('${model}'),
    prompt: inputPrompt,
    messages,
    signal: request.signal,
  });
}

export async function GET(): Promise<Response> {
  return Response.json({
    status: 'ready',
    provider: 'openai',
    model: '${model}',
  });
}
`;
}

function getCustomRouteTemplate(endpoint: string, model: string): string {
  return `import { streamAI } from '@ranu/ai';
import { createCustomAI } from '@ranu/ai-custom';

const customAI = createCustomAI({
  baseURL: process.env.CUSTOM_AI_ENDPOINT || '${endpoint}',
  apiKey: process.env.CUSTOM_AI_KEY,
});

export async function POST(request: Request): Promise<Response> {
  const { messages, prompt, model: reqModel } = (await request.json().catch(() => ({}))) as {
    messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    prompt?: string;
    model?: string;
  };

  const inputPrompt = prompt || messages?.[messages.length - 1]?.content || 'Hello, Custom AI!';
  const selectedModel = reqModel || process.env.CUSTOM_AI_MODEL || '${model}';

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
    endpoint: process.env.CUSTOM_AI_ENDPOINT || '${endpoint}',
    defaultModel: process.env.CUSTOM_AI_MODEL || '${model}',
  });
}
`;
}

export function runAddCommand(args: ParsedCliArgs, logger: CliLogger): Promise<number> {
  const isJson = Boolean(args.json);
  const isDryRun = Boolean(args.dryRun);
  const isForce = Boolean(args.force);
  const rawAddonName = args.args[0]?.toLowerCase().trim();

  if (!rawAddonName) {
    const errorMsg =
      'Missing add-on name. Available add-ons: tailwind, drizzle, auth, ai-gemini, ai-groq, ai-claude, ai-codex, ai-custom, ai-openai';
    if (isJson) {
      logger.json({ success: false, error: errorMsg });
    } else {
      logger.error(errorMsg);
      logger.info('Usage: ranu add <addon-name> [--dry-run] [--force]');
    }
    return Promise.resolve(1);
  }

  if (!(SUPPORTED_ADDONS as readonly string[]).includes(rawAddonName)) {
    const errorMsg = `Unsupported add-on "${rawAddonName}". Available add-ons: tailwind, drizzle, auth, ai-gemini, ai-groq, ai-claude, ai-codex, ai-custom, ai-openai`;
    if (isJson) {
      logger.json({ success: false, error: errorMsg });
    } else {
      logger.error(errorMsg);
    }
    return Promise.resolve(1);
  }

  // Canonical alias normalization
  let canonicalAddon = rawAddonName;
  if (rawAddonName === 'gemini') canonicalAddon = 'ai-gemini';
  else if (rawAddonName === 'groq') canonicalAddon = 'ai-groq';
  else if (rawAddonName === 'claude') canonicalAddon = 'ai-claude';
  else if (rawAddonName === 'codex') canonicalAddon = 'ai-codex';
  else if (rawAddonName === 'custom') canonicalAddon = 'ai-custom';
  else if (rawAddonName === 'openai') canonicalAddon = 'ai-openai';
  else if (rawAddonName === 'tailwindcss') canonicalAddon = 'tailwind';

  const cwd = process.cwd();
  const projectRoot = args.root ? path.resolve(cwd, args.root) : discoverProjectRoot(cwd);

  if (!fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) {
    const errorMsg = `Project root directory does not exist: "${projectRoot}"`;
    if (isJson) {
      logger.json({ success: false, error: errorMsg });
    } else {
      logger.error(errorMsg);
    }
    return Promise.resolve(1);
  }

  const filesCreated: string[] = [];
  const dependencies: string[] = [];
  const devDependencies: string[] = [];
  const envVars: string[] = [];
  const nextSteps: string[] = [];

  function safeWriteFile(relativeFilePath: string, content: string, allowOverwrite = false): void {
    const fullPath = sanitizeTargetFilePath(projectRoot, relativeFilePath);

    if (fs.existsSync(fullPath) && !allowOverwrite && !isForce) {
      throw new Error(`Route file already exists at "${relativeFilePath}". Use --force to overwrite.`);
    }

    filesCreated.push(path.relative(projectRoot, fullPath).replace(/\\/g, '/'));
    if (!isDryRun) {
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(fullPath, content, 'utf8');
    }
  }

  try {
    // 1. Classic Addons
    if (canonicalAddon === 'tailwind') {
      devDependencies.push('@tailwindcss/postcss', 'postcss', 'tailwindcss');

      // app/globals.css
      safeWriteFile('app/globals.css', '@import "tailwindcss";\n', true);

      // Wire globals.css into root layout if present
      const layoutCandidates = ['layout.tsx', 'layout.jsx', 'layout.ts', 'layout.js'];
      for (const cand of layoutCandidates) {
        const layoutPath = path.join(projectRoot, 'app', cand);
        if (fs.existsSync(layoutPath)) {
          const layoutContent = fs.readFileSync(layoutPath, 'utf8');
          if (!layoutContent.includes('globals.css')) {
            const updated = `import './globals.css';\n${layoutContent}`;
            filesCreated.push(path.relative(projectRoot, layoutPath).replace(/\\/g, '/'));
            if (!isDryRun) {
              fs.writeFileSync(layoutPath, updated, 'utf8');
            }
          }
          break;
        }
      }

      // postcss.config.mjs
      safeWriteFile(
        'postcss.config.mjs',
        `export default {\n  plugins: {\n    "@tailwindcss/postcss": {},\n  },\n};\n`,
        true,
      );
    } else if (canonicalAddon === 'drizzle') {
      dependencies.push('drizzle-orm');
      devDependencies.push('drizzle-kit');

      safeWriteFile(
        'db/schema.ts',
        `import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';\n\n` +
          `export const users = pgTable('users', {\n` +
          `  id: serial('id').primaryKey(),\n` +
          `  name: text('name').notNull(),\n` +
          `  email: text('email').notNull().unique(),\n` +
          `  createdAt: timestamp('created_at').defaultNow().notNull(),\n` +
          `});\n`,
        true,
      );

      safeWriteFile('db/index.ts', `export * from './schema.js';\n`, true);

      safeWriteFile(
        'drizzle.config.ts',
        `import { defineConfig } from 'drizzle-kit';\n\n` +
          `export default defineConfig({\n` +
          `  schema: './db/schema.ts',\n` +
          `  out: './drizzle',\n` +
          `  dialect: 'postgresql',\n` +
          `});\n`,
        true,
      );
    } else if (canonicalAddon === 'auth') {
      envVars.push('AUTH_SECRET');
      updateEnvExample(
        projectRoot,
        { AUTH_SECRET: 'ranu-auth-secret-change-in-production-min-32-chars' },
        'Authentication Secret Key',
        isDryRun,
        filesCreated,
      );

      safeWriteFile(
        'app/api/auth/[...auth]/route.ts',
        `import { cookies } from '@ranu/server';\n` +
          `import { verifySession, signSession } from '../../../../lib/auth';\n\n` +
          `const AUTH_SECRET = process.env.AUTH_SECRET || 'ranu-auth-secret-change-in-production-min-32-chars';\n` +
          `const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours\n\n` +
          `export async function GET() {\n` +
          `  const cookieStore = await cookies();\n` +
          `  const sessionCookie = cookieStore.get('session');\n` +
          `  if (!sessionCookie) {\n` +
          `    return Response.json({ error: 'Unauthorized', message: 'No session cookie' }, { status: 401 });\n` +
          `  }\n` +
          `  const session = await verifySession(sessionCookie, AUTH_SECRET);\n` +
          `  if (!session) {\n` +
          `    return Response.json({ error: 'Unauthorized', message: 'Session expired or invalid' }, { status: 401 });\n` +
          `  }\n` +
          `  return Response.json({ status: 'authenticated', session });\n` +
          `}\n\n` +
          `export async function POST(request: Request) {\n` +
          `  let userId = 'user_anonymous';\n` +
          `  try {\n` +
          `    const body = (await request.json()) as { userId?: string };\n` +
          `    if (body && typeof body.userId === 'string') {\n` +
          `      userId = body.userId;\n` +
          `    }\n` +
          `  } catch {\n` +
          `    // optional body fallback\n` +
          `  }\n` +
          `  const expiresAt = Date.now() + SESSION_DURATION_MS;\n` +
          `  const token = await signSession({ userId, expiresAt }, AUTH_SECRET);\n` +
          `  const cookieStore = await cookies();\n` +
          `  cookieStore.set('session', token, {\n` +
          `    httpOnly: true,\n` +
          `    secure: process.env.NODE_ENV === 'production',\n` +
          `    sameSite: 'lax',\n` +
          `    path: '/',\n` +
          `    maxAge: 86400,\n` +
          `  });\n` +
          `  return Response.json({ success: true, expiresAt });\n` +
          `}\n`,
        true,
      );

      safeWriteFile(
        'lib/auth.ts',
        `import { cookies } from '@ranu/server';\n\n` +
          `export interface SessionPayload {\n` +
          `  userId: string;\n` +
          `  expiresAt: number;\n` +
          `  [key: string]: unknown;\n` +
          `}\n\n` +
          `export async function signSession(payload: SessionPayload, secret: string): Promise<string> {\n` +
          `  const enc = new TextEncoder();\n` +
          `  const data = JSON.stringify(payload);\n` +
          `  const dataB64 = Buffer.from(data).toString('base64url');\n` +
          `  const key = await crypto.subtle.importKey(\n` +
          `    'raw',\n` +
          `    enc.encode(secret),\n` +
          `    { name: 'HMAC', hash: 'SHA-256' },\n` +
          `    false,\n` +
          `    ['sign'],\n` +
          `  );\n` +
          `  const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(dataB64));\n` +
          `  const sigB64 = Buffer.from(sigBuffer).toString('base64url');\n` +
          `  return \`\${dataB64}.\${sigB64}\`;\n` +
          `}\n\n` +
          `export async function verifySession(token: string, secret: string): Promise<SessionPayload | null> {\n` +
          `  try {\n` +
          `    if (!token || typeof token !== 'string') return null;\n` +
          `    const parts = token.split('.');\n` +
          `    if (parts.length !== 2) return null;\n` +
          `    const [dataB64, sigB64] = parts;\n` +
          `    const enc = new TextEncoder();\n` +
          `    const key = await crypto.subtle.importKey(\n` +
          `      'raw',\n` +
          `      enc.encode(secret),\n` +
          `      { name: 'HMAC', hash: 'SHA-256' },\n` +
          `      false,\n` +
          `      ['verify'],\n` +
          `    );\n` +
          `    const sigBuffer = Buffer.from(sigB64, 'base64url');\n` +
          `    const isValid = await crypto.subtle.verify('HMAC', key, sigBuffer, enc.encode(dataB64));\n` +
          `    if (!isValid) return null;\n` +
          `    const json = Buffer.from(dataB64, 'base64url').toString('utf8');\n` +
          `    const payload = JSON.parse(json) as SessionPayload;\n` +
          `    if (typeof payload.expiresAt === 'number' && Date.now() > payload.expiresAt) {\n` +
          `      return null;\n` +
          `    }\n` +
          `    return payload;\n` +
          `  } catch {\n` +
          `    return null;\n` +
          `  }\n` +
          `}\n\n` +
          `export async function getSession(): Promise<SessionPayload | null> {\n` +
          `  const cookieStore = await cookies();\n` +
          `  const sessionCookie = cookieStore.get('session');\n` +
          `  if (!sessionCookie) return null;\n` +
          `  const secret = process.env.AUTH_SECRET || 'ranu-auth-secret-change-in-production-min-32-chars';\n` +
          `  return verifySession(sessionCookie, secret);\n` +
          `}\n`,
        true,
      );
    }

    // 2. AI Recipes
    else if (canonicalAddon === 'ai-gemini') {
      const model = args.model?.trim() || 'gemini-1.5-pro';
      dependencies.push('@ranu/ai', '@ranu/ai-gemini');
      envVars.push('GEMINI_API_KEY');
      updateEnvExample(
        projectRoot,
        { GEMINI_API_KEY: 'your_gemini_api_key_here' },
        'Google Gemini API Key',
        isDryRun,
        filesCreated,
      );
      safeWriteFile('app/routes/api.ai.ts', getGeminiRouteTemplate(model));
      nextSteps.push('Add your GEMINI_API_KEY to your local .env file');
      nextSteps.push('Run pnpm install (or npm install) to install newly added dependencies');
      nextSteps.push('Test your streaming endpoint with curl or ranu ai');
    } else if (canonicalAddon === 'ai-groq') {
      const model = args.model?.trim() || 'llama-3.3-70b-versatile';
      dependencies.push('@ranu/ai', '@ranu/ai-groq');
      envVars.push('GROQ_API_KEY');
      updateEnvExample(
        projectRoot,
        { GROQ_API_KEY: 'your_groq_api_key_here' },
        'Groq LPU Ultra-Fast Inference API Key',
        isDryRun,
        filesCreated,
      );
      safeWriteFile('app/routes/api.ai.ts', getGroqRouteTemplate(model));
      nextSteps.push('Add your GROQ_API_KEY to your local .env file');
      nextSteps.push('Run pnpm install (or npm install) to install newly added dependencies');
      nextSteps.push('Test your sub-10ms streaming endpoint with curl or ranu ai');
    } else if (canonicalAddon === 'ai-claude') {
      const model = args.model?.trim() || 'claude-3-5-sonnet-20241022';
      dependencies.push('@ranu/ai', '@ranu/ai-claude');
      envVars.push('ANTHROPIC_API_KEY');
      updateEnvExample(
        projectRoot,
        { ANTHROPIC_API_KEY: 'your_anthropic_api_key_here' },
        'Anthropic Claude API Key',
        isDryRun,
        filesCreated,
      );
      safeWriteFile('app/routes/api.ai.ts', getClaudeRouteTemplate(model));
      nextSteps.push('Add your ANTHROPIC_API_KEY to your local .env file');
      nextSteps.push('Run pnpm install (or npm install) to install newly added dependencies');
      nextSteps.push('Test your Claude tool-calling endpoint with curl or ranu ai');
    } else if (canonicalAddon === 'ai-codex') {
      const model = args.model?.trim() || 'gpt-4o';
      dependencies.push('@ranu/ai', '@ranu/ai-codex');
      envVars.push('CODEX_API_KEY');
      updateEnvExample(
        projectRoot,
        { CODEX_API_KEY: 'your_codex_api_key_here' },
        'Codex API Key',
        isDryRun,
        filesCreated,
      );
      safeWriteFile('app/routes/api.ai.ts', getCodexRouteTemplate(model));
      nextSteps.push('Add your CODEX_API_KEY to your local .env file');
      nextSteps.push('Run pnpm install (or npm install) to install newly added dependencies');
      nextSteps.push('Test your Codex streaming endpoint with curl or ranu ai');
    } else if (canonicalAddon === 'ai-openai') {
      const model = args.model?.trim() || 'gpt-4o';
      dependencies.push('@ranu/ai', '@ranu/ai-openai');
      envVars.push('OPENAI_API_KEY');
      updateEnvExample(
        projectRoot,
        { OPENAI_API_KEY: 'your_openai_api_key_here' },
        'OpenAI API Key',
        isDryRun,
        filesCreated,
      );
      safeWriteFile('app/routes/api.ai.ts', getOpenAIRouteTemplate(model));
      nextSteps.push('Add your OPENAI_API_KEY to your local .env file');
      nextSteps.push('Run pnpm install (or npm install) to install newly added dependencies');
      nextSteps.push('Test your OpenAI streaming endpoint with curl or ranu ai');
    } else if (canonicalAddon === 'ai-custom') {
      const customName = args.name?.trim() || 'custom';
      if (!/^[a-zA-Z0-9_-]+$/.test(customName)) {
        throw new Error(
          `Invalid --name "${customName}". Name must contain only alphanumeric characters, dashes, and underscores.`,
        );
      }

      const customEndpoint = args.endpoint?.trim() || 'http://localhost:11434';
      try {
        const parsed = new URL(customEndpoint);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          throw new Error(
            `Invalid --endpoint protocol "${parsed.protocol}". Only "http:" and "https:" URLs are supported.`,
          );
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes('protocol')) {
          throw e;
        }
        throw new Error(`Invalid --endpoint "${customEndpoint}". Must be a valid HTTP or HTTPS URL.`);
      }

      const customModel = args.model?.trim() || 'llama3';
      if (!/^[a-zA-Z0-9_.:/-]+$/.test(customModel)) {
        throw new Error(`Invalid --model "${customModel}". Model identifier contains invalid characters.`);
      }

      dependencies.push('@ranu/ai', '@ranu/ai-custom');
      envVars.push('CUSTOM_AI_KEY', 'CUSTOM_AI_ENDPOINT');
      updateEnvExample(
        projectRoot,
        {
          CUSTOM_AI_KEY: 'your_custom_api_key_here',
          CUSTOM_AI_ENDPOINT: customEndpoint,
        },
        'Custom AI / Enterprise Proxy / Local Ollama',
        isDryRun,
        filesCreated,
      );
      safeWriteFile('app/routes/api.ai.ts', getCustomRouteTemplate(customEndpoint, customModel));
      nextSteps.push('Add your CUSTOM_AI_KEY (if required) to your local .env file');
      nextSteps.push(`Ensure your custom AI endpoint is running at ${customEndpoint}`);
      nextSteps.push('Run pnpm install (or npm install) to install newly added dependencies');
      nextSteps.push('Test your custom AI streaming endpoint with curl or ranu ai');
    }

    // 3. Record package.json changes
    const pkgJsonPath = sanitizeTargetFilePath(projectRoot, 'package.json');
    if (fs.existsSync(pkgJsonPath) && (dependencies.length > 0 || devDependencies.length > 0)) {
      try {
        const pkgContent = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
          [key: string]: unknown;
        };
        if (dependencies.length > 0) {
          pkgContent.dependencies = pkgContent.dependencies || {};
          for (const dep of dependencies) {
            pkgContent.dependencies[dep] = pkgContent.dependencies[dep] || '^0.1.0';
          }
        }
        if (devDependencies.length > 0) {
          pkgContent.devDependencies = pkgContent.devDependencies || {};
          for (const dep of devDependencies) {
            pkgContent.devDependencies[dep] = pkgContent.devDependencies[dep] || '^0.1.0';
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
      addon: canonicalAddon,
      dryRun: isDryRun ? true : undefined,
      filesCreated,
      dependencies,
      devDependencies,
      envVars: envVars.length > 0 ? envVars : undefined,
      nextSteps: nextSteps.length > 0 ? nextSteps : undefined,
    };

    if (isJson) {
      logger.json(result);
    } else {
      logger.success(
        `Successfully configured add-on "${canonicalAddon}"${isDryRun ? ' (dry-run)' : ''}!`,
      );
      if (filesCreated.length > 0) {
        logger.info(isDryRun ? 'Proposed files (dry-run):' : 'Configured files:');
        filesCreated.forEach((f) => logger.info(`  + ${f}`));
      }
      if (dependencies.length > 0 || devDependencies.length > 0) {
        logger.info(isDryRun ? 'Packages to add:' : 'Added packages:');
        [...dependencies, ...devDependencies].forEach((p) => logger.info(`  • ${p}`));
      }
      if (envVars.length > 0) {
        logger.info('Required environment variables:');
        envVars.forEach((v) => logger.info(`  • ${v}`));
      }
      if (nextSteps.length > 0) {
        logger.info('Next steps:');
        nextSteps.forEach((step, idx) => logger.info(`  ${idx + 1}. ${step}`));
      }
      if (isDryRun) {
        logger.info('\nDry-run mode: no files were written to disk. Re-run without --dry-run to apply.\n');
      }
    }

    return Promise.resolve(0);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (isJson) {
      logger.json({
        success: false,
        error: message,
        hint: message.includes('--force')
          ? 'Pass --force to overwrite the existing route file.'
          : undefined,
      });
    } else {
      logger.error(message);
      if (message.includes('--force')) {
        logger.info(`To overwrite existing files, rerun with: ranu add ${canonicalAddon} --force`);
      }
    }
    return Promise.resolve(1);
  }
}
