// Versioned prompts. Bump VERSION_PROMPT on any change: it is recorded in every position and
// is part of the AI cache key, so changed prompts are never answered from stale cache.
import { z } from 'zod';
import { Quote } from '../dataset/schema';

export const VERSION_PROMPT = 'v2';

export const EXTRACT_INSTRUCTIONS = `Eres un analista que lee programas electorales.
Recibes el texto de un programa, página a página, y un tema.
Devuelve si el programa propone algo concreto sobre ese tema y, en ese caso, entre 1 y 3 citas
LITERALES (copiadas carácter a carácter, entre 40 y 600 caracteres cada una) con su número de página.
No parafrasees, no unas frases de sitios distintos, no inventes. Si no hay propuesta, proposes=false y quotes=[].`;

export const ExtractResponse = z.object({
  proposes: z.boolean(),
  quotes: z.array(z.object({ text: z.string(), page: z.number().int().min(1) })),
});

export const NEUTRALIZE_INSTRUCTIONS = `Reescribe una propuesta electoral en un estilo neutro, común a todos los partidos.
Recibes un tema y las citas literales de la propuesta. Devuelve:
- what: qué propone, en una frase de 12 palabras como máximo, sin sujeto ("Limitar…", "Crear…").
- how: con qué instrumento o cómo lo haría, en 30 palabras como máximo.
- figure: la cifra, importe o plazo principal tal y como aparece en las citas, o null si no hay.
Entre "what" y "how", de 25 a 70 palabras en total. Sin adjetivos valorativos, sin eslóganes,
sin nombres de partidos, siglas, líderes ni palabras de marca de NINGÚN partido.
No añadas nada que no esté en las citas, tampoco cifras: toda cifra debe aparecer en alguna cita.
Si recibes "avoid", esos términos no pueden aparecer. Si recibes "fix", corrige cada punto.
Si recibes "hint", es lo que delató al partido en tu versión anterior: reescribe sin ese rasgo,
sin perder fidelidad a las citas.`;

export const NeutralizeInput = z.object({ quotes: z.array(Quote) });
// Loose on purpose: an empty field is caught by V6 (rewrite), not rejected as a malformed answer.
export const NeutralizeResponse = z.object({ what: z.string(), how: z.string(), figure: z.string().nullable() });
