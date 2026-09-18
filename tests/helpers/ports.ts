import net from 'node:net';

const allocatedPorts = new Set<number>();

/**
 * Discover an ephemeral TCP port.
 * Returns an available port number. In-memory set tracks ports chosen within the current
 * process to reduce collision probability among concurrent tests.
 */
export async function getAvailablePort(): Promise<number> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const port = await new Promise<number>((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (typeof addr === 'object' && addr !== null) {
          const p = addr.port;
          server.close(() => resolve(p));
        } else {
          server.close(() => reject(new Error('Failed to resolve port address')));
        }
      });
    });

    if (!allocatedPorts.has(port)) {
      allocatedPorts.add(port);
      return port;
    }
  }

  throw new Error('Unable to allocate a free TCP port after 20 attempts');
}

/**
 * Release a previously tracked port.
 */
export function releasePort(port: number): void {
  allocatedPorts.delete(port);
}

/**
 * Retry-capable action runner for actions that bind to a port and may encounter EADDRINUSE.
 * Retries with exponential backoff and a new port if an address collision occurs.
 */
export async function withPortRetry<T>(
  action: (port: number) => Promise<T>,
  maxRetries = 5,
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const port = await getAvailablePort();
    try {
      return await action(port);
    } catch (err: any) {
      lastError = err;
      releasePort(port);
      const isAddrInUse =
        err?.code === 'EADDRINUSE' ||
        String(err?.message ?? '').includes('EADDRINUSE') ||
        String(err?.stderr ?? '').includes('EADDRINUSE');
      if (isAddrInUse && attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 100 * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
