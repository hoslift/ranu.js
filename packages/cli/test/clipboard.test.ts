import { describe, it, expect, vi } from 'vitest';
import { copyToClipboard, type ClipboardSpawner } from '../src/clipboard.js';
import { EventEmitter } from 'node:events';

describe('@ranu/cli clipboard utility', () => {
  it('resolves false gracefully when child process emits error', async () => {
    const mockChild = new EventEmitter();
    const mockStdin = {
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
    };
    (mockChild as Record<string, unknown>).stdin = mockStdin;

    const mockSpawner: ClipboardSpawner = vi.fn().mockImplementation(() => {
      setTimeout(() => {
        mockChild.emit('error', new Error('spawn ENOENT'));
      }, 5);
      return mockChild as any;
    });

    const result = await copyToClipboard('test snippet', mockSpawner);
    expect(result).toBe(false);
  });

  it('resolves false gracefully when spawn throws synchronous exception', async () => {
    const mockSpawner: ClipboardSpawner = vi.fn().mockImplementation(() => {
      throw new Error('EPERM: operation not permitted');
    });

    const result = await copyToClipboard('test snippet', mockSpawner);
    expect(result).toBe(false);
  });

  it('resolves true when child process closes with code 0', async () => {
    const mockChild = new EventEmitter();
    const mockStdin = {
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
    };
    (mockChild as Record<string, unknown>).stdin = mockStdin;

    const mockSpawner: ClipboardSpawner = vi.fn().mockImplementation((command, args) => {
      setTimeout(() => {
        mockChild.emit('close', 0);
      }, 5);
      return mockChild as any;
    });

    const result = await copyToClipboard('hello clipboard', mockSpawner);
    expect(result).toBe(true);
    expect(mockSpawner).toHaveBeenCalled();
    expect(mockStdin.write).toHaveBeenCalledWith('hello clipboard', 'utf-8');
    expect(mockStdin.end).toHaveBeenCalled();
  });

  it('resolves false when child process closes with non-zero exit code', async () => {
    const mockChild = new EventEmitter();
    const mockStdin = {
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
    };
    (mockChild as Record<string, unknown>).stdin = mockStdin;

    const mockSpawner: ClipboardSpawner = vi.fn().mockImplementation(() => {
      setTimeout(() => {
        mockChild.emit('close', 1);
      }, 5);
      return mockChild as any;
    });

    const result = await copyToClipboard('snippet', mockSpawner);
    expect(result).toBe(false);
  });
});
