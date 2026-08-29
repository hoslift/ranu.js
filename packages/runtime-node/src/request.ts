import type { IncomingMessage, IncomingHttpHeaders } from 'node:http';
import { Readable } from 'node:stream';
import { parseBodyLimit, createLimitedReadableStream, PayloadTooLargeError } from './body-limit.js';

export interface BuildRequestUrlOptions {
  readonly defaultHost?: string | undefined;
  readonly trustProxy?: boolean | undefined;
}

export interface ToWebRequestOptions {
  readonly defaultHost?: string | undefined;
  readonly trustProxy?: boolean | undefined;
  readonly bodyLimit?: number | string | undefined;
}

/** Narrow safe interface for Node.js streamed Request construction. */
export interface NodeRequestInit extends RequestInit {
  duplex?: 'half';
}

export interface RequestUrlInput {
  readonly url?: string | undefined;
  readonly headers: IncomingHttpHeaders | Record<string, string | string[] | undefined>;
  readonly socket?: unknown;
}

/**
 * Safely constructs an absolute URL from a Node.js IncomingMessage.
 * Does NOT blindly trust forwarded headers (X-Forwarded-Proto, X-Forwarded-Host)
 * unless explicit trustProxy configuration is enabled.
 */
export function buildRequestUrl(req: RequestUrlInput, options?: BuildRequestUrlOptions): string {
  const trustProxy = options?.trustProxy ?? false;
  const defaultHost = options?.defaultHost ?? 'localhost';

  const isEncrypted = Boolean(
    req.socket &&
    typeof req.socket === 'object' &&
    'encrypted' in req.socket &&
    (req.socket as { encrypted?: boolean }).encrypted,
  );
  let protocol = isEncrypted ? 'https' : 'http';
  let host = defaultHost;

  if (trustProxy) {
    const protoHeader = req.headers['x-forwarded-proto'];
    const protoVal = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader;
    if (typeof protoVal === 'string') {
      const normalizedProto = protoVal.split(',')[0]?.trim().toLowerCase();
      if (normalizedProto === 'https' || normalizedProto === 'http') {
        protocol = normalizedProto;
      }
    }

    const forwardedHostHeader = req.headers['x-forwarded-host'];
    const forwardedHostVal = Array.isArray(forwardedHostHeader)
      ? forwardedHostHeader[0]
      : forwardedHostHeader;
    if (typeof forwardedHostVal === 'string' && forwardedHostVal.trim().length > 0) {
      host = forwardedHostVal.split(',')[0]?.trim() ?? defaultHost;
    } else {
      const hostHeader = req.headers['host'];
      const hostVal = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
      if (typeof hostVal === 'string' && hostVal.trim().length > 0) {
        host = hostVal.trim();
      }
    }
  } else {
    const hostHeader = req.headers['host'];
    const hostVal = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
    if (typeof hostVal === 'string' && hostVal.trim().length > 0) {
      host = hostVal.trim();
    }
  }

  const rawUrl = req.url ?? '/';
  return `${protocol}://${host}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
}

/**
 * Converts a Node.js IncomingMessage into a standard Web Request object.
 * Enforces body size limits and streams request bodies without full in-memory buffering.
 */
export function toWebRequest(
  req: IncomingMessage,
  signal: AbortSignal,
  options?: ToWebRequestOptions,
): Request {
  const url = buildRequestUrl(req, {
    defaultHost: options?.defaultHost,
    trustProxy: options?.trustProxy,
  });

  const method = (req.method ?? 'GET').toUpperCase();

  // Convert Node IncomingHttpHeaders to Web Headers
  const webHeaders = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        webHeaders.append(key, item);
      }
    } else {
      webHeaders.append(key, value);
    }
  }

  const maxBodyBytes = parseBodyLimit(options?.bodyLimit);

  // Early Content-Length check for fast 413 rejection before consuming stream
  const contentLengthStr = req.headers['content-length'];
  if (contentLengthStr !== undefined) {
    const contentLength = parseInt(
      Array.isArray(contentLengthStr) ? contentLengthStr[0]! : contentLengthStr,
      10,
    );
    if (!Number.isNaN(contentLength) && contentLength > maxBodyBytes) {
      throw new PayloadTooLargeError(
        `Request body Content-Length of ${contentLength} bytes exceeds limit of ${maxBodyBytes} bytes.`,
      );
    }
  }

  // GET and HEAD request constructors throw in standard Web API if body is provided
  const hasBody = method !== 'GET' && method !== 'HEAD';
  let body: ReadableStream<Uint8Array> | null = null;

  if (hasBody) {
    const rawWebStream = Readable.toWeb(req) as ReadableStream<Uint8Array>;
    body = createLimitedReadableStream(rawWebStream, maxBodyBytes);
  }

  const requestInit: NodeRequestInit = {
    method,
    headers: webHeaders,
    body,
    ...(hasBody ? { duplex: 'half' } : {}),
    signal,
  };

  return new Request(url, requestInit);
}
