import type { Dataset, NotaViabilidad, Partido, Postura } from '../../src/dataset/esquema';

const publicado = (n: string) => ({
  estado: 'publicado' as const,
  url: `https://ejemplo.org/${n}.pdf`,
  titulo: 'Programa 2026',
});

const partido = (id: string, ambito: Partido['ambito'] = { tipo: 'estatal' }, programa: Partido['programa'] = publicado(id)): Partido => ({
  id,
  nombre: `Partido ${id.toUpperCase()}`,
  siglas: id.toUpperCase(),
  ambito,
  programa,
});

/** Neutral labels so card texts never contain party ids. */
const NEUTRO: Record<string, string> = { aaa: 'uno', bbb: 'dos', ccc: 'tres', isla: 'cuatro', bcn: 'cinco' };

const cita = (p: string) => ({ texto: `Cita literal del programa de ${p} sobre vivienda, con más de cuarenta caracteres.`, pagina: 7 });
const propone = (p: string, tema = 'vivienda'): Postura => ({
  partido: p,
  tema,
  estado: 'propone',
  texto: { que: `Medida número ${NEUTRO[p]}`, como: `Instrumento número ${NEUTRO[p]}`, cifra: null },
  citas: [cita(p)],
  versiones: { prompt: 'v1' },
});

export const notaEjemplo: NotaViabilidad = {
  resultado: 'sin_consenso',
  porque: null,
  fuentes: [],
  evaluaciones: [
    { nivel: 'viable', razones: { competencia: 'a', coste: 'b', legal: 'c', precedentes: 'd', mayoria: 'e' }, porque: 'Una.', fuentes: [{ titulo: 'INE', url: 'https://www.ine.es/x' }] },
    { nivel: 'dificil', razones: { competencia: 'a', coste: 'b', legal: 'c', precedentes: 'd', mayoria: 'e' }, porque: 'Otra.', fuentes: [] },
  ],
  versiones: { prompt: 'viabilidad-v1', rubrica: 'r1' },
};

/**
 * 4 national parties (one proposes nothing, one pending), 1 regional party in the Canary provinces
 * (35 Las Palmas, 38 Santa Cruz de Tenerife), 1 regional pending party in 35, 1 regional party in 08 (Barcelona).
 */
export const datasetEjemplo: Dataset = {
  version: 1,
  generado: '2026-11-08T00:00:00.000Z',
  origen: 'prueba',
  partidos: [
    partido('aaa'),
    partido('bbb'),
    partido('ccc'),
    partido('nada'),
    partido('pend', { tipo: 'estatal' }, { estado: 'pendiente' }),
    partido('isla', { tipo: 'provincias', provincias: ['35', '38'] }),
    partido('penreg', { tipo: 'provincias', provincias: ['35'] }, { estado: 'pendiente' }),
    partido('bcn', { tipo: 'provincias', provincias: ['08'] }),
  ],
  temas: [
    { id: 'vivienda', titulo: 'Vivienda y alquiler', pregunta: '¿Qué harían con la vivienda?', ambito: 'nacional', orden: 1 },
    { id: 'ref', titulo: 'Régimen fiscal canario', pregunta: '¿Qué harían con el REF?', ambito: 'canarias', orden: 2 },
  ],
  posturas: [
    { ...propone('aaa'), viabilidad: notaEjemplo } as Postura,
    propone('bbb'),
    propone('ccc'),
    { partido: 'nada', tema: 'vivienda', estado: 'no_propone', versiones: { prompt: 'v1' } },
    propone('isla'),
    propone('aaa', 'ref'),
    { partido: 'bbb', tema: 'ref', estado: 'sin_verificar', versiones: { prompt: 'v1' } },
    propone('ccc', 'ref'),
    { partido: 'nada', tema: 'ref', estado: 'no_propone', versiones: { prompt: 'v1' } },
    propone('isla', 'ref'),
    propone('bcn'),
    { partido: 'bcn', tema: 'ref', estado: 'no_propone', versiones: { prompt: 'v1' } },
  ],
  informes: [],
};
