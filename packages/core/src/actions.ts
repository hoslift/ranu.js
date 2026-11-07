/**
 * Standard Schema v1 specification issue format.
 */
export interface StandardSchemaIssue {
  readonly message: string;
  readonly path?: readonly (string | number | symbol)[];
}

/**
 * Standard Schema v1 specification interface (Zod 3.24+, Valibot, ArkType).
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
    ) =>
      | { readonly value: Output; readonly issues?: undefined }
      | { readonly issues: readonly StandardSchemaIssue[]; readonly value?: undefined }
      | Promise<
          | { readonly value: Output; readonly issues?: undefined }
          | { readonly issues: readonly StandardSchemaIssue[]; readonly value?: undefined }
        >;
  };
}

/**
 * Schema supporting Standard Schema v1, Zod safeParse, or validation function.
 */
export type SchemaLike<T = any> =
  | StandardSchemaV1<unknown, T>
  | {
      safeParse(data: unknown):
        | { success: true; data: T }
        | { success: false; error: { issues: readonly { message: string; path?: readonly (string | number)[] }[] } };
    }
  | ((data: unknown) => Promise<T> | T);

export interface FormActionOptions<TInput, TOutput> {
  readonly schema?: SchemaLike<TInput>;
  readonly handler: (data: TInput, request?: Request) => Promise<TOutput> | TOutput;
}

export type FormActionResult<TOutput> =
  | { readonly success: true; readonly data: TOutput; readonly errors?: undefined; readonly formErrors?: undefined }
  | {
      readonly success: false;
      readonly errors: Record<string, string[]>;
      readonly formErrors: string[];
      readonly data?: undefined;
    };

export type FormAction<TInput, TOutput> = {
  (input: FormData | Request | Record<string, unknown>): Promise<FormActionResult<TOutput>>;
  raw(data: TInput, request?: Request): Promise<TOutput>;
};

/**
 * Server Action Metadata recorded in ActionManifest.
 */
export interface ServerActionMetadata {
  readonly actionId: string; // e.g. "act_a8f9c1b2d3e4"
  readonly routeId: string;  // e.g. "app/actions/user.ts"
  readonly exportName: string;
  readonly astSignatureHash: string;
  readonly isMutating?: boolean | undefined;
}

/**
 * Action Manifest schema.
 */
export interface ActionManifest {
  readonly schemaVersion: number;
  readonly buildId: string;
  readonly actions: Record<string, ServerActionMetadata>;
  readonly previousBuildGraceActions?: Record<string, ServerActionMetadata> | undefined;
}

/**
 * Structured error frame emitted mid-stream when a streaming Server Action fails.
 */
export interface MidStreamErrorFrame {
  readonly $e: true;
  readonly code: string;
  readonly message: string;
  readonly recoverable: boolean;
}

/**
 * Error thrown in client stubs when a mid-stream exception frame is received.
 */
export class RanuActionStreamError extends Error {
  readonly code: string;
  readonly recoverable: boolean;

  constructor(message: string, code = 'ACTION_STREAM_ERROR', recoverable = false) {
    super(message);
    this.name = 'RanuActionStreamError';
    this.code = code;
    this.recoverable = recoverable;
  }
}

