// Territory: provinces (INE codes), islands and the INE municipality list → province.
// The search ignores accents, case and punctuation, accepts name variants (A Coruña / La Coruña /
// Coruña, Girona / Gerona) and reads the INE's "Name, Article" and "Name1/Name2" forms.
// The municipality list (~8,100, data/municipalities.json) is passed in, so the browser can load it lazily.

export interface Province {
  /** INE province code ("35"). */
  code: string;
  /** Name shown to the voter. */
  name: string;
  /** INE autonomous-community code (CODAUTO): which regional parliament applies. */
  regionCode: string;
  /** Other names the voter may type (official, older Spanish, co-official forms). */
  variants: string[];
}

// INE codes (CPRO) and autonomous communities (CODAUTO), as in the INE municipality list.
export const PROVINCES: Province[] = [
  { code: '01', name: 'Álava', regionCode: '16', variants: ['Araba', 'Araba/Álava'] },
  { code: '02', name: 'Albacete', regionCode: '08', variants: [] },
  { code: '03', name: 'Alicante', regionCode: '10', variants: ['Alacant', 'Alicante/Alacant'] },
  { code: '04', name: 'Almería', regionCode: '01', variants: [] },
  { code: '05', name: 'Ávila', regionCode: '07', variants: [] },
  { code: '06', name: 'Badajoz', regionCode: '11', variants: [] },
  { code: '07', name: 'Illes Balears', regionCode: '04', variants: ['Baleares', 'Islas Baleares', 'Balears'] },
  { code: '08', name: 'Barcelona', regionCode: '09', variants: [] },
  { code: '09', name: 'Burgos', regionCode: '07', variants: [] },
  { code: '10', name: 'Cáceres', regionCode: '11', variants: [] },
  { code: '11', name: 'Cádiz', regionCode: '01', variants: [] },
  { code: '12', name: 'Castellón', regionCode: '10', variants: ['Castelló', 'Castellón/Castelló'] },
  { code: '13', name: 'Ciudad Real', regionCode: '08', variants: [] },
  { code: '14', name: 'Córdoba', regionCode: '01', variants: [] },
  { code: '15', name: 'A Coruña', regionCode: '12', variants: ['La Coruña', 'Coruña'] },
  { code: '16', name: 'Cuenca', regionCode: '08', variants: [] },
  { code: '17', name: 'Girona', regionCode: '09', variants: ['Gerona'] },
  { code: '18', name: 'Granada', regionCode: '01', variants: [] },
  { code: '19', name: 'Guadalajara', regionCode: '08', variants: [] },
  { code: '20', name: 'Gipuzkoa', regionCode: '16', variants: ['Guipúzcoa'] },
  { code: '21', name: 'Huelva', regionCode: '01', variants: [] },
  { code: '22', name: 'Huesca', regionCode: '02', variants: ['Uesca'] },
  { code: '23', name: 'Jaén', regionCode: '01', variants: [] },
  { code: '24', name: 'León', regionCode: '07', variants: [] },
  { code: '25', name: 'Lleida', regionCode: '09', variants: ['Lérida'] },
  { code: '26', name: 'La Rioja', regionCode: '17', variants: ['Rioja', 'Logroño'] },
  { code: '27', name: 'Lugo', regionCode: '12', variants: [] },
  { code: '28', name: 'Madrid', regionCode: '13', variants: ['Comunidad de Madrid'] },
  { code: '29', name: 'Málaga', regionCode: '01', variants: [] },
  { code: '30', name: 'Murcia', regionCode: '14', variants: ['Región de Murcia'] },
  { code: '31', name: 'Navarra', regionCode: '15', variants: ['Nafarroa', 'Comunidad Foral de Navarra'] },
  { code: '32', name: 'Ourense', regionCode: '12', variants: ['Orense'] },
  { code: '33', name: 'Asturias', regionCode: '03', variants: ['Principado de Asturias', 'Oviedo'] },
  { code: '34', name: 'Palencia', regionCode: '07', variants: [] },
  { code: '35', name: 'Las Palmas', regionCode: '05', variants: ['Palmas'] },
  { code: '36', name: 'Pontevedra', regionCode: '12', variants: [] },
  { code: '37', name: 'Salamanca', regionCode: '07', variants: [] },
  { code: '38', name: 'Santa Cruz de Tenerife', regionCode: '05', variants: ['Tenerife', 'S/C de Tenerife'] },
  { code: '39', name: 'Cantabria', regionCode: '06', variants: ['Santander'] },
  { code: '40', name: 'Segovia', regionCode: '07', variants: [] },
  { code: '41', name: 'Sevilla', regionCode: '01', variants: [] },
  { code: '42', name: 'Soria', regionCode: '07', variants: [] },
  { code: '43', name: 'Tarragona', regionCode: '09', variants: [] },
  { code: '44', name: 'Teruel', regionCode: '02', variants: [] },
  { code: '45', name: 'Toledo', regionCode: '08', variants: [] },
  { code: '46', name: 'Valencia', regionCode: '10', variants: ['València', 'Valencia/València'] },
  { code: '47', name: 'Valladolid', regionCode: '07', variants: [] },
  { code: '48', name: 'Bizkaia', regionCode: '16', variants: ['Vizcaya'] },
  { code: '49', name: 'Zamora', regionCode: '07', variants: [] },
  { code: '50', name: 'Zaragoza', regionCode: '02', variants: [] },
  { code: '51', name: 'Ceuta', regionCode: '18', variants: [] },
  { code: '52', name: 'Melilla', regionCode: '19', variants: [] },
];

