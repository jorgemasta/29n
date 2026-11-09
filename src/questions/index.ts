// Answering a question from one programme ("Pregunta libre" module, docs/ux-spec.md §12).
// Used by the data pipeline to precompute the 7 suggested questions, and meant to be reused
// behind the live endpoint (#15) for the free text box. No Node-only dependency: it runs in a Worker.
//
//   answerQuestion(ai, question, pages, { terms }) → answers | notMentioned | unverified
//
// Steps: keyword retrieval (no AI) → no candidate page = "no lo menciona" without calling the AI
// → AI answer with mandatory literal quotes → V1/V2 (invented quotes are removed) → V3–V6 → V10.
// Any failure is fed back for a rewrite, up to MAX_RETRIES times; then "sin_verificar".
import type { Quote, NeutralText } from '../dataset/schema';
import type { AIAdapter } from '../ai/adapter';
import type { IdentifyingTerms } from '../registry/terms';
import { verifyQuote } from '../pipeline/checks';
import { verifyFidelity } from '../pipeline/fidelity';
import { candidatePages, type Fragment } from '../pipeline/fragments';
import { cleanText, reviewText } from '../pipeline/text';
import { ANSWER_INSTRUCTIONS, AnswerResponse } from './prompts';

export { QUESTION_PROMPT_VERSION } from './prompts';

/** Same limit as the positions' rewrite loop. */
export const MAX_RETRIES = 2;

export interface QuestionToAnswer {
  id: string;
  text: string;
  /** Search terms that find the candidate pages. */
  keywords: string[];
}

export type AnswerResult =
  | { state: 'answers'; text: NeutralText; quotes: Quote[] }
  | { state: 'notMentioned'; detail: string }
  | { state: 'unverified'; detail: string };

type AnswerCheck = 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6' | 'V10';
export type Annotate = (check: AnswerCheck, result: 'pass' | 'fix' | 'rewrite' | 'discard', detail: string) => void;

export interface AnswerOptions {
  /** Identifying terms of every party (V3). */
  terms: IdentifyingTerms;
  /** Receives every check outcome (the pipeline writes them into the public report). */
  annotate?: Annotate;
  /**
   * Send the AI at most this many candidate pages: the ones matching the most search terms
   * (ties: page order). Unset = every candidate page (precomputed answers).
   */
  maxPages?: number;
}

/** Candidate pages for a question, optionally only the `max` that match the most search terms. */
export function pagesToAnswer(pages: string[], words: string[], max?: number): Fragment[] {
  const candidates = candidatePages(pages, words);
  if (max === undefined || candidates.length <= max) return candidates;
  const hits = new Map(candidates.map((c) => [c.page, words.filter((p) => candidatePages([c.text], [p]).length).length]));
  return [...candidates]
    .sort((a, b) => hits.get(b.page)! - hits.get(a.page)! || a.page - b.page)
    .slice(0, max);
}

export async function answerQuestion(
  ai: AIAdapter,
  question: QuestionToAnswer,
  pages: string[],
  options: AnswerOptions,
): Promise<AnswerResult> {
  const annotate: Annotate = options.annotate ?? (() => {});
  const candidates = pagesToAnswer(pages, question.keywords, options.maxPages);
  const searchedTerms = `términos buscados: ${question.keywords.join(', ')}`;
  if (candidates.length === 0) return { state: 'notMentioned', detail: `${searchedTerms}; ninguna página los menciona` };

  const aiQuestion = { id: question.id, text: question.text };
  // V10's verifier takes a topic; the question plays that role.
  const fidelityTopic = { id: question.id, title: question.text, question: question.text };
  let avoid: string[] = [];
  let fix: string[] = [];
  type Failure = { check: AnswerCheck; detail: string; avoid?: string[]; fix?: string };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const r = await ai.complete({
      task: 'answer-question',
      instructions: ANSWER_INSTRUCTIONS,
      input: {
        question: aiQuestion,
        pages: candidates,
        ...(avoid.length ? { avoid } : {}),
        ...(fix.length ? { fix } : {}),
      },
      schema: AnswerResponse,
    });
    if (!r.mentions)
      return { state: 'notMentioned', detail: `${searchedTerms}; revisadas las páginas ${candidates.map((c) => c.page).join(', ')} sin respuesta` };

    // V1 + V2: an invented quote is removed; the page of a real one is fixed.
    const quotes: Quote[] = [];
    for (const quote of r.quotes) {
      const v = verifyQuote(quote, pages);
      if (!v.ok) annotate('V1', 'discard', `cita eliminada: ${v.reason}`);
      else {
        if (v.fixedPage) annotate('V2', 'fix', `página ${quote.page} → ${v.quote.page}`);
        quotes.push(v.quote);
      }
    }

    const text = cleanText(r);
    const failures: Failure[] = [];
    if (quotes.length === 0)
      failures.push({
        check: 'V1',
        detail: 'ninguna cita aparece literal en el programa',
        fix: 'Ninguna cita aparece tal cual en las páginas: cópialas carácter a carácter.',
      });
    else {
      failures.push(...reviewText(text, { quotes, terms: options.terms }));
      if (failures.length === 0) {
        const fidelity = await verifyFidelity(ai, fidelityTopic, quotes, text);
        if (fidelity.faithful) {
          annotate('V1', 'pass', `${quotes.length} cita(s) localizadas`);
          annotate('V3', 'pass', 'sin marcas identificativas');
          annotate('V4', 'pass', 'cifras trazables a las citas');
          annotate('V5', 'pass', 'longitud dentro del rango');
          annotate('V6', 'pass', 'plantilla completa');
          annotate('V10', 'pass', 'fiel a la cita según un verificador independiente');
          return { state: 'answers', text, quotes };
        }
        failures.push({ check: 'V10', detail: `no es fiel a la cita: ${fidelity.reason}`, fix: fidelity.reason });
      }
    }

    if (attempt === MAX_RETRIES) {
      for (const f of failures) annotate(f.check, 'discard', `${f.detail} (tras ${MAX_RETRIES} reintentos)`);
      return { state: 'unverified', detail: failures.map((f) => `${f.check}: ${f.detail}`).join('; ') };
    }
    for (const f of failures) annotate(f.check, 'rewrite', f.detail);
    avoid = [...new Set([...avoid, ...failures.flatMap((f) => f.avoid ?? [])])];
    fix = failures.flatMap((f) => (f.fix ? [f.fix] : []));
  }
  throw new Error('inalcanzable');
}
