import type { RanuRequestContext } from '@ranu/runtime';
import { getRequestContext } from './context.js';
import type { Cookie, CookieSetOptions, CookieDeleteOptions, CookieStore } from './types.js';

const cookieStoreCache = new WeakMap<RanuRequestContext, CookieStore>();

/**
 * Validates cookie name against RFC 6265 disallowed characters.
 */
function validateCookieName(name: string): void {
  if (!name || typeof name !== 'string') {
    throw new TypeError('Cookie name must be a non-empty string.');
  }
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    if (code <= 31 || code === 127) {
      throw new TypeError(`Invalid cookie name "${name}". Cookie names cannot contain whitespace, control characters, or separators (=, ;, \\).`);
    }
  }
  if (/[\s,;=\\]/.test(name)) {
    throw new TypeError(`Invalid cookie name "${name}". Cookie names cannot contain whitespace, control characters, or separators (=, ;, \\).`);
  }
}

/**
 * Safely decodes a cookie value.
 */
function safeDecode(val: string): string {
  try {
    return decodeURIComponent(val);
  } catch {
    return val;
  }
}

/**
 * Parses a standard HTTP Cookie header into Cookie records.
 */
function parseCookieHeader(headerValue: string | null | undefined): Cookie[] {
  if (!headerValue || typeof headerValue !== 'string') {
    return [];
  }

  const cookies: Cookie[] = [];
  const pairs = headerValue.split(';');

  for (const pair of pairs) {
    const trimmed = pair.trim();
    if (!trimmed) {
      continue;
    }

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) {
      // Key-only cookie pair
      const name = trimmed;
      if (name.length > 0) {
        cookies.push({ name, value: '' });
      }
      continue;
    }

    const name = trimmed.slice(0, eqIdx).trim();
    let rawValue = trimmed.slice(eqIdx + 1).trim();

    // Strip wrapping quotes if present
    if (rawValue.startsWith('"') && rawValue.endsWith('"') && rawValue.length >= 2) {
      rawValue = rawValue.slice(1, -1);
    }

    if (name.length > 0) {
      cookies.push({
        name,
        value: safeDecode(rawValue),
      });
    }
  }

  return cookies;
}

/**
 * Serializes a cookie and its options into a standard Set-Cookie header string.
 */
function serializeSetCookie(name: string, value: string, options?: CookieSetOptions): string {
  validateCookieName(name);

  // Prevent CRLF injection in values
  if (/[\r\n]/.test(value)) {
    throw new TypeError('Cookie value cannot contain newline characters (CRLF injection prevention).');
  }

  const parts: string[] = [`${name}=${encodeURIComponent(value)}`];

  if (options?.maxAge !== undefined) {
    const maxAge = Math.floor(options.maxAge);
    if (!Number.isFinite(maxAge)) {
      throw new TypeError('Cookie maxAge must be a finite number.');
    }
    parts.push(`Max-Age=${maxAge}`);
  }

  if (options?.expires !== undefined) {
    let expiresDate: Date;
    if (options.expires instanceof Date) {
      expiresDate = options.expires;
    } else if (typeof options.expires === 'number') {
      expiresDate = new Date(options.expires);
    } else {
      expiresDate = new Date(options.expires);
    }

    if (!Number.isNaN(expiresDate.getTime())) {
      parts.push(`Expires=${expiresDate.toUTCString()}`);
    }
  }

  if (options?.domain) {
    parts.push(`Domain=${options.domain}`);
  }

  const path = options?.path ?? '/';
  if (path) {
    parts.push(`Path=${path}`);
  }

  if (options?.secure) {
    parts.push('Secure');
  }

  if (options?.httpOnly) {
    parts.push('HttpOnly');
  }

  if (options?.sameSite !== undefined) {
    const rawSameSite = options.sameSite;
    if (typeof rawSameSite === 'boolean') {
      if (rawSameSite) {
        parts.push('SameSite=Strict');
      }
    } else if (typeof rawSameSite === 'string') {
      const lower = rawSameSite.toLowerCase();
      if (lower === 'strict') {
        parts.push('SameSite=Strict');
      } else if (lower === 'lax') {
        parts.push('SameSite=Lax');
      } else if (lower === 'none') {
        parts.push('SameSite=None');
      }
    }
  }

  return parts.join('; ');
}

/**
 * Provider-neutral CookieStore implementation.
 * Manages request cookie lookups and records response cookie mutations into the request context.
 */
class CookieStoreImpl implements CookieStore {
  private readonly parsedCookies: Cookie[];
  private readonly cookieMap: Map<string, Cookie[]>;

  constructor(private readonly context: RanuRequestContext) {
    const rawCookieHeader = context.request.headers.get('cookie');
    this.parsedCookies = parseCookieHeader(rawCookieHeader);
    this.cookieMap = new Map<string, Cookie[]>();

    for (const cookie of this.parsedCookies) {
      const existing = this.cookieMap.get(cookie.name);
      if (existing) {
        existing.push(cookie);
      } else {
        this.cookieMap.set(cookie.name, [cookie]);
      }
    }
  }

  get(name: string): Cookie | undefined {
    const list = this.cookieMap.get(name);
    return list && list.length > 0 ? list[0] : undefined;
  }

  getAll(name?: string): readonly Cookie[] {
    if (name !== undefined) {
      return this.cookieMap.get(name) ?? [];
    }

    const all: Cookie[] = [];
    for (const list of this.cookieMap.values()) {
      all.push(...list);
    }
    return all;
  }

  has(name: string): boolean {
    const list = this.cookieMap.get(name);
    return Boolean(list && list.length > 0);
  }

  set(name: string, value: string, options?: CookieSetOptions): this {
    validateCookieName(name);
    const serialized = serializeSetCookie(name, value, options);

    // Update in-memory map for subsequent get/has calls within this request
    const updatedCookie: Cookie = { name, value };
    this.cookieMap.set(name, [updatedCookie]);

    // Record response mutation in typed context.responseCookies array
    this.context.responseCookies.push(serialized);

    return this;
  }

  delete(name: string, options?: CookieDeleteOptions): this {
    validateCookieName(name);

    // Remove from in-memory map for subsequent get/has calls within this request
    this.cookieMap.delete(name);

    // Emit expired Set-Cookie header
    const deleteOptions: CookieSetOptions = {
      path: options?.path ?? '/',
      domain: options?.domain,
      maxAge: 0,
      expires: new Date(0),
    };

    const serialized = serializeSetCookie(name, '', deleteOptions);

    // Record response mutation in typed context.responseCookies array
    this.context.responseCookies.push(serialized);

    return this;
  }
}

/**
 * Accesses the CookieStore for reading incoming request cookies and mutating outgoing response cookies.
 */
export function cookies(): CookieStore {
  const context = getRequestContext();
  let store = cookieStoreCache.get(context);
  if (!store) {
    store = new CookieStoreImpl(context);
    cookieStoreCache.set(context, store);
  }
  return store;
}
