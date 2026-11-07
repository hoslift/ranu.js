import type { CacheStore, CacheEntry } from './types.js';

/**
 * In-memory CacheStore implementation with secondary tag indexing and monotonic invalidation tracking.
 */
export class MemoryCacheStore implements CacheStore {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly tagIndex = new Map<string, Set<string>>();
  private readonly keyTags = new Map<string, Set<string>>();
  private readonly invalidationTimestamps = new Map<string, number>();

  get<T>(key: string): Promise<CacheEntry<T> | undefined> {
    const entry = this.entries.get(key);
    if (!entry) {
      return Promise.resolve(undefined);
    }
    return Promise.resolve(entry as CacheEntry<T>);
  }

  set<T>(
    key: string,
    value: T,
    options: {
      ttl: number;
      tags?: string[];
      swr?: number;
      revalidatedAt?: number;
    },
  ): Promise<void> {
    const now = Date.now();
    const tags = options.tags ? [...new Set(options.tags)] : [];

    // Clean up previous tag associations if overwriting an existing key
    this.cleanKeyTags(key);

    const entry: CacheEntry<T> = {
      value,
      createdAt: now,
      revalidatedAt: options.revalidatedAt ?? now,
      ttlMs: options.ttl,
      tags,
      ...(options.swr !== undefined ? { staleWhileRevalidateMs: options.swr } : {}),
    };

    this.entries.set(key, entry as CacheEntry<unknown>);

    if (tags.length > 0) {
      const tagSet = new Set<string>();
      for (const tag of tags) {
        tagSet.add(tag);
        let keysForTag = this.tagIndex.get(tag);
        if (!keysForTag) {
          keysForTag = new Set<string>();
          this.tagIndex.set(tag, keysForTag);
        }
        keysForTag.add(key);
      }
      this.keyTags.set(key, tagSet);
    }

    return Promise.resolve();
  }

  async delete(key: string): Promise<void> {
    await this.recordInvalidation(key, Date.now());
    this.cleanKeyTags(key);
    this.entries.delete(key);
  }

  async deleteByTag(tag: string): Promise<number> {
    const now = Date.now();
    await this.recordInvalidation(tag, now);

    const keys = this.tagIndex.get(tag);
    if (!keys || keys.size === 0) {
      return 0;
    }

    const keysToDelete = Array.from(keys);
    let count = 0;

    for (const key of keysToDelete) {
      await this.recordInvalidation(key, now);
      this.cleanKeyTags(key);
      if (this.entries.delete(key)) {
        count++;
      }
    }

    this.tagIndex.delete(tag);
    return count;
  }

  async deleteByPrefix(prefix: string): Promise<number> {
    const now = Date.now();
    await this.recordInvalidation(prefix, now);

    let count = 0;
    const keysToDelete: string[] = [];

    for (const key of this.entries.keys()) {
      if (key === prefix || key.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      await this.recordInvalidation(key, now);
      this.cleanKeyTags(key);
      if (this.entries.delete(key)) {
        count++;
      }
    }

    return count;
  }

  recordInvalidation(keyOrTag: string, timestamp: number): Promise<void> {
    const current = this.invalidationTimestamps.get(keyOrTag) ?? 0;
    this.invalidationTimestamps.set(keyOrTag, Math.max(current, timestamp));
    return Promise.resolve();
  }

  getLastInvalidatedAt(keyOrTag: string): Promise<number | undefined> {
    return Promise.resolve(this.invalidationTimestamps.get(keyOrTag));
  }

  clear(): Promise<void> {
    this.entries.clear();
    this.tagIndex.clear();
    this.keyTags.clear();
    this.invalidationTimestamps.clear();
    return Promise.resolve();
  }

  private cleanKeyTags(key: string): void {
    const existingTags = this.keyTags.get(key);
    if (existingTags) {
      for (const tag of existingTags) {
        const keysForTag = this.tagIndex.get(tag);
        if (keysForTag) {
          keysForTag.delete(key);
          if (keysForTag.size === 0) {
            this.tagIndex.delete(tag);
          }
        }
      }
      this.keyTags.delete(key);
    }
  }
}
