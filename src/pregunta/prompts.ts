// Versioned prompt for answering a question from one programme. Part of the AI cache key
// (instrucciones are hashed), and recorded in every answer (`versiones.prompt`).
import { z } from 'zod';

export const VERSION_PROMPT_PREGUNTA = 'pregunta-v1';

export const INSTRUCCIONES_RESPONDER = `Respondes a la pregunta de un votante usando SOLO un programa electoral.
Recibes la pregunta y únicamente las páginas del programa donde aparecen palabras relacionadas.
Si esas páginas no dicen nada concreto sobre lo que se pregunta, menciona=false, citas=[] y los demás campos vacíos.
Si lo dicen, menciona=true y devuelve:
- citas: entre 1 y 3 citas LITERALES (copiadas carácter a carácter, entre 40 y 600 caracteres) con su número de página.
- que: qué dice el programa sobre lo preguntado, en una frase de 12 palabras como máximo, sin sujeto.
- como: cómo lo haría o con qué condiciones, en 30 palabras como máximo.
- cifra: la cifra, importe o plazo principal tal y como aparece en las citas, o null si no hay.
Entre "que" y "como", de 25 a 70 palabras en total. Estilo neutro: sin adjetivos valorativos, sin eslóganes,
sin nombres de partidos, siglas, líderes ni palabras de marca de NINGÚN partido.
No opines, no predigas y no añadas nada que no esté en las citas, tampoco cifras.
Si recibes "evitar", esos términos no pueden aparecer. Si recibes "corregir", corrige cada punto.`;

// Loose on purpose: empty fields reach the barriers (V6) instead of failing as a malformed answer.
export const RespuestaResponder = z.object({
  menciona: z.boolean(),
  que: z.string(),
  como: z.string(),
  cifra: z.string().nullable(),
  citas: z.array(z.object({ texto: z.string(), pagina: z.number().int().min(1) })),
});
