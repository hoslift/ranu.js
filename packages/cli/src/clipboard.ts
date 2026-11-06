import { spawn } from 'node:child_process';

export type ClipboardSpawner = typeof spawn;

/**
 * Copies the given text to the system clipboard across macOS, Windows, and Linux.
 * In headless environments or when no clipboard utility is installed, returns `false` without throwing.
 *
 * @param text - Plain text to copy to clipboard
 * @param spawner - Optional child process spawn function for testing
 * @returns `true` if successfully copied, `false` otherwise
 */
export async function copyToClipboard(
  text: string,
  spawner: ClipboardSpawner = spawn
): Promise<boolean> {
  const platform = process.platform;
  let command: string;
  let args: string[] = [];

  if (platform === 'darwin') {
    command = 'pbcopy';
  } else if (platform === 'win32') {
    command = 'clip';
  } else {
    // Linux / BSD / Wayland / X11
    command = process.env.WAYLAND_DISPLAY ? 'wl-copy' : 'xclip';
    if (command === 'xclip') {
      args = ['-selection', 'clipboard'];
    }
  }

  return new Promise<boolean>((resolve) => {
    try {
      const child = spawner(command, args, { stdio: ['pipe', 'ignore', 'ignore'] });

      child.on('error', () => {
        resolve(false);
      });

      child.on('close', (code) => {
        resolve(code === 0);
      });

      child.stdin.on('error', () => {
        resolve(false);
      });

      child.stdin.write(text, 'utf-8');
      child.stdin.end();
    } catch {
      resolve(false);
    }
  });
}
