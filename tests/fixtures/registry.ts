import type { Party, Position, Topic } from '../../src/dataset/schema';
import type { IdentifyingTerms } from '../../src/registry/terms';

/** Fictional parties: tests never depend on the real registry. */
export const sampleParty: Party = {
  id: 'pej',
  name: 'Partido Ejemplo',
  acronym: 'PEJ',
  scope: { type: 'national' },
  manifesto: {
    state: 'published',
    url: 'https://ejemplo.org/programa.pdf',
    title: 'Programa 2026',
  },
};

export const housingTopic: Topic = {
  id: 'vivienda',
  title: 'Vivienda y alquiler',
  question: '¿Qué harían con el precio de la vivienda y el alquiler?',
  scope: 'national',
  order: 1,
};

export const testTerms: IdentifyingTerms = {
  pej: ['Partido Ejemplo', 'PEJ', 'Ana Líder'],
  other: ['Otro Partido', 'OTP', 'Bruno Jefe', 'Avanzamos Juntos'],
};

/** Another fictional party already published, so V11 has positions to mix with. */
export const otherParty: Party = {
  id: 'otp',
  name: 'Otro Partido',
  acronym: 'OTP',
  scope: { type: 'national' },
  manifesto: { state: 'published', url: 'https://ejemplo.org/otro.pdf', title: 'Programa 2026' },
};

export const otherPosition: Position = {
  party: 'otp',
  topic: 'vivienda',
  state: 'proposes',
  versions: { prompt: 'v1' },
  // 28 words: inside V5's range around the other test texts.
  text: {
    what: 'Bajar el IVA de la vivienda nueva para quienes compran su primera casa en cualquier parte del país.',
    how: 'Con una rebaja fiscal temporal para los compradores, revisada cada año según la evolución de los precios.',
    figure: null,
  },
  quotes: [{ text: 'Rebajaremos el IVA de la vivienda nueva para los compradores de primera vivienda.', page: 4 }],
};

export const thirdParty: Party = { ...otherParty, id: 'ter', name: 'Tercer Partido', acronym: 'TER' };
export const thirdPosition: Position = {
  ...otherPosition,
  party: 'ter',
  text: {
    what: 'Crear un seguro público que cubra el impago del alquiler a los propietarios que alquilen a jóvenes.',
    how: 'El Estado avalaría esos contratos durante los primeros años, para que alquilar a jóvenes sea más seguro.',
    figure: null,
  },
};

/** Official domains of the fictional parties (V7). */
export const testDomains: Record<string, string[]> = {
  pej: ['ejemplo.org'],
  other: ['otro-partido.es'],
};
