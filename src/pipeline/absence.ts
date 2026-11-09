// V12 (AI check): before marking "proposes nothing", a second pass confirms it.
// Keyword search over the programme's pages → targeted question to the AI about the candidates.
import { z } from 'zod';
import type { AIAdapter } from '../ai/adapter';
import { candidatePages } from './fragments';
import { ExtractResponse } from './prompts';

export const ABSENCE_INSTRUCTIONS = `Eres un segundo lector de un programa electoral. Una primera lectura concluyó que el
programa NO propone nada que responda a la pregunta indicada ("question"). Recibes solo los fragmentos
(páginas) donde aparecen sus palabras clave. Léelos con atención y di si de verdad no hay ninguna propuesta
concreta que responda a la pregunta.
Si la hay, proposes=true, entre 1 y 3 citas LITERALES (copiadas carácter a carácter, entre 40 y 600
caracteres) con su número de página, y proposal: qué propone (what), cómo (how) y la cifra principal
EXACTA tal y como aparece en las citas (figure, o null), fiel a las citas.
Si no la hay, proposes=false, quotes=[] y proposal=null. No inventes.`;

/** Same answer as the first pass (extract-position). */
export const AbsenceResponse = ExtractResponse;

export type AbsenceResult =
  | { confirmed: true; detail: string }
  | { confirmed: false; found: z.infer<typeof AbsenceResponse> };

export async function confirmAbsence(
  ai: AIAdapter,
  question: { id: string; text: string },
  pages: string[],
  words: string[],
): Promise<AbsenceResult> {
  const candidates = candidatePages(pages, words);
  const searchedTerms = `términos buscados: ${words.join(', ')}`;
  if (candidates.length === 0) return { confirmed: true, detail: `${searchedTerms}; ninguna página los menciona` };

  const r = await ai.complete({
    task: 'confirm-absence',
    instructions: ABSENCE_INSTRUCTIONS,
    input: { question, pages: candidates },
    schema: AbsenceResponse,
  });
  if (r.proposes && r.quotes.length > 0) return { confirmed: false, found: r };
  return {
    confirmed: true,
    detail: `${searchedTerms}; revisadas las páginas ${candidates.map((c) => c.page).join(', ')} sin propuesta`,
  };
}
