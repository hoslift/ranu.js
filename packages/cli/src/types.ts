import type { ResolvedRanuConfig, RanuMode } from '@ranu/config';

export type CliCommand =
  | 'dev'
  | 'build'
  | 'start'
  | 'create'
  | 'deploy'
  | 'help'
  | 'version';

export interface ParsedCliArgs {
  readonly command?: CliCommand;
  readonly args: readonly string[];
  readonly root?: string;
  readonly port?: number;
  readonly host?: string;
  readonly clean?: boolean;
  readonly open?: boolean;
  readonly verbose?: boolean;
  readonly debug?: boolean;
  readonly quiet?: boolean;
  readonly json?: boolean;
  readonly help?: boolean;
  readonly version?: boolean;
  readonly [key: string]: unknown;
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
  readonly configFile?: string;
  readonly config: ResolvedRanuConfig;
  readonly mode: RanuMode;
  readonly logger: CliLogger;
  readonly isCI: boolean;
}
