// Territory: provinces (INE codes), islands and the INE municipality list → province.
// The search ignores accents, case and punctuation, accepts name variants (A Coruña / La Coruña /
// Coruña, Girona / Gerona) and reads the INE's "Name, Article" and "Name1/Name2" forms.
// The municipality list (~8,100, data/municipios.json) is passed in, so the browser can load it lazily.

export interface Provincia {
  /** INE province code ("35"). */
  codigo: string;
  /** Name shown to the voter. */
  nombre: string;
  /** INE autonomous-community code (CODAUTO): which regional parliament applies. */
  ccaa: string;
  /** Other names the voter may type (official, older Spanish, co-official forms). */
  variantes: string[];
}

// INE codes (CPRO) and autonomous communities (CODAUTO), as in the INE municipality list.
export const PROVINCIAS: Provincia[] = [
  { codigo: '01', nombre: 'Álava', ccaa: '16', variantes: ['Araba', 'Araba/Álava'] },
  { codigo: '02', nombre: 'Albacete', ccaa: '08', variantes: [] },
  { codigo: '03', nombre: 'Alicante', ccaa: '10', variantes: ['Alacant', 'Alicante/Alacant'] },
  { codigo: '04', nombre: 'Almería', ccaa: '01', variantes: [] },
  { codigo: '05', nombre: 'Ávila', ccaa: '07', variantes: [] },
  { codigo: '06', nombre: 'Badajoz', ccaa: '11', variantes: [] },
  { codigo: '07', nombre: 'Illes Balears', ccaa: '04', variantes: ['Baleares', 'Islas Baleares', 'Balears'] },
  { codigo: '08', nombre: 'Barcelona', ccaa: '09', variantes: [] },
  { codigo: '09', nombre: 'Burgos', ccaa: '07', variantes: [] },
  { codigo: '10', nombre: 'Cáceres', ccaa: '11', variantes: [] },
  { codigo: '11', nombre: 'Cádiz', ccaa: '01', variantes: [] },
  { codigo: '12', nombre: 'Castellón', ccaa: '10', variantes: ['Castelló', 'Castellón/Castelló'] },
  { codigo: '13', nombre: 'Ciudad Real', ccaa: '08', variantes: [] },
  { codigo: '14', nombre: 'Córdoba', ccaa: '01', variantes: [] },
  { codigo: '15', nombre: 'A Coruña', ccaa: '12', variantes: ['La Coruña', 'Coruña'] },
  { codigo: '16', nombre: 'Cuenca', ccaa: '08', variantes: [] },
  { codigo: '17', nombre: 'Girona', ccaa: '09', variantes: ['Gerona'] },
  { codigo: '18', nombre: 'Granada', ccaa: '01', variantes: [] },
  { codigo: '19', nombre: 'Guadalajara', ccaa: '08', variantes: [] },
  { codigo: '20', nombre: 'Gipuzkoa', ccaa: '16', variantes: ['Guipúzcoa'] },
  { codigo: '21', nombre: 'Huelva', ccaa: '01', variantes: [] },
  { codigo: '22', nombre: 'Huesca', ccaa: '02', variantes: ['Uesca'] },
  { codigo: '23', nombre: 'Jaén', ccaa: '01', variantes: [] },
  { codigo: '24', nombre: 'León', ccaa: '07', variantes: [] },
  { codigo: '25', nombre: 'Lleida', ccaa: '09', variantes: ['Lérida'] },
  { codigo: '26', nombre: 'La Rioja', ccaa: '17', variantes: ['Rioja', 'Logroño'] },
  { codigo: '27', nombre: 'Lugo', ccaa: '12', variantes: [] },
  { codigo: '28', nombre: 'Madrid', ccaa: '13', variantes: ['Comunidad de Madrid'] },
  { codigo: '29', nombre: 'Málaga', ccaa: '01', variantes: [] },
  { codigo: '30', nombre: 'Murcia', ccaa: '14', variantes: ['Región de Murcia'] },
  { codigo: '31', nombre: 'Navarra', ccaa: '15', variantes: ['Nafarroa', 'Comunidad Foral de Navarra'] },
  { codigo: '32', nombre: 'Ourense', ccaa: '12', variantes: ['Orense'] },
  { codigo: '33', nombre: 'Asturias', ccaa: '03', variantes: ['Principado de Asturias', 'Oviedo'] },
  { codigo: '34', nombre: 'Palencia', ccaa: '07', variantes: [] },
  { codigo: '35', nombre: 'Las Palmas', ccaa: '05', variantes: ['Palmas'] },
  { codigo: '36', nombre: 'Pontevedra', ccaa: '12', variantes: [] },
  { codigo: '37', nombre: 'Salamanca', ccaa: '07', variantes: [] },
  { codigo: '38', nombre: 'Santa Cruz de Tenerife', ccaa: '05', variantes: ['Tenerife', 'S/C de Tenerife'] },
  { codigo: '39', nombre: 'Cantabria', ccaa: '06', variantes: ['Santander'] },
  { codigo: '40', nombre: 'Segovia', ccaa: '07', variantes: [] },
  { codigo: '41', nombre: 'Sevilla', ccaa: '01', variantes: [] },
  { codigo: '42', nombre: 'Soria', ccaa: '07', variantes: [] },
  { codigo: '43', nombre: 'Tarragona', ccaa: '09', variantes: [] },
  { codigo: '44', nombre: 'Teruel', ccaa: '02', variantes: [] },
  { codigo: '45', nombre: 'Toledo', ccaa: '08', variantes: [] },
  { codigo: '46', nombre: 'Valencia', ccaa: '10', variantes: ['València', 'Valencia/València'] },
  { codigo: '47', nombre: 'Valladolid', ccaa: '07', variantes: [] },
  { codigo: '48', nombre: 'Bizkaia', ccaa: '16', variantes: ['Vizcaya'] },
  { codigo: '49', nombre: 'Zamora', ccaa: '07', variantes: [] },
  { codigo: '50', nombre: 'Zaragoza', ccaa: '02', variantes: [] },
  { codigo: '51', nombre: 'Ceuta', ccaa: '18', variantes: [] },
  { codigo: '52', nombre: 'Melilla', ccaa: '19', variantes: [] },
];

