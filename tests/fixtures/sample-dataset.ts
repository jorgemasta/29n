import type { Dataset, FeasibilityNote, Party, Position } from '../../src/dataset/schema';

const published = (n: string) => ({
  state: 'published' as const,
  url: `https://ejemplo.org/${n}.pdf`,
  title: 'Programa 2026',
});

const party = (id: string, scope: Party['scope'] = { type: 'national' }, manifesto: Party['manifesto'] = published(id)): Party => ({
  id,
  name: `Partido ${id.toUpperCase()}`,
  acronym: id.toUpperCase(),
  scope,
  manifesto,
});

/** Neutral labels so card texts never contain party ids. */
const NEUTRAL: Record<string, string> = { aaa: 'uno', bbb: 'dos', ccc: 'tres', isla: 'cuatro', bcn: 'cinco' };

const quote = (p: string) => ({ text: `Cita literal del programa de ${p} sobre vivienda, con más de cuarenta caracteres.`, page: 7 });
const proposes = (p: string, topic = 'vivienda'): Position => ({
  party: p,
  topic,
  state: 'proposes',
  text: { what: `Medida número ${NEUTRAL[p]}`, how: `Instrumento número ${NEUTRAL[p]}`, figure: null },
  quotes: [quote(p)],
  versions: { prompt: 'v1' },
});

export const sampleNote: FeasibilityNote = {
  result: 'noConsensus',
  why: null,
  sources: [],
  assessments: [
    { level: 'viable', reasons: { competence: 'a', cost: 'b', legal: 'c', precedents: 'd', majority: 'e' }, why: 'Una.', sources: [{ title: 'INE', url: 'https://www.ine.es/x' }] },
    { level: 'difficult', reasons: { competence: 'a', cost: 'b', legal: 'c', precedents: 'd', majority: 'e' }, why: 'Otra.', sources: [] },
  ],
  versions: { prompt: 'viabilidad-v1', rubric: 'r1' },
};

/**
 * 4 national parties (one proposes nothing, one pending), 1 regional party in the Canary provinces
 * (35 Las Palmas, 38 Santa Cruz de Tenerife), 1 regional pending party in 35, 1 regional party in 08 (Barcelona).
 */
export const sampleDataset: Dataset = {
  version: 2,
  generated: '2026-11-08T00:00:00.000Z',
  origin: 'test',
  parties: [
    party('aaa'),
    party('bbb'),
    party('ccc'),
    party('nada'),
    party('pend', { type: 'national' }, { state: 'pending' }),
    party('isla', { type: 'provinces', provinces: ['35', '38'] }),
    party('penreg', { type: 'provinces', provinces: ['35'] }, { state: 'pending' }),
    party('bcn', { type: 'provinces', provinces: ['08'] }),
  ],
  topics: [
    { id: 'vivienda', title: 'Vivienda y alquiler', question: '¿Qué harían con la vivienda?', scope: 'national', order: 1 },
    { id: 'ref', title: 'Régimen fiscal canario', question: '¿Qué harían con el REF?', scope: 'canarias', order: 2 },
  ],
  positions: [
    { ...proposes('aaa'), feasibility: sampleNote } as Position,
    proposes('bbb'),
    proposes('ccc'),
    { party: 'nada', topic: 'vivienda', state: 'noProposal', versions: { prompt: 'v1' } },
    proposes('isla'),
    proposes('aaa', 'ref'),
    { party: 'bbb', topic: 'ref', state: 'unverified', versions: { prompt: 'v1' } },
    proposes('ccc', 'ref'),
    { party: 'nada', topic: 'ref', state: 'noProposal', versions: { prompt: 'v1' } },
    proposes('isla', 'ref'),
    proposes('bcn'),
    { party: 'bcn', topic: 'ref', state: 'noProposal', versions: { prompt: 'v1' } },
  ],
  reports: [],
};
