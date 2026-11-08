// Versioned prompts. Bump VERSION_PROMPT on any change: it is recorded in every postura and
// is part of the AI cache key, so changed prompts are never answered from stale cache.
import { z } from 'zod';
import { Cita } from '../dataset/esquema';

export const VERSION_PROMPT = 'v2';

export const INSTRUCCIONES_EXTRAER = `Eres un analista que lee programas electorales.
Recibes el texto de un programa, página a página, y un tema.
Devuelve si el programa propone algo concreto sobre ese tema y, en ese caso, entre 1 y 3 citas
LITERALES (copiadas carácter a carácter, entre 40 y 600 caracteres cada una) con su número de página.
No parafrasees, no unas frases de sitios distintos, no inventes. Si no hay propuesta, propone=false y citas=[].`;

export const RespuestaExtraer = z.object({
  propone: z.boolean(),
  citas: z.array(z.object({ texto: z.string(), pagina: z.number().int().min(1) })),
});

export const INSTRUCCIONES_NEUTRALIZAR = `Reescribe una propuesta electoral en un estilo neutro, común a todos los partidos.
Recibes un tema y las citas literales de la propuesta. Devuelve:
- que: qué propone, en una frase de 12 palabras como máximo, sin sujeto ("Limitar…", "Crear…").
- como: con qué instrumento o cómo lo haría, en 30 palabras como máximo.
- cifra: la cifra, importe o plazo principal tal y como aparece en las citas, o null si no hay.
Entre "que" y "como", de 25 a 70 palabras en total. Sin adjetivos valorativos, sin eslóganes,
sin nombres de partidos, siglas, líderes ni palabras de marca de NINGÚN partido.
No añadas nada que no esté en las citas, tampoco cifras: toda cifra debe aparecer en alguna cita.
Si recibes "evitar", esos términos no pueden aparecer. Si recibes "corregir", corrige cada punto.`;

export const EntradaNeutralizar = z.object({ citas: z.array(Cita) });
// Loose on purpose: an empty field is caught by V6 (rewrite), not rejected as a malformed answer.
export const RespuestaNeutralizar = z.object({ que: z.string(), como: z.string(), cifra: z.string().nullable() });
