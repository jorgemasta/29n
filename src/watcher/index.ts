// Programme watcher (runs every 2–3 h, see .github/workflows/watcher.yml). Single entry point:
//   watch({dataset, state, sources, parties}, ports, options) → {dataset, state, results}
// For each party: read its sources (official pages, aggregators or the PDF itself) → pick the
// programme PDF on an official domain → compare its hash with the last one seen → run the data
// pipeline → classify the party into the frozen approaches of the published questions (#28,
// classifyLateParty) → publish (commit + deploy) if publishable, or keep the previous state if
// blocked → notify the maintainer's phone. Every side effect goes through `ports`, so tests use fakes.
import type { Dataset, Party, SourceType } from '../dataset/schema';
import type { AIAdapter } from '../ai/adapter';
import type { CacheStore } from '../ai/cache';
import { processManifesto, type ProcessOptions } from '../pipeline';
import { verifySource } from '../pipeline/source';
import { hashPdf } from '../pipeline/pdf';
import { mergeManifesto } from '../pipeline/publish';
import { classifyLateParty } from '../pipeline/late';
import { SETTLE_PROMPT_VERSION } from '../pipeline/prompts-settle';
import type { SettleOptions } from '../pipeline/settle';
import { withCache } from '../ai/cache';
import { OFFICIAL_DOMAINS } from '../registry/domains';
import { textPath } from '../questions/texts';

/** A page (official site or aggregator) or a PDF URL where a party's programme may appear. */
export interface WatchedSource {
  party: string;
  url: string;
  /** Case-insensitive regex the PDF URL must match (to tell the programme from other PDFs). */
  pattern?: string;
  title?: string;
  source?: SourceType;
}

export type Download = { type: 'pdf'; bytes: Uint8Array } | { type: 'html'; text: string };

/** Last programme seen per party (committed as data/watcher.json so runs remember it). */
export type WatcherState = Record<
  string,
  { url: string; hash: string; date: string; result: 'published' | 'blocked'; reason?: string }
>;

/** Files to commit; `deploy` also builds and deploys the site. Throws if anything fails. */
export interface Change {
  message: string;
  files: Record<string, string>;
  deploy: boolean;
}

export interface Alert {
  type: 'published' | 'failure';
  title: string;
  message: string;
}

export interface Ports {
  download(url: string): Promise<Download>;
  ai: AIAdapter;
  /** AI answer cache (committed with the data: re-running the same PDF is free and identical). */
  cache?: CacheStore;
  save(change: Change): Promise<void>;
  sendAlert(alert: Alert): Promise<void>;
  now(): Date;
}

export interface WatchOptions {
  /** Manual relaunch: only this party. */
  party?: string;
  /** Process even if the PDF has not changed. */
  force?: boolean;
  /** Pipeline options; `questions` defaults to the dataset's published questions (the pulse's list, #23). */
  processResult?: Partial<ProcessOptions>;
  /** Options of the late classification into frozen approaches (default checks otherwise). */
  settle?: SettleOptions;
}

export type PartyResult = {
  party: string;
  result: 'published' | 'blocked' | 'unchanged' | 'noManifesto' | 'error';
  url?: string;
  reason?: string;
};

export interface WatchResult {
  dataset: Dataset;
  state: WatcherState;
  results: PartyResult[];
  /** Sources that could not be read (logged, not notified: party sites go down often). */
  sourceErrors: { party: string; url: string; error: string }[];
  /** Notices that could not be delivered (never turn a publication into a failure). */
  alertErrors: string[];
}

