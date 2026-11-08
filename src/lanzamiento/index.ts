// Public launch (#16): what a build may publish. Pure: the Astro pages (src/transparencia/datos.ts),
// robots.txt and the build integration (astro.config.mjs) all go through `configurarPublicacion`.
//
// - Preview build (`npm run build`, no PRODUCCION): never fails, never indexable; warns about test data.
// - Production build (`PRODUCCION=1`, used by `npm run deploy` and the watcher): FAILS unless the dataset
//   is real, valid, only has registered parties and every published programme comes from an official
//   domain. Provisional sources (2023 programme, party document, statements) are excluded loudly: those
//   parties ship as "programme pending".
import { aplicarModo, fuenteDe, esSoloPrivado, validarDataset, type Dataset, type Modo } from '../dataset';
import { verificarFuente } from '../pipeline/fuente';
import { DOMINIOS_OFICIALES, type DominiosOficiales } from '../registro/dominios';
import { PARTIDOS } from '../registro/partidos';
import { rutaTexto } from '../pregunta/textos';

export type Entorno = Record<string, string | undefined>;

export interface Publicacion {
  modo: Modo;
  /** `PRODUCCION=1`: the build that goes to the public domain. */
  produccion: boolean;
  /** Only a production build that passed every check can be indexed by search engines. */
  indexable: boolean;
  /** Dataset after the mode filter: what the pages ship. */
  dataset: Dataset;
  /** Non-empty ⇒ the production build must fail. */
  errores: string[];
  /** Printed loudly by the build. */
  avisos: string[];
}

export interface OpcionesPublicacion {
  /** Party ids that meet the inclusion criterion (default: src/registro/partidos.ts). */
  registro?: string[];
  /** Official domains per party (default: src/registro/dominios.ts, V7). */
  dominios?: DominiosOficiales;
}

export function configurarPublicacion(bruto: Dataset, env: Entorno, opciones: OpcionesPublicacion = {}): Publicacion {
  const modo: Modo = env.MODO === 'privado' ? 'privado' : 'publico';
  const produccion = env.PRODUCCION === '1';
  const registro = new Set(opciones.registro ?? Object.keys(PARTIDOS));
  const dominios = opciones.dominios ?? DOMINIOS_OFICIALES;
  const dataset = aplicarModo(bruto, modo);
  const problemas: string[] = [];
  const avisos: string[] = [];

  if (bruto.origen !== 'real') problemas.push(`el dataset es «${bruto.origen}» (datos de prueba), no real`);
  if (modo === 'privado') problemas.push('el prototipo privado (MODO=privado) no puede ser el build de producción');
  const v = validarDataset(bruto);
  if (!v.valido) problemas.push(...v.errores.map((e) => `dataset no válido (V9): ${e}`));
  for (const p of bruto.partidos) {
    if (p.prueba) problemas.push(`${p.id}: partido ficticio de prueba`);
    if (!registro.has(p.id)) problemas.push(`${p.id}: no está en el registro de partidos (criterio de inclusión)`);
  }
  for (const p of dataset.partidos) {
    if (p.programa.estado !== 'publicado') continue;
    const f = verificarFuente(p, dominios);
    if (!f.ok) problemas.push(`${p.id}: fuente no oficial (V7): ${f.detalle}`);
  }
  if (modo === 'publico') {
    for (const p of bruto.partidos) {
      const f = fuenteDe(p);
      if (f && esSoloPrivado(f)) avisos.push(`${p.id}: fuente provisional (${f}) excluida; sale como «programa pendiente»`);
    }
  }

  if (!produccion && problemas.length) {
    avisos.unshift('build de vista previa (sin PRODUCCION=1): con estos datos el build de producción fallaría', ...problemas.map((x) => `  · ${x}`));
  }
  const errores = produccion ? problemas : [];
  return { modo, produccion, indexable: produccion && errores.length === 0, dataset, errores, avisos };
}

/**
 * Static files (paths relative to dist/) that belong to a party without a public official programme
 * in `dataset`: simulated PDFs (programas/<id>.pdf) and page texts (textos/<id>.json).
 */
export function archivosNoPublicables(dataset: Dataset, archivos: string[]): string[] {
  const publicados = new Set(dataset.partidos.filter((p) => p.programa.estado === 'publicado').map((p) => p.id));
  const permitidos = new Set([...publicados].map((id) => rutaTexto(id)));
  return archivos.filter((a) => {
    if (a.startsWith('programas/')) return true; // real programmes are linked on the party's site, never copied
    if (a.startsWith('textos/')) return !permitidos.has(a);
    return false;
  });
}

export function textoRobots(indexable: boolean): string {
  return indexable
    ? 'User-agent: *\nAllow: /\n'
    : '# Not the production build: not indexed.\nUser-agent: *\nDisallow: /\n';
}
