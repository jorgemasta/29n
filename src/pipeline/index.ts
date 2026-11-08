// Data pipeline (test point A). Single entry point:
//   procesarPrograma(pdf, partido, ia) → { posturas, informe, publicable }
// Stages: PDF text by page → extract postura per topic → V1/V2 → neutralise → V3 → V9 → decision.
import type { EntradaInforme, Informe, Partido, Postura, Tema } from '../dataset/esquema';
import { Postura as EsquemaPostura } from '../dataset/esquema';
import type { AdaptadorIA } from '../ia/adaptador';
import { conCache, type AlmacenCache } from '../ia/cache';
import { TEMAS } from '../registro/temas';
import { TERMINOS, type TerminosIdentificativos } from '../registro/terminos';
import { buscarMarcas, verificarCita } from './barreras';
import { extraerPaginas, hashPdf } from './pdf';
import {
  INSTRUCCIONES_EXTRAER,
  INSTRUCCIONES_NEUTRALIZAR,
  RespuestaExtraer,
  RespuestaNeutralizar,
  VERSION_PROMPT,
} from './prompts';

export interface OpcionesProceso {
  temas?: Tema[];
  terminos?: TerminosIdentificativos;
  cache?: AlmacenCache;
  versionPrompt?: string;
}

export interface ResultadoProceso {
  posturas: Postura[];
  informe: Informe;
  publicable: boolean;
}

/** Max rewrites after a failed rewrite-barrier before the postura is discarded. */
export const MAX_REINTENTOS = 2;
/** A programme with more than this share of extracted posturas discarded is blocked. */
export const MAX_DESCARTE = 0.3;

export async function procesarPrograma(
  pdf: Uint8Array,
  partido: Partido,
  iaBase: AdaptadorIA,
  opciones: OpcionesProceso = {},
): Promise<ResultadoProceso> {
  const temas = opciones.temas ?? TEMAS;
  const terminos = opciones.terminos ?? TERMINOS;
  const versionPrompt = opciones.versionPrompt ?? VERSION_PROMPT;
  const hash = hashPdf(pdf);
  const ia = opciones.cache ? conCache(iaBase, opciones.cache, { hashPdf: hash, versionPrompt }) : iaBase;
  const paginas = await extraerPaginas(pdf);

  const entradas: EntradaInforme[] = [];
  const posturas: Postura[] = [];
  let extraidas = 0;
  let descartadas = 0;

  for (const tema of temas) {
    const base = { partido: partido.id, tema: tema.id, versiones: { prompt: versionPrompt } };
    const temaIA = { id: tema.id, titulo: tema.titulo, pregunta: tema.pregunta };
    const anotar = (barrera: EntradaInforme['barrera'], resultado: EntradaInforme['resultado'], detalle: string) =>
      entradas.push({ tema: tema.id, barrera, resultado, detalle });

    const extraccion = await ia.completar({
      tarea: 'extraer-postura',
      instrucciones: INSTRUCCIONES_EXTRAER,
      entrada: { tema: temaIA, paginas: paginas.map((texto, i) => ({ pagina: i + 1, texto })) },
      esquema: RespuestaExtraer,
    });

    if (!extraccion.propone || extraccion.citas.length === 0) {
      posturas.push({ ...base, estado: 'no_propone' });
      continue;
    }
    extraidas++;
    const descartar = (barrera: EntradaInforme['barrera'], detalle: string) => {
      anotar(barrera, 'descartar', detalle);
      descartadas++;
      posturas.push({ ...base, estado: 'sin_verificar' });
    };

    // V1 + V2: every quote exists in the PDF (page fixed if needed).
    const citas = [];
    let fallo: string | null = null;
    for (const cita of extraccion.citas) {
      const r = verificarCita(cita, paginas);
      if (!r.ok) {
        fallo = r.motivo;
        break;
      }
      if (r.paginaCorregida) anotar('V2', 'corregir', `página ${cita.pagina} → ${r.cita.pagina}`);
      citas.push(r.cita);
    }
    if (fallo) {
      descartar('V1', fallo);
      continue;
    }
    anotar('V1', 'pasa', `${citas.length} cita(s) localizadas`);

    // Neutralise, then V3 (rewrite up to MAX_REINTENTOS times).
    let evitar: string[] = [];
    let texto = null;
    for (let intento = 0; intento <= MAX_REINTENTOS; intento++) {
      const propuesta = await ia.completar({
        tarea: 'neutralizar',
        instrucciones: INSTRUCCIONES_NEUTRALIZAR,
        entrada: { tema: temaIA, citas, ...(evitar.length ? { evitar } : {}) },
        esquema: RespuestaNeutralizar,
      });
      const marcas = buscarMarcas([propuesta.que, propuesta.como, propuesta.cifra ?? ''].join(' '), terminos);
      if (marcas.length === 0) {
        texto = propuesta;
        break;
      }
      evitar = [...new Set([...evitar, ...marcas])];
      if (intento < MAX_REINTENTOS) anotar('V3', 'reescribir', `marcas identificativas: ${marcas.join(', ')}`);
      else descartar('V3', `marcas identificativas tras ${MAX_REINTENTOS} reintentos: ${marcas.join(', ')}`);
    }
    if (!texto) continue;
    anotar('V3', 'pasa', 'sin marcas identificativas');

    posturas.push({ ...base, estado: 'propone', texto, citas });
  }

  // V9: every postura validates against the schema.
  const invalidas = posturas.filter((p) => !EsquemaPostura.safeParse(p).success);
  for (const p of invalidas) entradas.push({ tema: p.tema, barrera: 'V9', resultado: 'descartar', detalle: 'no valida contra el esquema' });

  const motivos: string[] = [];
  if (invalidas.length) motivos.push(`${invalidas.length} postura(s) no validan contra el esquema`);
  if (extraidas > 0 && descartadas / extraidas > MAX_DESCARTE)
    motivos.push(`descartado el ${Math.round((descartadas / extraidas) * 100)} % de las posturas extraídas (máximo ${MAX_DESCARTE * 100} %)`);
  const publicable = motivos.length === 0;

  return {
    posturas,
    publicable,
    informe: {
      partido: partido.id,
      hashPdf: hash,
      versionPrompt,
      extraidas,
      descartadas,
      publicable,
      ...(publicable ? {} : { motivo: motivos.join('; ') }),
      entradas,
    },
  };
}
