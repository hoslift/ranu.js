/**
 * Package managers supported for project scaffolding and dependency installation.
 */
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

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
