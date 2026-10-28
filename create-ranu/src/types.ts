/**
 * Package managers supported for project scaffolding and dependency installation.
 */
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

/**
 * Project template names supported for scaffolding.
 */
export type TemplateName = 'default' | 'minimal' | 'cloudflare' | 'node-docker' | 'api-routes' | 'saas' | 'ai-studio';

/**
 * Official deployment adapters supported for scaffolding.
 */
export type SupportedAdapter = 'cloudflare' | 'node' | 'netlify' | 'bun' | 'deno' | 'vercel';

/**
 * Supported AI engines for project scaffolding.
 */
export type AIEngineName = 'none' | 'gemini' | 'groq' | 'claude' | 'openai' | 'custom';

/**
 * Type aliases for AIEngineName.
 */
export type AIEngine = AIEngineName;
export type AIEngineChoice = AIEngineName;

/**
 * Readonly array of all supported AI engines.
 */
export const SUPPORTED_AI_ENGINES: readonly AIEngineName[] = [
  'none',
  'gemini',
  'groq',
  'claude',
  'openai',
  'custom',
] as const;

/**
 * Options controlling project scaffolding in create-ranu.
 */
export interface ScaffoldOptions {
  /**
   * Target directory path for the new project (relative or absolute).
   */
  projectPath: string;

  /**
   * Package name in package.json. Defaults to target directory basename.
   */
  projectName?: string | undefined;

  /**
   * Project template to scaffold ('default', 'minimal', 'cloudflare', 'node-docker', 'api-routes', 'saas').
   * Defaults to 'default'.
   */
  template?: TemplateName | undefined;

  /**
   * Deployment adapter to configure in ranu.config.ts and package.json.
   */
  adapter?: string | undefined;

  /**
   * Whether to configure unit and component test suites.
   * Defaults to false.
   */
  tests?: boolean | undefined;

  /**
   * Package manager to configure in scripts and run commands.
   * Defaults to detected package manager or 'npm'.
   */
  packageManager?: PackageManager | undefined;

  /**
   * Whether to install dependencies after scaffolding.
   * Defaults to false in non-interactive/scriptable modes.
   */
  install?: boolean | undefined;

  /**
   * Whether to initialize a git repository.
   * Defaults to false.
   */
  git?: boolean | undefined;

  /**
   * Whether to force creation if the target directory already exists and is non-empty.
   * Defaults to false.
   */
  force?: boolean | undefined;

  /**
   * Whether to suppress non-error console output.
   * Defaults to false.
   */
  quiet?: boolean | undefined;

  /**
   * AI engine integration to scaffold ('none', 'gemini', 'groq', 'claude', 'openai', 'custom').
   * Defaults to 'none' (Zero AI).
   */
  ai?: AIEngineName | undefined;

  /**
   * API key or session token for selected AI engine.
   */
  apiKey?: string | undefined;

  /**
   * Custom or local endpoint URL for selected AI engine.
   */
  endpoint?: string | undefined;

  /**
   * Base working directory for resolving relative project paths.
   * Defaults to process.cwd().
   */
  cwd?: string | undefined;
}

/**
 * Result returned after scaffolding a new Ranu.js project.
 */
export interface ScaffoldResult {
  /**
   * Whether the project was successfully scaffolded.
   */
  success: boolean;

  /**
   * Absolute path to the created project root directory.
   */
  projectPath: string;

  /**
   * Effective package name in package.json.
   */
  projectName: string;

  /**
   * Template used to scaffold the project.
   */
  template?: TemplateName | undefined;

  /**
   * Effective package manager used.
   */
  packageManager: PackageManager;

  /**
   * Relative paths of all files created.
   */
  filesCreated: string[];

  /**
   * Status of dependency installation.
   */
  installStatus?: 'installed' | 'skipped' | 'failed' | undefined;

  /**
   * Status of git repository initialization.
   */
  gitStatus?: 'initialized' | 'skipped' | 'failed' | undefined;

  /**
   * Configured AI engine.
   */
  ai?: AIEngineName | undefined;

  /**
   * Whether credentials or endpoint were configured during scaffolding.
   */
  hasCredentials?: boolean | undefined;

  /**
   * Error message if scaffolding failed.
   */
  error?: string | undefined;
}

/**
 * Result of project name or path validation.
 */
export interface ValidationResult {
  /**
   * Whether the input is valid.
   */
  valid: boolean;

  /**
   * List of validation error messages.
   */
  errors: string[];

  /**
   * List of validation warnings.
   */
  warnings: string[];
}
