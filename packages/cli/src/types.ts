import type { RanuMode } from '@ranu/core';
import type { ResolvedRanuConfig } from '@ranu/config';

export type CliCommand =
  | 'dev'
  | 'build'
  | 'start'
  | 'create'
  | 'deploy'
  | 'help'
  | 'version';

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
  readonly help?: boolean | undefined;
  readonly version?: boolean | undefined;
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
  readonly configFile?: string | undefined;
  readonly config: ResolvedRanuConfig;
  readonly mode: RanuMode;
  readonly logger: CliLogger;
  readonly isCI: boolean;
}
