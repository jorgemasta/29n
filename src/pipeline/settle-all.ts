// The operator's settle step (`npm run settle`, #18): the frozen pulse (data/pulse.json, #23) gives
// the dataset its themes and the list of questions; every manifesto is processed against that list
// (`pulseQuestions`, used by `npm run process` and the watcher), so each party has a position on
// every pulse question, published or not. Once enough manifestos are in, this settles every pulse
// question that is not published yet from all parties' positions (`settleApproaches` without
// `frozen`) and publishes it (`publishSettled`). A published question is frozen: never settled again
// here (late manifestos are classified into it by the watcher, #28).
import type { AIAdapter } from '../ai/adapter';
import { withCache, type CacheStore } from '../ai/cache';
import { validateDataset } from '../dataset';
import type { Dataset, Question } from '../dataset/schema';
import type { Pulse } from '../pulse';
import { GUESS_ROUNDS, MAX_REWRITES } from './approach-checks';
import { SETTLE_PROMPT_VERSION } from './prompts-settle';
import { pulseThemes } from './publish';
import { MAX_ROUNDS, publishSettled, settleApproaches, type QuestionSpec, type SettleOptions, type SettleReport } from './settle';

/**
 * The questions every manifesto is processed against: the pulse's frozen list (published or not),
 * plus any published question that is not in it. Without a pulse, the published questions.
 */
export function pulseQuestions(pulse: Pick<Pulse, 'questions'> | null | undefined, dataset: Pick<Dataset, 'questions'>): QuestionSpec[] {
  const published = (dataset.questions ?? []).map(({ approaches: _, otherProposals: __, ...q }) => q);
  if (!pulse) return published;
  const inPulse = new Set(pulse.questions.map((q) => q.id));
  return [...pulse.questions.map((q) => ({ ...q, ...published.find((p) => p.id === q.id) })), ...published.filter((q) => !inPulse.has(q.id))];
}

/**
 * A pulse question held back: these published parties have no position on it (processed before
 * it was in their question list). Settling it now would publish them as "no propone nada" there,
 * and V9 rejects that. Reprocess them (`npm run process`, against the whole pulse) and settle again.
 */
export interface HeldQuestion {
  question: string;
  parties: string[];
}

export interface SettleEstimate {
  /** Pulse questions to settle now, with how many parties propose something on each (0 = no AI call). */
  questions: { id: string; proposing: number }[];
  /** Pulse questions held back: published parties without a position on them (no AI call). */
  held: HeldQuestion[];
  /** Pulse questions already published: frozen, skipped. */
  frozen: string[];
  /** AI calls: everything passing first time, and the worst case (retry round, every rewrite). */
  calls: { min: number; max: number };
}

/** Pulse questions not published yet (all of them, or those in `only`), less the held ones. */
function pending(dataset: Dataset, pulse: Pulse, only?: readonly string[]) {
  const published = new Set((dataset.questions ?? []).map((q) => q.id));
  const wanted = pulse.questions.filter((q) => !only || only.includes(q.id));
  const parties = dataset.parties.filter((p) => p.manifesto.state === 'published').map((p) => p.id);
  const missing = (question: string) => parties.filter((party) => !dataset.positions.some((p) => p.party === party && p.question === question));
  const unpublished = wanted.filter((q) => !published.has(q.id));
  return {
    toSettle: unpublished.filter((q) => missing(q.id).length === 0),
    held: unpublished.flatMap((q) => (missing(q.id).length ? [{ question: q.id, parties: missing(q.id) }] : [])),
    frozen: wanted.filter((q) => published.has(q.id)).map((q) => q.id),
  };
}

const proposingOn = (dataset: Dataset, question: string) =>
  dataset.positions.filter((p) => p.question === question && p.state === 'proposes' && p.quotes.length > 0).length;

/** The dry run of `npm run settle`: what would be settled and how many AI calls it would take. */
export function estimateSettle(dataset: Dataset, pulse: Pulse, only?: readonly string[]): SettleEstimate {
  const { toSettle, held, frozen } = pending(dataset, pulse, only);
  const questions = toSettle.map((q) => ({ id: q.id, proposing: proposingOn(dataset, q.id) }));
  // Per question: two passes per round; per round of checks, V10 on up to 3 approaches and the
  // V11 guesser; each rewrite asks for up to 3 approaches and checks them all again.
  const checks = { min: 1 + GUESS_ROUNDS, max: 3 + GUESS_ROUNDS };
  const asked = questions.filter((q) => q.proposing > 0).length;
  return {
    questions,
    held,
    frozen,
    calls: {
      min: asked * (2 + checks.min),
      max: asked * (2 * MAX_ROUNDS + (1 + MAX_REWRITES) * checks.max + MAX_REWRITES * 3),
    },
  };
}

export type SettleAll =
  | { ok: true; dataset: Dataset; reports: SettleReport[]; held: HeldQuestion[] }
  | { ok: false; reason: string; reports: SettleReport[]; held: HeldQuestion[] };

/**
 * The dataset with the pulse's themes and every pending pulse question settled from all parties'
 * positions: the publishable ones go into `questions`, every report into `approachReports`. A
 * question some published party has no position on is held back (`held`: not settled, not
 * published, no report) and the rest go ahead. Not ok on a simulated dataset or when the result
 * does not pass V9 (then nothing should be written).
 */
export async function settleAll(
  dataset: Dataset,
  pulse: Pulse,
  ai: AIAdapter,
  options: SettleOptions & { only?: readonly string[] } = {},
): Promise<SettleAll> {
  if (dataset.origin !== 'real') return { ok: false, reason: 'el dataset es simulado: procesa antes algún programa real', reports: [], held: [] };
  const { toSettle, held } = pending(dataset, pulse, options.only);
  // Questions are independent: settle them at once, then fold them in the pulse's order.
  const results = await Promise.all(
    toSettle.map((question) => settleApproaches({ question, positions: dataset.positions.filter((p) => p.question === question.id) }, ai, options)),
  );
  let settled: Pick<Dataset, 'questions' | 'approachReports'> = { questions: dataset.questions ?? [], approachReports: dataset.approachReports ?? [] };
  for (const result of results) settled = publishSettled(settled, result);
  const reports = results.map((r) => r.report);
  // The pulse's themes, plus those of published questions no longer in it (a published question stays).
  const questions = sortQuestions(settled.questions ?? []);
  const themes = pulseThemes(pulse.themes, dataset.themes, questions);
  const next: Dataset = { ...dataset, themes, ...settled, questions };
  const v = validateDataset(next);
  if (!v.valid) return { ok: false, reason: `V9: el dataset no valida: ${v.errors.join('; ')}`, reports, held };
  return { ok: true, dataset: next, reports, held };
}

/**
 * The settle step's AI cache (data/cache/ai). Keyed by the prompt version and each call's input,
 * never by the manifestos' hashes: every input already carries what it depends on (the question,
 * the proposing parties' quotes and proposals, the approaches checked), so a new manifesto only
 * misses the calls whose input it changes.
 */
export function settleCache(ai: AIAdapter, store: CacheStore): AIAdapter {
  return withCache(ai, store, { hashPdf: 'settle', promptVersion: SETTLE_PROMPT_VERSION });
}

const sortQuestions = (qs: Question[]) => [...qs].sort((a, b) => a.theme.localeCompare(b.theme) || a.order - b.order);