/** Islands of the two island provinces (Canarias, Illes Balears). */
export const ISLANDS: { name: string; province: string; variants: string[] }[] = [
  { name: 'Gran Canaria', province: '35', variants: [] },
  { name: 'Lanzarote', province: '35', variants: [] },
  { name: 'Fuerteventura', province: '35', variants: [] },
  { name: 'La Graciosa', province: '35', variants: ['Graciosa'] },
  { name: 'Tenerife', province: '38', variants: [] },
  { name: 'La Palma', province: '38', variants: [] },
  { name: 'La Gomera', province: '38', variants: ['Gomera'] },
  { name: 'El Hierro', province: '38', variants: ['Hierro'] },
  { name: 'Mallorca', province: '07', variants: ['Majorca'] },
  { name: 'Menorca', province: '07', variants: [] },
  { name: 'Ibiza', province: '07', variants: ['Eivissa'] },
  { name: 'Formentera', province: '07', variants: [] },
];

export const PROVINCES_BY_CODE = new Map(PROVINCES.map((p) => [p.code, p]));
export const provinceByCode = (code: string): Province | undefined => PROVINCES_BY_CODE.get(code);

/** INE province code → official municipality names (data/municipalities.json). */
export interface Municipalities {
  municipalities: Record<string, string[]>;
}

export interface Place {
  type: 'province' | 'island' | 'municipality';
  /** Name as shown ("Las Palmas de Gran Canaria"). */
  name: string;
  province: string;
  /** "Telde → Las Palmas"; just the name for a province. */
  resolution: string;
}

/** Lower case, no accents, punctuation (apostrophes, hyphens, slashes) as spaces. */
export function normalizePlace(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** INE writes "Palmas de Gran Canaria, Las" and "Hospitalet de Llobregat, L'": put the article first. */
export function readableName(ineName: string): string {
  return ineName
    .split('/')
    .map((part) => {
      const m = /^(.*), (L'|[\p{L}]{1,3})$/u.exec(part.trim());
      if (!m) return part.trim();
      return m[2]!.endsWith("'") ? `${m[2]}${m[1]}` : `${m[2]} ${m[1]}`;
    })
    .join(' / ');
}

interface Input {
  place: Place;
  /** Normalised forms that match this place. */
  forms: string[];
  priority: number;
}

export interface Finder {
  /** Best matches first (at most `max`): exact name, then name start, then word start. */
  search(query: string, max?: number): Place[];
}

export function createFinder(data: Municipalities): Finder {
  const entries: Input[] = [];
  const forms = (...names: string[]) => [...new Set(names.flatMap((n) => [n, ...n.split('/')]).map(normalizePlace).filter(Boolean))];
  for (const p of PROVINCES)
    entries.push({ place: { type: 'province', name: p.name, province: p.code, resolution: p.name }, forms: forms(p.name, ...p.variants), priority: 0 });
  for (const i of ISLANDS) {
    const prov = provinceByCode(i.province)!;
    entries.push({ place: { type: 'island', name: i.name, province: i.province, resolution: `${i.name} → ${prov.name}` }, forms: forms(i.name, ...i.variants), priority: 1 });
  }
  for (const [code, names] of Object.entries(data.municipalities)) {
    const prov = provinceByCode(code);
    if (!prov) continue;
    for (const ineName of names) {
      const name = readableName(ineName);
      entries.push({
        place: { type: 'municipality', name, province: code, resolution: `${name} → ${prov.name}` },
        forms: forms(name, ineName, ...MUNICIPALITY_ALIASES[`${code}:${ineName}`] ?? []),
        priority: 2,
      });
    }
  }

  return {
    search(query, max = 8) {
      const q = normalizePlace(query);
      if (!q) return [];
      const scored: { e: Input; level: number }[] = [];
      for (const e of entries) {
        let level = Infinity;
        for (const f of e.forms) {
          if (f === q) level = Math.min(level, 0);
          else if (f.startsWith(q)) level = Math.min(level, 1);
          else if (f.includes(` ${q}`)) level = Math.min(level, 2);
        }
        if (level !== Infinity) scored.push({ e, level });
      }
      scored.sort((a, b) => a.level - b.level || a.e.priority - b.e.priority || a.e.place.name.localeCompare(b.e.place.name, 'es'));
      return scored.slice(0, max).map((x) => x.e.place);
    },
  };
}

/**
 * Common Spanish names of municipalities whose official INE name is only in the co-official language.
 * Key: "<province code>:<INE name>". Not exhaustive: the official names (and their bilingual forms) always work.
 */
const MUNICIPALITY_ALIASES: Record<string, string[]> = {
  '15:Coruña, A': ['La Coruña'],
  '32:Ourense': ['Orense'],
  '17:Girona': ['Gerona'],
  '25:Lleida': ['Lérida'],
  '07:Eivissa': ['Ibiza'],
  '07:Maó': ['Mahón'],
  '36:Sanxenxo': ['Sanjenjo'],
  '33:Gijón': ['Xixón'],
};
