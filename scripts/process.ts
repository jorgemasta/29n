// Process one real programme with Claude and merge it into data/dataset.json.
//   ANTHROPIC_API_KEY=… npm run process -- --party erc --pdf ./erc.pdf --url https://…/programa.pdf [--title "Programa 2026"]
//     [--source manifesto-29n|manifesto-2023|party-document|statements]  (anything but manifesto-29n is
//     a provisional source: only shown by the private build, `npm run build:private`)
// AI answers are cached in data/cache/ai (commit it: re-runs are then free and identical).
// Writes the dataset only if the programme is publishable and the dataset passes V9. If the
// approaches are already frozen (published questions), the party is classified into them (#28).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { textPath } from '../src/questions/texts';
import { parseArgs } from 'node:util';
import { Dataset, SourceType, type Party } from '../src/dataset';
import { createDiskCache } from '../src/ai/disk-cache';
import { createClaudeAI } from '../src/ai/claude';
import { processManifesto } from '../src/pipeline';
import { mergeManifesto } from '../src/pipeline/publish';
import { classifyLateParty } from '../src/pipeline/late';
import { SETTLE_PROMPT_VERSION } from '../src/pipeline/prompts-settle';
import { withCache } from '../src/ai/cache';
import { PARTIES } from '../src/registry/parties';

const { values } = parseArgs({
  options: {
    party: { type: 'string' },
    pdf: { type: 'string' },
    url: { type: 'string' },
    title: { type: 'string', default: 'Programa electoral 2026' },
    source: { type: 'string', default: 'manifesto-29n' },
    dataset: { type: 'string', default: 'data/dataset.json' },
    /** Capture date of the PDF (V7 records it with the hash). Defaults to today. */
    date: { type: 'string', default: new Date().toISOString().slice(0, 10) },
  },
});
if (!values.party || !values.pdf || !values.url) {
  console.error('Uso: npm run process -- --party <id> --pdf <fichero> --url <url oficial del PDF>');
  process.exit(2);
}
const base = PARTIES[values.party];
if (!base) throw new Error(`Partido desconocido: ${values.party}`);

const pdf = new Uint8Array(await readFile(values.pdf));
const source = SourceType.parse(values.source);
const party: Party = { ...base, manifesto: { state: 'published', source, url: values.url, title: values.title } };
const previous = Dataset.parse(JSON.parse(await readFile(values.dataset, 'utf8')));

const ai = createClaudeAI();
const cache = createDiskCache('data/cache/ai');
const result = await processManifesto(pdf, party, ai, {
  // One position per published question (the pulse's frozen list, #23).
  questions: previous.questions ?? [],
  cache,
  date: values.date,
});

if (!result.publishable) {
  // A blocked programme leaves the published report (and dataset) intact.
  await mkdir('data/reports/blocked', { recursive: true });
  await writeFile(`data/reports/blocked/${party.id}.json`, JSON.stringify(result.report, null, 2) + '\n');
  console.error(`No publicable: ${result.report.reason}. Informe en data/informes/bloqueados/${party.id}.json`);
  process.exit(1);
}

// Late manifesto: classify the party into the frozen approaches of the published questions.
const late = await classifyLateParty(previous, party.id, result.positions, withCache(ai, cache, { hashPdf: result.report.hashPdf, promptVersion: SETTLE_PROMPT_VERSION }));
if (!late.ok) {
  await mkdir('data/reports/blocked', { recursive: true });
  await writeFile(`data/reports/blocked/${party.id}-approaches.json`, JSON.stringify(late.reports, null, 2) + '\n');
  console.error(`No publicable: ${late.reason}. Informe en data/reports/blocked/${party.id}-approaches.json`);
  process.exit(1);
}

const merge = mergeManifesto(previous, party, result, {
  settled: late.settled,
  generated: new Date().toISOString(),
  date: values.date,
  // Every registered party is listed; without a processed programme it is "⏳ programa pendiente".
  registry: PARTIES,
});
if (!merge.ok) {
  console.error(merge.reason);
  process.exit(1);
}
await mkdir('data/reports', { recursive: true });
await writeFile(`data/reports/${party.id}.json`, JSON.stringify(result.report, null, 2) + '\n');
await writeFile(values.dataset, JSON.stringify(merge.dataset, null, 2) + '\n');
// Page text for the live free question (read by the Cloudflare function, see docs/deploy.md).
await mkdir('public/texts', { recursive: true });
await writeFile(`public/${textPath(party.id)}`, JSON.stringify(result.text) + '\n');
console.log(`${party.id}: ${result.positions.length} postura(s) publicadas en ${values.dataset}`);
