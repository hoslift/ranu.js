import fs from 'node:fs';
import path from 'node:path';
import type { DevFileChangeCategory, DevFileEvent } from './types.js';
import { isStaticAssetFile } from '@ranu/build';

export interface ProjectWatcherOptions {
  readonly projectRoot: string;
  readonly debounceMs?: number | undefined;
  readonly onChange: (events: DevFileEvent[]) => void;
  readonly onError?: (error: Error) => void;
}

export function categorizeChangedFile(relativePath: string): DevFileChangeCategory {
  const normalized = relativePath.replace(/\\/g, '/');

  if (normalized.startsWith('public/')) {
    return 'public';
  }

  if (
    normalized.startsWith('ranu.config.') ||
    normalized === 'package.json' ||
    normalized.startsWith('tsconfig')
  ) {
    return 'config';
  }

  if (normalized.startsWith('.env')) {
    return 'env';
  }

  if (normalized.endsWith('.css') || normalized.endsWith('.module.css')) {
    return 'css';
  }

  if (isStaticAssetFile(normalized)) {
    return 'asset';
  }

  const base = path.basename(normalized);
  if (
    base.startsWith('page.') ||
    base.startsWith('layout.') ||
    base.startsWith('loading.') ||
    base.startsWith('error.') ||
    base.startsWith('not-found.') ||
    base.startsWith('route.')
  ) {
    return 'route';
  }

  return 'other';
}

export function shouldIgnoreFile(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/');

  // Ignored directory prefixes and patterns
  if (
    normalized.startsWith('.git') ||
    normalized.startsWith('node_modules') ||
    normalized.startsWith('.ranu') ||
    normalized.startsWith('dist') ||
    normalized.startsWith('docs')
  ) {
    return true;
  }

  const base = path.basename(normalized);
  // Ignore editor temp files
  if (
    base.startsWith('.') &&
    (base.endsWith('.swp') || base.endsWith('.tmp') || base.endsWith('.bak'))
  ) {
    return true;
  }
  if (base.endsWith('~') || base.startsWith('#') || base.endsWith('#')) {
    return true;
  }

  return false;
}

export class ProjectWatcher {
  private readonly projectRoot: string;
  private readonly debounceMs: number;
  private readonly onChange: (events: DevFileEvent[]) => void;
  private readonly onError: ((error: Error) => void) | undefined;
  private isClosed = false;

  private watchers: fs.FSWatcher[] = [];
  private pendingEvents = new Map<string, DevFileEvent>();
  private debounceTimer: NodeJS.Timeout | null = null;

  constructor(options: ProjectWatcherOptions) {
    this.projectRoot = path.resolve(options.projectRoot);
    this.debounceMs = options.debounceMs ?? 80;
    this.onChange = options.onChange;
    this.onError = options.onError;

    this.startWatching();
  }

  private startWatching(): void {
    const watchTargets = [
      this.projectRoot,
      path.join(this.projectRoot, 'app'),
      path.join(this.projectRoot, 'public'),
    ].filter(dir => fs.existsSync(dir));

    // Deduplicate watch targets
    const uniqueTargets = Array.from(new Set(watchTargets));

    for (const target of uniqueTargets) {
      try {
        const watcher = fs.watch(
          target,
          { recursive: true },
          (_eventType: string, filename: string | null) => {
            if (this.isClosed || !filename) return;

            const fullPath = path.isAbsolute(filename)
              ? filename
              : path.join(target, filename);

            const relPath = path.relative(this.projectRoot, fullPath).replace(/\\/g, '/');
            if (shouldIgnoreFile(relPath)) {
              return;
            }

            const exists = fs.existsSync(fullPath);
            const type: DevFileEvent['type'] = exists ? 'change' : 'unlink';
            const category = categorizeChangedFile(relPath);

            const event: DevFileEvent = {
              type,
              relativePath: relPath,
              fullPath,
              category,
            };

            this.queueEvent(event);
          }
        );

        watcher.on('error', (err) => {
          if (!this.isClosed && this.onError) {
            this.onError(err);
          }
        });

        this.watchers.push(watcher);
      } catch (err) {
        if (this.onError && !this.isClosed) {
          this.onError(err as Error);
        }
      }
    }
  }

  private queueEvent(event: DevFileEvent): void {
    // Coalesce rapid events by relative path
    this.pendingEvents.set(event.relativePath, event);

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.flushEvents();
    }, this.debounceMs);
  }

  private flushEvents(): void {
    if (this.isClosed || this.pendingEvents.size === 0) {
      return;
    }

    const events = Array.from(this.pendingEvents.values());
    this.pendingEvents.clear();
    this.debounceTimer = null;

    try {
      this.onChange(events);
    } catch (err) {
      if (this.onError && !this.isClosed) {
        this.onError(err as Error);
      }
    }
  }

  close(): void {
    if (this.isClosed) return;
    this.isClosed = true;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingEvents.clear();

    for (const w of this.watchers) {
      try {
        w.close();
      } catch {
        // Ignore watcher close errors
      }
    }
    this.watchers = [];
  }
}
