// Late manifesto (#28): a party processed after the approaches were frozen is classified into them,
// question by question, without settling them again. Shared by the watcher and `npm run process`.
//
// "Frozen" = the questions of the published dataset (`origin: 'real'`, `questions`): their 3
// approaches were settled and people have played them, so their ids and texts never change. A
// question that is not published (settleApproaches gave up, or it was never settled) is left as it
// is: the party's position on it is still stored with the other positions, so the operator can
// settle it from scratch (`settleApproaches` without `frozen`) once there is enough to publish it.
import type { AIAdapter } from '../ai/adapter';
import type { Dataset, Position } from '../dataset/schema';
import { publishSettled, settleApproaches, type SettleOptions, type SettleReport } from './settle';

/** The published questions and their settle reports, with the late party in (via `publishSettled`). */
export type Settled = Pick<Dataset, 'questions' | 'approachReports'>;

export type LateClassification =
  /** `settled` undefined: nothing frozen, the dataset's questions are kept as the merge decides. */
  | { ok: true; settled: Settled | undefined; reports: SettleReport[] }
  | { ok: false; reason: string; reports: SettleReport[] };

/**
 * The published questions with `party` (re)classified from its new `positions`; everyone else
 * keeps its place. Not ok when any published question cannot be settled for this party: then
 * nothing of the party should be published (it would show up as "no propone nada" there).
 */
export async function classifyLateParty(
  dataset: Dataset,
  party: string,
  positions: readonly Position[],
  ai: AIAdapter,
  options: SettleOptions = {},
): Promise<LateClassification> {
  // A simulated dataset is replaced entirely by the first real manifesto: nothing is frozen yet.
  if (dataset.origin !== 'real' || !dataset.questions) return { ok: true, settled: undefined, reports: [] };
  let settledData: Settled = { questions: dataset.questions, approachReports: dataset.approachReports ?? [] };
  const reports: SettleReport[] = [];
  for (const published of dataset.questions) {
    const position = positions.find((p) => p.party === party && p.question === published.id);
    // Not processed in this run (not in its question list): the question stays as published.
    if (!position) continue;
    const { approaches, otherProposals, ...question } = published;
    const others = dataset.positions.filter((p) => p.question === published.id && p.party !== party);
    const settled = await settleApproaches(
      { question, positions: [...others, position], frozen: { approaches, otherProposals, parties: [party] } },
      ai,
      options,
    );
    reports.push(settled.report);
    // A failure leaves the published question and its report untouched (the party is blocked).
    if (!settled.question) return { ok: false, reason: `enfoques de ${published.id}: ${settled.report.reason ?? 'no publicable'}`, reports };
    settledData = publishSettled(settledData, settled);
  }
  return { ok: true, settled: settledData, reports };
}
