import type { Dataset, SuggestedAnswer } from '../../src/dataset/schema';
import { sampleDataset } from './sample-dataset';

const answers = (party: string, question: string, n: string): SuggestedAnswer => ({
  party,
  question,
  state: 'answers',
  text: { what: `Respuesta número ${n}`, how: `Detalle número ${n}`, figure: null },
  quotes: [{ text: `Cita literal del programa de ${party} sobre la pregunta, con más de cuarenta caracteres.`, page: 3 }],
  versions: { prompt: 'v1' },
});
const other = (party: string, question: string, state: 'notMentioned' | 'unverified'): SuggestedAnswer => ({
  party, question, state, versions: { prompt: 'v1' },
});

/**
 * sampleDataset plus two suggested questions: "luz" (aaa, ccc, isla, bcn answer; bbb does not
 * mention it; nada could not be verified) and "mili" (nobody mentions it).
 */
export const questionsDataset: Dataset = {
  ...sampleDataset,
  suggestedQuestions: [
    { id: 'mili', text: '¿Qué dicen sobre el servicio militar?', keywords: ['servicio militar'], order: 2 },
    { id: 'luz', text: '¿Quién propone bajar el IVA de la luz?', keywords: ['IVA', 'luz'], order: 1 },
  ],
  answers: [
    answers('aaa', 'luz', 'uno'),
    other('bbb', 'luz', 'notMentioned'),
    answers('ccc', 'luz', 'tres'),
    other('nada', 'luz', 'unverified'),
    answers('isla', 'luz', 'cuatro'),
    answers('bcn', 'luz', 'cinco'),
    ...['aaa', 'bbb', 'ccc', 'nada', 'isla', 'bcn'].map((p) => other(p, 'mili', 'notMentioned')),
  ],
};
