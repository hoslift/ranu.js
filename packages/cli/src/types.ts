import type { RanuMode } from '@ranu/core';
import type { ResolvedRanuConfig } from '@ranu/config';

export type CliCommand =
  | 'dev'
  | 'build'
  | 'start'
  | 'create'
  | 'deploy'
  | 'describe'
  | 'check'
  | 'fix'
  | 'generate'
  | 'add'
  | 'ai'
  | 'prompt'
  | 'help'
  | 'version';

export type OutputFormat = 'text' | 'json' | 'compact';

export interface ParsedCliArgs {
  readonly command?: CliCommand | undefined;
  readonly args: readonly string[];
  readonly root?: string | undefined;
  readonly port?: number | undefined;
  readonly host?: string | undefined;
  readonly clean?: boolean | undefined;
  readonly open?: boolean | undefined;
  readonly verbose?: boolean | undefined;
  readonly debug?: boolean | undefined;
  readonly quiet?: boolean | undefined;
  readonly json?: boolean | undefined;
  readonly format?: OutputFormat | undefined;
  readonly adapter?: string | undefined;
  readonly client?: boolean | undefined;
  readonly dryRun?: boolean | undefined;
  readonly yes?: boolean | undefined;
  readonly force?: boolean | undefined;
  readonly name?: string | undefined;
  readonly endpoint?: string | undefined;
  readonly model?: string | undefined;
  readonly provider?: string | undefined;
  readonly files?: readonly string[] | undefined;
  readonly target?: string | undefined;
  readonly copy?: boolean | undefined;
  readonly stdout?: boolean | undefined;
  readonly help?: boolean | undefined;
  readonly version?: boolean | undefined;
  readonly [key: string]: unknown;
}

export interface AddOnResult {
  readonly success: boolean;
  readonly addon: string;
  readonly dryRun?: boolean | undefined;
  readonly filesCreated: readonly string[];
  readonly dependencies: readonly string[];
  readonly devDependencies: readonly string[];
  readonly envVars?: readonly string[] | undefined;
  readonly nextSteps?: readonly string[] | undefined;
  readonly error?: string | undefined;
  readonly hint?: string | undefined;
}

export interface CliLogger {
  info(message: string, ...args: unknown[]): void;
  success(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  log(message: string, ...args: unknown[]): void;
  json(data: unknown): void;
}

export interface CliContext {
  readonly cwd: string;
  readonly projectRoot: string;
  readonly configFile?: string | undefined;
  readonly config: ResolvedRanuConfig;
  readonly mode: RanuMode;
  readonly logger: CliLogger;
  readonly isCI: boolean;
}
