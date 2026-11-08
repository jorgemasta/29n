import type { Partido } from '../dataset/esquema';

// Real party registry (metadata only; programme URL/hash are set by the pipeline run).
// TODO(#7): inclusion criterion, all parties, provinces.
export const PARTIDOS: Record<string, Omit<Partido, 'programa'>> = {
  erc: {
    id: 'erc',
    nombre: 'Esquerra Republicana de Catalunya',
    siglas: 'ERC',
    // Barcelona, Girona, Lleida, Tarragona
    ambito: { tipo: 'provincias', provincias: ['08', '17', '25', '43'] },
  },
  // Source for #6: its 'Contrato con España' (process with --fuente programa-29n if it is its 29N
  // programme, or --fuente documento-partido if it is a party document: private prototype only).
  pp: {
    id: 'pp',
    nombre: 'Partido Popular',
    siglas: 'PP',
    ambito: { tipo: 'estatal' },
  },
};
