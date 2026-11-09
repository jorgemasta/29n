// Versioned feasibility prompt (V13). Bump FEASIBILITY_PROMPT_VERSION on any change: it is
// recorded in every viability note and is part of the AI cache key (via the instructions).
import { z } from 'zod';
import { AssessmentLevel, RubricReasons } from '../dataset/schema';
import { rubricAsText } from '../registry/rubric';
import { INSTITUTIONAL_DOMAINS } from '../registry/institutional-domains';

export const FEASIBILITY_PROMPT_VERSION = 'viabilidad-v2';

export const FEASIBILITY_INSTRUCTIONS = `Evalúas la viabilidad de una propuesta electoral en España. No sabes de qué partido es
y no debes intentar averiguarlo. Recibes la pregunta a la que responde, la propuesta concreta (qué / cómo / cifra)
y las citas literales del programa (los nombres propios de partidos aparecen como [partido]).
No valoras si la propuesta es buena idea: solo qué haría falta para aplicarla.

${rubricAsText()}

Devuelve:
- level: uno de viable, viableWithCaveats, difficult, veryDifficult, o notConcrete si la propuesta no da
  cifras, plazos ni instrumento suficientes para evaluarla.
- reasons: una frase por criterio (competence, cost, legal, precedents, majority).
- why: 2 o 3 frases llanas, sin adjetivos morales, que expliquen el nivel.
- sources: de 1 a 3 fuentes institucionales que respalden el "why", con título y URL https exacta
  (solo de estos dominios o sus subdominios: ${INSTITUTIONAL_DOMAINS.join(', ')}). No inventes URLs.
  Toda cifra del "why" debe venir de una fuente; si no hay fuente, no hay cifra. Con notConcrete, sources puede ir vacía.
Si recibes "rejectedSources", esas URLs no eran válidas: no las repitas.`;

// Looser than the published Evaluacion (sources validated by V8, not by the parser).
export const FeasibilityResponse = z.object({
  level: AssessmentLevel,
  reasons: RubricReasons,
  why: z.string().min(1),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
});

export type FeasibilityResponse = z.infer<typeof FeasibilityResponse>;
