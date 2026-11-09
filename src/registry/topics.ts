import type { Topic } from '../dataset/schema';

// The national topics, in their fixed, published order ("Siguiente" follows it): vivienda first,
// then roughly the citizens' main concerns in the CIS barometer, then the rest. The first 5 are the
// visible goal ("Tema 1 de 5"); the rest are "temas extra".
//
// Neutrality rules for `question`: an open "¿Qué harían…?" question, no figures or context data
// (choosing the data already frames the question), no word that belongs to one side's vocabulary.
// `explanation` only for topics with jargon or acronyms, in plain words.
// Canary-only topics (scope 'canarias') come last and are only shown in provinces 35 and 38.
export const TOPICS: Topic[] = [
  {
    id: 'vivienda',
    title: 'Vivienda y alquiler',
    question: '¿Qué harían con el precio de la vivienda y el alquiler?',
    scope: 'national',
    order: 1,
  },
  {
    id: 'empleo',
    title: 'Empleo y salarios',
    question: '¿Qué harían con el empleo, los salarios y la jornada de trabajo?',
    scope: 'national',
    order: 2,
  },
  {
    id: 'sanidad',
    title: 'Sanidad',
    question: '¿Qué harían con la sanidad pública y las listas de espera?',
    scope: 'national',
    order: 3,
  },
  {
    id: 'inmigracion',
    title: 'Inmigración',
    question: '¿Qué harían con la llegada de personas inmigrantes y con su integración?',
    scope: 'national',
    order: 4,
  },
  {
    id: 'pensiones',
    title: 'Pensiones',
    question: '¿Qué harían con las pensiones y cómo las pagarían?',
    scope: 'national',
    order: 5,
  },
  {
    id: 'coste-vida',
    title: 'Precios y coste de la vida',
    question: '¿Qué harían con lo que cuestan la compra, la luz y el resto de gastos del día a día?',
    scope: 'national',
    order: 6,
  },
  {
    id: 'impuestos',
    title: 'Impuestos',
    question: '¿Qué harían con los impuestos, como el IRPF o el IVA?',
    explanation: 'IRPF: el impuesto que se paga por lo que ganas. IVA: el que se paga al comprar.',
    scope: 'national',
    order: 7,
  },
  {
    id: 'educacion',
    title: 'Educación',
    question: '¿Qué harían con los colegios, la FP y la universidad?',
    explanation: 'FP: formación profesional, los estudios para aprender un oficio.',
    scope: 'national',
    order: 8,
  },
  {
    id: 'instituciones',
    title: 'Corrupción e instituciones',
    question: '¿Qué harían para prevenir la corrupción y mejorar el funcionamiento de las instituciones?',
    scope: 'national',
    order: 9,
  },
  {
    id: 'energia-clima',
    title: 'Energía y cambio climático',
    question: '¿Qué harían con la energía y con el cambio climático?',
    scope: 'national',
    order: 10,
  },
  {
    id: 'cuidados',
    title: 'Dependencia, crianza y cuidados',
    question: '¿Qué harían con la atención a la dependencia, la crianza y los cuidados?',
    explanation: 'Dependencia: la ayuda para las personas que necesitan a otra para su vida diaria.',
    scope: 'national',
    order: 11,
  },
  {
    id: 'seguridad-justicia',
    title: 'Seguridad y justicia',
    question: '¿Qué harían con la seguridad ciudadana y con el funcionamiento de la justicia?',
    scope: 'national',
    order: 12,
  },
  {
    id: 'territorial',
    title: 'Comunidades autónomas y financiación',
    question: '¿Cómo repartirían el poder y el dinero entre el Estado y las comunidades autónomas?',
    explanation: 'Financiación autonómica: cómo se reparte entre el Estado y las comunidades el dinero de los impuestos.',
    scope: 'national',
    order: 13,
  },
  {
    id: 'igualdad',
    title: 'Igualdad y violencia contra las mujeres',
    question: '¿Qué harían con la igualdad entre mujeres y hombres y con la violencia contra las mujeres?',
    scope: 'national',
    order: 14,
  },
  {
    id: 'campo-agua',
    title: 'Campo y agua',
    question: '¿Qué harían con la agricultura, la ganadería y el agua?',
    scope: 'national',
    order: 15,
  },
  {
    id: 'transporte',
    title: 'Transporte',
    question: '¿Qué harían con el tren, las carreteras y el transporte público?',
    scope: 'national',
    order: 16,
  },
  {
    id: 'defensa',
    title: 'Defensa y OTAN',
    question: '¿Qué harían con el gasto en defensa y con el papel de España en la OTAN?',
    explanation: 'OTAN: la alianza militar de Europa y Norteamérica a la que pertenece España.',
    scope: 'national',
    order: 17,
  },
  {
    id: 'europa-exterior',
    title: 'Europa y política exterior',
    question: '¿Qué papel querrían para España en la Unión Europea y en el mundo?',
    scope: 'national',
    order: 18,
  },
  {
    id: 'ref-canarias',
    title: 'Régimen fiscal canario (REF, ZEC y AIEM)',
    question: '¿Qué harían con las reglas fiscales y económicas especiales de Canarias?',
    explanation:
      'REF, ZEC y AIEM: las reglas fiscales especiales de Canarias. REF: el régimen económico y fiscal propio de las islas. ZEC: una zona con menos impuestos para empresas que se instalan allí. AIEM: un impuesto canario a algunos productos que llegan de fuera.',
    scope: 'canarias',
    order: 19,
  },
  {
    id: 'migracion-atlantica',
    title: 'Migración atlántica',
    question: '¿Qué harían con la llegada de personas migrantes por mar a Canarias?',
    scope: 'canarias',
    order: 20,
  },
];
