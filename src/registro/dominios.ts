// V7: official domains each party's programme PDF may come from (subdomains included).
// One entry per registered party (src/registro/partidos.ts). Root domains; subdomains are accepted.
export type DominiosOficiales = Record<string, string[]>;

export const DOMINIOS_OFICIALES: DominiosOficiales = {
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
