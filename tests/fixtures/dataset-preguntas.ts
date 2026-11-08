import type { Dataset, RespuestaPregunta } from '../../src/dataset/esquema';
import { datasetEjemplo } from './dataset-ejemplo';

const responde = (partido: string, pregunta: string, n: string): RespuestaPregunta => ({
  partido,
  pregunta,
  estado: 'responde',
  texto: { que: `Respuesta número ${n}`, como: `Detalle número ${n}`, cifra: null },
  citas: [{ texto: `Cita literal del programa de ${partido} sobre la pregunta, con más de cuarenta caracteres.`, pagina: 3 }],
  versiones: { prompt: 'v1' },
});
const otra = (partido: string, pregunta: string, estado: 'no_menciona' | 'sin_verificar'): RespuestaPregunta => ({
  partido, pregunta, estado, versiones: { prompt: 'v1' },
});

/**
 * datasetEjemplo plus two suggested questions: "luz" (aaa, ccc, isla, bcn answer; bbb does not
 * mention it; nada could not be verified) and "mili" (nobody mentions it).
 */
export const datasetPreguntas: Dataset = {
  ...datasetEjemplo,
  preguntas: [
    { id: 'mili', texto: '¿Qué dicen sobre el servicio militar?', palabrasClave: ['servicio militar'], orden: 2 },
    { id: 'luz', texto: '¿Quién propone bajar el IVA de la luz?', palabrasClave: ['IVA', 'luz'], orden: 1 },
  ],
  respuestas: [
    responde('aaa', 'luz', 'uno'),
    otra('bbb', 'luz', 'no_menciona'),
    responde('ccc', 'luz', 'tres'),
    otra('nada', 'luz', 'sin_verificar'),
    responde('isla', 'luz', 'cuatro'),
    responde('bcn', 'luz', 'cinco'),
    ...['aaa', 'bbb', 'ccc', 'nada', 'isla', 'bcn'].map((p) => otra(p, 'mili', 'no_menciona')),
  ],
};
