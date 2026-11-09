// Guess hit-rate check (#13, #26), run weekly by .github/workflows/guesses.yml (or by hand):
//   npx tsx scripts/guesses.ts [--days 30] [--no-publish]
// Reads aggregated 'guess-hit' / 'guess-miss' counts per question from Umami and opens a GitHub
// issue (label 'reneutralizar') for each question whose hit rate is clearly above its own chance
// (from data/dataset.json), only with enough guesses. --no-publish: print only.
// Env: UMAMI_API_KEY, UMAMI_WEBSITE_ID (unset ⇒ analytics disabled, exits 0), UMAMI_API_URL
// (default https://stats.padelful.com/api, the self-hosted instance); GH_TOKEN for `gh` (the workflow passes github.token).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { checkGuesses, questionChances, type GuessPorts } from '../src/guesses';
import { createUmamiCounter, createGitHubPorts } from '../src/guesses/adapters';
import { Dataset } from '../src/dataset';

const { values } = parseArgs({
  options: { days: { type: 'string', default: '30' }, 'no-publish': { type: 'boolean', default: false } },
});
const { UMAMI_API_KEY: apiKey, UMAMI_WEBSITE_ID: websiteId } = process.env;
if (!apiKey || !websiteId) {
  console.log('Analítica desactivada (faltan UMAMI_API_KEY / UMAMI_WEBSITE_ID): nada que comprobar.');
  process.exit(0);
}
const days = Number(values.days);
const gh = createGitHubPorts((args) => execFileSync('gh', args, { encoding: 'utf8' }));
const ports: GuessPorts = {
  countGuesses: createUmamiCounter({
    base: process.env.UMAMI_API_URL || 'https://stats.padelful.com/api',
    apiKey,
    websiteId,
    days,
    now: () => Date.now(),
    request: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(30_000) }),
  }),
  openIssues: gh.openIssues,
  openIssue: values['no-publish']
    ? async (i) => console.log(`[sin publicar] ${i.title}\n${i.body}\n`)
    : gh.openIssue,
};

const dataset = Dataset.parse(JSON.parse(readFileSync('data/dataset.json', 'utf8')));
const pct = (x: number) => `${Math.round(x * 100)} %`;
const r = await checkGuesses(ports, { questions: questionChances(dataset), period: `los últimos ${days} días` });
for (const q of r.questions) console.log(`${q.question}: ${q.guesses} apuestas, ${pct(q.rate)} (azar ${pct(q.chance)}) → ${q.action}`);
if (!r.questions.length) console.log('Sin apuestas en el periodo.');
