/**
 * @ranu/runtime-node
 *
 * Node.js HTTP bridge — converts Node IncomingMessage/ServerResponse to
 * Web Request/Response and back.
 * Internal package — not public application API.
 *
 * Phase 0 skeleton — full implementation in Phase 7.
 */

/**
 * Convert a Node.js IncomingMessage URL to a full URL string.
 * Stub — full implementation in Phase 7.
 */
export function buildRequestUrl(
  req: { url?: string; headers: Record<string, string | string[] | undefined> },
  defaultHost = 'localhost',
): string {
  const host = (req.headers['host'] as string | undefined) ?? defaultHost;
  const url = req.url ?? '/';
  return `http://${host}${url}`;
}
