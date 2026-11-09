// Bet hit-rate check (#13), run weekly by .github/workflows/guesses.yml (or by hand):
//   npx tsx scripts/guesses.ts [--days 30] [--no-publish]
// Reads aggregated 'guess-hit' / 'guess-miss' counts per topic from Umami and opens a GitHub
// issue (label 'reneutralizar') for each topic above 60 % with enough bets. --no-publish: print only.
// Env: UMAMI_WEBSITE_ID + UMAMI_USERNAME/UMAMI_PASSWORD (self-hosted) or UMAMI_API_KEY (Umami Cloud);
// unset ⇒ analytics disabled, exits 0. UMAMI_API_URL (default https://stats.padelful.com/api); GH_TOKEN for `gh` (the workflow passes github.token).
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { checkGuesses, type GuessPorts } from '../src/guesses';
import { createUmamiCounter, createGitHubPorts } from '../src/guesses/adapters';
import { TOPICS } from '../src/registry/topics';

const { values } = parseArgs({
  options: { days: { type: 'string', default: '30' }, 'no-publish': { type: 'boolean', default: false } },
});
const { UMAMI_API_KEY: apiKey, UMAMI_USERNAME: username, UMAMI_PASSWORD: password, UMAMI_WEBSITE_ID: websiteId } = process.env;
const auth = apiKey ? { apiKey } : username && password ? { username, password } : null;
if (!auth || !websiteId) {
  console.log('Analítica desactivada (faltan UMAMI_WEBSITE_ID y UMAMI_USERNAME/UMAMI_PASSWORD o UMAMI_API_KEY): nada que comprobar.');
  process.exit(0);
}
const days = Number(values.days);
const gh = createGitHubPorts((args) => execFileSync('gh', args, { encoding: 'utf8' }));
const ports: GuessPorts = {
  countGuesses: createUmamiCounter({
    base: process.env.UMAMI_API_URL || 'https://stats.padelful.com/api',
    auth,
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

const r = await checkGuesses(ports, { topics: TOPICS, period: `los últimos ${days} días` });
for (const t of r.topics) console.log(`${t.topic}: ${t.guesses} apuestas, ${Math.round(t.rate * 100)} % → ${t.action}`);
if (!r.topics.length) console.log('Sin apuestas en el periodo.');
