// Astro integration: checks the launch rules before building (fails fast, prints every warning) and,
// in production, removes from dist/ the static files of parties without a public official programme
// (simulated PDFs, page texts of provisional sources).
import { readFile, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import type { AstroIntegration } from 'astro';
import type { Dataset } from '../dataset';
import { archivosNoPublicables, configurarPublicacion } from './index';

async function listar(dir: string): Promise<string[]> {
  const entradas = await readdir(dir, { withFileTypes: true, recursive: true });
  return entradas.filter((e) => e.isFile()).map((e) => relative(dir, join(e.parentPath, e.name)).split('\\').join('/'));
}

export function lanzamiento(): AstroIntegration {
  const leer = async () => configurarPublicacion(JSON.parse(await readFile('data/dataset.json', 'utf8')) as Dataset, process.env);
  return {
    name: '29n-lanzamiento',
    hooks: {
      'astro:build:start': async ({ logger }) => {
        const p = await leer();
        logger.info(`modo ${p.modo}${p.produccion ? ', PRODUCCIÓN' : ', vista previa'}${p.indexable ? ', indexable' : ', sin indexar'}`);
        for (const a of p.avisos) logger.warn(`⚠ ${a}`);
        if (p.errores.length) throw new Error(`Build de producción bloqueado (docs/deploy.md, «Lanzamiento»):\n- ${p.errores.join('\n- ')}`);
      },
      'astro:build:done': async ({ dir, logger }) => {
        const p = await leer();
        if (!p.produccion) return;
        const raiz = fileURLToPath(dir);
        const quitar = archivosNoPublicables(p.dataset, await listar(raiz));
        for (const f of quitar) {
          await rm(join(raiz, f));
          logger.warn(`⚠ excluido del build de producción: ${f}`);
        }
      },
    },
  };
}