/** Islands of the two island provinces (Canarias, Illes Balears). */
export const ISLAS: { nombre: string; provincia: string; variantes: string[] }[] = [
  { nombre: 'Gran Canaria', provincia: '35', variantes: [] },
  { nombre: 'Lanzarote', provincia: '35', variantes: [] },
  { nombre: 'Fuerteventura', provincia: '35', variantes: [] },
  { nombre: 'La Graciosa', provincia: '35', variantes: ['Graciosa'] },
  { nombre: 'Tenerife', provincia: '38', variantes: [] },
  { nombre: 'La Palma', provincia: '38', variantes: [] },
  { nombre: 'La Gomera', provincia: '38', variantes: ['Gomera'] },
  { nombre: 'El Hierro', provincia: '38', variantes: ['Hierro'] },
  { nombre: 'Mallorca', provincia: '07', variantes: ['Majorca'] },
  { nombre: 'Menorca', provincia: '07', variantes: [] },
  { nombre: 'Ibiza', provincia: '07', variantes: ['Eivissa'] },
  { nombre: 'Formentera', provincia: '07', variantes: [] },
];

export const PROVINCIAS_POR_CODIGO = new Map(PROVINCIAS.map((p) => [p.codigo, p]));
export const provinciaPorCodigo = (codigo: string): Provincia | undefined => PROVINCIAS_POR_CODIGO.get(codigo);

/** INE province code → official municipality names (data/municipios.json). */
export interface Municipios {
  municipios: Record<string, string[]>;
}

export interface Lugar {
  tipo: 'provincia' | 'isla' | 'municipio';
  /** Name as shown ("Las Palmas de Gran Canaria"). */
  nombre: string;
  provincia: string;
  /** "Telde → Las Palmas"; just the name for a province. */
  resolucion: string;
}

