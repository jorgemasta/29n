// Public feasibility rubric (V13). Versioned in the repo: bump RUBRIC_VERSION on ANY change to
// the criteria or level texts. The version is recorded in every viability note, and the rubric
// is rendered as-is on /rubrica and sent to the evaluators.

export const RUBRIC_VERSION = 'r1';

export const CRITERIA = [
  {
    id: 'competence',
    title: 'Quién puede hacerlo (Estado / comunidades / UE)',
    question: '¿Tiene el Estado la competencia, o corresponde a las comunidades autónomas, a los ayuntamientos o a la UE?',
  },
  {
    id: 'cost',
    title: 'Coste y cómo se paga',
    question: '¿Cuánto costaría frente al presupuesto y dice la propuesta cómo se financia?',
  },
  {
    id: 'legal',
    title: 'Encaje legal y constitucional',
    question: '¿Cabe en la Constitución y en el derecho europeo, o exige cambiar leyes orgánicas o la Constitución?',
  },
  {
    id: 'precedents',
    title: 'Precedentes',
    question: '¿Hay evidencia o precedentes, en España o fuera, de medidas parecidas y de sus efectos?',
  },
  {
    id: 'majority',
    title: 'Votos necesarios en el Congreso',
    question: '¿Basta un decreto o una ley ordinaria, o hace falta mayoría absoluta o reforzada?',
  },
] as const;

export type CriterionId = (typeof CRITERIA)[number]['id'];

/** The four published levels, from most to least feasible (one tone, never a traffic light). */
export const LEVELS = [
  { id: 'viable', name: 'Viable', explanation: 'encaja con las competencias, el presupuesto y la ley actuales.' },
  { id: 'viableWithCaveats', name: 'Viable con matices', explanation: 'se puede aplicar, con condiciones que la propuesta no resuelve del todo.' },
  { id: 'difficult', name: 'Difícil', explanation: 'necesita cambios importantes de ley, de presupuesto o de mayorías.' },
  { id: 'veryDifficult', name: 'Muy difícil', explanation: 'choca a la vez con varias condiciones (competencia, ley, coste o mayorías).' },
] as const;

/** Outside the scale: the evaluator can't assess it, or the two evaluations disagree. */
export const OFF_SCALE = {
  notConcrete: { name: 'Sin concreción suficiente para evaluar', explanation: 'no da cifras, plazos ni instrumento.' },
  noConsensus: { name: 'Evaluación sin consenso', explanation: 'dos evaluaciones de la IA no coincidieron. Preferimos enseñártelo a elegir una.' },
} as const;

export type LevelId = (typeof LEVELS)[number]['id'];

export function levelName(id: LevelId | keyof typeof OFF_SCALE): string {
  return LEVELS.find((n) => n.id === id)?.name ?? OFF_SCALE[id as keyof typeof OFF_SCALE].name;
}

/** Rubric as plain text, for the evaluator prompt. */
export function rubricAsText(): string {
  return [
    `Rúbrica ${RUBRIC_VERSION}. Criterios (da una razón de una frase por cada uno):`,
    ...CRITERIA.map((c) => `- ${c.id} (${c.title}): ${c.question}`),
    'Niveles:',
    ...LEVELS.map((n) => `- ${n.id} (${n.name}): ${n.explanation}`),
    `- notConcrete (${OFF_SCALE.notConcrete.name}): ${OFF_SCALE.notConcrete.explanation}`,
  ].join('\n');
}
