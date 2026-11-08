// Deterministic barriers on a neutral text (no AI): V3 marks, V4 figures, V5 length, V6 template.
// Each failure carries what to tell the AI when asking for a rewrite.
import type { Cita, TextoNeutral } from '../dataset/esquema';
import type { TerminosIdentificativos } from '../registro/terminos';
import { buscarMarcas } from './barreras';

export const LONGITUD_TEXTO = { min: 25, max: 70 };
/** Allowed deviation from the topic median (V5). */
export const TOLERANCIA_MEDIANA = 0.25;

export type BarreraTexto = 'V3' | 'V4' | 'V5' | 'V6';

export interface FalloTexto {
  barrera: BarreraTexto;
  /** For the verification report. */
  detalle: string;
  /** V3: identifying terms to avoid. */
  evitar?: string[];
  /** V4–V6: correction for the rewrite prompt. */
  corregir?: string;
}

export interface ContextoTexto {
  citas: Cita[];
  terminos: TerminosIdentificativos;
  /** Word counts of the other parties' published texts on this topic (V5 median, with this text in it). */
  longitudesTema?: number[];
}

/** Trims the fields; an empty figure becomes null (the figure is optional). */
export function limpiarTexto(t: TextoNeutral | { que: string; como: string; cifra: string | null }): TextoNeutral {
  const cifra = t.cifra?.trim() || null;
  return { que: t.que.trim(), como: t.como.trim(), cifra };
}

/** Words of the neutral text ("qué" + "cómo"): tokens with at least one letter or digit. */
export function contarPalabras(t: Pick<TextoNeutral, 'que' | 'como'>): number {
  return `${t.que} ${t.como}`.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

/**
 * Figures (numbers, percentages, amounts) in canonical form: "50.000" and "50000" → "50000",
 * "2,5" → "2.5". Spanish grouping: 1–3 digits followed by groups of 3 after "." or ",".
 */
export function cifras(texto: string): string[] {
  const encontradas = texto.match(/\d+(?:[.,]\d+)*/g) ?? [];
  return encontradas.map((c) => (/^\d{1,3}(?:[.,]\d{3})+$/.test(c) ? c.replace(/[.,]/g, '') : c.replace(',', '.')));
}

export function revisarTexto(t: TextoNeutral, ctx: ContextoTexto): FalloTexto[] {
  const fallos: FalloTexto[] = [];

  // V6: template fields "qué" and "cómo" present ("cifra" optional).
  const faltan = [!t.que && 'qué', !t.como && 'cómo'].filter((x): x is string => !!x);
  if (faltan.length)
    fallos.push({
      barrera: 'V6',
      detalle: `falta el campo ${faltan.join(' y el campo ')}`,
      corregir: `Rellena ${faltan.map((f) => `"${f === 'qué' ? 'que' : 'como'}"`).join(' y ')}: es obligatorio.`,
    });

  // V3: no identifying marks of ANY party.
  const marcas = buscarMarcas([t.que, t.como, t.cifra ?? ''].join(' '), ctx.terminos);
  if (marcas.length) fallos.push({ barrera: 'V3', detalle: `marcas identificativas: ${marcas.join(', ')}`, evitar: marcas });

  // V4: every figure appears in some quote.
  const enCitas = new Set(ctx.citas.flatMap((c) => cifras(c.texto)));
  const ajenas = [...new Set(cifras([t.que, t.como, t.cifra ?? ''].join(' ')))].filter((c) => !enCitas.has(c));
  if (ajenas.length)
    fallos.push({
      barrera: 'V4',
      detalle: `cifras que no aparecen en ninguna cita: ${ajenas.join(', ')}`,
      corregir: `Estas cifras no aparecen en las citas; quítalas o usa las de las citas: ${ajenas.join(', ')}.`,
    });

  // V5: 25–70 words and within ±25 % of the topic median (the other published texts plus this one).
  // The rewrite is asked for the range around the other texts' median, where it should land.
  const n = contarPalabras(t);
  const otras = ctx.longitudesTema ?? [];
  const m = otras.length ? mediana([...otras, n])! : null;
  const objetivo = mediana(otras);
  const min = objetivo === null ? LONGITUD_TEXTO.min : Math.max(LONGITUD_TEXTO.min, Math.ceil(objetivo * (1 - TOLERANCIA_MEDIANA)));
  const max = objetivo === null ? LONGITUD_TEXTO.max : Math.min(LONGITUD_TEXTO.max, Math.floor(objetivo * (1 + TOLERANCIA_MEDIANA)));
  let motivo = `tiene ${n} palabras (debe tener entre ${LONGITUD_TEXTO.min} y ${LONGITUD_TEXTO.max})`;
  let fuera = n < LONGITUD_TEXTO.min || n > LONGITUD_TEXTO.max;
  if (!fuera && m !== null && Math.abs(n - m) > m * TOLERANCIA_MEDIANA) {
    fuera = true;
    motivo = `tiene ${n} palabras, fuera del ±${TOLERANCIA_MEDIANA * 100} % de la mediana del tema (${m})`;
  }
  if (fuera)
    fallos.push({
      barrera: 'V5',
      detalle: motivo,
      corregir: `Entre "que" y "como" deben sumar entre ${min} y ${max} palabras (ahora ${n}).`,
    });

  return fallos;
}
