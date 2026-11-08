// Programme watcher (runs every 2–3 h, see .github/workflows/vigilante.yml). Single entry point:
//   vigilar({dataset, estado, fuentes, partidos}, puertos, opciones) → {dataset, estado, resultados}
// For each party: read its sources (official pages, aggregators or the PDF itself) → pick the
// programme PDF on an official domain → compare its hash with the last one seen → run the data
// pipeline → publish (commit + deploy) if publishable, or keep the previous state if blocked →
// notify the maintainer's phone. Every side effect goes through `puertos`, so tests use fakes.
import { createHash } from 'node:crypto';
import type { Dataset, Partido, TipoFuente } from '../dataset/esquema';
import type { AdaptadorIA } from '../ia/adaptador';
import type { AlmacenCache } from '../ia/cache';
import { procesarPrograma, type OpcionesProceso } from '../pipeline';
import { verificarFuente } from '../pipeline/fuente';
import { contextoPublicado, fusionarPrograma } from '../pipeline/publicar';
import { DOMINIOS_OFICIALES } from '../registro/dominios';
import { TEMAS } from '../registro/temas';

/** A page (official site or aggregator) or a PDF URL where a party's programme may appear. */
export interface FuenteVigilada {
  partido: string;
  url: string;
  /** Case-insensitive regex the PDF URL must match (to tell the programme from other PDFs). */
  patron?: string;
  titulo?: string;
  fuente?: TipoFuente;
}

export type Descarga = { tipo: 'pdf'; bytes: Uint8Array } | { tipo: 'html'; texto: string };

/** Last programme seen per party (committed as data/vigilante.json so runs remember it). */
export type EstadoVigilante = Record<
  string,
  { url: string; hash: string; fecha: string; resultado: 'publicado' | 'bloqueado'; motivo?: string }
>;

/** Files to commit; `desplegar` also builds and deploys the site. Throws if anything fails. */
export interface Cambio {
  mensaje: string;
  archivos: Record<string, string>;
  desplegar: boolean;
}

export interface Aviso {
  tipo: 'publicado' | 'fallo';
  titulo: string;
  mensaje: string;
}

export interface Puertos {
  descargar(url: string): Promise<Descarga>;
  ia: AdaptadorIA;
  /** AI answer cache (committed with the data: re-running the same PDF is free and identical). */
  cache?: AlmacenCache;
  guardar(cambio: Cambio): Promise<void>;
  avisar(aviso: Aviso): Promise<void>;
  ahora(): Date;
}

export interface OpcionesVigilancia {
  /** Manual relaunch: only this party. */
  partido?: string;
  /** Process even if the PDF has not changed. */
  forzar?: boolean;
  /** Passed through to procesarPrograma (temas, terminos, dominios…). */
  proceso?: OpcionesProceso;
}

export type ResultadoPartido = {
  partido: string;
  resultado: 'publicado' | 'bloqueado' | 'sin_cambios' | 'sin_programa' | 'error';
  url?: string;
  motivo?: string;
};

export interface ResultadoVigilancia {
  dataset: Dataset;
  estado: EstadoVigilante;
  resultados: ResultadoPartido[];
  /** Sources that could not be read (logged, not notified: party sites go down often). */
  erroresFuente: { partido: string; url: string; error: string }[];
  /** Notices that could not be delivered (never turn a publication into a failure). */
  erroresAviso: string[];
}

