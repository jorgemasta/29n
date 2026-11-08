// Data pipeline (test point A). Single entry point:
//   procesarPrograma(pdf, partido, ia) → { posturas, informe, publicable }
// Stages: V7 (source) → PDF text by page → extract postura per topic (V12 confirms absences) →
// V1/V2 → neutralise → V3–V6 + V10 (rewrite loop) → V11 → V9 → publication decision.
import type { Cita, EntradaInforme, Informe, Partido, Postura, ResumenPostura, Tema, TextoNeutral } from '../dataset/esquema';
import { Postura as EsquemaPostura } from '../dataset/esquema';
import type { AdaptadorIA } from '../ia/adaptador';
import { comprobacionConCache, conCache, type AlmacenCache } from '../ia/cache';
import { TEMAS } from '../registro/temas';
import { PALABRAS_CLAVE, type PalabrasClave } from '../registro/palabras-clave';
import { TERMINOS, type TerminosIdentificativos } from '../registro/terminos';
import { DOMINIOS_OFICIALES, type DominiosOficiales } from '../registro/dominios';
import { confirmarAusencia } from './ausencia';
import { verificarCita } from './barreras';
import { verificarFidelidad } from './fidelidad';
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
import { comprobarReconocibilidad } from './reconocibilidad';
import { comprobarUrlHttp, evaluarViabilidad, type ComprobarUrl } from './viabilidad';

export interface OpcionesProceso {
  temas?: Tema[];
  terminos?: TerminosIdentificativos;
  cache?: AlmacenCache;
  versionPrompt?: string;
  /** V12: keywords per topic for the second pass (default: registro/palabras-clave). */
  palabrasClave?: PalabrasClave;
  /** V11: already-published parties and posturas (e.g. the current dataset), to mix with this one. */
  publicado?: { partidos: Partido[]; posturas: Postura[] };
  /** V8 HTTP 200 check for feasibility sources (default: real fetch). */
  comprobarUrl?: ComprobarUrl;
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
  const palabrasClave = opciones.palabrasClave ?? PALABRAS_CLAVE;
  const hash = hashPdf(pdf);
  const ia = opciones.cache ? conCache(iaBase, opciones.cache, { hashPdf: hash, versionPrompt }) : iaBase;
  const comprobarBase = opciones.comprobarUrl ?? comprobarUrlHttp;
  const comprobarUrl = opciones.cache
    ? comprobacionConCache(comprobarBase, opciones.cache, { hashPdf: hash, versionPrompt })
    : comprobarBase;
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

    // V12: "proposes nothing" only after a second pass confirms it; if it finds something, extract it.
    const palabras = palabrasClave[tema.id] ?? [tema.titulo];
    let citasIA = extraccion.propone ? extraccion.citas : [];
    let ausenciaRevisada = false;
    if (citasIA.length === 0) {
      const v12 = await confirmarAusencia(ia, temaIA, paginas, palabras);
      if (v12.confirmada) {
        anotar('V12', 'pasa', v12.detalle);
        posturas.push({ ...base, estado: 'no_propone' });
        resumen.push({ tema: tema.id, estado: 'no_propone', reescrituras: 0 });
        continue;
      }
      anotar('V12', 'extraer', `la segunda pasada encontró ${v12.citas.length} cita(s) que la primera no vio`);
      citasIA = v12.citas;
      ausenciaRevisada = true;
    }
    extraidas++;
    let reescrituras = 0;

    /**
     * A discarded postura shows as "proposes nothing" only if V12 confirms the absence;
     * otherwise as "No pudimos verificar su propuesta". Quotes already found in the PDF prove
     * there is a proposal, so V12 only runs when they were not verified.
     */
    const descartar = async (fallos: { barrera: EntradaInforme['barrera']; detalle: string }[], citasVerificadas: boolean) => {
      for (const f of fallos) anotar(f.barrera, 'descartar', f.detalle);
      descartadas++;
      const motivo = fallos.map((f) => `${f.barrera}: ${f.detalle}`).join('; ');
      if (!citasVerificadas && !ausenciaRevisada) {
        const v12 = await confirmarAusencia(ia, temaIA, paginas, palabras);
        if (v12.confirmada) {
          anotar('V12', 'pasa', `${v12.detalle}; se muestra como "no propone nada"`);
          posturas.push({ ...base, estado: 'no_propone' });
          resumen.push({ tema: tema.id, estado: 'no_propone', reescrituras, motivo });
          return;
        }
        anotar('V12', 'aviso', 'la segunda pasada encontró una propuesta: se muestra como "No pudimos verificar su propuesta"');
      }
      posturas.push({ ...base, estado: 'sin_verificar' });
      resumen.push({ tema: tema.id, estado: 'sin_verificar', reescrituras, motivo });
    };

    // V1 + V2: every quote exists in the PDF (page fixed if needed).
    const citas: Cita[] = [];
    let fallo: string | null = null;
    const correcciones: string[] = [];
    for (const cita of citasIA) {
      const r = verificarCita(cita, paginas);
      if (!r.ok) {
        fallo = r.motivo;
        break;
      }
      if (r.paginaCorregida) correcciones.push(`página ${cita.pagina} → ${r.cita.pagina}`);
      citas.push(r.cita);
    }
    if (fallo) {
      await descartar([{ barrera: 'V1', detalle: fallo }], false);
      continue;
    }
    anotar('V1', 'pasa', `${citas.length} cita(s) localizadas`);
    if (correcciones.length) for (const c of correcciones) anotar('V2', 'corregir', c);
    else anotar('V2', 'pasa', 'páginas declaradas correctas');

