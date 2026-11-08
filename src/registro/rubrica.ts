// Public feasibility rubric (V13). Versioned in the repo: bump VERSION_RUBRICA on ANY change to
// the criteria or level texts. The version is recorded in every viability note, and the rubric
// is rendered as-is on /rubrica and sent to the evaluators.

export const VERSION_RUBRICA = 'r1';

export const CRITERIOS = [
  {
    id: 'competencia',
    titulo: 'Quién puede hacerlo (Estado / comunidades / UE)',
    pregunta: '¿Tiene el Estado la competencia, o corresponde a las comunidades autónomas, a los ayuntamientos o a la UE?',
  },
  {
    id: 'coste',
    titulo: 'Coste y cómo se paga',
    pregunta: '¿Cuánto costaría frente al presupuesto y dice la propuesta cómo se financia?',
  },
  {
    id: 'legal',
    titulo: 'Encaje legal y constitucional',
    pregunta: '¿Cabe en la Constitución y en el derecho europeo, o exige cambiar leyes orgánicas o la Constitución?',
  },
  {
    id: 'precedentes',
    titulo: 'Precedentes',
    pregunta: '¿Hay evidencia o precedentes, en España o fuera, de medidas parecidas y de sus efectos?',
  },
  {
    id: 'mayoria',
    titulo: 'Votos necesarios en el Congreso',
    pregunta: '¿Basta un decreto o una ley ordinaria, o hace falta mayoría absoluta o reforzada?',
  },
] as const;

export type CriterioId = (typeof CRITERIOS)[number]['id'];

/** The four published levels, from most to least feasible (one tone, never a traffic light). */
export const NIVELES = [
  { id: 'viable', nombre: 'Viable', explicacion: 'encaja con las competencias, el presupuesto y la ley actuales.' },
  { id: 'viable_con_matices', nombre: 'Viable con matices', explicacion: 'se puede aplicar, con condiciones que la propuesta no resuelve del todo.' },
  { id: 'dificil', nombre: 'Difícil', explicacion: 'necesita cambios importantes de ley, de presupuesto o de mayorías.' },
  { id: 'muy_dificil', nombre: 'Muy difícil', explicacion: 'choca a la vez con varias condiciones (competencia, ley, coste o mayorías).' },
] as const;

/** Outside the scale: the evaluator can't assess it, or the two evaluations disagree. */
export const FUERA_DE_ESCALA = {
  sin_concrecion: { nombre: 'Sin concreción suficiente para evaluar', explicacion: 'no da cifras, plazos ni instrumento.' },
  sin_consenso: { nombre: 'Evaluación sin consenso', explicacion: 'dos evaluaciones de la IA no coincidieron. Preferimos enseñártelo a elegir una.' },
} as const;

export type NivelId = (typeof NIVELES)[number]['id'];

export function nombreNivel(id: NivelId | keyof typeof FUERA_DE_ESCALA): string {
  return NIVELES.find((n) => n.id === id)?.nombre ?? FUERA_DE_ESCALA[id as keyof typeof FUERA_DE_ESCALA].nombre;
}

/** Rubric as plain text, for the evaluator prompt. */
export function rubricaComoTexto(): string {
  return [
    `Rúbrica ${VERSION_RUBRICA}. Criterios (da una razón de una frase por cada uno):`,
    ...CRITERIOS.map((c) => `- ${c.id} (${c.titulo}): ${c.pregunta}`),
    'Niveles:',
    ...NIVELES.map((n) => `- ${n.id} (${n.nombre}): ${n.explicacion}`),
    `- sin_concrecion (${FUERA_DE_ESCALA.sin_concrecion.nombre}): ${FUERA_DE_ESCALA.sin_concrecion.explicacion}`,
  ].join('\n');
}
