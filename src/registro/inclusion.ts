// Inclusion criterion (public, decisions.md): a party counts in a province when
//   1. its candidature is proclaimed in that province, AND
//   2. it currently has seats in the Congress OR in that province's regional parliament.
// Encoded as data per party (DatosInclusion) + this rule, so the methodology page can publish both.
import type { Ambito } from '../dataset/esquema';
import { PROVINCIAS, provinciaPorCodigo } from './territorio';

export interface DatosInclusion {
  representacion: {
    /** Seats in the current Congress. */
    congreso: boolean;
    /** Regional parliaments where it has seats now (INE autonomous-community codes, e.g. "05" Canarias). */
    parlamentos: string[];
  };
  candidaturas: {
    /** Provinces (INE codes) where its candidature runs; 'todas' = the 52. */
    provincias: 'todas' | string[];
    /**
     * 'provisional' until the electoral boards proclaim the candidatures (published in the BOE);
     * then 'proclamada', with the BOE reference in `fuente`.
     */
    estado: 'provisional' | 'proclamada';
    fuente: string;
  };
}

export function cumpleCriterio(d: DatosInclusion, provincia: string): boolean {
  const prov = provinciaPorCodigo(provincia);
  if (!prov) return false;
  const seMuestra = d.candidaturas.provincias === 'todas' || d.candidaturas.provincias.includes(provincia);
  const tieneEscanos = d.representacion.congreso || d.representacion.parlamentos.includes(prov.ccaa);
  return seMuestra && tieneEscanos;
}

/** Provinces where the party counts, in INE order. */
export const provinciasIncluidas = (d: DatosInclusion): string[] => PROVINCIAS.map((p) => p.codigo).filter((c) => cumpleCriterio(d, c));

/**
 * Scope derived from the criterion: national when it counts in all 52 provinces (the only parties
 * shown with "Prefiero no decirlo"), by province otherwise, null when it counts nowhere.
 */
export function ambitoSegunCriterio(d: DatosInclusion): Ambito | null {
  const provincias = provinciasIncluidas(d);
  if (provincias.length === PROVINCIAS.length) return { tipo: 'estatal' };
  if (provincias.length === 0) return null;
  return { tipo: 'provincias', provincias };
}
