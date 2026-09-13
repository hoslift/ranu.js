import net from 'node:net';

const allocatedPorts = new Set<number>();

/**
 * Allocate an available TCP port safely.
 * Uses ephemeral port binding (port 0) while tracking actively reserved ports
 * across the current process to prevent race conditions during test runs.
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
 * Release a previously reserved port back to the free pool.
 */
export function releasePort(port: number): void {
  allocatedPorts.delete(port);
}
