import http from 'node:http';

export interface PollReadyOptions {
  timeoutMs?: number;
  intervalMs?: number;
  expectedStatus?: number;
}

/**
 * Poll an HTTP URL until it responds with expected status or timeout is reached.
 */
export async function waitForHttpReady(
  url: string,
  options: PollReadyOptions = {},
): Promise<void> {
  const { timeoutMs = 20000, intervalMs = 150, expectedStatus = 200 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const ok = await new Promise<boolean>((resolve) => {
        const req = http.get(url, (res) => {
          res.resume();
          resolve(res.statusCode === expectedStatus);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(1000, () => {
          req.destroy();
          resolve(false);
        });
      });

      if (ok) return;
    } catch {
      // Retry
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`Timed out waiting for HTTP service at ${url} after ${timeoutMs}ms`);
}

/**
 * Simple HTTP request helper returning status, headers, and text body.
 */
export async function fetchText(
  url: string,
  options: http.RequestOptions = {},
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          body,
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}
