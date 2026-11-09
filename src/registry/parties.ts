import type { Party } from '../dataset/schema';
import { scopeByCriterion, type InclusionData } from './inclusion';

// Real party registry: metadata + the data the inclusion criterion runs on (src/registry/inclusion.ts).
// Programme URL/hash are set by the pipeline run; a registered party without one is "⏳ programa pendiente".
//
// REPRESENTATION: Congress seats of the XV legislature (elected 23-J 2023), including deputies that
// later moved to the Mixed Group (Podemos).
// CANDIDATURES: PROVISIONAL. The candidatures for 29-N are not proclaimed yet, so the provinces
// below are an estimate (where the party ran in 2023, or its home region). Replace them with the
// proclaimed lists (BOE) and set state: 'proclaimed'.
// NOT COMPLETE: parties whose only seats are in a regional parliament (criterion branch 2b) are not
// registered yet; they are added from the proclaimed candidatures.
const CONGRESS = 'Congreso, XV legislatura (elecciones del 23-J de 2023)';
const PROVISIONAL_ALL = 'Provisional: se asume candidatura en las 52 provincias hasta la proclamación (BOE)';
const provisional = (provinces: string[], where: string): InclusionData['candidatures'] => ({
  provinces,
  state: 'provisional',
  source: `Provisional: se asume candidatura solo en ${where} hasta la proclamación (BOE)`,
});
const national = (): InclusionData => ({
  representation: { congress: true, parliaments: [] },
  candidatures: { provinces: 'all', state: 'provisional', source: PROVISIONAL_ALL },
});

const CATALONIA = ['08', '17', '25', '43'];
const BASQUE_COUNTRY = ['01', '20', '48'];
const GALICIA = ['15', '27', '32', '36'];

export interface RegistryEntry {
  id: string;
  name: string;
  acronym: string;
  inclusion: InclusionData;
  /** Where the representation data comes from. */
  representationSource: string;
}

export const REGISTRY: RegistryEntry[] = [
  { id: 'pp', name: 'Partido Popular', acronym: 'PP', inclusion: national(), representationSource: CONGRESS },
  { id: 'psoe', name: 'Partido Socialista Obrero Español', acronym: 'PSOE', inclusion: national(), representationSource: CONGRESS },
  { id: 'vox', name: 'Vox', acronym: 'Vox', inclusion: national(), representationSource: CONGRESS },
  { id: 'sumar', name: 'Sumar', acronym: 'Sumar', inclusion: national(), representationSource: CONGRESS },
  { id: 'podemos', name: 'Podemos', acronym: 'Podemos', inclusion: national(), representationSource: CONGRESS },
  {
    id: 'erc', name: 'Esquerra Republicana de Catalunya', acronym: 'ERC', representationSource: CONGRESS,
    inclusion: { representation: { congress: true, parliaments: ['09'] }, candidatures: provisional(CATALONIA, 'Cataluña') },
  },
  {
    id: 'junts', name: 'Junts per Catalunya', acronym: 'Junts', representationSource: CONGRESS,
    inclusion: { representation: { congress: true, parliaments: ['09'] }, candidatures: provisional(CATALONIA, 'Cataluña') },
  },
  {
    id: 'bildu', name: 'EH Bildu', acronym: 'EH Bildu', representationSource: CONGRESS,
    inclusion: { representation: { congress: true, parliaments: ['15', '16'] }, candidatures: provisional([...BASQUE_COUNTRY, '31'], 'País Vasco y Navarra') },
  },
  {
    id: 'pnv', name: 'Partido Nacionalista Vasco', acronym: 'EAJ-PNV', representationSource: CONGRESS,
    inclusion: { representation: { congress: true, parliaments: ['16'] }, candidatures: provisional(BASQUE_COUNTRY, 'País Vasco') },
  },
  {
    id: 'bng', name: 'Bloque Nacionalista Galego', acronym: 'BNG', representationSource: CONGRESS,
    inclusion: { representation: { congress: true, parliaments: ['12'] }, candidatures: provisional(GALICIA, 'Galicia') },
  },
  {
    id: 'cc', name: 'Coalición Canaria', acronym: 'CC', representationSource: CONGRESS,
    inclusion: { representation: { congress: true, parliaments: ['05'] }, candidatures: provisional(['35', '38'], 'Canarias') },
  },
  {
    id: 'upn', name: 'Unión del Pueblo Navarro', acronym: 'UPN', representationSource: CONGRESS,
    inclusion: { representation: { congress: true, parliaments: ['15'] }, candidatures: provisional(['31'], 'Navarra') },
  },
];

/** Parties that meet the inclusion criterion somewhere, with the scope derived from it. */
export const PARTIES: Record<string, Omit<Party, 'manifesto'>> = Object.fromEntries(
  REGISTRY.flatMap((r) => {
    const scope = scopeByCriterion(r.inclusion);
    return scope ? [[r.id, { id: r.id, name: r.name, acronym: r.acronym, scope }]] : [];
  }),
);
