// Builds data/municipalities.json from the INE's official municipality list ("Relación de municipios
// y códigos por comunidades autónomas y provincias", one row per municipality, 1 January of the year).
//   npx tsx scripts/generate-municipalities.ts [--year 26] [--xlsx fichero-ya-descargado.xlsx]
// No dependencies: the .xlsx (a zip of XML files) is read with node:zlib and a minimal parser.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { inflateRawSync } from 'node:zlib';
import { PROVINCES } from '../src/registry/territory';

const { values } = parseArgs({ options: { year: { type: 'string', default: '26' }, xlsx: { type: 'string' } } });
const url = `https://www.ine.es/daco/daco42/codmun/diccionario${values.year}.xlsx`;
const bytes = values.xlsx
  ? new Uint8Array(await readFile(values.xlsx))
  : new Uint8Array(await (await fetch(url, { headers: { 'user-agent': '29n-generate-municipalities' } })).arrayBuffer());

/** Files inside a zip, via its central directory. */
function readZip(buf: Uint8Array): Map<string, string> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let end = buf.length - 22;
  while (end >= 0 && dv.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error('No es un zip');
  const total = dv.getUint16(end + 10, true);
  let p = dv.getUint32(end + 16, true);
  const out = new Map<string, string>();
  for (let i = 0; i < total; i++) {
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const lName = dv.getUint16(p + 28, true);
    const lExtra = dv.getUint16(p + 30, true);
    const lComment = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + lName));
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const data = buf.subarray(start, start + size);
    out.set(name, new TextDecoder().decode(method === 8 ? inflateRawSync(data) : data));
    p += 46 + lName + lExtra + lComment;
  }
  return out;
}

const entities = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => entities(m[1]!)).join('');

const zip = readZip(bytes);
const sharedStrings = [...(zip.get('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]!));
const sheet = zip.get('xl/worksheets/sheet1.xml');
if (!sheet) throw new Error('Falta la hoja 1');
const rows = [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((row) => {
  const cells: Record<string, string> = {};
  for (const c of row[1]!.matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const [, col, attrs, body = ''] = c;
    const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
    cells[col!] = /t="s"/.test(attrs!) ? sharedStrings[+v!]! : /t="inlineStr"/.test(attrs!) ? texts(body) : entities(v ?? '');
  }
  return cells;
});

const header = rows.findIndex((f) => f.B === 'CPRO' && f.E === 'NOMBRE');
if (header < 0) throw new Error('No encuentro la cabecera CODAUTO/CPRO/CMUN/DC/NOMBRE');
const title = rows[0]?.A ?? '';
const byProvince: Record<string, string[]> = {};
let n = 0;
for (const f of rows.slice(header + 1)) {
  if (!f.B || !f.E) continue;
  const prov = PROVINCES.find((p) => p.code === f.B);
  if (!prov) throw new Error(`Provincia desconocida: ${f.B}`);
  if (prov.regionCode !== f.A) throw new Error(`${f.E}: CCAA ${f.A} no coincide con la de ${prov.name} (${prov.regionCode})`);
  (byProvince[f.B] ??= []).push(f.E);
  n++;
}
for (const l of Object.values(byProvince)) l.sort((a, b) => a.localeCompare(b, 'es'));

const output = {
  source: title,
  url,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  total: n,
  /** INE province code → official municipality names, as the INE writes them ("Palmas de Gran Canaria, Las"). */
  municipalities: Object.fromEntries(Object.entries(byProvince).sort(([a], [b]) => a.localeCompare(b))),
};
await writeFile('data/municipalities.json', JSON.stringify(output) + '\n');
console.log(`data/municipios.json: ${n} municipios (${title})`);
