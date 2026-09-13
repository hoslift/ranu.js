import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';

export interface RunProcessResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface SpawnManagedOptions extends SpawnOptions {
  timeoutMs?: number;
}

const activeProcesses = new Set<ChildProcess>();

/**
 * Terminate a process and its child process tree cleanly across Windows and Linux.
 */
export async function terminateProcessTree(child: ChildProcess): Promise<void> {
  if (!child.pid || child.killed) return;

  const pid = child.pid;
  activeProcesses.delete(child);

  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
        stdio: 'ignore',
      });
      killer.on('close', () => resolve());
      killer.on('error', () => resolve());
    });
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        child.kill('SIGKILL');
      } catch {
        // Process already terminated
      }
    }
  }
}

/**
 * Run a command to completion and capture stdout/stderr with execution timeout guards.
 */
export async function runCommand(
  cmd: string,
  args: string[],
  options: SpawnManagedOptions = {},
): Promise<RunProcessResult> {
  const { timeoutMs = 60000, ...spawnOpts } = options;
  const startTime = Date.now();

  return new Promise<RunProcessResult>((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const child = spawn(cmd, args, {
      ...spawnOpts,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    activeProcesses.add(child);

    let timer: NodeJS.Timeout | null = null;
    if (timeoutMs > 0) {
      timer = setTimeout(async () => {
        await terminateProcessTree(child);
        reject(new Error(`Command timed out after ${timeoutMs}ms: ${cmd} ${args.join(' ')}`));
      }, timeoutMs);
    }

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', async (err) => {
      if (timer) clearTimeout(timer);
      activeProcesses.delete(child);
      reject(err);
    });

    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      activeProcesses.delete(child);
      resolve({
        code,
        signal,
        stdout,
        stderr,
        durationMs: Date.now() - startTime,
      });
    });
  });
}

/**
 * Register global exit handlers to kill any active child processes.
 */
export async function cleanupAllProcesses(): Promise<void> {
  const toKill = Array.from(activeProcesses);
  await Promise.all(toKill.map((p) => terminateProcessTree(p)));
}
