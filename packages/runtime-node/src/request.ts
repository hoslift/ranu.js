import type { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';

/**
 * Convert a Node.js IncomingMessage URL to a full URL string.
 */
export function buildRequestUrl(
  req: { url?: string | undefined; headers: Record<string, string | string[] | undefined> },
  defaultHost = 'localhost',
): string {
  const hostHeader = req.headers['host'];
  const host = Array.isArray(hostHeader) ? hostHeader[0] : (hostHeader ?? defaultHost);
  const url = req.url ?? '/';

  // Detect protocol (support standard x-forwarded-proto behind reverse proxies)
  const protoHeader = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : (protoHeader ?? 'http');
  const normalizedProto = proto === 'https' ? 'https' : 'http';

  return `${normalizedProto}://${host}${url}`;
}

/**
 * Converts a Node.js IncomingMessage into a Web standard Request object.
 */
export function toWebRequest(
  req: IncomingMessage,
  signal: AbortSignal,
  defaultHost = 'localhost',
): Request {
  const url = buildRequestUrl(req, defaultHost);
  const method = req.method?.toUpperCase() ?? 'GET';

  const webHeaders = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        webHeaders.append(key, v);
      }
    } else if (value !== undefined) {
      webHeaders.append(key, value);
    }
  }

  // GET and HEAD request constructors throw if a body is present
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const body = hasBody ? Readable.toWeb(req) : null;

  return new Request(url, {
    method,
    headers: webHeaders,
    body: body as any,
    duplex: hasBody ? 'half' : undefined,
    signal,
  } as any);
}
