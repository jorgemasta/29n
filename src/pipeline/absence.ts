// V12 (AI check): before marking "proposes nothing", a second pass confirms it.
// Keyword search over the programme's pages → targeted question to the AI about the candidates.
import { z } from 'zod';
import type { AIAdapter } from '../ai/adapter';
import { candidatePages } from './fragments';

export const ABSENCE_INSTRUCTIONS = `Eres un segundo lector de un programa electoral. Una primera lectura concluyó que el
programa NO propone nada sobre el tema indicado. Recibes solo los fragmentos (páginas) donde aparecen
palabras clave del tema. Léelos con atención y di si de verdad no hay ninguna propuesta concreta sobre el tema.
Si la hay, proposes=true y entre 1 y 3 citas LITERALES (copiadas carácter a carácter, entre 40 y 600
caracteres) con su número de página. Si no la hay, proposes=false y quotes=[]. No inventes.`;

export const AbsenceResponse = z.object({
  proposes: z.boolean(),
  quotes: z.array(z.object({ text: z.string(), page: z.number().int().min(1) })),
});

export type AbsenceResult =
  | { confirmed: true; detail: string }
  | { confirmed: false; quotes: z.infer<typeof AbsenceResponse>['quotes'] };

export async function confirmAbsence(
  ai: AIAdapter,
  topic: { id: string; title: string; question: string },
  pages: string[],
  words: string[],
): Promise<AbsenceResult> {
  const candidates = candidatePages(pages, words);
  const searchedTerms = `términos buscados: ${words.join(', ')}`;
  if (candidates.length === 0) return { confirmed: true, detail: `${searchedTerms}; ninguna página los menciona` };

  const r = await ai.complete({
    task: 'confirm-absence',
    instructions: ABSENCE_INSTRUCTIONS,
    input: { topic, pages: candidates },
    schema: AbsenceResponse,
  });
  if (r.proposes && r.quotes.length > 0) return { confirmed: false, quotes: r.quotes };
  return {
    confirmed: true,
    detail: `${searchedTerms}; revisadas las páginas ${candidates.map((c) => c.page).join(', ')} sin propuesta`,
  };
}
