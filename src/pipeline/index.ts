// Data pipeline (test point A). Single entry point:
//   procesarPrograma(pdf, partido, ia) → { posturas, informe, publicable }
// Stages: PDF text by page → extract postura per topic (V12 confirms absences) → V1/V2 →
// neutralise → V3 → V10 → V11 → V9 → decision.
import type { Cita, EntradaInforme, Informe, Partido, Postura, Tema, TextoNeutral } from '../dataset/esquema';
import { Postura as EsquemaPostura } from '../dataset/esquema';
import type { AdaptadorIA } from '../ia/adaptador';
import { conCache, type AlmacenCache } from '../ia/cache';
import { TEMAS } from '../registro/temas';
import { PALABRAS_CLAVE, type PalabrasClave } from '../registro/palabras-clave';
import { TERMINOS, type TerminosIdentificativos } from '../registro/terminos';
import { confirmarAusencia } from './ausencia';
import { buscarMarcas, verificarCita } from './barreras';
import { verificarFidelidad } from './fidelidad';
import { extraerPaginas, hashPdf } from './pdf';
import {
  INSTRUCCIONES_EXTRAER,
  INSTRUCCIONES_NEUTRALIZAR,
  RespuestaExtraer,
  RespuestaNeutralizar,
  VERSION_PROMPT,
} from './prompts';
import { comprobarReconocibilidad } from './reconocibilidad';

export interface OpcionesProceso {
  temas?: Tema[];
  terminos?: TerminosIdentificativos;
  cache?: AlmacenCache;
  versionPrompt?: string;
  /** V12: keywords per topic for the second pass (default: registro/palabras-clave). */
  palabrasClave?: PalabrasClave;
  /** V11: already-published parties and posturas (e.g. the current dataset), to mix with this one. */
  publicado?: { partidos: Partido[]; posturas: Postura[] };
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

    // V12: "proposes nothing" only after a second pass confirms it; if it finds something, extract it.
    const palabras = palabrasClave[tema.id] ?? [tema.titulo];
    let citasIA = extraccion.propone ? extraccion.citas : [];
    let ausenciaRevisada = false;
    if (citasIA.length === 0) {
      const v12 = await confirmarAusencia(ia, temaIA, paginas, palabras);
      if (v12.confirmada) {
        anotar('V12', 'pasa', v12.detalle);
        posturas.push({ ...base, estado: 'no_propone' });
        continue;
      }
      anotar('V12', 'extraer', `la segunda pasada encontró ${v12.citas.length} cita(s) que la primera no vio`);
      citasIA = v12.citas;
      ausenciaRevisada = true;
    }
    extraidas++;

    /**
     * A discarded postura shows as "proposes nothing" only if V12 confirms the absence;
     * otherwise as "No pudimos verificar su propuesta". Quotes already found in the PDF prove
     * there is a proposal, so V12 only runs when they were not verified.
     */
    const descartar = async (barrera: EntradaInforme['barrera'], detalle: string, citasVerificadas: boolean) => {
      anotar(barrera, 'descartar', detalle);
      descartadas++;
      if (!citasVerificadas && !ausenciaRevisada) {
        const v12 = await confirmarAusencia(ia, temaIA, paginas, palabras);
        if (v12.confirmada) {
          anotar('V12', 'pasa', `${v12.detalle}; se muestra como "no propone nada"`);
          posturas.push({ ...base, estado: 'no_propone' });
          return;
        }
        anotar('V12', 'aviso', 'la segunda pasada encontró una propuesta: se muestra como "No pudimos verificar su propuesta"');
      }
      posturas.push({ ...base, estado: 'sin_verificar' });
    };

    // V1 + V2: every quote exists in the PDF (page fixed if needed).
    const citas: Cita[] = [];
    let fallo: string | null = null;
    for (const cita of citasIA) {
      const r = verificarCita(cita, paginas);
      if (!r.ok) {
        fallo = r.motivo;
        break;
      }
      if (r.paginaCorregida) anotar('V2', 'corregir', `página ${cita.pagina} → ${r.cita.pagina}`);
      citas.push(r.cita);
    }
    if (fallo) {
      await descartar('V1', fallo, false);
      continue;
    }
    anotar('V1', 'pasa', `${citas.length} cita(s) localizadas`);

    /**
     * Neutralise, then the rewrite barriers in order: V3 (identifying marks), V10 (fidelity).
     * A failure is fed back to the next rewrite; after MAX_REINTENTOS rewrites it fails.
     */
    const neutralizar = async (pista?: string[]): Promise<{ texto: TextoNeutral } | { barrera: EntradaInforme['barrera']; detalle: string }> => {
      let evitar: string[] = [];
      let corregir: string | null = null;
      for (let intento = 0; intento <= MAX_REINTENTOS; intento++) {
        const ultimo = intento === MAX_REINTENTOS;
        const propuesta = await ia.completar({
          tarea: 'neutralizar',
          instrucciones: INSTRUCCIONES_NEUTRALIZAR,
          entrada: {
            tema: temaIA,
            citas,
            ...(evitar.length ? { evitar } : {}),
            ...(corregir ? { corregir } : {}),
            ...(pista?.length ? { pista } : {}),
          },
          esquema: RespuestaNeutralizar,
        });
        const marcas = buscarMarcas([propuesta.que, propuesta.como, propuesta.cifra ?? ''].join(' '), terminos);
        if (marcas.length > 0) {
          evitar = [...new Set([...evitar, ...marcas])];
          if (ultimo) return { barrera: 'V3', detalle: `marcas identificativas tras ${MAX_REINTENTOS} reintentos: ${marcas.join(', ')}` };
          anotar('V3', 'reescribir', `marcas identificativas: ${marcas.join(', ')}`);
          continue;
        }
        const fidelidad = await verificarFidelidad(ia, temaIA, citas, propuesta);
        if (!fidelidad.fiel) {
          corregir = fidelidad.motivo;
          if (ultimo) return { barrera: 'V10', detalle: `no es fiel a la cita tras ${MAX_REINTENTOS} reintentos: ${fidelidad.motivo}` };
          anotar('V10', 'reescribir', fidelidad.motivo);
          continue;
        }
        anotar('V3', 'pasa', 'sin marcas identificativas');
        anotar('V10', 'pasa', 'fiel a la cita según un verificador independiente');
        return { texto: propuesta };
      }
      throw new Error('inalcanzable');
    };

    const neutral = await neutralizar();
    if (!('texto' in neutral)) {
      await descartar(neutral.barrera, neutral.detalle, true);
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
      for (let reescritura = 0; ; reescritura++) {
        const v11 = await comprobarReconocibilidad(ia, {
          tema: temaIA,
          partido: partido.id,
          propia: texto,
          otras,
          partidos: partidosV11,
          semilla: `${hash}:${reescritura}`,
        });
        if (!v11.reconocible) {
          anotar('V11', 'pasa', v11.detalle);
          break;
        }
        const pistas = v11.pistas.join(' / ');
        if (reescritura === MAX_REINTENTOS) {
          anotar('V11', 'aviso', `sigue siendo reconocible tras ${MAX_REINTENTOS} reescrituras (${v11.detalle}; pista: ${pistas}); se publica`);
          break;
        }
        anotar('V11', 'reescribir', `${v11.detalle}; pista: ${pistas}`);
        const nuevo = await neutralizar(v11.pistas);
        if (!('texto' in nuevo)) {
          anotar('V11', 'aviso', `la reescritura no pasó ${nuevo.barrera}; se publica la versión anterior, reconocible (pista: ${pistas})`);
          break;
        }
        texto = nuevo.texto;
      }
    }

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
