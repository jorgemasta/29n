// Bet hit-rate check (#13), run weekly by .github/workflows/apuestas.yml (or by hand):
//   npx tsx scripts/apuestas.ts [--dias 30] [--sin-publicar]
// Reads aggregated 'apuesta-acierto' / 'apuesta-fallo' counts per topic from Umami and opens a GitHub
// issue (label 'reneutralizar') for each topic above 60 % with enough bets. --sin-publicar: print only.
// Env: UMAMI_API_KEY, UMAMI_WEBSITE_ID (unset ⇒ analytics disabled, exits 0), UMAMI_API_URL
// (default https://api.umami.is/v1); GH_TOKEN for `gh` (the workflow passes github.token).
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { comprobarApuestas, type PuertosApuestas } from '../src/apuestas';
import { crearContadorUmami, crearPuertosGitHub } from '../src/apuestas/adaptadores';
import { TEMAS } from '../src/registro/temas';

const { values } = parseArgs({
  options: { dias: { type: 'string', default: '30' }, 'sin-publicar': { type: 'boolean', default: false } },
});
const { UMAMI_API_KEY: apiKey, UMAMI_WEBSITE_ID: websiteId } = process.env;
if (!apiKey || !websiteId) {
  console.log('Analítica desactivada (faltan UMAMI_API_KEY / UMAMI_WEBSITE_ID): nada que comprobar.');
  process.exit(0);
}
const dias = Number(values.dias);
const gh = crearPuertosGitHub((args) => execFileSync('gh', args, { encoding: 'utf8' }));
const puertos: PuertosApuestas = {
  contarApuestas: crearContadorUmami({
    base: process.env.UMAMI_API_URL || 'https://api.umami.is/v1',
    apiKey,
    websiteId,
    dias,
    ahora: () => Date.now(),
    pedir: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(30_000) }),
  }),
  issuesAbiertos: gh.issuesAbiertos,
  abrirIssue: values['sin-publicar']
    ? async (i) => console.log(`[sin publicar] ${i.titulo}\n${i.cuerpo}\n`)
    : gh.abrirIssue,
};

const r = await comprobarApuestas(puertos, { temas: TEMAS, periodo: `los últimos ${dias} días` });
for (const t of r.temas) console.log(`${t.tema}: ${t.apuestas} apuestas, ${Math.round(t.tasa * 100)} % → ${t.accion}`);
if (!r.temas.length) console.log('Sin apuestas en el periodo.');
