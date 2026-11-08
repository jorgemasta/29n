// Process one real programme with Claude and merge it into data/dataset.json.
//   ANTHROPIC_API_KEY=… npm run procesar -- --partido erc --pdf ./erc.pdf --url https://…/programa.pdf [--titulo "Programa 2026"]
//     [--fuente programa-29n|programa-2023|documento-partido|declaraciones]  (anything but programa-29n is
//     a provisional source: only shown by the private build, `npm run build:privado`)
// AI answers are cached in data/cache/ia (commit it: re-runs are then free and identical).
// Writes the dataset only if the programme is publishable and the dataset passes V9.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { construirDataset, validarDataset, Dataset, TipoFuente, type Partido } from '../src/dataset';
import { crearCacheEnDisco } from '../src/ia/cache-disco';
import { crearIAClaude } from '../src/ia/claude';
import { procesarPrograma } from '../src/pipeline';
import { contarPalabras } from '../src/pipeline/texto';
import { PARTIDOS } from '../src/registro/partidos';
import { TEMAS } from '../src/registro/temas';

const { values } = parseArgs({
  options: {
    partido: { type: 'string' },
    pdf: { type: 'string' },
    url: { type: 'string' },
    titulo: { type: 'string', default: 'Programa electoral 2026' },
    fuente: { type: 'string', default: 'programa-29n' },
    dataset: { type: 'string', default: 'data/dataset.json' },
    /** Capture date of the PDF (V7 records it with the hash). Defaults to today. */
    fecha: { type: 'string', default: new Date().toISOString().slice(0, 10) },
  },
});
if (!values.partido || !values.pdf || !values.url) {
  console.error('Uso: npm run procesar -- --partido <id> --pdf <fichero> --url <url oficial del PDF>');
  process.exit(2);
}
const base = PARTIDOS[values.partido];
if (!base) throw new Error(`Partido desconocido: ${values.partido}`);

const pdf = new Uint8Array(await readFile(values.pdf));
const fuente = TipoFuente.parse(values.fuente);
const partido: Partido = { ...base, programa: { estado: 'publicado', fuente, url: values.url, titulo: values.titulo } };
const anterior = Dataset.parse(JSON.parse(await readFile(values.dataset, 'utf8')));
// Real data replaces simulated data entirely.
const previos = anterior.origen === 'real' ? anterior : { ...anterior, partidos: [], posturas: [], informes: [] };
// V5: word counts of the other parties' published texts, per topic (for the topic median).
const longitudesTema: Record<string, number[]> = {};
for (const p of previos.posturas)
  if (p.estado === 'propone' && p.partido !== partido.id) (longitudesTema[p.tema] ??= []).push(contarPalabras(p.texto));

const resultado = await procesarPrograma(pdf, partido, crearIAClaude(), {
  temas: TEMAS,
  cache: crearCacheEnDisco('data/cache/ia'),
  longitudesTema,
  fecha: values.fecha,
  // V11 mixes this programme's posturas with the ones already published.
  publicado: { partidos: previos.partidos, posturas: previos.posturas },
});

await mkdir('data/informes', { recursive: true });
await writeFile(`data/informes/${partido.id}.json`, JSON.stringify(resultado.informe, null, 2) + '\n');
if (!resultado.publicable) {
  console.error(`No publicable: ${resultado.informe.motivo}. Informe en data/informes/${partido.id}.json`);
  process.exit(1);
}

const conHash: Partido = { ...partido, programa: { ...partido.programa, hashPdf: resultado.informe.hashPdf, fecha: values.fecha } } as Partido;
const dataset = construirDataset({
  partidos: [...previos.partidos.filter((p) => p.id !== partido.id), conHash],
  temas: TEMAS,
  resultados: [
    ...previos.informes
      .filter((i) => i.partido !== partido.id)
      .map((informe) => ({ informe, posturas: previos.posturas.filter((p) => p.partido === informe.partido) })),
    resultado,
  ],
  generado: new Date().toISOString(),
  origen: 'real',
});
const v = validarDataset(dataset);
if (!v.valido) {
  console.error(`V9: el dataset no valida:\n${v.errores.join('\n')}`);
  process.exit(1);
}
await writeFile(values.dataset, JSON.stringify(dataset, null, 2) + '\n');
console.log(`${partido.id}: ${resultado.posturas.length} postura(s) publicadas en ${values.dataset}`);
