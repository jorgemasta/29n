// Versioned feasibility prompt (V13). Bump VERSION_PROMPT_VIABILIDAD on any change: it is
// recorded in every viability note and is part of the AI cache key (via the instructions).
import { z } from 'zod';
import { NivelEvaluacion, RazonesRubrica } from '../dataset/esquema';
import { rubricaComoTexto } from '../registro/rubrica';
import { DOMINIOS_INSTITUCIONALES } from '../registro/dominios-institucionales';

export const VERSION_PROMPT_VIABILIDAD = 'viabilidad-v1';

export const INSTRUCCIONES_VIABILIDAD = `Evalúas la viabilidad de una propuesta electoral en España. No sabes de qué partido es
y no debes intentar averiguarlo. Recibes el tema, la propuesta reescrita en estilo neutro (qué / cómo / cifra)
y las citas literales del programa (los nombres propios de partidos aparecen como [partido]).
No valoras si la propuesta es buena idea: solo qué haría falta para aplicarla.

${rubricaComoTexto()}

Devuelve:
- nivel: uno de viable, viable_con_matices, dificil, muy_dificil, o sin_concrecion si la propuesta no da
  cifras, plazos ni instrumento suficientes para evaluarla.
- razones: una frase por criterio (competencia, coste, legal, precedentes, mayoria).
- porque: 2 o 3 frases llanas, sin adjetivos morales, que expliquen el nivel.
- fuentes: de 1 a 3 fuentes institucionales que respalden el "porque", con título y URL https exacta
  (solo de estos dominios o sus subdominios: ${DOMINIOS_INSTITUCIONALES.join(', ')}). No inventes URLs.
  Toda cifra del "porque" debe venir de una fuente; si no hay fuente, no hay cifra. Con sin_concrecion, fuentes puede ir vacía.
Si recibes "fuentesRechazadas", esas URLs no eran válidas: no las repitas.`;

// Looser than the published Evaluacion (sources validated by V8, not by the parser).
export const RespuestaViabilidad = z.object({
  nivel: NivelEvaluacion,
  razones: RazonesRubrica,
  porque: z.string().min(1),
  fuentes: z.array(z.object({ titulo: z.string(), url: z.string() })),
});

export type RespuestaViabilidad = z.infer<typeof RespuestaViabilidad>;
