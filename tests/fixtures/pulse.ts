import type { Pulse } from '../../src/pulse';

/** A frozen pulse matching themesDataset, plus two rejected candidates. */
export const samplePulse: Pulse = {
  frozenAt: '2026-11-01',
  promptVersion: 'pulso-v1',
  sources: {
    cis: {
      barometer: 'Barómetro del CIS de octubre de 2026',
      url: 'https://www.cis.es/barometro-octubre-2026',
      items: [{ id: 'vivienda', label: 'La vivienda', percent: 30 }],
    },
    manifestos: [
      { party: 'aaa', topics: ['vivienda'] },
      { party: 'bbb', topics: ['vivienda', 'sanidad'] },
      { party: 'ccc', topics: ['sanidad'] },
    ],
    networks: [
      { id: 'r1', source: 'reddit', label: 'Hilo sobre alquiler', url: 'https://www.reddit.com/r/spain/x' },
      { id: 'r2', source: 'reddit', label: 'Hilo sobre okupas' },
      { id: 'w1', source: 'web', label: 'Foro' },
    ],
  },
  themes: [
    { id: 'vivienda', title: 'Vivienda', order: 1 },
    { id: 'sanidad', title: 'Sanidad', order: 2 },
    { id: 'canarias', title: 'Tu comunidad: Canarias', order: 3, region: '05' },
  ],
  questions: [
    { id: 'alquiler', theme: 'vivienda', text: '¿Qué harían para que el alquiler sea asequible?', followUp: false, order: 1, origin: { cis: 'La vivienda: 30 % (Barómetro del CIS de octubre de 2026)', manifestos: 2 } },
    { id: 'listas', theme: 'sanidad', text: '¿Qué harían con las listas de espera?', followUp: false, order: 1, origin: { cis: null, manifestos: 3 } },
    { id: 'urgencias', theme: 'sanidad', text: '¿Qué harían con las urgencias?', followUp: false, order: 2, origin: { cis: null, manifestos: 3 } },
  ],
  rejected: [
    { id: 'chemtrails', theme: 'sanidad', text: '¿Qué harían con las estelas de los aviones?', reason: 'networksOnly', detail: 'Solo sale de redes abiertas: no está en el CIS ni la trata ningún programa.' },
    { id: 'toros', theme: 'cultura', text: '¿Qué harían con los toros?', reason: 'passesDisagree', detail: 'Solo la propuso una de las dos pasadas independientes.' },
  ],
};
