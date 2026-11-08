// Process one real programme with Claude and merge it into data/dataset.json.
//   ANTHROPIC_API_KEY=… npm run procesar -- --partido erc --pdf ./erc.pdf --url https://…/programa.pdf [--titulo "Programa 2026"]
//     [--fuente programa-29n|programa-2023|documento-partido|declaraciones]  (anything but programa-29n is
//     a provisional source: only shown by the private build, `npm run build:privado`)
// AI answers are cached in data/cache/ia (commit it: re-runs are then free and identical).
// Writes the dataset only if the programme is publishable and the dataset passes V9.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { rutaTexto } from '../src/pregunta/textos';
import { parseArgs } from 'node:util';
import { Dataset, TipoFuente, type Partido } from '../src/dataset';
import { crearCacheEnDisco } from '../src/ia/cache-disco';
import { crearIAClaude } from '../src/ia/claude';
import { procesarPrograma } from '../src/pipeline';
import { contextoPublicado, fusionarPrograma } from '../src/pipeline/publicar';
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

const resultado = await procesarPrograma(pdf, partido, crearIAClaude(), {
  temas: TEMAS,
  cache: crearCacheEnDisco('data/cache/ia'),
  fecha: values.fecha,
  // V5 lengths and V11's mix come from the parties already published.
  ...contextoPublicado(anterior, partido.id),
});

if (!resultado.publicable) {
  // A blocked programme leaves the published report (and dataset) intact.
  await mkdir('data/informes/bloqueados', { recursive: true });
  await writeFile(`data/informes/bloqueados/${partido.id}.json`, JSON.stringify(resultado.informe, null, 2) + '\n');
  console.error(`No publicable: ${resultado.informe.motivo}. Informe en data/informes/bloqueados/${partido.id}.json`);
  process.exit(1);
}

const fusion = fusionarPrograma(anterior, partido, resultado, {
  temas: TEMAS,
  generado: new Date().toISOString(),
  fecha: values.fecha,
  // Every registered party is listed; without a processed programme it is "⏳ programa pendiente".
  registro: PARTIDOS,
});
if (!fusion.ok) {
  console.error(fusion.motivo);
  process.exit(1);
}
await mkdir('data/informes', { recursive: true });
await writeFile(`data/informes/${partido.id}.json`, JSON.stringify(resultado.informe, null, 2) + '\n');
await writeFile(values.dataset, JSON.stringify(fusion.dataset, null, 2) + '\n');
// Page text for the live free question (read by the Cloudflare function, see docs/deploy.md).
await mkdir('public/textos', { recursive: true });
await writeFile(`public/${rutaTexto(partido.id)}`, JSON.stringify(resultado.texto) + '\n');
console.log(`${partido.id}: ${resultado.posturas.length} postura(s) publicadas en ${values.dataset}`);
