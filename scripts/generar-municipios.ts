// Builds data/municipios.json from the INE's official municipality list ("Relación de municipios
// y códigos por comunidades autónomas y provincias", one row per municipality, 1 January of the year).
//   npx tsx scripts/generar-municipios.ts [--anio 26] [--xlsx fichero-ya-descargado.xlsx]
// No dependencies: the .xlsx (a zip of XML files) is read with node:zlib and a minimal parser.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { inflateRawSync } from 'node:zlib';
import { PROVINCIAS } from '../src/registro/territorio';

const { values } = parseArgs({ options: { anio: { type: 'string', default: '26' }, xlsx: { type: 'string' } } });
const url = `https://www.ine.es/daco/daco42/codmun/diccionario${values.anio}.xlsx`;
const bytes = values.xlsx
  ? new Uint8Array(await readFile(values.xlsx))
  : new Uint8Array(await (await fetch(url, { headers: { 'user-agent': '29n-generar-municipios' } })).arrayBuffer());

/** Files inside a zip, via its central directory. */
function leerZip(buf: Uint8Array): Map<string, string> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let fin = buf.length - 22;
  while (fin >= 0 && dv.getUint32(fin, true) !== 0x06054b50) fin--;
  if (fin < 0) throw new Error('No es un zip');
  const total = dv.getUint16(fin + 10, true);
  let p = dv.getUint32(fin + 16, true);
  const out = new Map<string, string>();
  for (let i = 0; i < total; i++) {
    const metodo = dv.getUint16(p + 10, true);
    const tam = dv.getUint32(p + 20, true);
    const lNombre = dv.getUint16(p + 28, true);
    const lExtra = dv.getUint16(p + 30, true);
    const lComent = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const nombre = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + lNombre));
    const ini = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const datos = buf.subarray(ini, ini + tam);
    out.set(nombre, new TextDecoder().decode(metodo === 8 ? inflateRawSync(datos) : datos));
    p += 46 + lNombre + lExtra + lComent;
  }
  return out;
}

const entidades = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
const textos = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => entidades(m[1]!)).join('');

const zip = leerZip(bytes);
const compartidas = [...(zip.get('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textos(m[1]!));
const hoja = zip.get('xl/worksheets/sheet1.xml');
if (!hoja) throw new Error('Falta la hoja 1');
const filas = [...hoja.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((fila) => {
  const celdas: Record<string, string> = {};
  for (const c of fila[1]!.matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const [, col, attrs, cuerpo = ''] = c;
    const v = /<v>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1];
    celdas[col!] = /t="s"/.test(attrs!) ? compartidas[+v!]! : /t="inlineStr"/.test(attrs!) ? textos(cuerpo) : entidades(v ?? '');
  }
  return celdas;
});

const cabecera = filas.findIndex((f) => f.B === 'CPRO' && f.E === 'NOMBRE');
if (cabecera < 0) throw new Error('No encuentro la cabecera CODAUTO/CPRO/CMUN/DC/NOMBRE');
const titulo = filas[0]?.A ?? '';
const porProvincia: Record<string, string[]> = {};
let n = 0;
for (const f of filas.slice(cabecera + 1)) {
  if (!f.B || !f.E) continue;
  const prov = PROVINCIAS.find((p) => p.codigo === f.B);
  if (!prov) throw new Error(`Provincia desconocida: ${f.B}`);
  if (prov.ccaa !== f.A) throw new Error(`${f.E}: CCAA ${f.A} no coincide con la de ${prov.nombre} (${prov.ccaa})`);
  (porProvincia[f.B] ??= []).push(f.E);
  n++;
}
for (const l of Object.values(porProvincia)) l.sort((a, b) => a.localeCompare(b, 'es'));

const salida = {
  fuente: titulo,
  url,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  total: n,
  /** INE province code → official municipality names, as the INE writes them ("Palmas de Gran Canaria, Las"). */
  municipios: Object.fromEntries(Object.entries(porProvincia).sort(([a], [b]) => a.localeCompare(b))),
};
await writeFile('data/municipios.json', JSON.stringify(salida) + '\n');
console.log(`data/municipios.json: ${n} municipios (${titulo})`);
