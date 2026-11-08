import type { Dataset, Partido, Postura, Tema, TipoFuente } from '../../src/dataset/esquema';

const partido = (id: string, fuente?: TipoFuente): Partido => ({
  id,
  nombre: `Partido ${id}`,
  siglas: id.toUpperCase(),
  ambito: { tipo: 'estatal' },
  programa: { estado: 'publicado', url: `https://ejemplo.org/${id}.pdf`, titulo: `Documento de ${id}`, ...(fuente ? { fuente } : {}) },
});

const titulos: [string, string][] = [
  ['vivienda', 'Vivienda y alquiler'],
  ['empleo', 'Empleo y salarios'],
  ['sanidad', 'Sanidad'],
  ['pensiones', 'Pensiones'],
  ['impuestos', 'Impuestos'],
  ['transporte', 'Transporte'],
  ['defensa', 'Defensa y OTAN'],
];
const temas: Tema[] = titulos.map(([id, titulo], i) => ({ id, titulo, pregunta: `¿Qué harían con ${titulo.toLowerCase()}?`, ambito: 'nacional', orden: i + 1 }));

const NEUTRO: Record<string, string> = { uno: 'uno', dos: 'dos', viejo: 'tres', dichos: 'cuatro' };
const propone = (partido: string, tema: string): Postura => ({
  partido,
  tema,
  estado: 'propone',
  texto: { que: `Medida ${NEUTRO[partido]} sobre ${tema}`, como: `Instrumento ${NEUTRO[partido]}`, cifra: null },
  citas: [{ texto: `Cita literal del documento de ${partido} sobre ${tema}, con más de cuarenta caracteres.`, pagina: 3 }],
  versiones: { prompt: 'v1' },
});

/**
 * 7 national topics; 'uno' (no explicit source: official programme) and 'dos' (official 29N
 * programme) are public sources, 'viejo' (2023 programme) and 'dichos' (public statements)
 * are provisional, private-prototype-only sources.
 */
export const datasetTemas: Dataset = {
  version: 1,
  generado: '2026-11-08T00:00:00.000Z',
  origen: 'prueba',
  partidos: [partido('uno'), partido('dos', 'programa-29n'), partido('viejo', 'programa-2023'), partido('dichos', 'declaraciones')],
  temas,
  posturas: temas.flatMap((t) => ['uno', 'dos', 'viejo', 'dichos'].map((p) => propone(p, t.id))),
  informes: [],
};
