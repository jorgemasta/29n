import type { Tema } from '../dataset/esquema';

// Fixed, published topic order: vivienda first. More topics arrive in #6.
export const TEMAS: Tema[] = [
  {
    id: 'vivienda',
    titulo: 'Vivienda y alquiler',
    pregunta: '¿Qué harían con el precio de la vivienda y el alquiler?',
    ambito: 'nacional',
    orden: 1,
  },
];
