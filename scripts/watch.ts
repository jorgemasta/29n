// Programme watcher, run by .github/workflows/watcher.yml every 2 h (or by hand).
//   npx tsx scripts/watch.ts [--party erc] [--force] [--no-publish]
// --party: only that party (manual relaunch). --force: process even if the PDF is unchanged
// (with the committed AI cache the result is identical and free). --no-publish: dry run, writes
// nothing, no git, no deploy (notices go to the console).
// Env: ANTHROPIC_API_KEY (+ optional AI_GATEWAY_URL); NTFY_TOPIC (+ optional NTFY_TOKEN,
// NTFY_SERVER) for phone notices; CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID for `npm run deploy`.
// PUSH=1 pushes each commit (the workflow sets it).
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { Dataset } from '../src/dataset';
import { createDiskCache } from '../src/ai/disk-cache';
import { createClaudeAI } from '../src/ai/claude';
import { PARTIES } from '../src/registry/parties';
import { TOPICS } from '../src/registry/topics';
import { DATASET_PATH, STATE_PATH, watch, type Alert, type Change, type Download, type WatcherState } from '../src/watcher';
import { MANIFESTO_SOURCES } from '../src/watcher/sources';
import { createNtfyAlert } from '../src/watcher/ntfy';

const { values } = parseArgs({
  options: {
    party: { type: 'string' },
    force: { type: 'boolean', default: false },
    'no-publish': { type: 'boolean', default: false },
  },
});
const dryRun = values['no-publish'];
const CACHE_DIR = 'data/cache/ai';
const MAX_BYTES = 80 * 1024 * 1024;

const git = (...args: string[]) => execFileSync('git', args, { stdio: 'inherit' });
const hasChanges = (path: string) => execFileSync('git', ['status', '--porcelain', '--', path], { encoding: 'utf8' }).trim() !== '';
const push = () => {
  if (process.env.PUSH === '1') git('push');
};

/** Commit the AI cache on its own, so a failed deploy can drop the data commit and keep the cache. */
function saveCache() {
  if (dryRun || !hasChanges(CACHE_DIR)) return;
  git('add', CACHE_DIR);
  git('commit', '-m', 'vigilante: caché de IA');
}

async function download(url: string): Promise<Download> {
  const r = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000),
    headers: { 'user-agent': '29n-vigilante (+https://29n.jorgemasta.com/)', accept: 'text/html,application/pdf' },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error(`${url}: demasiado grande (${bytes.length} bytes)`);
  // Magic bytes, not the content-type: some servers send PDFs as octet-stream.
  if (new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-') return { type: 'pdf', bytes };
  return { type: 'html', text: new TextDecoder().decode(bytes) };
}

async function save(c: Change) {
  if (dryRun) {
    console.log(`[sin publicar] ${c.message}: ${Object.keys(c.files).join(', ')}${c.deploy ? ' + despliegue' : ''}`);
    return;
  }
  saveCache();
  for (const [path, content] of Object.entries(c.files)) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  git('add', ...Object.keys(c.files));
  git('commit', '-m', c.message);
  if (c.deploy) {
    try {
      execFileSync('npm', ['run', 'deploy'], { stdio: 'inherit' });
    } catch (e) {
      // Leave the repo (and the live site) as they were before this programme.
      git('reset', '--hard', 'HEAD~1');
      throw new Error(`despliegue fallido: ${e instanceof Error ? e.message : e}`);
    }
  }
  push();
}

const consoleAlert = async (a: Alert) => console.log(`[alert ${a.type}] ${a.title}\n${a.message}`);
const phoneAlert = process.env.NTFY_TOPIC
  ? createNtfyAlert({ topic: process.env.NTFY_TOPIC, token: process.env.NTFY_TOKEN || undefined, server: process.env.NTFY_SERVER || undefined })
  : null;
if (!phoneAlert) console.warn('NTFY_TOPIC no definido: los avisos solo salen por consola.');

const readJson = async (path: string, fallback: unknown) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
};

const r = await watch(
  {
    dataset: Dataset.parse(await readJson(DATASET_PATH, null)),
    state: (await readJson(STATE_PATH, {})) as WatcherState,
    sources: MANIFESTO_SOURCES,
    parties: PARTIES,
  },
  {
    download,
    ai: createClaudeAI(),
    cache: createDiskCache(CACHE_DIR),
    save,
    sendAlert: async (a) => {
      await consoleAlert(a);
      if (phoneAlert && !dryRun) await phoneAlert(a);
    },
    now: () => new Date(),
  },
  { party: values.party, force: values.force, processResult: { topics: TOPICS } },
);

// AI answers paid for in runs that published nothing (blocked or crashed) are kept too.
saveCache();
if (!dryRun) push();

for (const x of r.results) console.log(`${x.party}: ${x.result}${x.url ? ` ${x.url}` : ''}${x.reason ? ` (${x.reason})` : ''}`);
for (const e of r.sourceErrors) console.warn(`fuente no disponible (${e.party}): ${e.url}: ${e.error}`);
for (const e of r.alertErrors) console.error(`aviso no entregado: ${e}`);
// A failed notice fails the job, so GitHub's own e-mail still reaches the maintainer.
if (r.alertErrors.length > 0) process.exit(1);
