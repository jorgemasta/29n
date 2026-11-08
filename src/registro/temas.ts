import type { Tema } from '../dataset/esquema';

// The national topics, in their fixed, published order ("Siguiente" follows it): vivienda first,
// then roughly the citizens' main concerns in the CIS barometer, then the rest. The first 5 are the
// visible goal ("Tema 1 de 5"); the rest are "temas extra".
//
// Neutrality rules for `pregunta`: an open "¿Qué harían…?" question, no figures or context data
// (choosing the data already frames the question), no word that belongs to one side's vocabulary.
// `explicacion` only for topics with jargon or acronyms, in plain words.
// Canary-only topics (REF/ZEC/AIEM, migración atlántica) arrive with the province selector (#7).
export const TEMAS: Tema[] = [
  {
    id: 'vivienda',
    titulo: 'Vivienda y alquiler',
    pregunta: '¿Qué harían con el precio de la vivienda y el alquiler?',
    ambito: 'nacional',
    orden: 1,
  },
  {
    id: 'empleo',
    titulo: 'Empleo y salarios',
    pregunta: '¿Qué harían con el empleo, los salarios y la jornada de trabajo?',
    ambito: 'nacional',
    orden: 2,
  },
  {
    id: 'sanidad',
    titulo: 'Sanidad',
    pregunta: '¿Qué harían con la sanidad pública y las listas de espera?',
    ambito: 'nacional',
    orden: 3,
  },
  {
    id: 'inmigracion',
    titulo: 'Inmigración',
    pregunta: '¿Qué harían con la llegada de personas inmigrantes y con su integración?',
    ambito: 'nacional',
    orden: 4,
  },
  {
    id: 'pensiones',
    titulo: 'Pensiones',
    pregunta: '¿Qué harían con las pensiones y cómo las pagarían?',
    ambito: 'nacional',
    orden: 5,
  },
  {
    id: 'coste-vida',
    titulo: 'Precios y coste de la vida',
    pregunta: '¿Qué harían con lo que cuestan la compra, la luz y el resto de gastos del día a día?',
    ambito: 'nacional',
    orden: 6,
  },
  {
    id: 'impuestos',
    titulo: 'Impuestos',
    pregunta: '¿Qué harían con los impuestos, como el IRPF o el IVA?',
    explicacion: 'IRPF: el impuesto que se paga por lo que ganas. IVA: el que se paga al comprar.',
    ambito: 'nacional',
    orden: 7,
  },
  {
    id: 'educacion',
    titulo: 'Educación',
    pregunta: '¿Qué harían con los colegios, la FP y la universidad?',
    explicacion: 'FP: formación profesional, los estudios para aprender un oficio.',
    ambito: 'nacional',
    orden: 8,
  },
  {
    id: 'instituciones',
    titulo: 'Corrupción e instituciones',
    pregunta: '¿Qué harían para prevenir la corrupción y mejorar el funcionamiento de las instituciones?',
    ambito: 'nacional',
    orden: 9,
  },
  {
    id: 'energia-clima',
    titulo: 'Energía y cambio climático',
    pregunta: '¿Qué harían con la energía y con el cambio climático?',
    ambito: 'nacional',
    orden: 10,
  },
  {
    id: 'cuidados',
    titulo: 'Dependencia, crianza y cuidados',
    pregunta: '¿Qué harían con la atención a la dependencia, la crianza y los cuidados?',
    explicacion: 'Dependencia: la ayuda para las personas que necesitan a otra para su vida diaria.',
    ambito: 'nacional',
    orden: 11,
  },
  {
    id: 'seguridad-justicia',
    titulo: 'Seguridad y justicia',
    pregunta: '¿Qué harían con la seguridad ciudadana y con el funcionamiento de la justicia?',
    ambito: 'nacional',
    orden: 12,
  },
  {
    id: 'territorial',
    titulo: 'Comunidades autónomas y financiación',
    pregunta: '¿Cómo repartirían el poder y el dinero entre el Estado y las comunidades autónomas?',
    explicacion: 'Financiación autonómica: cómo se reparte entre el Estado y las comunidades el dinero de los impuestos.',
    ambito: 'nacional',
    orden: 13,
  },
  {
    id: 'igualdad',
    titulo: 'Igualdad y violencia contra las mujeres',
    pregunta: '¿Qué harían con la igualdad entre mujeres y hombres y con la violencia contra las mujeres?',
    ambito: 'nacional',
    orden: 14,
  },
  {
    id: 'campo-agua',
    titulo: 'Campo y agua',
    pregunta: '¿Qué harían con la agricultura, la ganadería y el agua?',
    ambito: 'nacional',
    orden: 15,
  },
  {
    id: 'transporte',
    titulo: 'Transporte',
    pregunta: '¿Qué harían con el tren, las carreteras y el transporte público?',
    ambito: 'nacional',
    orden: 16,
  },
  {
    id: 'defensa',
    titulo: 'Defensa y OTAN',
    pregunta: '¿Qué harían con el gasto en defensa y con el papel de España en la OTAN?',
    explicacion: 'OTAN: la alianza militar de Europa y Norteamérica a la que pertenece España.',
    ambito: 'nacional',
    orden: 17,
  },
  {
    id: 'europa-exterior',
    titulo: 'Europa y política exterior',
    pregunta: '¿Qué papel querrían para España en la Unión Europea y en el mundo?',
    ambito: 'nacional',
    orden: 18,
  },
];
