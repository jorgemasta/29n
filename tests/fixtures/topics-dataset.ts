import type { Dataset, Party, TopicPosition, Topic, SourceType } from '../../src/dataset/schema';

const party = (id: string, source?: SourceType): Party => ({
  id,
  name: `Partido ${id}`,
  acronym: id.toUpperCase(),
  scope: { type: 'national' },
  manifesto: { state: 'published', url: `https://ejemplo.org/${id}.pdf`, title: `Documento de ${id}`, ...(source ? { source } : {}) },
});

const titles: [string, string][] = [
  ['vivienda', 'Vivienda y alquiler'],
  ['empleo', 'Empleo y salarios'],
  ['sanidad', 'Sanidad'],
  ['pensiones', 'Pensiones'],
  ['impuestos', 'Impuestos'],
  ['transporte', 'Transporte'],
  ['defensa', 'Defensa y OTAN'],
];
const topics: Topic[] = titles.map(([id, title], i) => ({ id, title, question: `¿Qué harían con ${title.toLowerCase()}?`, scope: 'national', order: i + 1 }));

const NEUTRAL: Record<string, string> = { uno: 'uno', dos: 'dos', viejo: 'tres', dichos: 'cuatro' };
const proposes = (party: string, topic: string): TopicPosition => ({
  party,
  topic,
  state: 'proposes',
  text: { what: `Medida ${NEUTRAL[party]} sobre ${topic}`, how: `Instrumento ${NEUTRAL[party]}`, figure: null },
  quotes: [{ text: `Cita literal del documento de ${party} sobre ${topic}, con más de cuarenta caracteres.`, page: 3 }],
  versions: { prompt: 'v1' },
});

/**
 * 7 national topics; 'uno' (no explicit source: official programme) and 'dos' (official 29N
 * programme) are public sources, 'viejo' (2023 programme) and 'dichos' (public statements)
 * are provisional, private-prototype-only sources.
 */
export const topicsDataset: Dataset = {
  version: 2,
  generated: '2026-11-08T00:00:00.000Z',
  origin: 'test',
  parties: [party('uno'), party('dos', 'manifesto-29n'), party('viejo', 'manifesto-2023'), party('dichos', 'statements')],
  topics,
  topicPositions: topics.flatMap((t) => ['uno', 'dos', 'viejo', 'dichos'].map((p) => proposes(p, t.id))),
  positions: [],
  reports: [],
};
