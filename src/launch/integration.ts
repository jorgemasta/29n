// Astro integration: checks the launch rules before building (fails fast, prints every warning) and,
// in production, removes from dist/ the static files of parties without a public official programme
// (simulated PDFs, page texts of provisional sources).
import { readFile, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import type { AstroIntegration } from 'astro';
import type { Dataset } from '../dataset';
import { nonPublishableFiles, setupPublication } from './index';

async function list(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((e) => e.isFile()).map((e) => relative(dir, join(e.parentPath, e.name)).split('\\').join('/'));
}

export function launch(): AstroIntegration {
  const read = async () => setupPublication(JSON.parse(await readFile('data/dataset.json', 'utf8')) as Dataset, process.env);
  return {
    name: '29n-launch',
    hooks: {
      'astro:build:start': async ({ logger }) => {
        const p = await read();
        logger.info(`modo ${p.mode}${p.production ? ', PRODUCCIÓN' : ', vista previa'}${p.indexable ? ', indexable' : ', sin indexar'}`);
        for (const a of p.warnings) logger.warn(`⚠ ${a}`);
        if (p.errors.length) throw new Error(`Build de producción bloqueado (docs/deploy.md, «Lanzamiento»):\n- ${p.errors.join('\n- ')}`);
      },
      'astro:build:done': async ({ dir, logger }) => {
        const p = await read();
        if (!p.production) return;
        const root = fileURLToPath(dir);
        const remove = nonPublishableFiles(p.dataset, await list(root));
        for (const f of remove) {
          await rm(join(root, f));
          logger.warn(`⚠ excluido del build de producción: ${f}`);
        }
      },
    },
  };
}
