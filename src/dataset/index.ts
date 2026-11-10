import {
  Dataset,
  PUBLIC_SOURCES,
  type Report,
  type Mode,
  type Party,
  type Position,
  type Question,
  type SuggestedQuestion,
  type Theme,
  type SuggestedAnswer,
  type Topic,
  type TopicPosition,
  type SourceType,
} from './schema';

export * from './schema';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** V9: the dataset validates against the schema (and one state per party × question). */
export function validateDataset(data: unknown): ValidationResult {
  const r = Dataset.safeParse(data);
  if (r.success) return { valid: true, errors: [] };
  return {
    valid: false,
    errors: r.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`),
  };
}

/** Assembles a dataset from per-programme pipeline results. Does not validate: call validateDataset. */
export function buildDataset(args: {
  parties: Party[];
  /** v1 (legacy) topics and their cards, while the v1 views still read them. */
  topics?: Topic[];
  topicPositions?: TopicPosition[];
  /** Suggested questions; their answers come from each result's `answers`. */
  suggestedQuestions?: SuggestedQuestion[];
  /** v2 themes and questions (with their approaches and stances). */
  themes?: Theme[];
  questions?: Question[];
  results: { positions: Position[]; report: Report; answers?: SuggestedAnswer[] }[];
  generated: string;
  origin: Dataset['origin'];
  note?: string;
}): Dataset {
  return {
    version: 2,
    generated: args.generated,
    origin: args.origin,
    ...(args.note ? { note: args.note } : {}),
    parties: args.parties,
    topics: [...(args.topics ?? [])].sort((a, b) => a.order - b.order),
    topicPositions: args.topicPositions ?? [],
    positions: args.results.flatMap((r) => r.positions),
    reports: args.results.map((r) => r.report),
    ...(args.suggestedQuestions
      ? {
          suggestedQuestions: [...args.suggestedQuestions].sort((a, b) => a.order - b.order),
          answers: args.results.flatMap((r) => r.answers ?? []),
        }
      : {}),
    ...(args.themes ? { themes: [...args.themes].sort((a, b) => a.order - b.order) } : {}),
    ...(args.questions ? { questions: [...args.questions].sort((a, b) => a.theme.localeCompare(b.theme) || a.order - b.order) } : {}),
  };
}

/** Source type of a party's document (absent = official 29N programme). Null if pending. */
export function sourceOf(p: Party): SourceType | null {
  return p.manifesto.state === 'published' ? (p.manifesto.source ?? 'manifesto-29n') : null;
}

export const isPrivateOnly = (t: SourceType) => !PUBLIC_SOURCES.includes(t);

/**
 * Mode switch. In 'public', parties whose only document is a provisional source (2023
 * programme, party document, public statements) count as "programme pending": their positions,
 * reports, answers, stances and "propone otra cosa" are dropped. 'privado' (private prototype) keeps everything.
 */
export function applyMode(d: Dataset, mode: Mode): Dataset {
  if (mode === 'private') return d;
  const provisionalIds = new Set(d.parties.filter((p) => { const f = sourceOf(p); return f !== null && isPrivateOnly(f); }).map((p) => p.id));
  if (provisionalIds.size === 0) return d;
  return {
    ...d,
    parties: d.parties.map((p) => (provisionalIds.has(p.id) ? { ...p, manifesto: { state: 'pending' } } : p)),
    positions: d.positions.filter((p) => !provisionalIds.has(p.party)),
    topicPositions: d.topicPositions.filter((p) => !provisionalIds.has(p.party)),
    reports: d.reports.filter((i) => !provisionalIds.has(i.party)),
    ...(d.answers ? { answers: d.answers.filter((r) => !provisionalIds.has(r.party)) } : {}),
    // v2: their stances and "propone otra cosa" go too. An approach only they defended is then
    // defended by nobody: it plays (and reveals) as a filler.
    ...(d.questions ? { questions: withoutParties(d.questions, provisionalIds) } : {}),
    // Settle report entries that name them (the passes' classifications) are not published.
    ...(d.approachReports
      ? { approachReports: d.approachReports.map((r) => ({ ...r, entries: r.entries.filter((e) => ![...provisionalIds].some((id) => namesParty(e.detail, id))) })) }
      : {}),
  };
}

/**
 * The questions with these parties taken out: no stance, no "propone otra cosa". An approach only
 * they defended is defended by nobody now: it becomes a filler (adds to nobody, reveals as such).
 */
export function withoutParties(questions: Question[], parties: ReadonlySet<string>): Question[] {
  return questions.map((q) => ({
    ...q,
    approaches: q.approaches.map((a) => {
      const stances = a.stances.filter((s) => !parties.has(s.party));
      return { ...a, stances, filler: a.filler || stances.every((s) => s.stance === 'none') };
    }),
    otherProposals: q.otherProposals.filter((o) => !parties.has(o.party)),
  }));
}

/** The text names this party id as a word (ids are lowercase slugs with hyphens). */
const namesParty = (text: string, id: string) => new RegExp(`(^|[^a-z0-9-])${id}($|[^a-z0-9-])`).test(text);
