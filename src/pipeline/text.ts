// Deterministic checks on a neutral text (no AI): V3 marks, V4 figures, V5 length, V6 template.
// Each failure carries what to tell the AI when asking for a rewrite.
import type { Quote, NeutralText } from '../dataset/schema';
import type { IdentifyingTerms } from '../registry/terms';
import { findMarks } from './checks';

export const TEXT_LENGTH = { min: 25, max: 70 };
/** Allowed deviation from the topic median (V5). */
export const MEDIAN_TOLERANCE = 0.25;

export type TextCheck = 'V3' | 'V4' | 'V5' | 'V6';

export interface TextFailure {
  check: TextCheck;
  /** For the verification report. */
  detail: string;
  /** V3: identifying terms to avoid. */
  avoid?: string[];
  /** V4–V6: correction for the rewrite prompt. */
  fix?: string;
}

export interface TextContext {
  quotes: Quote[];
  terms: IdentifyingTerms;
  /** Word counts of the other parties' published texts on this topic (V5 median, with this text in it). */
  topicLengths?: number[];
}

/** Trims the fields; an empty figure becomes null (the figure is optional). */
export function cleanText(t: NeutralText | { what: string; how: string; figure: string | null }): NeutralText {
  const figure = t.figure?.trim() || null;
  return { what: t.what.trim(), how: t.how.trim(), figure };
}

/** Words of the neutral text ("qué" + "cómo"): tokens with at least one letter or digit. */
export function countWords(t: Pick<NeutralText, 'what' | 'how'>): number {
  return `${t.what} ${t.how}`.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const v = [...values].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

/**
 * Figures (numbers, percentages, amounts) in canonical form: "50.000" and "50000" → "50000",
 * "2,5" → "2.5". Spanish grouping: 1–3 digits followed by groups of 3 after "." or ",".
 */
export function figures(text: string): string[] {
  const found = text.match(/\d+(?:[.,]\d+)*/g) ?? [];
  return found.map((c) => (/^\d{1,3}(?:[.,]\d{3})+$/.test(c) ? c.replace(/[.,]/g, '') : c.replace(',', '.')));
}

export function reviewText(t: NeutralText, ctx: TextContext): TextFailure[] {
  const failures: TextFailure[] = [];

  // V6: template fields "what" and "how" present ("figure" optional).
  const missingOnes = [!t.what && 'qué', !t.how && 'cómo'].filter((x): x is string => !!x);
  if (missingOnes.length)
    failures.push({
      check: 'V6',
      detail: `falta el campo ${missingOnes.join(' y el campo ')}`,
      fix: `Rellena ${missingOnes.map((f) => `"${f === 'qué' ? 'what' : 'how'}"`).join(' y ')}: es obligatorio.`,
    });

  // V3: no identifying marks of ANY party.
  const marks = findMarks([t.what, t.how, t.figure ?? ''].join(' '), ctx.terms);
  if (marks.length) failures.push({ check: 'V3', detail: `marcas identificativas: ${marks.join(', ')}`, avoid: marks });

  // V4: every figure appears in some quote.
  const inQuotes = new Set(ctx.quotes.flatMap((c) => figures(c.text)));
  const foreign = [...new Set(figures([t.what, t.how, t.figure ?? ''].join(' ')))].filter((c) => !inQuotes.has(c));
  if (foreign.length)
    failures.push({
      check: 'V4',
      detail: `cifras que no aparecen en ninguna cita: ${foreign.join(', ')}`,
      fix: `Estas cifras no aparecen en las citas; quítalas o usa las de las citas: ${foreign.join(', ')}.`,
    });

  // V5: 25–70 words and within ±25 % of the topic median (the other published texts plus this one).
  // The rewrite is asked for the range around the other texts' median, where it should land.
  const n = countWords(t);
  const others = ctx.topicLengths ?? [];
  const m = others.length ? median([...others, n])! : null;
  const goal = median(others);
  const min = goal === null ? TEXT_LENGTH.min : Math.max(TEXT_LENGTH.min, Math.ceil(goal * (1 - MEDIAN_TOLERANCE)));
  const max = goal === null ? TEXT_LENGTH.max : Math.min(TEXT_LENGTH.max, Math.floor(goal * (1 + MEDIAN_TOLERANCE)));
  let reason = `tiene ${n} palabras (debe tener entre ${TEXT_LENGTH.min} y ${TEXT_LENGTH.max})`;
  let outside = n < TEXT_LENGTH.min || n > TEXT_LENGTH.max;
  if (!outside && m !== null && Math.abs(n - m) > m * MEDIAN_TOLERANCE) {
    outside = true;
    reason = `tiene ${n} palabras, fuera del ±${MEDIAN_TOLERANCE * 100} % de la mediana del tema (${m})`;
  }
  if (outside)
    failures.push({
      check: 'V5',
      detail: reason,
      fix: `Entre "que" y "como" deben sumar entre ${min} y ${max} palabras (ahora ${n}).`,
    });

  return failures;
}
