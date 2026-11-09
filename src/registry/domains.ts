// V7: official domains each party's programme PDF may come from (subdomains included).
// One entry per registered party (src/registry/parties.ts). Root domains; subdomains are accepted.
export type OfficialDomains = Record<string, string[]>;

export const OFFICIAL_DOMAINS: OfficialDomains = {
  pp: ['pp.es'],
  psoe: ['psoe.es'],
  vox: ['voxespana.es'],
  sumar: ['movimientosumar.es'],
  podemos: ['podemos.info'],
  erc: ['esquerra.cat'],
  junts: ['junts.cat'],
  bildu: ['ehbildu.eus'],
  pnv: ['eaj-pnv.eus'],
  bng: ['bng.gal'],
  cc: ['coalicioncanaria.org'],
  upn: ['upn.org'],
};
