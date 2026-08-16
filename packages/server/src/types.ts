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
