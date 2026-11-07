import { createHash, timingSafeEqual } from 'node:crypto';

export interface VipMiddlewareOptions {
  /**
   * Expected secret token string or getter returning the secret token.
   */
  secretToken: string | (() => string | Promise<string>);

  /**
   * URL pathname prefix to guard. Defaults to '/vip'.
   */
  pathPrefix?: string;

  /**
   * Query parameter name containing the VIP token. Defaults to 'token'.
   */
  paramName?: string;

  /**
   * Header name containing the VIP token. Defaults to 'x-vip-token'.
   */
  headerName?: string;

  /**
   * When true, returns 404 Not Found instead of 401/403 when unauthorized,
   * completely obscuring the existence of the VIP preview endpoint. Defaults to true.
   */
  hideEndpoint?: boolean;

  /**
   * Custom response body for 404 Not Found responses.
   */
  customNotFoundBody?: string;
}

export const VIP_ROBOTS_HEADER_VALUE = 'noindex, nofollow, noarchive, nosnippet';
export const VIP_CACHE_CONTROL_HEADER_VALUE = 'private, no-cache, no-store, max-age=0, must-revalidate';

/**
 * Constant-time timing-safe comparison of candidate and expected secret tokens.
 * Computes SHA-256 digests first so that buffers of identical length (32 bytes)
 * are always compared, eliminating token length leakage via timing side-channels.
 */
export function verifyVipToken(
  candidateToken: string | null | undefined,
  expectedToken: string
): boolean {
  if (!candidateToken || !expectedToken) {
    return false;
  }

  try {
    const candidateHash = createHash('sha256').update(candidateToken).digest();
    const expectedHash = createHash('sha256').update(expectedToken).digest();

    return timingSafeEqual(candidateHash, expectedHash);
  } catch {
    return false;
  }
}

/**
 * Injects anti-indexing and private caching headers to protect confidential VIP previews.
 */
export function applyVipHeaders(headers: Headers): void {
  headers.set('X-Robots-Tag', VIP_ROBOTS_HEADER_VALUE);
  headers.set('Cache-Control', VIP_CACHE_CONTROL_HEADER_VALUE);
}

/**
 * Constructs a 404 response to obscure VIP endpoint existence.
 */
export function createVipNotFoundResponse(customBody?: string): Response {
  return new Response(customBody ?? '404 Not Found', {
    status: 404,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Robots-Tag': VIP_ROBOTS_HEADER_VALUE,
    },
  });
}

/**
 * Creates middleware to protect confidential VIP preview endpoints.
 *
 * Enforces:
 * 1. Strict secret token validation using timing-safe SHA-256 byte comparisons.
 * 2. 404 Not Found security gating when unauthenticated (hiding endpoint existence).
 * 3. Automatic `X-Robots-Tag: noindex, nofollow` headers on all authorized responses.
 */
export function createVipMiddleware(options: VipMiddlewareOptions) {
  const pathPrefix = options.pathPrefix ?? '/vip';
  const paramName = options.paramName ?? 'token';
  const headerName = options.headerName ?? 'x-vip-token';
  const hideEndpoint = options.hideEndpoint !== false;

  return async function handleVipRequest(
    request: Request,
    next: () => Promise<Response>
  ): Promise<Response> {
    const url = new URL(request.url);

    // Only guard routes matching the VIP prefix
    if (!url.pathname.startsWith(pathPrefix)) {
      return next();
    }

    // Resolve expected secret token
    const expectedSecret =
      typeof options.secretToken === 'function'
        ? await options.secretToken()
        : options.secretToken;

    if (!expectedSecret) {
      // Configuration error or unconfigured secret - fail closed
      return hideEndpoint
        ? createVipNotFoundResponse(options.customNotFoundBody)
        : new Response('VIP Endpoint Not Configured', { status: 500 });
    }

    // Extract token from query param, custom header, or Authorization header
    let candidateToken = url.searchParams.get(paramName);

    if (!candidateToken) {
      candidateToken = request.headers.get(headerName);
    }

    if (!candidateToken) {
      const authHeader = request.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        candidateToken = authHeader.slice(7).trim();
      }
    }

    // Timing-safe validation
    const isValid = verifyVipToken(candidateToken, expectedSecret);

    if (!isValid) {
      if (hideEndpoint) {
        return createVipNotFoundResponse(options.customNotFoundBody);
      }
      return new Response('Unauthorized VIP Access', {
        status: 401,
        headers: {
          'X-Robots-Tag': VIP_ROBOTS_HEADER_VALUE,
        },
      });
    }

    // Authorized VIP preview request: proceed and ensure crawler suppression headers
    const response = await next();
    const modifiedHeaders = new Headers(response.headers);
    applyVipHeaders(modifiedHeaders);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: modifiedHeaders,
    });
  };
}
