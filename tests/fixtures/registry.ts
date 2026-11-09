import type { Party } from '../../src/dataset/schema';
import type { QuestionToProcess } from '../../src/pipeline';
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

/** A question to process (V12 searches its keywords before marking "proposes nothing"). */
export const housingQuestion: QuestionToProcess = {
  id: 'vivienda-asequible',
  text: '¿Qué harían para que la vivienda sea asequible?',
  keywords: ['vivienda', 'alquiler'],
};

export const testTerms: IdentifyingTerms = {
  pej: ['Partido Ejemplo', 'PEJ', 'Ana Líder'],
  other: ['Otro Partido', 'OTP', 'Bruno Jefe', 'Avanzamos Juntos'],
};

/** Another fictional party. */
export const otherParty: Party = {
  id: 'otp',
  name: 'Otro Partido',
  acronym: 'OTP',
  scope: { type: 'national' },
  manifesto: { state: 'published', url: 'https://ejemplo.org/otro.pdf', title: 'Programa 2026' },
};

/** Official domains of the fictional parties (V7). */
export const testDomains: Record<string, string[]> = {
  pej: ['ejemplo.org'],
  other: ['otro-partido.es'],
};