export const RUTA_DATASET = 'data/dataset.json';
export const RUTA_ESTADO = 'data/vigilante.json';
const rutaInforme = (p: string) => `data/informes/${p}.json`;
const rutaBloqueado = (p: string) => `data/informes/bloqueados/${p}.json`;
const aJson = (x: unknown) => JSON.stringify(x, null, 2) + '\n';
const mensajeError = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function vigilar(
  entrada: {
    dataset: Dataset;
    estado: EstadoVigilante;
    fuentes: FuenteVigilada[];
    partidos: Record<string, Omit<Partido, 'programa'>>;
  },
  puertos: Puertos,
  opciones: OpcionesVigilancia = {},
): Promise<ResultadoVigilancia> {
  if (opciones.partido && !entrada.partidos[opciones.partido])
    throw new Error(`Partido desconocido: ${opciones.partido}`);
  const dominios = opciones.proceso?.dominios ?? DOMINIOS_OFICIALES;
  const temas = opciones.proceso?.temas ?? TEMAS;

  let dataset = entrada.dataset;
  let estado = entrada.estado;
  const resultados: ResultadoPartido[] = [];
  const erroresFuente: ResultadoVigilancia['erroresFuente'] = [];
  const erroresAviso: string[] = [];
  const avisar = (a: Aviso) => puertos.avisar(a).catch((e) => void erroresAviso.push(`${a.titulo}: ${mensajeError(e)}`));

  // One download per URL per run (an aggregator page serves several parties).
  const descargas = new Map<string, Promise<Descarga>>();
  const descargar = (url: string) => {
    if (!descargas.has(url)) descargas.set(url, puertos.descargar(url));
    return descargas.get(url)!;
  };

  const ids = opciones.partido ? [opciones.partido] : [...new Set(entrada.fuentes.map((f) => f.partido))];
  for (const id of ids) {
    const registro = entrada.partidos[id];
    if (!registro) continue;
    const fuentes = entrada.fuentes.filter((f) => f.partido === id);

    // 1. Find the programme: first source (in listed order) that yields an official PDF.
    let encontrado: { fuente: FuenteVigilada; url: string; bytes: Uint8Array } | null = null;
    for (const fuente of fuentes) {
      try {
        encontrado = await buscarPrograma(fuente, descargar, (url) => esOficial(registro, url, dominios));
      } catch (e) {
        erroresFuente.push({ partido: id, url: fuente.url, error: mensajeError(e) });
      }
      if (encontrado) break;
    }
    if (!encontrado) {
      resultados.push({ partido: id, resultado: 'sin_programa' });
      continue;
    }

    // 2. New or changed? (hash of the bytes)
    const { fuente, url, bytes } = encontrado;
    const hash = createHash('sha256').update(bytes).digest('hex');
    const actual = dataset.partidos.find((p) => p.id === id)?.programa;
    const visto = estado[id]?.hash === hash || (actual?.estado === 'publicado' && actual.hashPdf === hash);
    if (visto && !opciones.forzar) {
      resultados.push({ partido: id, resultado: 'sin_cambios', url });
      continue;
    }

    // 3. Run the data pipeline and publish (or not).
    const partido: Partido = {
      ...registro,
      programa: { estado: 'publicado', fuente: fuente.fuente ?? 'programa-29n', url, titulo: fuente.titulo ?? 'Programa electoral 2026' },
    };
    const ahora = puertos.ahora();
    const fecha = ahora.toISOString().slice(0, 10);
    const nombre = `${registro.siglas}`;
    try {
      const resultado = await procesarPrograma(bytes, partido, puertos.ia, {
        ...opciones.proceso,
        ...contextoPublicado(dataset, id),
        cache: puertos.cache ?? opciones.proceso?.cache,
        fecha,
      });
      const fusion = fusionarPrograma(dataset, partido, resultado, {
        temas,
        generado: ahora.toISOString(),
        fecha,
        registro: entrada.partidos,
      });

      if (!fusion.ok) {
        // Blocked: nothing of this party is published; remember the hash so it is not retried.
        const nuevoEstado = { ...estado, [id]: { url, hash, fecha, resultado: 'bloqueado' as const, motivo: fusion.motivo } };
        await puertos.guardar({
          mensaje: `vigilante: ${id} bloqueado (${fusion.motivo})`,
          archivos: { [rutaBloqueado(id)]: aJson(resultado.informe), [RUTA_ESTADO]: aJson(nuevoEstado) },
          desplegar: false,
        });
        estado = nuevoEstado;
        resultados.push({ partido: id, resultado: 'bloqueado', url, motivo: fusion.motivo });
        await avisar({
          tipo: 'fallo',
          titulo: `29N: programa de ${nombre} bloqueado`,
          mensaje: `${fusion.motivo}\n${resultado.informe.descartadas}/${resultado.informe.extraidas} posturas descartadas. ${url}`,
        });
        continue;
      }

      const nuevoEstado = { ...estado, [id]: { url, hash, fecha, resultado: 'publicado' as const } };
      await puertos.guardar({
        mensaje: `vigilante: publica el programa de ${id}`,
        archivos: {
          [RUTA_DATASET]: aJson(fusion.dataset),
          [rutaInforme(id)]: aJson(resultado.informe),
          [RUTA_ESTADO]: aJson(nuevoEstado),
        },
        desplegar: true,
      });
      dataset = fusion.dataset;
      estado = nuevoEstado;
      const propone = resultado.posturas.filter((p) => p.estado === 'propone').length;
      resultados.push({ partido: id, resultado: 'publicado', url });
      await avisar({
        tipo: 'publicado',
        titulo: `29N: publicado el programa de ${nombre}`,
        mensaje: `${propone} postura(s) con propuesta, ${resultado.informe.descartadas} descartada(s). ${url}`,
      });
    } catch (e) {
      // Crash (AI, PDF, git or deploy): previous dataset and state stay; next run retries.
      const motivo = mensajeError(e);
      resultados.push({ partido: id, resultado: 'error', url, motivo });
      await avisar({ tipo: 'fallo', titulo: `29N: fallo al procesar ${nombre}`, mensaje: `${motivo}\n${url}` });
    }
  }

  return { dataset, estado, resultados, erroresFuente, erroresAviso };
}

function esOficial(partido: Omit<Partido, 'programa'>, url: string, dominios: Record<string, string[]>): boolean {
  const programa = { estado: 'publicado' as const, url, titulo: '' };
  return verificarFuente({ ...partido, programa }, dominios).ok;
}

async function buscarPrograma(
  fuente: FuenteVigilada,
  descargar: (url: string) => Promise<Descarga>,
  oficial: (url: string) => boolean,
): Promise<{ fuente: FuenteVigilada; url: string; bytes: Uint8Array } | null> {
  const patron = fuente.patron ? new RegExp(fuente.patron, 'i') : null;
  const r = await descargar(fuente.url);
  if (r.tipo === 'pdf') return oficial(fuente.url) ? { fuente, url: fuente.url, bytes: r.bytes } : null;
  for (const url of enlacesPdf(r.texto, fuente.url)) {
    if (!oficial(url) || (patron && !patron.test(url))) continue;
    const pdf = await descargar(url);
    if (pdf.tipo === 'pdf') return { fuente, url, bytes: pdf.bytes };
  }
  return null;
}

/** Absolute URLs of the links to PDFs in an HTML page, in page order, without duplicates. */
export function enlacesPdf(html: string, base: string): string[] {
  const urls = new Set<string>();
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const url = new URL(m[1]!.replaceAll('&amp;', '&'), base);
      url.hash = '';
      if (/\.pdf$/i.test(url.pathname)) urls.add(url.href);
    } catch {
      // ignore malformed links
    }
  }
  return [...urls];
}
