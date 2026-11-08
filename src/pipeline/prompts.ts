// Versioned prompts. Bump VERSION_PROMPT on any change: it is recorded in every postura and
// is part of the AI cache key, so changed prompts are never answered from stale cache.
import { z } from 'zod';
import { Cita, TextoNeutral } from '../dataset/esquema';

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
No añadas nada que no esté en las citas. Si recibes "evitar", esos términos no pueden aparecer.
Si recibes "corregir", es lo que un verificador encontró mal en tu versión anterior: corrígelo.
Si recibes "pista", es lo que delató al partido en tu versión anterior: reescribe sin ese rasgo,
sin perder fidelidad a las citas.`;

export const EntradaNeutralizar = z.object({ citas: z.array(Cita) });
export const RespuestaNeutralizar = TextoNeutral;
