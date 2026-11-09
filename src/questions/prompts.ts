// Versioned prompt for answering a question from one programme. Part of the AI cache key
// (instrucciones are hashed), and recorded in every answer (`versions.prompt`).
import { z } from 'zod';

export const QUESTION_PROMPT_VERSION = 'pregunta-v1';

export const ANSWER_INSTRUCTIONS = `Respondes a la pregunta de un votante usando SOLO un programa electoral.
Recibes la pregunta y únicamente las páginas del programa donde aparecen palabras relacionadas.
Si esas páginas no dicen nada concreto sobre lo que se pregunta, mentions=false, quotes=[] y los demás campos vacíos.
Si lo dicen, mentions=true y devuelve:
- quotes: entre 1 y 3 citas LITERALES (copiadas carácter a carácter, entre 40 y 600 caracteres) con su número de página.
- what: qué dice el programa sobre lo preguntado, en una frase de 12 palabras como máximo, sin sujeto.
- how: cómo lo haría o con qué condiciones, en 30 palabras como máximo.
- figure: la cifra, importe o plazo principal tal y como aparece en las citas, o null si no hay.
Entre "what" y "how", de 25 a 70 palabras en total. Estilo neutro: sin adjetivos valorativos, sin eslóganes,
sin nombres de partidos, siglas, líderes ni palabras de marca de NINGÚN partido.
No opines, no predigas y no añadas nada que no esté en las citas, tampoco cifras.
Si recibes "avoid", esos términos no pueden aparecer. Si recibes "fix", corrige cada punto.`;

// Loose on purpose: empty fields reach the checks (V6) instead of failing as a malformed answer.
export const AnswerResponse = z.object({
  mentions: z.boolean(),
  what: z.string(),
  how: z.string(),
  figure: z.string().nullable(),
  quotes: z.array(z.object({ text: z.string(), page: z.number().int().min(1) })),
});