export const DATASET_PATH = 'data/dataset.json';
export const STATE_PATH = 'data/watcher.json';
const reportPath = (p: string) => `data/reports/${p}.json`;
const blockedPath = (p: string) => `data/reports/blocked/${p}.json`;
/** Settle reports of a party blocked because a frozen question could not take it (#28). */
const blockedApproachesPath = (p: string) => `data/reports/blocked/${p}-approaches.json`;
const toJson = (x: unknown) => JSON.stringify(x, null, 2) + '\n';
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function watch(
  input: {
    dataset: Dataset;
    state: WatcherState;
    sources: WatchedSource[];
    parties: Record<string, Omit<Party, 'manifesto'>>;
  },
  ports: Ports,
  options: WatchOptions = {},
): Promise<WatchResult> {
  if (options.party && !input.parties[options.party])
    throw new Error(`Partido desconocido: ${options.party}`);
  const domains = options.processResult?.domains ?? OFFICIAL_DOMAINS;
  const questions = options.processResult?.questions ?? input.dataset.questions ?? [];

  let dataset = input.dataset;
  let state = input.state;
  const results: PartyResult[] = [];
  const sourceErrors: WatchResult['sourceErrors'] = [];
  const alertErrors: string[] = [];
  const sendAlert = (a: Alert) => ports.sendAlert(a).catch((e) => void alertErrors.push(`${a.title}: ${errorMessage(e)}`));

  // One download per URL per run (an aggregator page serves several parties).
  const downloads = new Map<string, Promise<Download>>();
  const download = (url: string) => {
    if (!downloads.has(url)) downloads.set(url, ports.download(url));
    return downloads.get(url)!;
  };

  const ids = options.party ? [options.party] : [...new Set(input.sources.map((f) => f.party))];
  for (const id of ids) {
    const registry = input.parties[id];
    if (!registry) continue;
    const sources = input.sources.filter((f) => f.party === id);

    // 1. Find the programme: first source (in listed order) that yields an official PDF.
    let found: { source: WatchedSource; url: string; bytes: Uint8Array } | null = null;
    for (const source of sources) {
      try {
        found = await findManifesto(source, download, (url) => isOfficial(registry, url, domains));
      } catch (e) {
        sourceErrors.push({ party: id, url: source.url, error: errorMessage(e) });
      }
      if (found) break;
    }
    if (!found) {
      results.push({ party: id, result: 'noManifesto' });
      continue;
    }

    // 2. New or changed? Same hash the pipeline stores as manifesto.hashPdf, or nothing would match.
    const { source, url, bytes } = found;
    const hash = hashPdf(bytes);
    const current = dataset.parties.find((p) => p.id === id)?.manifesto;
    const seen = state[id]?.hash === hash || (current?.state === 'published' && current.hashPdf === hash);
    if (seen && !options.force) {
      results.push({ party: id, result: 'unchanged', url });
      continue;
    }

    // 3. Run the data pipeline and publish (or not).
    const party: Party = {
      ...registry,
      manifesto: { state: 'published', source: source.source ?? 'manifesto-29n', url, title: source.title ?? 'Programa electoral 2026' },
    };
    const now = ports.now();
    const date = now.toISOString().slice(0, 10);
    const name = `${registry.acronym}`;
    try {
      const result = await processManifesto(bytes, party, ports.ai, {
        ...options.processResult,
        questions,
        cache: ports.cache ?? options.processResult?.cache,
        date,
      });
      // Late manifesto: place the party in the approaches already published (frozen), alone.
      const settleAi = ports.cache ? withCache(ports.ai, ports.cache, { hashPdf: hash, promptVersion: SETTLE_PROMPT_VERSION }) : ports.ai;
      const late = result.publishable ? await classifyLateParty(dataset, id, result.positions, settleAi, options.settle) : null;
      const merge = late && !late.ok
        ? { ok: false as const, reason: late.reason }
        : mergeManifesto(dataset, party, result, {
            generated: now.toISOString(),
            date,
            registry: input.parties,
            ...(late?.ok ? { questions: late.questions } : {}),
          });

      if (!merge.ok) {
        // Blocked: nothing of this party is published; remember the hash so it is not retried.
        const newState = { ...state, [id]: { url, hash, date, result: 'blocked' as const, reason: merge.reason } };
        await ports.save({
          message: `vigilante: ${id} bloqueado (${merge.reason})`,
          files: {
            [blockedPath(id)]: toJson(result.report),
            ...(late && !late.ok ? { [blockedApproachesPath(id)]: toJson(late.reports) } : {}),
            [STATE_PATH]: toJson(newState),
          },
          deploy: false,
        });
        state = newState;
        results.push({ party: id, result: 'blocked', url, reason: merge.reason });
        await sendAlert({
          type: 'failure',
          title: `29N: programa de ${name} bloqueado`,
          message: `${merge.reason}\n${result.report.discarded}/${result.report.extracted} posturas descartadas. ${url}`,
        });
        continue;
      }

      const newState = { ...state, [id]: { url, hash, date, result: 'published' as const } };
      await ports.save({
        message: `vigilante: publica el programa de ${id}`,
        files: {
          [DATASET_PATH]: toJson(merge.dataset),
          [reportPath(id)]: toJson(result.report),
          // Page text for the live free question (same PDF as the published hash).
          ...(result.text ? { [`public/${textPath(id)}`]: JSON.stringify(result.text) + '\n' } : {}),
          [STATE_PATH]: toJson(newState),
        },
        deploy: true,
      });
      dataset = merge.dataset;
      state = newState;
      const proposes = result.positions.filter((p) => p.state === 'proposes').length;
      results.push({ party: id, result: 'published', url });
      await sendAlert({
        type: 'published',
        title: `29N: publicado el programa de ${name}`,
        message: `${proposes} postura(s) con propuesta, ${result.report.discarded} descartada(s). ${url}`,
      });
    } catch (e) {
      // Crash (AI, PDF, git or deploy): previous dataset and state stay; next run retries.
      const reason = errorMessage(e);
      results.push({ party: id, result: 'error', url, reason });
      await sendAlert({ type: 'failure', title: `29N: fallo al procesar ${name}`, message: `${reason}\n${url}` });
    }
  }

  return { dataset, state, results, sourceErrors, alertErrors };
}

function isOfficial(party: Omit<Party, 'manifesto'>, url: string, domains: Record<string, string[]>): boolean {
  const manifesto = { state: 'published' as const, url, title: '' };
  return verifySource({ ...party, manifesto }, domains).ok;
}

async function findManifesto(
  source: WatchedSource,
  download: (url: string) => Promise<Download>,
  official: (url: string) => boolean,
): Promise<{ source: WatchedSource; url: string; bytes: Uint8Array } | null> {
  const pattern = source.pattern ? new RegExp(source.pattern, 'i') : null;
  const r = await download(source.url);
  if (r.type === 'pdf') return official(source.url) ? { source, url: source.url, bytes: r.bytes } : null;
  for (const url of pdfLinks(r.text, source.url)) {
    if (!official(url) || (pattern && !pattern.test(url))) continue;
    const pdf = await download(url);
    if (pdf.type === 'pdf') return { source, url, bytes: pdf.bytes };
  }
  return null;
}

/** Absolute URLs of the links to PDFs in an HTML page, in page order, without duplicates. */
export function pdfLinks(html: string, base: string): string[] {
  const urls = new Set<string>();
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const url = new URL(m[1]!.replaceAll('&amp;', '&'), base);
      url.hash = '';
      if (/\.pdf$/i.test(url.pathname)) urls.add(url.href);
    } catch {
      // ignore malformed links
    }
  }
  return [...urls];
}
