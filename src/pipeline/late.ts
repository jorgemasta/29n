// Late manifesto (#28): a party processed after the approaches were frozen is classified into them,
// question by question, without settling them again. Shared by the watcher and `npm run process`.
//
// "Frozen" = the questions of the published dataset (`origin: 'real'`, `questions`): their 3
// approaches were settled and people have played them, so their ids and texts never change. A
// question that is not published (settleApproaches gave up, or it was never settled) is left as it
// is: the party's position on it is still processed (`npm run process` and the watcher process every
// question of the frozen pulse, `pulseQuestions`) and stored with the other positions, so the
// operator can settle it from scratch later (`npm run settle`: `settleAll`, src/pipeline/settle-all.ts).
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
  // Every published question needs the party's new position: its old one is replaced by the merge,
  // so a question left out of this run would lose it (and V9 would reject the dataset).
  const missing = dataset.questions.filter((q) => !positions.some((p) => p.party === party && p.question === q.id)).map((q) => q.id);
  if (missing.length)
    return { ok: false, reason: `sin postura de ${party} en la pregunta publicada ${missing.join(', ')}: procésalo con todas las preguntas publicadas (npm run process usa el pulso)`, reports: [] };
  // Questions are independent: settle them at once, then fold them in the published order.
  const results = await Promise.all(
    dataset.questions.map((published) => {
      const position = positions.find((p) => p.party === party && p.question === published.id)!;
      const { approaches, otherProposals, ...question } = published;
      const others = dataset.positions.filter((p) => p.question === published.id && p.party !== party);
      return settleApproaches({ question, positions: [...others, position], frozen: { approaches, otherProposals, parties: [party] } }, ai, options);
    }),
  );
  let settledData: Settled = { questions: dataset.questions, approachReports: dataset.approachReports ?? [] };
  const reports: SettleReport[] = [];
  for (const settled of results) {
    reports.push(settled.report);
    // A failure leaves the published question and its report untouched (the party is blocked).
    if (!settled.question) return { ok: false, reason: `enfoques de ${settled.report.question}: ${settled.report.reason ?? 'no publicable'}`, reports };
    settledData = publishSettled(settledData, settled);
  }
  return { ok: true, settled: settledData, reports };
}
