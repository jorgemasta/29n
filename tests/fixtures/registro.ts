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
  texto: { que: 'Bajar el IVA de la vivienda nueva.', como: 'Con una rebaja fiscal temporal para compradores.', cifra: null },
  citas: [{ texto: 'Rebajaremos el IVA de la vivienda nueva para los compradores de primera vivienda.', pagina: 4 }],
};

export const terceroPartido: Partido = { ...partidoOtro, id: 'ter', nombre: 'Tercer Partido', siglas: 'TER' };
export const posturaTercero: Postura = {
  ...posturaOtro,
  partido: 'ter',
  texto: { que: 'Crear un seguro público de impago.', como: 'Avalando a los propietarios que alquilen a jóvenes.', cifra: null },
};
