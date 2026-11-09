// The operator's settle step (#18): settle every pulse question not published yet from all parties'
// positions (settleApproaches + publishSettled) and write the dataset with the pulse's themes.
//   npm run settle -- --dry-run                 (what would be settled and how many AI calls: no cost, writes nothing)
//   ANTHROPIC_API_KEY=… npm run settle [-- --question <id> …] [--dataset data/dataset.json] [--pulse data/pulse.json]
// Published questions are frozen and skipped (late manifestos are classified into them by the
// watcher). AI answers are cached in data/cache/ai (commit it: re-runs are then free and identical).
// Writes the dataset only if it passes V9; settle reports go into `approachReports`.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { Dataset } from '../src/dataset';
import { Pulse } from '../src/pulse';
import { createClaudeAI } from '../src/ai/claude';
import { createDiskCache } from '../src/ai/disk-cache';
import { withCache } from '../src/ai/cache';
import { estimateSettle, settleAll } from '../src/pipeline/settle-all';
import { SETTLE_PROMPT_VERSION } from '../src/pipeline/prompts-settle';

const { values } = parseArgs({
  options: {
    dataset: { type: 'string', default: 'data/dataset.json' },
    pulse: { type: 'string', default: 'data/pulse.json' },
    /** Only these questions (repeatable). Default: every pulse question not published yet. */
    question: { type: 'string', multiple: true },
    'dry-run': { type: 'boolean', default: false },
  },
});

const dataset = Dataset.parse(JSON.parse(await readFile(values.dataset, 'utf8')));
let pulse: Pulse;
try {
  pulse = Pulse.parse(JSON.parse(await readFile(values.pulse, 'utf8')));
} catch (e) {
  console.error(`No se puede leer la lista congelada (${values.pulse}): ${e instanceof Error ? e.message : e}. Toma antes el pulso: npm run pulse.`);
  process.exit(1);
}
const only = values.question?.length ? values.question : undefined;
const unknown = (only ?? []).filter((id) => !pulse.questions.some((q) => q.id === id));
if (unknown.length) {
  console.error(`Preguntas que no están en el pulso: ${unknown.join(', ')}`);
  process.exit(2);
}

const estimate = estimateSettle(dataset, pulse, only);
for (const q of estimate.questions) console.log(`- ${q.id}: ${q.proposing} partido(s) proponen algo${q.proposing ? '' : ' (no se publicará, sin llamar a la IA)'}`);
if (estimate.frozen.length) console.log(`Ya publicadas (congeladas, no se tocan): ${estimate.frozen.join(', ')}`);
console.log(`Coste estimado: entre ${estimate.calls.min} y ${estimate.calls.max} llamadas a la IA (menos si ya están en la caché).`);

if (values['dry-run']) {
  console.log('\nSimulación: no se ha llamado a la IA ni se ha escrito nada.');
  process.exit(0);
}
if (dataset.origin !== 'real') {
  console.error('El dataset es simulado: procesa antes algún programa real (npm run process o el vigilante).');
  process.exit(1);
}

// Cache keyed by every manifesto hash, so a re-run with the same programmes is free and identical.
const hashes = dataset.reports.map((r) => `${r.party}:${r.hashPdf}`).sort().join(',');
const ai = withCache(createClaudeAI(), createDiskCache('data/cache/ai'), {
  hashPdf: createHash('sha256').update(hashes).digest('hex'),
  promptVersion: SETTLE_PROMPT_VERSION,
});
const r = await settleAll(dataset, pulse, ai, { only });
for (const report of r.reports)
  console.log(`${report.question}: ${report.publishable ? 'publicada' : `no publicada (${report.reason ?? 'no pasa las comprobaciones'})`}`);
if (!r.ok) {
  console.error(r.reason);
  process.exit(1);
}
await writeFile(values.dataset, JSON.stringify(r.dataset, null, 2) + '\n');
console.log(`\n${r.dataset.questions?.length ?? 0} pregunta(s) publicadas en ${values.dataset}.`);
