// Versioned prompts. Bump VERSION_PROMPT on any change: it is recorded in every position and
// is part of the AI cache key, so changed prompts are never answered from stale cache.
import { z } from 'zod';

export const VERSION_PROMPT = 'v3';

export const EXTRACT_INSTRUCTIONS = `Eres un analista que lee programas electorales.
Recibes el texto de un programa, página a página, y una pregunta ("question").
Devuelve si el programa propone algo concreto que responda a esa pregunta y, en ese caso:
- quotes: entre 1 y 3 citas LITERALES (copiadas carácter a carácter, entre 40 y 600 caracteres cada
  una) con su número de página. No parafrasees, no unas frases de sitios distintos, no inventes.
- proposal: la propuesta concreta del partido, fiel a las citas:
  - what: qué propone, en una frase corta, sin sujeto ("Limitar…", "Crear…").
  - how: con qué instrumento o cómo lo haría, en una o dos frases.
  - figure: la cifra, importe o plazo principal EXACTO tal y como aparece en las citas, o null si no hay.
  No añadas nada que no esté en las citas.
Si no hay propuesta, proposes=false, quotes=[] y proposal=null.`;

// Loose on purpose: an empty "what"/"how" is caught by V6 (discard), not rejected as a malformed answer.
export const ProposalResponse = z.object({ what: z.string(), how: z.string(), figure: z.string().nullable() });

export const ExtractResponse = z.object({
  proposes: z.boolean(),
  quotes: z.array(z.object({ text: z.string(), page: z.number().int().min(1) })),
  proposal: ProposalResponse.nullable(),
});
