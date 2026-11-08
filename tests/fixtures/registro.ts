import type { Partido, Postura, Tema } from '../../src/dataset/esquema';
import type { TerminosIdentificativos } from '../../src/registro/terminos';

/** Fictional parties: tests never depend on the real registry. */
export const partidoEjemplo: Partido = {
  id: 'pej',
  nombre: 'Partido Ejemplo',
  siglas: 'PEJ',
  ambito: { tipo: 'estatal' },
  programa: {
    estado: 'publicado',
    url: 'https://ejemplo.org/programa.pdf',
    titulo: 'Programa 2026',
  },
};

export const temaVivienda: Tema = {
  id: 'vivienda',
  titulo: 'Vivienda y alquiler',
  pregunta: '¿Qué harían con el precio de la vivienda y el alquiler?',
  ambito: 'nacional',
  orden: 1,
};

export const terminosDePrueba: TerminosIdentificativos = {
  pej: ['Partido Ejemplo', 'PEJ', 'Ana Líder'],
  otro: ['Otro Partido', 'OTP', 'Bruno Jefe', 'Avanzamos Juntos'],
};

/** Another fictional party already published, so V11 has posturas to mix with. */
export const partidoOtro: Partido = {
  id: 'otp',
  nombre: 'Otro Partido',
  siglas: 'OTP',
  ambito: { tipo: 'estatal' },
  programa: { estado: 'publicado', url: 'https://ejemplo.org/otro.pdf', titulo: 'Programa 2026' },
};

export const posturaOtro: Postura = {
  partido: 'otp',
  tema: 'vivienda',
  estado: 'propone',
  versiones: { prompt: 'v1' },
  // 28 words: inside V5's range around the other test texts.
  texto: {
    que: 'Bajar el IVA de la vivienda nueva para quienes compran su primera casa en cualquier parte del país.',
    como: 'Con una rebaja fiscal temporal para los compradores, revisada cada año según la evolución de los precios.',
    cifra: null,
  },
  citas: [{ texto: 'Rebajaremos el IVA de la vivienda nueva para los compradores de primera vivienda.', pagina: 4 }],
};

export const terceroPartido: Partido = { ...partidoOtro, id: 'ter', nombre: 'Tercer Partido', siglas: 'TER' };
export const posturaTercero: Postura = {
  ...posturaOtro,
  partido: 'ter',
  texto: {
    que: 'Crear un seguro público que cubra el impago del alquiler a los propietarios que alquilen a jóvenes.',
    como: 'El Estado avalaría esos contratos durante los primeros años, para que alquilar a jóvenes sea más seguro.',
    cifra: null,
  },
};

/** Official domains of the fictional parties (V7). */
export const dominiosDePrueba: Record<string, string[]> = {
  pej: ['ejemplo.org'],
  otro: ['otro-partido.es'],
};
