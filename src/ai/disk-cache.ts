// File-system cache for CLI runs (node only). One JSON file per key under `dir`.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CacheStore } from './cache';

export function createDiskCache(dir: string): CacheStore {
  return {
    async read(key) {
      try {
        return JSON.parse(await readFile(join(dir, `${key}.json`), 'utf8'));
      } catch {
        return undefined;
      }
    },
    async save(key, value) {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `${key}.json`), JSON.stringify(value, null, 2) + '\n');
    },
  };
}