    /**
     * Neutralise, then V3–V6 (deterministic) and V10 (independent fidelity check, only on a text
     * that passed V3–V6). Any failure is fed back to the next rewrite (up to MAX_REINTENTOS times).
     * `pista`: what gave the party away (V11).
     */
    type Fallo = { barrera: EntradaInforme['barrera']; detalle: string };
    const neutralizar = async (pista?: string[]): Promise<{ texto: TextoNeutral } | { fallos: Fallo[] }> => {
      let evitar: string[] = [];
      let corregir: string[] = [];
      for (let intento = 0; intento <= MAX_REINTENTOS; intento++) {
        const propuesta = limpiarTexto(
          await ia.completar({
            tarea: 'neutralizar',
            instrucciones: INSTRUCCIONES_NEUTRALIZAR,
            entrada: {
              tema: temaIA,
              citas,
              ...(evitar.length ? { evitar } : {}),
              ...(corregir.length ? { corregir } : {}),
              ...(pista?.length ? { pista } : {}),
            },
            esquema: RespuestaNeutralizar,
          }),
        );
        const fallos: (FalloTexto | (Fallo & { corregir: string; evitar?: undefined }))[] = revisarTexto(propuesta, {
          citas,
          terminos,
          longitudesTema: opciones.longitudesTema?.[tema.id],
        });
        if (fallos.length === 0) {
          const fidelidad = await verificarFidelidad(ia, temaIA, citas, propuesta);
          if (fidelidad.fiel) {
            const pasa: Record<BarreraTexto | 'V10', string> = {
              V3: 'sin marcas identificativas',
              V4: 'cifras trazables a las citas',
              V5: 'longitud dentro del rango',
              V6: 'plantilla completa',
              V10: 'fiel a la cita según un verificador independiente',
            };
            for (const [barrera, detalle] of Object.entries(pasa)) anotar(barrera as BarreraTexto | 'V10', 'pasa', detalle);
            return { texto: propuesta };
          }
          fallos.push({ barrera: 'V10', detalle: `no es fiel a la cita: ${fidelidad.motivo}`, corregir: fidelidad.motivo });
        }
        if (intento === MAX_REINTENTOS)
          return { fallos: fallos.map((f) => ({ barrera: f.barrera, detalle: `${f.detalle} (tras ${MAX_REINTENTOS} reintentos)` })) };
        reescrituras++;
        for (const f of fallos) anotar(f.barrera, 'reescribir', f.detalle);
        evitar = [...new Set([...evitar, ...fallos.flatMap((f) => f.evitar ?? [])])];
        corregir = fallos.flatMap((f) => (f.corregir ? [f.corregir] : []));
      }
      throw new Error('inalcanzable');
    };

    const neutral = await neutralizar();
    if ('fallos' in neutral) {
      await descartar(neutral.fallos, true);
      continue;
    }
    let texto = neutral.texto;

    // V11: rewrite a recognisable postura with the clue; if it persists, publish with an internal warning.
    const otras = (opciones.publicado?.posturas ?? [])
      .filter((p): p is Extract<Postura, { estado: 'propone' }> => p.tema === tema.id && p.partido !== partido.id && p.estado === 'propone')
      .map((p) => ({ partido: p.partido, texto: p.texto }));
    if (otras.length === 0) anotar('V11', 'pasa', 'no aplica: es la única propuesta publicada del tema');
    else {
      const partidosV11 = [partido, ...(opciones.publicado?.partidos ?? []).filter((p) => p.id !== partido.id)].map(
        ({ id, nombre, siglas }) => ({ id, nombre, siglas }),
      );
      for (let ronda = 0; ; ronda++) {
        const v11 = await comprobarReconocibilidad(ia, {
          tema: temaIA,
          partido: partido.id,
          propia: texto,
          otras,
          partidos: partidosV11,
          semilla: `${hash}:${ronda}`,
        });
        if (!v11.reconocible) {
          anotar('V11', 'pasa', v11.detalle);
          break;
        }
        const pistas = v11.pistas.join(' / ');
        if (ronda === MAX_REINTENTOS) {
          anotar('V11', 'aviso', `sigue siendo reconocible tras ${MAX_REINTENTOS} reescrituras (${v11.detalle}; pista: ${pistas}); se publica`);
          break;
        }
        anotar('V11', 'reescribir', `${v11.detalle}; pista: ${pistas}`);
        reescrituras++;
        const nuevo = await neutralizar(v11.pistas);
        if ('fallos' in nuevo) {
          const barreras = nuevo.fallos.map((f) => f.barrera).join(', ');
          anotar('V11', 'aviso', `la reescritura no pasó ${barreras}; se publica la versión anterior, reconocible (pista: ${pistas})`);
          break;
        }
        texto = nuevo.texto;
      }
    }

    // V13 + V8: double-blind feasibility note on the final neutral text.
    const viabilidad = await evaluarViabilidad({
      ia, tema: temaIA, texto, citas, terminos, comprobarUrl, anotar,
    });

    posturas.push({ ...base, estado: 'propone', texto, citas, viabilidad });
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
