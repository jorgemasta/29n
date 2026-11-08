// Answering a question from one programme ("Pregunta libre" module, docs/ux-spec.md §12).
// Used by the data pipeline to precompute the 7 suggested questions, and meant to be reused
// behind the live endpoint (#15) for the free text box. No Node-only dependency: it runs in a Worker.
//
//   responderPregunta(ia, pregunta, paginas, { terminos }) → responde | no_menciona | sin_verificar
//
// Steps: keyword retrieval (no AI) → no candidate page = "no lo menciona" without calling the AI
// → AI answer with mandatory literal quotes → V1/V2 (invented quotes are removed) → V3–V6 → V10.
// Any failure is fed back for a rewrite, up to MAX_REINTENTOS times; then "sin_verificar".
import type { Cita, TextoNeutral } from '../dataset/esquema';
import type { AdaptadorIA } from '../ia/adaptador';
import type { TerminosIdentificativos } from '../registro/terminos';
import { verificarCita } from '../pipeline/barreras';
import { verificarFidelidad } from '../pipeline/fidelidad';
import { paginasCandidatas } from '../pipeline/fragmentos';
import { limpiarTexto, revisarTexto } from '../pipeline/texto';
import { INSTRUCCIONES_RESPONDER, RespuestaResponder } from './prompts';

export { VERSION_PROMPT_PREGUNTA } from './prompts';

/** Same limit as the posturas' rewrite loop. */
export const MAX_REINTENTOS = 2;

export interface PreguntaAResponder {
  id: string;
  texto: string;
  /** Search terms that find the candidate pages. */
  palabrasClave: string[];
}

export type ResultadoRespuesta =
  | { estado: 'responde'; texto: TextoNeutral; citas: Cita[] }
  | { estado: 'no_menciona'; detalle: string }
  | { estado: 'sin_verificar'; detalle: string };

type BarreraRespuesta = 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6' | 'V10';
export type Anotar = (barrera: BarreraRespuesta, resultado: 'pasa' | 'corregir' | 'reescribir' | 'descartar', detalle: string) => void;

export interface OpcionesRespuesta {
  /** Identifying terms of every party (V3). */
  terminos: TerminosIdentificativos;
  /** Receives every barrier outcome (the pipeline writes them into the public report). */
  anotar?: Anotar;
}

export async function responderPregunta(
  ia: AdaptadorIA,
  pregunta: PreguntaAResponder,
  paginas: string[],
  opciones: OpcionesRespuesta,
): Promise<ResultadoRespuesta> {
  const anotar: Anotar = opciones.anotar ?? (() => {});
  const candidatas = paginasCandidatas(paginas, pregunta.palabrasClave);
  const buscadas = `términos buscados: ${pregunta.palabrasClave.join(', ')}`;
  if (candidatas.length === 0) return { estado: 'no_menciona', detalle: `${buscadas}; ninguna página los menciona` };

  const preguntaIA = { id: pregunta.id, texto: pregunta.texto };
  // V10's verifier takes a topic; the question plays that role.
  const temaFidelidad = { id: pregunta.id, titulo: pregunta.texto, pregunta: pregunta.texto };
  let evitar: string[] = [];
  let corregir: string[] = [];
  type Fallo = { barrera: BarreraRespuesta; detalle: string; evitar?: string[]; corregir?: string };

  for (let intento = 0; intento <= MAX_REINTENTOS; intento++) {
    const r = await ia.completar({
      tarea: 'responder-pregunta',
      instrucciones: INSTRUCCIONES_RESPONDER,
      entrada: {
        pregunta: preguntaIA,
        paginas: candidatas,
        ...(evitar.length ? { evitar } : {}),
        ...(corregir.length ? { corregir } : {}),
      },
      esquema: RespuestaResponder,
    });
    if (!r.menciona)
      return { estado: 'no_menciona', detalle: `${buscadas}; revisadas las páginas ${candidatas.map((c) => c.pagina).join(', ')} sin respuesta` };

    // V1 + V2: an invented quote is removed; the page of a real one is fixed.
    const citas: Cita[] = [];
    for (const cita of r.citas) {
      const v = verificarCita(cita, paginas);
      if (!v.ok) anotar('V1', 'descartar', `cita eliminada: ${v.motivo}`);
      else {
        if (v.paginaCorregida) anotar('V2', 'corregir', `página ${cita.pagina} → ${v.cita.pagina}`);
        citas.push(v.cita);
      }
    }

    const texto = limpiarTexto(r);
    const fallos: Fallo[] = [];
    if (citas.length === 0)
      fallos.push({
        barrera: 'V1',
        detalle: 'ninguna cita aparece literal en el programa',
        corregir: 'Ninguna cita aparece tal cual en las páginas: cópialas carácter a carácter.',
      });
    else {
      fallos.push(...revisarTexto(texto, { citas, terminos: opciones.terminos }));
      if (fallos.length === 0) {
        const fidelidad = await verificarFidelidad(ia, temaFidelidad, citas, texto);
        if (fidelidad.fiel) {
          anotar('V1', 'pasa', `${citas.length} cita(s) localizadas`);
          anotar('V3', 'pasa', 'sin marcas identificativas');
          anotar('V4', 'pasa', 'cifras trazables a las citas');
          anotar('V5', 'pasa', 'longitud dentro del rango');
          anotar('V6', 'pasa', 'plantilla completa');
          anotar('V10', 'pasa', 'fiel a la cita según un verificador independiente');
          return { estado: 'responde', texto, citas };
        }
        fallos.push({ barrera: 'V10', detalle: `no es fiel a la cita: ${fidelidad.motivo}`, corregir: fidelidad.motivo });
      }
    }

    if (intento === MAX_REINTENTOS) {
      for (const f of fallos) anotar(f.barrera, 'descartar', `${f.detalle} (tras ${MAX_REINTENTOS} reintentos)`);
      return { estado: 'sin_verificar', detalle: fallos.map((f) => `${f.barrera}: ${f.detalle}`).join('; ') };
    }
    for (const f of fallos) anotar(f.barrera, 'reescribir', f.detalle);
    evitar = [...new Set([...evitar, ...fallos.flatMap((f) => f.evitar ?? [])])];
    corregir = fallos.flatMap((f) => (f.corregir ? [f.corregir] : []));
  }
  throw new Error('inalcanzable');
}
