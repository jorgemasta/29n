import type { Approach, Dataset, PartyStance, Question } from '../../src/dataset/schema';
import { sampleDataset } from './sample-dataset';

/** Neutral words so approach texts never contain party ids. */
const quote = (party: string, n: number) => ({
  text: `Cita literal número ${n} del programa de ${party}, con más de cuarenta caracteres.`,
  page: n,
});
const full = (party: string, n = 3): PartyStance => ({ party, stance: 'full', quote: quote(party, n) });
const partial = (party: string, n = 4): PartyStance => ({ party, stance: 'partial', quote: quote(party, n) });

const approach = (id: string, word: string, stances: PartyStance[], filler = false): Approach => ({
  id,
  what: `Enfoque ${word}`,
  how: `Mediante el instrumento ${word}`,
  figure: filler ? null : 'decenas de miles',
  filler,
  stances,
});

const question = (q: Omit<Question, 'origin' | 'otherProposals'> & Partial<Question>): Question => ({
  origin: { cis: 'Preocupa al 30 % según el barómetro', manifestos: 4 },
  otherProposals: [],
  ...q,
});

/**
 * sampleDataset (parties aaa, bbb, ccc national; nada proposes nothing; pend pending; isla regional
 * 35/38; bcn regional 08) plus v2 themes:
 * - vivienda: base questions alquiler and compra, follow-up question okupacion.
 *   alquiler: "control" (aaa full, bbb partial), "oferta" (ccc full, isla full), "ayudas" (filler);
 *   bcn proposes something else.
 * - sanidad: one base question, listas.
 * - canarias: regionalTheme for autonomous community 05 (provinces 35, 38).
 */
export const themesDataset: Dataset = {
  ...sampleDataset,
  themes: [
    { id: 'vivienda', title: 'Vivienda', order: 1 },
    { id: 'sanidad', title: 'Sanidad', order: 2 },
    { id: 'canarias', title: 'Tu comunidad: Canarias', order: 3, region: '05' },
  ],
  questions: [
    question({
      id: 'alquiler',
      theme: 'vivienda',
      text: '¿Qué harían para que el alquiler sea asequible?',
      followUp: false,
      order: 1,
      approaches: [
        approach('control', 'uno', [full('aaa'), partial('bbb')]),
        approach('oferta', 'dos', [full('ccc'), full('isla')]),
        approach('ayudas', 'tres', [], true),
      ],
      otherProposals: [{ party: 'bcn', quote: quote('bcn', 5) }],
    }),
    question({
      id: 'compra',
      theme: 'vivienda',
      text: '¿Qué harían para que comprar casa sea posible?',
      followUp: false,
      order: 2,
      approaches: [
        approach('avales', 'cuatro', [full('aaa')]),
        approach('suelo', 'cinco', [full('bbb')]),
        approach('cooperativas', 'seis', [full('ccc')]),
      ],
    }),
    question({
      id: 'okupacion',
      theme: 'vivienda',
      text: '¿Qué harían con las viviendas vacías?',
      followUp: true,
      order: 3,
      approaches: [
        approach('impuesto', 'siete', [full('aaa')]),
        approach('registro', 'ocho', [full('bbb')]),
        approach('compra-publica', 'nueve', [full('ccc')]),
      ],
    }),
    question({
      id: 'listas',
      theme: 'sanidad',
      text: '¿Qué harían con las listas de espera?',
      followUp: false,
      order: 1,
      approaches: [
        approach('conciertos', 'diez', [full('aaa')]),
        approach('plantillas', 'once', [full('bbb'), partial('ccc')]),
        approach('ventanilla', 'doce', [], true),
      ],
    }),
    question({
      id: 'ref',
      theme: 'canarias',
      text: '¿Qué harían con el régimen fiscal canario?',
      followUp: false,
      order: 1,
      approaches: [
        approach('ampliar', 'trece', [full('isla')]),
        approach('mantener', 'catorce', [full('aaa'), full('bbb')]),
        approach('revisar', 'quince', [full('ccc')]),
      ],
    }),
  ],
};
