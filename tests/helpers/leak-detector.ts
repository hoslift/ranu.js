import net from 'node:net';

/**
 * Check whether a TCP port is currently occupied / listening with bounded timeout.
 */
export async function isPortOccupied(port: number, timeoutMs = 500): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => finish(true));
    socket.on('timeout', () => finish(false));
    socket.on('error', () => finish(false));

    socket.connect(port, '127.0.0.1');
  });
}
