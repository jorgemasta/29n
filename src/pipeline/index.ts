// Data pipeline (test point A). Single entry point:
//   procesarPrograma(pdf, partido, ia) → { posturas, informe, publicable }
// Stages: V7 (source) → PDF text by page → extract postura per topic → V1/V2 → neutralise →
// V3–V6 (rewrite loop) → V9 → publication decision.
import type { EntradaInforme, Informe, Partido, Postura, ResumenPostura, Tema, TextoNeutral } from '../dataset/esquema';
import { Postura as EsquemaPostura } from '../dataset/esquema';
import type { AdaptadorIA } from '../ia/adaptador';
import { conCache, type AlmacenCache } from '../ia/cache';
import { TEMAS } from '../registro/temas';
import { TERMINOS, type TerminosIdentificativos } from '../registro/terminos';
import { DOMINIOS_OFICIALES, type DominiosOficiales } from '../registro/dominios';
import { verificarCita } from './barreras';
import { verificarFuente } from './fuente';
import { limpiarTexto, revisarTexto, type BarreraTexto, type FalloTexto } from './texto';
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
  /** Official domains per party (V7). */
  dominios?: DominiosOficiales;
  /** Word counts of the other parties' published texts, per topic (V5 median). */
  longitudesTema?: Record<string, number[]>;
  /** Capture date of the PDF, recorded with its hash (V7). Defaults to the programme's date. */
  fecha?: string;
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
  const fecha = opciones.fecha ?? (partido.programa.estado === 'publicado' ? partido.programa.fecha : undefined);

  const entradas: EntradaInforme[] = [];
  const posturas: Postura[] = [];
  const resumen: ResumenPostura[] = [];
  let extraidas = 0;
  let descartadas = 0;

  const informe = (publicable: boolean, motivos: string[], url?: string): Informe => ({
    partido: partido.id,
    hashPdf: hash,
    ...(url ? { url } : {}),
    ...(fecha ? { fecha } : {}),
    versionPrompt,
    extraidas,
    descartadas,
    publicable,
    ...(publicable ? {} : { motivo: motivos.join('; ') }),
    posturas: resumen,
    entradas,
  });

  // V7: official source. A non-official PDF blocks the programme before any AI call.
  const fuente = verificarFuente(partido, opciones.dominios ?? DOMINIOS_OFICIALES);
  entradas.push({ barrera: 'V7', resultado: fuente.ok ? 'pasa' : 'bloquear', detalle: fuente.detalle });
  if (!fuente.ok) return { posturas, publicable: false, informe: informe(false, [`V7: ${fuente.detalle}`], fuente.url) };

  const paginas = await extraerPaginas(pdf);

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
      resumen.push({ tema: tema.id, estado: 'no_propone', reescrituras: 0 });
      continue;
    }
    extraidas++;
    let reescrituras = 0;
    const descartar = (fallos: { barrera: EntradaInforme['barrera']; detalle: string }[]) => {
      for (const f of fallos) anotar(f.barrera, 'descartar', f.detalle);
      descartadas++;
      posturas.push({ ...base, estado: 'sin_verificar' });
      resumen.push({
        tema: tema.id,
        estado: 'sin_verificar',
        reescrituras,
        motivo: fallos.map((f) => `${f.barrera}: ${f.detalle}`).join('; '),
      });
    };

    // V1 + V2: every quote exists in the PDF (page fixed if needed).
    const citas = [];
    let fallo: string | null = null;
    const correcciones: string[] = [];
    for (const cita of extraccion.citas) {
      const r = verificarCita(cita, paginas);
      if (!r.ok) {
        fallo = r.motivo;
        break;
      }
      if (r.paginaCorregida) correcciones.push(`página ${cita.pagina} → ${r.cita.pagina}`);
      citas.push(r.cita);
    }
    if (fallo) {
      descartar([{ barrera: 'V1', detalle: fallo }]);
      continue;
    }
    anotar('V1', 'pasa', `${citas.length} cita(s) localizadas`);
    if (correcciones.length) for (const c of correcciones) anotar('V2', 'corregir', c);
    else anotar('V2', 'pasa', 'páginas declaradas correctas');

    // Neutralise, then V3–V6; any failure asks for a rewrite (up to MAX_REINTENTOS times).
    let evitar: string[] = [];
    let corregir: string[] = [];
    let texto: TextoNeutral | null = null;
    for (let intento = 0; intento <= MAX_REINTENTOS; intento++) {
      const propuesta = limpiarTexto(
        await ia.completar({
          tarea: 'neutralizar',
          instrucciones: INSTRUCCIONES_NEUTRALIZAR,
          entrada: { tema: temaIA, citas, ...(evitar.length ? { evitar } : {}), ...(corregir.length ? { corregir } : {}) },
          esquema: RespuestaNeutralizar,
        }),
      );
      const fallos: FalloTexto[] = revisarTexto(propuesta, { citas, terminos, longitudesTema: opciones.longitudesTema?.[tema.id] });
      if (fallos.length === 0) {
        texto = propuesta;
        break;
      }
      if (intento === MAX_REINTENTOS) {
        descartar(fallos.map((f) => ({ barrera: f.barrera, detalle: `${f.detalle} (tras ${MAX_REINTENTOS} reintentos)` })));
        break;
      }
      reescrituras++;
      for (const f of fallos) anotar(f.barrera, 'reescribir', f.detalle);
      evitar = [...new Set([...evitar, ...fallos.flatMap((f) => f.evitar ?? [])])];
      corregir = fallos.flatMap((f) => (f.corregir ? [f.corregir] : []));
    }
    if (!texto) continue;
    const pasa: Record<BarreraTexto, string> = {
      V3: 'sin marcas identificativas',
      V4: 'cifras trazables a las citas',
      V5: 'longitud dentro del rango',
      V6: 'plantilla completa',
    };
    for (const [barrera, detalle] of Object.entries(pasa)) anotar(barrera as BarreraTexto, 'pasa', detalle);

    posturas.push({ ...base, estado: 'propone', texto, citas });
    resumen.push({ tema: tema.id, estado: 'propone', reescrituras });
  }

  // V9: every postura validates against the schema.
  const invalidas = posturas.filter((p) => !EsquemaPostura.safeParse(p).success);
  for (const p of invalidas) entradas.push({ tema: p.tema, barrera: 'V9', resultado: 'descartar', detalle: 'no valida contra el esquema' });

  // Publication rule: blocked if more than MAX_DESCARTE of the extracted posturas were discarded.
  const motivos: string[] = [];
  if (invalidas.length) motivos.push(`${invalidas.length} postura(s) no validan contra el esquema`);
  if (extraidas > 0 && descartadas / extraidas > MAX_DESCARTE)
    motivos.push(`descartado el ${Math.round((descartadas / extraidas) * 100)} % de las posturas extraídas (máximo ${MAX_DESCARTE * 100} %)`);
  const publicable = motivos.length === 0;

  return { posturas, publicable, informe: informe(publicable, motivos, fuente.url) };
}
