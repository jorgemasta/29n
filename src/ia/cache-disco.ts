// File-system cache for CLI runs (node only). One JSON file per key under `dir`.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AlmacenCache } from './cache';

export function crearCacheEnDisco(dir: string): AlmacenCache {
  return {
    async leer(clave) {
      try {
        return JSON.parse(await readFile(join(dir, `${clave}.json`), 'utf8'));
      } catch {
        return undefined;
      }
    },
    async guardar(clave, valor) {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `${clave}.json`), JSON.stringify(valor, null, 2) + '\n');
    },
  };
}
