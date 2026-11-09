// Inclusion criterion (public, decisions.md): a party counts in a province when
//   1. its candidature is proclaimed in that province, AND
//   2. it currently has seats in the Congress OR in that province's regional parliament.
// Encoded as data per party (InclusionData) + this rule, so the methodology page can publish both.
import type { Scope } from '../dataset/schema';
import { PROVINCES, provinceByCode } from './territory';

export interface InclusionData {
  representation: {
    /** Seats in the current Congress. */
    congress: boolean;
    /** Regional parliaments where it has seats now (INE autonomous-community codes, e.g. "05" Canarias). */
    parliaments: string[];
  };
  candidatures: {
    /** Provinces (INE codes) where its candidature runs; 'todas' = the 52. */
    provinces: 'all' | string[];
    /**
     * 'provisional' until the electoral boards proclaim the candidatures (published in the BOE);
     * then 'proclamada', with the BOE reference in `source`.
     */
    state: 'provisional' | 'proclaimed';
    source: string;
  };
}

export function meetsCriterion(d: InclusionData, province: string): boolean {
  const prov = provinceByCode(province);
  if (!prov) return false;
  const isShown = d.candidatures.provinces === 'all' || d.candidatures.provinces.includes(province);
  const hasSeats = d.representation.congress || d.representation.parliaments.includes(prov.regionCode);
  return isShown && hasSeats;
}

/** Provinces where the party counts, in INE order. */
export const includedProvinces = (d: InclusionData): string[] => PROVINCES.map((p) => p.code).filter((c) => meetsCriterion(d, c));

/**
 * Scope derived from the criterion: national when it counts in all 52 provinces (the only parties
 * shown with "Prefiero no decirlo"), by province otherwise, null when it counts nowhere.
 */
export function scopeByCriterion(d: InclusionData): Scope | null {
  const provinces = includedProvinces(d);
  if (provinces.length === PROVINCES.length) return { type: 'national' };
  if (provinces.length === 0) return null;
  return { type: 'provinces', provinces };
}
