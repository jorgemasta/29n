import type { Partido } from '../dataset/esquema';
import { ambitoSegunCriterio, type DatosInclusion } from './inclusion';

// Real party registry: metadata + the data the inclusion criterion runs on (src/registro/inclusion.ts).
// Programme URL/hash are set by the pipeline run; a registered party without one is "⏳ programa pendiente".
//
// REPRESENTATION: Congress seats of the XV legislature (elected 23-J 2023), including deputies that
// later moved to the Mixed Group (Podemos).
// CANDIDATURES: PROVISIONAL. The candidatures for 29-N are not proclaimed yet, so the provinces
// below are an estimate (where the party ran in 2023, or its home region). Replace them with the
// proclaimed lists (BOE) and set estado: 'proclamada'.
// NOT COMPLETE: parties whose only seats are in a regional parliament (criterion branch 2b) are not
// registered yet; they are added from the proclaimed candidatures.
const CONGRESO = 'Congreso, XV legislatura (elecciones del 23-J de 2023)';
const PROVISIONAL_TODAS = 'Provisional: se asume candidatura en las 52 provincias hasta la proclamación (BOE)';
const provisional = (provincias: string[], donde: string): DatosInclusion['candidaturas'] => ({
  provincias,
  estado: 'provisional',
  fuente: `Provisional: se asume candidatura solo en ${donde} hasta la proclamación (BOE)`,
});
const estatal = (): DatosInclusion => ({
  representacion: { congreso: true, parlamentos: [] },
  candidaturas: { provincias: 'todas', estado: 'provisional', fuente: PROVISIONAL_TODAS },
});

const CATALUNA = ['08', '17', '25', '43'];
const PAIS_VASCO = ['01', '20', '48'];
const GALICIA = ['15', '27', '32', '36'];

export interface EntradaRegistro {
  id: string;
  nombre: string;
  siglas: string;
  inclusion: DatosInclusion;
  /** Where the representation data comes from. */
  representacionFuente: string;
}

export const REGISTRO: EntradaRegistro[] = [
  { id: 'pp', nombre: 'Partido Popular', siglas: 'PP', inclusion: estatal(), representacionFuente: CONGRESO },
  { id: 'psoe', nombre: 'Partido Socialista Obrero Español', siglas: 'PSOE', inclusion: estatal(), representacionFuente: CONGRESO },
  { id: 'vox', nombre: 'Vox', siglas: 'Vox', inclusion: estatal(), representacionFuente: CONGRESO },
  { id: 'sumar', nombre: 'Sumar', siglas: 'Sumar', inclusion: estatal(), representacionFuente: CONGRESO },
  { id: 'podemos', nombre: 'Podemos', siglas: 'Podemos', inclusion: estatal(), representacionFuente: CONGRESO },
  {
    id: 'erc', nombre: 'Esquerra Republicana de Catalunya', siglas: 'ERC', representacionFuente: CONGRESO,
    inclusion: { representacion: { congreso: true, parlamentos: ['09'] }, candidaturas: provisional(CATALUNA, 'Cataluña') },
  },
  {
    id: 'junts', nombre: 'Junts per Catalunya', siglas: 'Junts', representacionFuente: CONGRESO,
    inclusion: { representacion: { congreso: true, parlamentos: ['09'] }, candidaturas: provisional(CATALUNA, 'Cataluña') },
  },
  {
    id: 'bildu', nombre: 'EH Bildu', siglas: 'EH Bildu', representacionFuente: CONGRESO,
    inclusion: { representacion: { congreso: true, parlamentos: ['15', '16'] }, candidaturas: provisional([...PAIS_VASCO, '31'], 'País Vasco y Navarra') },
  },
  {
    id: 'pnv', nombre: 'Partido Nacionalista Vasco', siglas: 'EAJ-PNV', representacionFuente: CONGRESO,
    inclusion: { representacion: { congreso: true, parlamentos: ['16'] }, candidaturas: provisional(PAIS_VASCO, 'País Vasco') },
  },
  {
    id: 'bng', nombre: 'Bloque Nacionalista Galego', siglas: 'BNG', representacionFuente: CONGRESO,
    inclusion: { representacion: { congreso: true, parlamentos: ['12'] }, candidaturas: provisional(GALICIA, 'Galicia') },
  },
  {
    id: 'cc', nombre: 'Coalición Canaria', siglas: 'CC', representacionFuente: CONGRESO,
    inclusion: { representacion: { congreso: true, parlamentos: ['05'] }, candidaturas: provisional(['35', '38'], 'Canarias') },
  },
  {
    id: 'upn', nombre: 'Unión del Pueblo Navarro', siglas: 'UPN', representacionFuente: CONGRESO,
    inclusion: { representacion: { congreso: true, parlamentos: ['15'] }, candidaturas: provisional(['31'], 'Navarra') },
  },
];

/** Parties that meet the inclusion criterion somewhere, with the scope derived from it. */
export const PARTIDOS: Record<string, Omit<Partido, 'programa'>> = Object.fromEntries(
  REGISTRO.flatMap((r) => {
    const ambito = ambitoSegunCriterio(r.inclusion);
    return ambito ? [[r.id, { id: r.id, nombre: r.nombre, siglas: r.siglas, ambito }]] : [];
  }),
);