/** Lower case, no accents, punctuation (apostrophes, hyphens, slashes) as spaces. */
export function normalizarLugar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** INE writes "Palmas de Gran Canaria, Las" and "Hospitalet de Llobregat, L'": put the article first. */
export function nombreLegible(ine: string): string {
  return ine
    .split('/')
    .map((parte) => {
      const m = /^(.*), (L'|[\p{L}]{1,3})$/u.exec(parte.trim());
      if (!m) return parte.trim();
      return m[2]!.endsWith("'") ? `${m[2]}${m[1]}` : `${m[2]} ${m[1]}`;
    })
    .join(' / ');
}

interface Entrada {
  lugar: Lugar;
  /** Normalised forms that match this place. */
  formas: string[];
  prioridad: number;
}

export interface Buscador {
  /** Best matches first (at most `max`): exact name, then name start, then word start. */
  buscar(consulta: string, max?: number): Lugar[];
}

export function crearBuscador(datos: Municipios): Buscador {
  const entradas: Entrada[] = [];
  const formas = (...nombres: string[]) => [...new Set(nombres.flatMap((n) => [n, ...n.split('/')]).map(normalizarLugar).filter(Boolean))];
  for (const p of PROVINCIAS)
    entradas.push({ lugar: { tipo: 'provincia', nombre: p.nombre, provincia: p.codigo, resolucion: p.nombre }, formas: formas(p.nombre, ...p.variantes), prioridad: 0 });
  for (const i of ISLAS) {
    const prov = provinciaPorCodigo(i.provincia)!;
    entradas.push({ lugar: { tipo: 'isla', nombre: i.nombre, provincia: i.provincia, resolucion: `${i.nombre} → ${prov.nombre}` }, formas: formas(i.nombre, ...i.variantes), prioridad: 1 });
  }
  for (const [codigo, nombres] of Object.entries(datos.municipios)) {
    const prov = provinciaPorCodigo(codigo);
    if (!prov) continue;
    for (const ine of nombres) {
      const nombre = nombreLegible(ine);
      entradas.push({
        lugar: { tipo: 'municipio', nombre, provincia: codigo, resolucion: `${nombre} → ${prov.nombre}` },
        formas: formas(nombre, ine, ...ALIAS_MUNICIPIOS[`${codigo}:${ine}`] ?? []),
        prioridad: 2,
      });
    }
  }

  return {
    buscar(consulta, max = 8) {
      const q = normalizarLugar(consulta);
      if (!q) return [];
      const puntuadas: { e: Entrada; nivel: number }[] = [];
      for (const e of entradas) {
        let nivel = Infinity;
        for (const f of e.formas) {
          if (f === q) nivel = Math.min(nivel, 0);
          else if (f.startsWith(q)) nivel = Math.min(nivel, 1);
          else if (f.includes(` ${q}`)) nivel = Math.min(nivel, 2);
        }
        if (nivel !== Infinity) puntuadas.push({ e, nivel });
      }
      puntuadas.sort((a, b) => a.nivel - b.nivel || a.e.prioridad - b.e.prioridad || a.e.lugar.nombre.localeCompare(b.e.lugar.nombre, 'es'));
      return puntuadas.slice(0, max).map((x) => x.e.lugar);
    },
  };
}

/**
 * Common Spanish names of municipalities whose official INE name is only in the co-official language.
 * Key: "<province code>:<INE name>". Not exhaustive: the official names (and their bilingual forms) always work.
 */
const ALIAS_MUNICIPIOS: Record<string, string[]> = {
  '15:Coruña, A': ['La Coruña'],
  '32:Ourense': ['Orense'],
  '17:Girona': ['Gerona'],
  '25:Lleida': ['Lérida'],
  '07:Eivissa': ['Ibiza'],
  '07:Maó': ['Mahón'],
  '36:Sanxenxo': ['Sanjenjo'],
  '33:Gijón': ['Xixón'],
};
