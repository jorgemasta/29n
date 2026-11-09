// The operator's settle step (`npm run settle`, #18): the frozen pulse (data/pulse.json, #23) gives
// the dataset its themes and the list of questions; every manifesto is processed against that list
// (`pulseQuestions`, used by `npm run process` and the watcher), so each party has a position on
// every pulse question, published or not. Once enough manifestos are in, this settles every pulse
// question that is not published yet from all parties' positions (`settleApproaches` without
// `frozen`) and publishes it (`publishSettled`). A published question is frozen: never settled again
// here (late manifestos are classified into it by the watcher, #28).
import type { AIAdapter } from '../ai/adapter';
import { validateDataset } from '../dataset';
import type { Dataset, Question } from '../dataset/schema';
import type { Pulse } from '../pulse';
import { GUESS_ROUNDS, MAX_REWRITES } from './approach-checks';
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

export interface SettleEstimate {
  /** Pulse questions to settle now, with how many parties propose something on each (0 = no AI call). */
  questions: { id: string; proposing: number }[];
  /** Pulse questions already published: frozen, skipped. */
  frozen: string[];
  /** AI calls: everything passing first time, and the worst case (retry round, every rewrite). */
  calls: { min: number; max: number };
}

/** Pulse questions not published yet (all of them, or those in `only`). */
function pending(dataset: Dataset, pulse: Pulse, only?: readonly string[]) {
  const published = new Set((dataset.questions ?? []).map((q) => q.id));
  const wanted = pulse.questions.filter((q) => !only || only.includes(q.id));
  return { toSettle: wanted.filter((q) => !published.has(q.id)), frozen: wanted.filter((q) => published.has(q.id)).map((q) => q.id) };
}

const proposingOn = (dataset: Dataset, question: string) =>
  dataset.positions.filter((p) => p.question === question && p.state === 'proposes' && p.quotes.length > 0).length;

/** The dry run of `npm run settle`: what would be settled and how many AI calls it would take. */
export function estimateSettle(dataset: Dataset, pulse: Pulse, only?: readonly string[]): SettleEstimate {
  const { toSettle, frozen } = pending(dataset, pulse, only);
  const questions = toSettle.map((q) => ({ id: q.id, proposing: proposingOn(dataset, q.id) }));
  // Per question: two passes per round; per round of checks, V10 on up to 3 approaches and the
  // V11 guesser; each rewrite asks for up to 3 approaches and checks them all again.
  const checks = { min: 1 + GUESS_ROUNDS, max: 3 + GUESS_ROUNDS };
  const asked = questions.filter((q) => q.proposing > 0).length;
  return {
    questions,
    frozen,
    calls: {
      min: asked * (2 + checks.min),
      max: asked * (2 * MAX_ROUNDS + (1 + MAX_REWRITES) * checks.max + MAX_REWRITES * 3),
    },
  };
}

export type SettleAll =
  | { ok: true; dataset: Dataset; reports: SettleReport[] }
  | { ok: false; reason: string; reports: SettleReport[] };

/**
 * The dataset with the pulse's themes and every pending pulse question settled from all parties'
 * positions: the publishable ones go into `questions`, every report into `approachReports`. Not ok
 * on a simulated dataset or when the result does not pass V9 (then nothing should be written).
 */
export async function settleAll(
  dataset: Dataset,
  pulse: Pulse,
  ai: AIAdapter,
  options: SettleOptions & { only?: readonly string[] } = {},
): Promise<SettleAll> {
  if (dataset.origin !== 'real') return { ok: false, reason: 'el dataset es simulado: procesa antes algún programa real', reports: [] };
  const { toSettle } = pending(dataset, pulse, options.only);
  let settled: Pick<Dataset, 'questions' | 'approachReports'> = { questions: dataset.questions ?? [], approachReports: dataset.approachReports ?? [] };
  const reports: SettleReport[] = [];
  for (const question of toSettle) {
    const positions = dataset.positions.filter((p) => p.question === question.id);
    const result = await settleApproaches({ question, positions }, ai, options);
    reports.push(result.report);
    settled = publishSettled(settled, result);
  }
  const next: Dataset = { ...dataset, themes: [...pulse.themes].sort((a, b) => a.order - b.order), ...settled, questions: sortQuestions(settled.questions ?? []) };
  const v = validateDataset(next);
  if (!v.valid) return { ok: false, reason: `V9: el dataset no valida: ${v.errors.join('; ')}`, reports };
  return { ok: true, dataset: next, reports };
}

const sortQuestions = (qs: Question[]) => [...qs].sort((a, b) => a.theme.localeCompare(b.theme) || a.order - b.order);
