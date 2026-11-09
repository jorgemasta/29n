// Merging one processed programme into the published dataset (shared by `npm run process` and
// the watcher). Real data replaces simulated data entirely; the party's previous positions and
// report are replaced by the new ones, the other parties are kept as they were.
import { buildDataset, validateDataset } from '../dataset';
import type { Dataset, Party, SuggestedQuestion } from '../dataset/schema';
import { SUGGESTED_QUESTIONS } from '../registry/questions';
import type { ProcessResult } from './index';

export type Merge = { ok: true; dataset: Dataset } | { ok: false; reason: string };

/** New dataset with the programme published, or the V9 reason it cannot be. */
export function mergeManifesto(
  previous: Dataset,
  party: Party,
  result: ProcessResult,
  args: {
    /** Suggested questions (default: registry/questions). */
    suggestedQuestions?: SuggestedQuestion[];
    generated: string;
    date?: string;
    /** Party registry (src/registry/parties.ts): when given, every registered party without a
     * processed programme is listed as "⏳ programa pendiente", scope always comes from the
     * registry (criterion data may have changed) and parties no longer registered are dropped. */
    registry?: Record<string, Omit<Party, 'manifesto'>>;
  },
): Merge {
  if (!result.publishable) return { ok: false, reason: result.report.reason ?? 'no publicable' };
  if (party.manifesto.state !== 'published') return { ok: false, reason: 'el partido no tiene programa' };
  const priorData: Pick<Dataset, 'parties' | 'positions' | 'reports' | 'answers' | 'topics' | 'topicPositions' | 'themes' | 'questions'> =
    previous.origin === 'real' ? previous : { parties: [], positions: [], reports: [], answers: [], topics: [], topicPositions: [] };
  const withHash: Party = {
    ...party,
    manifesto: { ...party.manifesto, hashPdf: result.report.hashPdf, ...(args.date ? { date: args.date } : {}) },
  };
  const { registry } = args;
  const processed = [...priorData.parties.filter((p) => p.id !== party.id), withHash];
  const parties: Party[] = registry
    ? Object.values(registry).map(
        (base) => ({ ...base, manifesto: processed.find((p) => p.id === base.id)?.manifesto ?? { state: 'pending' } }) as Party,
      )
    : processed;
  const dataset = buildDataset({
    parties,
    // Themes and settled questions stay as they are: settleApproaches (#20) or the late-manifesto
    // classification (#28) place this party in their approaches.
    ...(priorData.themes ? { themes: priorData.themes } : {}),
    ...(priorData.questions ? { questions: priorData.questions } : {}),
    topics: priorData.topics,
    topicPositions: priorData.topicPositions.filter((p) => p.party !== party.id),
    suggestedQuestions: args.suggestedQuestions ?? SUGGESTED_QUESTIONS,
    results: [
      ...priorData.reports
        .filter((i) => i.party !== party.id && (!registry || registry[i.party]))
        .map((report) => ({
          report,
          positions: priorData.positions.filter((p) => p.party === report.party),
          // Answers to questions no longer suggested are dropped (V9 rejects unknown questions).
          answers: (priorData.answers ?? []).filter(
            (r) => r.party === report.party && (args.suggestedQuestions ?? SUGGESTED_QUESTIONS).some((q) => q.id === r.question),
          ),
        })),
      result,
    ],
    generated: args.generated,
    origin: 'real',
  });
  const v = validateDataset(dataset);
  if (!v.valid) return { ok: false, reason: `V9: el dataset no valida: ${v.errors.join('; ')}` };
  return { ok: true, dataset };
}
