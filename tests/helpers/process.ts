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
      // Kill the entire process group if spawned detached
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
 * Uses detached process group on POSIX to enable clean process-tree termination.
 * Resolves pnpm to pnpm.cmd on Windows to ensure reliable subprocess execution.
 */
export async function runCommand(
  cmd: string,
  args: string[],
  options: SpawnManagedOptions = {},
): Promise<RunProcessResult> {
  const { timeoutMs = 60000, ...spawnOpts } = options;
  const startTime = Date.now();

  const resolvedCmd =
    process.platform === 'win32' && cmd === 'pnpm' ? 'pnpm.cmd' : cmd;

  return new Promise<RunProcessResult>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let isSettled = false;

    const child = spawn(resolvedCmd, args, {
      ...spawnOpts,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    activeProcesses.add(child);

    const settleResolve = (result: RunProcessResult) => {
      if (isSettled) return;
      isSettled = true;
      activeProcesses.delete(child);
      resolve(result);
    };

    const settleReject = (err: Error) => {
      if (isSettled) return;
      isSettled = true;
      activeProcesses.delete(child);
      reject(err);
    };

    let timer: NodeJS.Timeout | null = null;
    if (timeoutMs > 0) {
      timer = setTimeout(async () => {
        await terminateProcessTree(child);
        settleReject(
          new Error(`Command timed out after ${timeoutMs}ms: ${cmd} ${args.join(' ')}`),
        );
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
      settleReject(err);
    });

    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      settleResolve({
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
