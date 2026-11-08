// Programme watcher, run by .github/workflows/vigilante.yml every 2 h (or by hand).
//   npx tsx scripts/vigilar.ts [--partido erc] [--forzar] [--sin-publicar]
// --partido: only that party (manual relaunch). --forzar: process even if the PDF is unchanged
// (with the committed AI cache the result is identical and free). --sin-publicar: dry run, writes
// nothing, no git, no deploy (notices go to the console).
// Env: ANTHROPIC_API_KEY (+ optional AI_GATEWAY_URL); NTFY_TOPIC (+ optional NTFY_TOKEN,
// NTFY_SERVER) for phone notices; CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID for `npm run deploy`.
// PUSH=1 pushes each commit (the workflow sets it).
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { Dataset } from '../src/dataset';
import { crearCacheEnDisco } from '../src/ia/cache-disco';
import { crearIAClaude } from '../src/ia/claude';
import { PARTIDOS } from '../src/registro/partidos';
import { TEMAS } from '../src/registro/temas';
import { RUTA_DATASET, RUTA_ESTADO, vigilar, type Aviso, type Cambio, type Descarga, type EstadoVigilante } from '../src/vigilante';
import { FUENTES_PROGRAMAS } from '../src/vigilante/fuentes';
import { crearAvisoNtfy } from '../src/vigilante/ntfy';

const { values } = parseArgs({
  options: {
    partido: { type: 'string' },
    forzar: { type: 'boolean', default: false },
    'sin-publicar': { type: 'boolean', default: false },
  },
});
const seco = values['sin-publicar'];
const DIR_CACHE = 'data/cache/ia';
const MAX_BYTES = 80 * 1024 * 1024;

const git = (...args: string[]) => execFileSync('git', args, { stdio: 'inherit' });
const hayCambios = (ruta: string) => execFileSync('git', ['status', '--porcelain', '--', ruta], { encoding: 'utf8' }).trim() !== '';
const empujar = () => {
  if (process.env.PUSH === '1') git('push');
};

/** Commit the AI cache on its own, so a failed deploy can drop the data commit and keep the cache. */
function guardarCache() {
  if (seco || !hayCambios(DIR_CACHE)) return;
  git('add', DIR_CACHE);
  git('commit', '-m', 'vigilante: caché de IA');
}

async function descargar(url: string): Promise<Descarga> {
  const r = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000),
    headers: { 'user-agent': '29n-vigilante (+https://29n.jorgemasta.com/)', accept: 'text/html,application/pdf' },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error(`${url}: demasiado grande (${bytes.length} bytes)`);
  // Magic bytes, not the content-type: some servers send PDFs as octet-stream.
  if (new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-') return { tipo: 'pdf', bytes };
  return { tipo: 'html', texto: new TextDecoder().decode(bytes) };
}

async function guardar(c: Cambio) {
  if (seco) {
    console.log(`[sin publicar] ${c.mensaje}: ${Object.keys(c.archivos).join(', ')}${c.desplegar ? ' + despliegue' : ''}`);
    return;
  }
  guardarCache();
  for (const [ruta, contenido] of Object.entries(c.archivos)) {
    await mkdir(dirname(ruta), { recursive: true });
    await writeFile(ruta, contenido);
  }
  git('add', ...Object.keys(c.archivos));
  git('commit', '-m', c.mensaje);
  if (c.desplegar) {
    try {
      execFileSync('npm', ['run', 'deploy'], { stdio: 'inherit' });
    } catch (e) {
      // Leave the repo (and the live site) as they were before this programme.
      git('reset', '--hard', 'HEAD~1');
      throw new Error(`despliegue fallido: ${e instanceof Error ? e.message : e}`);
    }
  }
  empujar();
}

const consola = async (a: Aviso) => console.log(`[aviso ${a.tipo}] ${a.titulo}\n${a.mensaje}`);
const avisoMovil = process.env.NTFY_TOPIC
  ? crearAvisoNtfy({ topic: process.env.NTFY_TOPIC, token: process.env.NTFY_TOKEN || undefined, servidor: process.env.NTFY_SERVER || undefined })
  : null;
if (!avisoMovil) console.warn('NTFY_TOPIC no definido: los avisos solo salen por consola.');

const leerJson = async (ruta: string, defecto: unknown) => {
  try {
    return JSON.parse(await readFile(ruta, 'utf8'));
  } catch {
    return defecto;
  }
};

const r = await vigilar(
  {
    dataset: Dataset.parse(await leerJson(RUTA_DATASET, null)),
    estado: (await leerJson(RUTA_ESTADO, {})) as EstadoVigilante,
    fuentes: FUENTES_PROGRAMAS,
    partidos: PARTIDOS,
  },
  {
    descargar,
    ia: crearIAClaude(),
    cache: crearCacheEnDisco(DIR_CACHE),
    guardar,
    avisar: async (a) => {
      await consola(a);
      if (avisoMovil && !seco) await avisoMovil(a);
    },
    ahora: () => new Date(),
  },
  { partido: values.partido, forzar: values.forzar, proceso: { temas: TEMAS } },
);

// AI answers paid for in runs that published nothing (blocked or crashed) are kept too.
guardarCache();
if (!seco) empujar();

for (const x of r.resultados) console.log(`${x.partido}: ${x.resultado}${x.url ? ` ${x.url}` : ''}${x.motivo ? ` (${x.motivo})` : ''}`);
for (const e of r.erroresFuente) console.warn(`fuente no disponible (${e.partido}): ${e.url}: ${e.error}`);
for (const e of r.erroresAviso) console.error(`aviso no entregado: ${e}`);
// A failed notice fails the job, so GitHub's own e-mail still reaches the maintainer.
if (r.erroresAviso.length > 0) process.exit(1);
