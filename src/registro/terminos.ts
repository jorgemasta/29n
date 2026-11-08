// Identifying terms per party (name, acronym, leaders, slogans, brand words).
// V3 checks neutral text against the terms of EVERY party, not only its author.
// TODO(#7): complete and review this list together with the party registry.
export type TerminosIdentificativos = Record<string, string[]>;

export const TERMINOS: TerminosIdentificativos = {
  psoe: ['PSOE', 'Partido Socialista', 'Partido Socialista Obrero Español', 'Pedro Sánchez'],
  pp: ['PP', 'Partido Popular', 'Alberto Núñez Feijóo', 'Feijóo', 'Contrato con España'],
  vox: ['Vox', 'Santiago Abascal', 'Abascal'],
  sumar: ['Sumar', 'Yolanda Díaz'],
  podemos: ['Podemos', 'Ione Belarra', 'Irene Montero'],
  erc: ['ERC', 'Esquerra', 'Esquerra Republicana', 'Gabriel Rufián', 'Rufián', 'Oriol Junqueras', 'Junqueras'],
  junts: ['Junts', 'Junts per Catalunya', 'Carles Puigdemont', 'Puigdemont', 'Míriam Nogueras'],
  bildu: ['EH Bildu', 'Bildu', 'Arnaldo Otegi', 'Mertxe Aizpurua'],
  pnv: ['PNV', 'EAJ-PNV', 'Partido Nacionalista Vasco', 'Aitor Esteban'],
  bng: ['BNG', 'Bloque Nacionalista Galego', 'Ana Pontón', 'Néstor Rego'],
  cc: ['Coalición Canaria', 'CC', 'Cristina Valido', 'Fernando Clavijo'],
};
