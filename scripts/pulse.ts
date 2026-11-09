// Take the pulse once and freeze the list of themes and questions (#23).
//   ANTHROPIC_API_KEY=… npm run pulse -- --sources data/pulse-sources.json [--date YYYY-MM-DD] [--out data/pulse.json] [--force]
//   npm run pulse -- --dry-run   (fake AI over fictional example sources: no cost, writes nothing)
// The sources file follows `PulseSources` (src/pulse): the CIS barometer, the topics of each
// manifesto and open-network candidates (never X). Two AI calls (two independent passes).
// The list is frozen: an existing output is never overwritten unless --force.
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { createClaudeAI } from '../src/ai/claude';
import { createFakeAI } from '../src/ai/fake';
import { Pulse, PulseSources, takePulse, type PulseOptions } from '../src/pulse';
import { PARTIES } from '../src/registry/parties';
import { EXAMPLE_PARTIES, EXAMPLE_RESPONSE, EXAMPLE_SOURCES } from './pulse-example';

const { values } = parseArgs({
  options: {
    sources: { type: 'string' },
    out: { type: 'string', default: 'data/pulse.json' },
    /** Freeze date. Defaults to today. */
    date: { type: 'string', default: new Date().toISOString().slice(0, 10) },
    'dry-run': { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
  },
});
const dryRun = values['dry-run'];

if (!dryRun && !values.sources) {
  console.error('Uso: npm run pulse -- --sources <fuentes.json> [--date AAAA-MM-DD] [--out data/pulse.json] [--force]');
  console.error('     npm run pulse -- --dry-run');
  process.exit(2);
}
if (!dryRun && existsSync(values.out) && !values.force) {
  console.error(`${values.out} ya existe: la lista está congelada. Usa --force solo si de verdad hay que rehacerla.`);
  process.exit(1);
}

const sources = dryRun ? EXAMPLE_SOURCES : PulseSources.parse(JSON.parse(await readFile(values.sources!, 'utf8')));
const parties: PulseOptions['parties'] = dryRun ? EXAMPLE_PARTIES : Object.values(PARTIES);
// The pulse only calls take-pulse; any other task would throw (no canned answer).
const ai = dryRun ? createFakeAI({ 'take-pulse': () => EXAMPLE_RESPONSE }) : createClaudeAI();

const pulse = Pulse.parse(await takePulse(sources, ai, { frozenAt: values.date, parties }));

for (const t of pulse.themes) {
  const qs = pulse.questions.filter((q) => q.theme === t.id);
  console.log(`${t.order}. ${t.title}${t.region ? ` (comunidad ${t.region})` : ''}`);
  for (const q of qs) {
    const origin = [q.origin.cis, q.origin.manifestos ? `${q.origin.manifestos} programa${q.origin.manifestos === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ');
    console.log(`   ${q.followUp ? '+' : '-'} ${q.text}  [${origin}]`);
  }
}
if (pulse.rejected.length) {
  console.log(`\nNo entran (${pulse.rejected.length}):`);
  for (const r of pulse.rejected) console.log(`   ${r.theme}/${r.id}: ${r.reason}. ${r.detail}`);
}

if (dryRun) {
  console.log('\nSimulación con la IA falsa y fuentes de ejemplo: no se ha escrito nada.');
} else {
  await writeFile(values.out, JSON.stringify(pulse, null, 2) + '\n');
  console.log(`\nLista congelada el ${pulse.frozenAt} en ${values.out}.`);
}
