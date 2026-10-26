import type { MiddlewareHeadersInit } from '@ranu/runtime';

export interface Cookie {
  readonly name: string;
  readonly value: string;
}

export type CookieSameSite = 'strict' | 'lax' | 'none' | 'Strict' | 'Lax' | 'None' | boolean;

export interface CookieSetOptions {
  readonly path?: string | undefined;
  readonly domain?: string | undefined;
  readonly maxAge?: number | undefined;
  readonly expires?: Date | number | undefined;
  readonly httpOnly?: boolean | undefined;
  readonly secure?: boolean | undefined;
  readonly sameSite?: CookieSameSite | undefined;
}

export interface CookieDeleteOptions {
  readonly path?: string | undefined;
  readonly domain?: string | undefined;
}

export interface CookieStore {
  get(name: string): Cookie | undefined;
  getAll(name?: string): readonly Cookie[];
  has(name: string): boolean;
  set(name: string, value: string, options?: CookieSetOptions): this;
  delete(name: string, options?: CookieDeleteOptions): this;
}

export interface MiddlewareContext {
  readonly requestId: string;
  readonly params: Record<string, string | string[]>;
  readonly locals: Map<string, unknown>;
  readonly signal: AbortSignal;
}

export interface MiddlewareNextOptions {
  headers?: MiddlewareHeadersInit;
}

/**
 * Context passed to API Route Handlers (05_SERVER_RUNTIME_SPEC.md §27, 11_PUBLIC_API_SPECIFICATION.md §61).
 */
export interface RouteHandlerContext {
  readonly params: Readonly<Record<string, string | string[]>>;
}

/**
 * Standard API route handler function signature (11_PUBLIC_API_SPECIFICATION.md §60).
 */
export type RouteHandler = (
  request: Request,
  context: RouteHandlerContext
) => Promise<Response> | Response;

/**
 * Readonly wrapper over standard WHATWG Headers.
 * Exposes inspection and iteration methods while strictly preventing mutation
 * at both compile time and runtime.
 */
export interface ReadonlyHeaders extends Iterable<[string, string]> {
  get(name: string): string | null;
  has(name: string): boolean;
  getSetCookie?(): string[];
  forEach(callbackfn: (value: string, key: string, parent: ReadonlyHeaders) => void, thisArg?: any): void;
  entries(): IterableIterator<[string, string]>;
  keys(): IterableIterator<string>;
  values(): IterableIterator<string>;
  [Symbol.iterator](): IterableIterator<[string, string]>;

  /**
   * @deprecated Mutating request headers is disallowed. Use Response headers instead.
   */
  set?(name: string, value: string): void;
  /**
   * @deprecated Mutating request headers is disallowed. Use Response headers instead.
   */
  append?(name: string, value: string): void;
  /**
   * @deprecated Mutating request headers is disallowed. Use Response headers instead.
   */
  delete?(name: string): void;
}
