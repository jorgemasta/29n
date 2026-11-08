// V13 (double-blind feasibility) + V8 (feasibility sources).
// Two independent evaluations get ONLY the topic, the neutral text and the quotes (with every
// party's identifying terms masked); never the party. Each source must be on an institutional
// domain and answer HTTP 200, else it is removed; an evaluation left without sources is repeated.
import type { Cita, EntradaInforme, Evaluacion, Fuente, NotaViabilidad, TextoNeutral } from '../dataset/esquema';
import type { AdaptadorIA } from '../ia/adaptador';
import { esDominioInstitucional } from '../registro/dominios-institucionales';
import { VERSION_RUBRICA } from '../registro/rubrica';
import type { TerminosIdentificativos } from '../registro/terminos';
import { normalizarTermino } from './normalizar';
import { INSTRUCCIONES_VIABILIDAD, RespuestaViabilidad, VERSION_PROMPT_VIABILIDAD } from './prompts-viabilidad';

/** V8: does the URL answer HTTP 200? Injectable so tests never hit the network. */
export type ComprobarUrl = (url: string) => Promise<boolean>;

/** Max repetitions of an evaluation left without valid sources (V8). */
export const MAX_REPETICIONES_VIABILIDAD = 2;

/** Default V8 HTTP check: GET (many sites reject HEAD), redirects followed but must stay institutional. */
export const comprobarUrlHttp: ComprobarUrl = async (url) => {
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
      headers: { 'user-agent': '29n-verificador (+https://29n.jorgemasta.com/metodologia)' },
    });
    await r.body?.cancel();
    return r.status === 200 && esDominioInstitucional(r.url || url);
  } catch {
    return false;
  }
};

type Anotar = (barrera: EntradaInforme['barrera'], resultado: EntradaInforme['resultado'], detalle: string) => void;

export async function evaluarViabilidad(args: {
  ia: AdaptadorIA;
  tema: { id: string; titulo: string; pregunta: string };
  texto: TextoNeutral;
  citas: Cita[];
  terminos: TerminosIdentificativos;
  comprobarUrl: ComprobarUrl;
  anotar: Anotar;
}): Promise<NotaViabilidad> {
  const { ia, tema, texto, terminos, anotar } = args;
  const citas = args.citas.map((c) => ({ texto: ocultarMarcas(c.texto, terminos), pagina: c.pagina }));

  // One HTTP check per URL per run.
  const comprobadas = new Map<string, Promise<boolean>>();
  const responde = (url: string) => {
    if (!comprobadas.has(url)) comprobadas.set(url, args.comprobarUrl(url).catch(() => false));
    return comprobadas.get(url)!;
  };

  const evaluar = async (evaluacion: 1 | 2): Promise<Evaluacion> => {
    const rechazadas: string[] = [];
    let ultima: Evaluacion | null = null;
    for (let repeticion = 0; repeticion <= MAX_REPETICIONES_VIABILIDAD; repeticion++) {
      const r = await ia.completar({
        tarea: 'evaluar-viabilidad',
        instrucciones: INSTRUCCIONES_VIABILIDAD,
        // `evaluacion` keeps the two evaluations independent (and distinct in the AI cache).
        entrada: { tema, texto, citas, evaluacion, ...(repeticion ? { repeticion, fuentesRechazadas: rechazadas } : {}) },
        esquema: RespuestaViabilidad,
      });
      const fuentes: Fuente[] = [];
      for (const f of r.fuentes) {
        const motivo = !esDominioInstitucional(f.url)
          ? 'dominio no permitido'
          : !(await responde(f.url))
            ? 'no responde con HTTP 200'
            : null;
        if (motivo) {
          rechazadas.push(f.url);
          anotar('V8', 'corregir', `evaluación ${evaluacion}: fuente eliminada (${motivo}): ${f.url}`);
        } else if (!fuentes.some((x) => x.url === f.url)) fuentes.push({ titulo: f.titulo || f.url, url: f.url });
      }
      ultima = { nivel: r.nivel, razones: r.razones, porque: r.porque, fuentes };
      if (fuentes.length > 0 || r.nivel === 'sin_concrecion') return ultima;
      if (repeticion < MAX_REPETICIONES_VIABILIDAD)
        anotar('V8', 'reescribir', `evaluación ${evaluacion}: el "por qué" se quedó sin fuentes; se repite`);
    }
    anotar('V8', 'corregir', `evaluación ${evaluacion}: sin fuentes válidas tras ${MAX_REPETICIONES_VIABILIDAD} repeticiones; se publica sin fuentes`);
    return ultima!;
  };

  const e1 = await evaluar(1);
  const e2 = await evaluar(2);
  const versiones = { prompt: VERSION_PROMPT_VIABILIDAD, rubrica: VERSION_RUBRICA };

  if (e1.nivel !== e2.nivel) {
    anotar('V13', 'pasa', `sin consenso: ${e1.nivel} / ${e2.nivel}`);
    return { resultado: 'sin_consenso', porque: null, fuentes: [], evaluaciones: [e1, e2], versiones };
  }
  // Agreement: publish the argument of the evaluation that kept its sources.
  const publicada = e1.fuentes.length > 0 || e2.fuentes.length === 0 ? e1 : e2;
  anotar('V13', 'pasa', `consenso: ${e1.nivel}`);
  return { resultado: e1.nivel, porque: publicada.porque, fuentes: publicada.fuentes, evaluaciones: [e1, e2], versiones };
}

/**
 * Masks identifying terms of ANY party in a quote with "[partido]" (case/accent-insensitive,
 * whole words), keeping the rest of the original text untouched.
 */
export function ocultarMarcas(texto: string, terminos: TerminosIdentificativos): string {
  // Normalised copy + index of the original char behind each normalised char.
  let base = '';
  const origen: number[] = [];
  for (let i = 0; i < texto.length; i++) {
    for (const ch of texto[i]!.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()) {
      base += ch;
      origen.push(i);
    }
  }
  const rangos: [number, number][] = [];
  for (const termino of Object.values(terminos).flat()) {
    const patron = normalizarTermino(termino).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
    if (!patron) continue;
    for (const m of base.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${patron}(?![\\p{L}\\p{N}])`, 'gu')))
      rangos.push([origen[m.index]!, origen[m.index + m[0].length - 1]! + 1]);
  }
  if (rangos.length === 0) return texto;
  rangos.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  let salida = '';
  let cursor = 0;
  for (const [ini, fin] of rangos) {
    if (fin <= cursor) continue;
    salida += texto.slice(cursor, Math.max(cursor, ini)) + (ini >= cursor ? '[partido]' : '');
    cursor = fin;
  }
  return salida + texto.slice(cursor);
}
