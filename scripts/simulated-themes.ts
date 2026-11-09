// FICTIONAL v2 themes for the private prototype (#19): one theme with one question and its 3
// approaches, written by hand over the fictional "vivienda" proposals. Each stance quotes the
// party's literal text, taken from its position on the question (processManifesto, so the quote is
// in its fictional PDF). #20 replaces the hand-written approaches with settleApproaches on the fake AI.
import type { Approach, PartyStance, Position, Question, Theme } from '../src/dataset/schema';
import type { QuestionToProcess } from '../src/pipeline';

/** Questions the fictional programmes are processed for, with the v1 topic whose fictional proposals answer them. */
export const SIMULATED_QUESTIONS: (QuestionToProcess & { theme: string; topic: string })[] = [
  {
    id: 'vivienda-asequible',
    theme: 'vivienda',
    text: '¿Qué harían para que la vivienda sea asequible?',
    keywords: ['vivienda', 'alquiler', 'hipoteca', 'inquilin', 'suelo'],
    topic: 'vivienda',
  },
];

export function simulatedThemes(positions: Position[]): { themes: Theme[]; questions: Question[] } {
  const [question] = SIMULATED_QUESTIONS;
  const stance = (party: string, level: 'full' | 'partial'): PartyStance => {
    const p = positions.find((x) => x.party === party && x.question === question!.id);
    if (p?.state !== 'proposes') throw new Error(`${party} no tiene propuesta en ${question!.id}`);
    return { party, stance: level, quote: p.quotes[0]! };
  };
  const approaches: Approach[] = [
    {
      id: 'public-housing',
      what: 'Que el Estado construya vivienda pública de alquiler asequible.',
      how: 'Una empresa o un plan públicos levantarían viviendas cuyo alquiler no superaría una parte fija de los ingresos de quien viva en ellas.',
      figure: 'decenas de miles de viviendas al año',
      filler: false,
      stances: [stance('prueba-a', 'full'), stance('prueba-e', 'partial')],
    },
    {
      id: 'regulate-market',
      what: 'Poner límites al mercado del alquiler.',
      how: 'Se limitaría el precio del alquiler o los nuevos pisos turísticos donde falte vivienda, y se penalizarían las viviendas que lleven años vacías.',
      figure: null,
      filler: false,
      stances: [stance('prueba-c', 'full'), stance('prueba-e', 'partial')],
    },
    {
      id: 'ease-buying',
      what: 'Facilitar que la gente compre su primera vivienda.',
      how: 'Se bajarían los impuestos o se darían avales públicos para comprar la primera casa, y se liberaría suelo para que se construya más.',
      figure: null,
      filler: false,
      stances: [stance('prueba-b', 'full'), stance('prueba-d', 'partial')],
    },
  ];
  return {
    themes: [{ id: 'vivienda', title: 'Vivienda', order: 1 }],
    questions: [
      {
        id: question!.id,
        theme: question!.theme,
        text: question!.text,
        keywords: question!.keywords,
        followUp: false,
        order: 1,
        origin: { cis: 'La vivienda es el primer problema para una parte importante de la población (dato simulado).', manifestos: 5 },
        approaches,
        otherProposals: [],
      },
    ],
  };
}
