// Deterministic verification checks (no AI).
import type { Quote } from '../dataset/schema';
import type { IdentifyingTerms } from '../registry/terms';
import { normalizeQuote, normalizeTerm } from './normalize';

export const QUOTE_LENGTH = { min: 40, max: 600 };

export type QuoteResult =
  | { ok: true; quote: Quote; fixedPage: boolean }
  | { ok: false; reason: string };

/**
 * V1 (the quote exists, 40–600 chars) + V2 (correct page: fixed automatically).
 * Returns the quote as the AI gave it, with the page where it really is.
 */
export function verifyQuote(quote: Quote, pages: string[]): QuoteResult {
  const searched = normalizeQuote(quote.text);
  if (searched.length < QUOTE_LENGTH.min || searched.length > QUOTE_LENGTH.max)
    return { ok: false, reason: `la cita tiene ${searched.length} caracteres (debe tener entre ${QUOTE_LENGTH.min} y ${QUOTE_LENGTH.max})` };
  const normalized = pages.map(normalizeQuote);
  if (normalized[quote.page - 1]?.includes(searched)) return { ok: true, quote, fixedPage: false };
  const i = normalized.findIndex((p) => p.includes(searched));
  if (i === -1) return { ok: false, reason: `la cita no aparece en el PDF: «${quote.text.slice(0, 80)}…»` };
  return { ok: true, quote: { ...quote, page: i + 1 }, fixedPage: true };
}

/** V3: identifying terms of ANY party found in the text (case/accent-insensitive, whole words). */
export function findMarks(text: string, terms: IdentifyingTerms): string[] {
  const t = normalizeTerm(text);
  const found = new Set<string>();
  for (const list of Object.values(terms)) {
    for (const term of list) {
      const n = normalizeTerm(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`(?<![\\p{L}\\p{N}])${n}(?![\\p{L}\\p{N}])`, 'u').test(t)) found.add(term);
    }
  }
  return [...found];
}
