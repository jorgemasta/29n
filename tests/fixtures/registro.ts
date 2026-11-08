import type { Partido, Tema } from '../../src/dataset/esquema';
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
