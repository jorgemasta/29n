// FICTIONAL pulse inputs for `npm run pulse -- --dry-run`: example sources (not a real CIS
// barometer) for the fictional parties of the simulated dataset, and the canned answer the fake AI
// gives in both passes. They only exercise the path at no cost; nothing here is published.
import type { PulseOptions, PulseResponse, PulseSources } from '../src/pulse';

export const EXAMPLE_SOURCES: PulseSources = {
  cis: {
    barometer: 'Barómetro de ejemplo (ficticio)',
    url: 'https://www.cis.es/',
    items: [
      { id: 'vivienda', label: 'La vivienda', percent: 30 },
      { id: 'sanidad', label: 'La sanidad', percent: 15 },
    ],
  },
  manifestos: [
    { party: 'prueba-a', topics: ['alquiler', 'compra de vivienda', 'atención primaria', 'salud mental'] },
    { party: 'prueba-b', topics: ['alquiler', 'compra de vivienda', 'atención primaria', 'salud mental'] },
    { party: 'prueba-c', topics: ['alquiler', 'vivienda vacía', 'atención primaria', 'salud mental'] },
    { party: 'prueba-e', topics: ['conectividad entre islas', 'agua', 'alquiler'] },
  ],
  networks: [
    { id: 'reddit-ocupacion', source: 'reddit', label: 'Ocupación de viviendas', url: 'https://www.reddit.com/r/spain/' },
    { id: 'trends-alquiler', source: 'google-trends', label: 'precio alquiler' },
  ],
};

export const EXAMPLE_PARTIES: PulseOptions['parties'] = [
  { id: 'prueba-a', scope: { type: 'national' } },
  { id: 'prueba-b', scope: { type: 'national' } },
  { id: 'prueba-c', scope: { type: 'national' } },
  { id: 'prueba-e', scope: { type: 'provinces', provinces: ['35', '38'] } },
];

const NATIONAL = ['prueba-a', 'prueba-b', 'prueba-c'];
const backedBy = (topic: string, parties = NATIONAL) => parties.map((party) => ({ party, topic }));

export const EXAMPLE_RESPONSE: PulseResponse = {
  themes: [
    {
      id: 'vivienda',
      title: 'Vivienda',
      region: null,
      questions: [
        { id: 'precio-alquiler', text: '¿Qué harían con el precio del alquiler?', followUp: false, cis: 'vivienda', manifestos: backedBy('alquiler'), networks: ['trends-alquiler'] },
        { id: 'primera-vivienda', text: '¿Qué harían para que la gente pueda comprar su primera vivienda?', followUp: false, cis: 'vivienda', manifestos: backedBy('compra de vivienda', ['prueba-a', 'prueba-b']), networks: [] },
        { id: 'vivienda-publica', text: '¿Qué harían con la vivienda pública?', followUp: false, cis: 'vivienda', manifestos: [], networks: [] },
        { id: 'vivienda-vacia', text: '¿Qué harían con las viviendas vacías?', followUp: true, cis: 'vivienda', manifestos: backedBy('vivienda vacía', ['prueba-c']), networks: [] },
        { id: 'pisos-turisticos', text: '¿Qué harían con los pisos turísticos?', followUp: true, cis: 'vivienda', manifestos: [], networks: [] },
        // Only networks point to it: the pulse rejects it (networksOnly).
        { id: 'ocupacion', text: '¿Qué harían con la ocupación de viviendas?', followUp: true, cis: null, manifestos: [], networks: ['reddit-ocupacion'] },
      ],
    },
    {
      id: 'sanidad',
      title: 'Sanidad',
      region: null,
      questions: [
        { id: 'listas-espera', text: '¿Qué harían con las listas de espera?', followUp: false, cis: 'sanidad', manifestos: [], networks: [] },
        { id: 'atencion-primaria', text: '¿Qué harían con la atención primaria?', followUp: false, cis: 'sanidad', manifestos: backedBy('atención primaria'), networks: [] },
        { id: 'salud-mental', text: '¿Qué harían con la salud mental?', followUp: false, cis: null, manifestos: backedBy('salud mental'), networks: [] },
        { id: 'dentista', text: '¿Qué harían con la atención dental?', followUp: true, cis: 'sanidad', manifestos: [], networks: [] },
        { id: 'medicamentos', text: '¿Qué harían con el precio de los medicamentos?', followUp: true, cis: 'sanidad', manifestos: [], networks: [] },
      ],
    },
    {
      id: 'canarias',
      title: 'Tu comunidad',
      region: '05',
      questions: [
        { id: 'conectividad-islas', text: '¿Qué harían con los viajes entre islas?', followUp: false, cis: null, manifestos: backedBy('conectividad entre islas', ['prueba-e']), networks: [] },
        { id: 'agua-canarias', text: '¿Qué harían con el agua en las islas?', followUp: false, cis: 'vivienda', manifestos: [], networks: [] },
        { id: 'alquiler-canarias', text: '¿Qué harían con el alquiler en las islas?', followUp: false, cis: 'vivienda', manifestos: backedBy('alquiler', ['prueba-e']), networks: [] },
      ],
    },
  ],
};
