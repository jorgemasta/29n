// Dataset schema: the contract between the data pipeline, the game engine and the web.
// Single source of truth: zod schemas give both the TS types and the published JSON Schema
// (`npm run schema` writes data/dataset.schema.json).
import { z } from 'zod';

const id = z.string().regex(/^[a-z0-9-]+$/, 'id en minúsculas, cifras y guiones');

export const Scope = z.discriminatedUnion('type', [
  z.object({ type: z.literal('national') }),
  /** Regional party: only shown to voters in these provinces (INE province codes, e.g. "08"). */
  z.object({ type: z.literal('provinces'), provinces: z.array(z.string()).min(1) }),
]);

/**
 * What kind of document a party's positions come from. Only the official 29N programme counts in
 * public; the others are provisional sources allowed only in the private prototype.
 */
export const SourceType = z.enum(['manifesto-29n', 'manifesto-2023', 'party-document', 'statements']);
export const PUBLIC_SOURCES: readonly SourceType[] = ['manifesto-29n'];
/** Sources usable in public ('public') or also provisional ones ('private', private prototype). */
export const Mode = z.enum(['public', 'private']);

export const Manifesto = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('published'),
    /** Source type of this document; absent means the official 29N programme. */
    source: SourceType.optional(),
    url: z.url(),
    title: z.string(),
    hashPdf: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    date: z.string().optional(),
  }),
  z.object({ state: z.literal('pending') }),
]);

export const Party = z.object({
  id,
  name: z.string().min(1),
  acronym: z.string().min(1),
  scope: Scope,
  manifesto: Manifesto,
  /** Placeholder data used only to fill the private prototype; never shown as real. */
  test: z.boolean().optional(),
});

export const Topic = z.object({
  id,
  title: z.string().min(1),
  /** Neutral question shown above the cards. */
  question: z.string().min(1),
  /** Plain-language explanation, only for topics with jargon. */
  explanation: z.string().optional(),
  scope: z.enum(['national', 'canarias']),
  /** Fixed, published order: vivienda first. */
  order: z.number().int(),
});

export const Quote = z.object({
  text: z.string().min(40).max(600),
  page: z.number().int().min(1),
});

/** Neutral rewrite with the common template: what / how / figure (optional). */
export const NeutralText = z.object({
  what: z.string().min(1),
  how: z.string().min(1),
  figure: z.string().min(1).nullable(),
});

export const Versions = z.object({ prompt: z.string() });

// Feasibility note (V13): two blind evaluations with the public rubric (src/registry/rubric.ts).
export const FeasibilityLevel = z.enum(['viable', 'viableWithCaveats', 'difficult', 'veryDifficult']);
/** What one evaluation can say: a level, or that the proposal is too vague to assess. */
export const AssessmentLevel = z.enum([...FeasibilityLevel.options, 'notConcrete']);
/** What is published: agreed level, both "sin concreción", or disagreement. */
export const FeasibilityResult = z.enum([...AssessmentLevel.options, 'noConsensus']);

/** Institutional source (V8: allowed domain, answered HTTP 200). */
export const Source = z.object({ title: z.string().min(1), url: z.url() });

/** One reason per rubric criterion. */
export const RubricReasons = z.object({
  competence: z.string().min(1),
  cost: z.string().min(1),
  legal: z.string().min(1),
  precedents: z.string().min(1),
  majority: z.string().min(1),
});

export const Assessment = z.object({
  level: AssessmentLevel,
  reasons: RubricReasons,
  /** The "por qué": 2–3 sentences. */
  why: z.string().min(1),
  sources: z.array(Source),
});

export const FeasibilityNote = z.object({
  result: FeasibilityResult,
  /** Published "por qué" and sources; absent when there is no consensus (both arguments shown). */
  why: z.string().min(1).nullable(),
  sources: z.array(Source),
  assessments: z.tuple([Assessment, Assessment]),
  versions: z.object({ prompt: z.string(), rubric: z.string() }),
});

/**
 * A party's concrete proposal on a question, in its own terms: what / how / figure with the exact
 * figures of its manifesto. Not neutralised: it is only shown at the reveal, never blind (blind,
 * the voter sees approaches).
 */
export const Proposal = z.object({
  what: z.string().min(1),
  how: z.string().min(1),
  figure: z.string().min(1).nullable(),
});

const basePosition = { party: id, question: id, versions: Versions };

/**
 * Position ("postura"): what one party says about one question, produced by `processManifesto`
 * (one per party × question) and the input of `settleApproaches`, which groups the `proposes` ones
 * into the question's 3 approaches. The reveal shows `proposal`, `quotes` and `feasibility`.
 */
export const Position = z.discriminatedUnion('state', [
  z.object({
    ...basePosition,
    state: z.literal('proposes'),
    proposal: Proposal,
    /** Literal quotes, verified in the PDF (V1) with their right page (V2). */
    quotes: z.array(Quote).min(1),
    /** Feasibility of this concrete proposal (V13, V8). */
    feasibility: FeasibilityNote.optional(),
  }),
  /** Confirmed absence (V12): "no propone nada". */
  z.object({ ...basePosition, state: z.literal('noProposal') }),
  /** Extracted but discarded by a check: "No pudimos verificar su propuesta". */
  z.object({ ...basePosition, state: z.literal('unverified') }),
]);

const baseTopicPosition = { party: id, topic: id, versions: Versions };

/**
 * v1 (legacy): one party's neutralised card on a topic. Only kept, under `topicPositions`, while the
 * v1 topic views, methodology and reports still read it (#24, #29 remove it); the pipeline no longer
 * produces it.
 */
export const TopicPosition = z.discriminatedUnion('state', [
  z.object({ ...baseTopicPosition, state: z.literal('proposes'), text: NeutralText, quotes: z.array(Quote).min(1), feasibility: FeasibilityNote.optional() }),
  z.object({ ...baseTopicPosition, state: z.literal('noProposal') }),
  z.object({ ...baseTopicPosition, state: z.literal('unverified') }),
]);

/**
 * Suggested question of the "Preguntar" tab. `keywords` are the public search terms used to
 * find the candidate pages of each programme ("cómo lo buscamos").
 */
export const SuggestedQuestion = z.object({
  id,
  text: z.string().min(1),
  keywords: z.array(z.string().min(1)).min(1),
  /** Fixed order of the suggestion buttons. */
  order: z.number().int(),
});

const baseAnswer = { party: id, question: id, versions: Versions };

/** One party's answer to one question (precomputed by the pipeline, or live in #15). */
export const SuggestedAnswer = z.discriminatedUnion('state', [
  /** Same template as a position (what / how / figure) and same checks: V1, V3–V6, V10. */
  z.object({ ...baseAnswer, state: z.literal('answers'), text: NeutralText, quotes: z.array(Quote).min(1) }),
  /** "El programa de X no lo menciona". */
  z.object({ ...baseAnswer, state: z.literal('notMentioned') }),
  /** It talks about it, but no answer passed the checks: "No pudimos verificar su respuesta". */
  z.object({ ...baseAnswer, state: z.literal('unverified') }),
]);

// v2 (#18): themes → questions → 3 approaches; each party's stance on each approach.

/**
 * Theme ("temática"): groups questions. National, or a regionalTheme ("Tu comunidad") with
 * `region` = the INE autonomous-community code (CODAUTO, e.g. "05" Canarias), shown only there.
 */
export const Theme = z.object({
  id,
  title: z.string().min(1),
  /** Fixed, published order (from the pulse). */
  order: z.number().int(),
  region: z.string().regex(/^\d{2}$/).optional(),
});

/** How a party fits an approach: full (1), partial (0.5) or none (0). */
export const Stance = z.enum(['full', 'partial', 'none']);

/** One party's stance on one approach; every stance other than "none" carries its quote. */
export const PartyStance = z.union([
  z.object({ party: id, stance: z.enum(['full', 'partial']), quote: Quote }),
  z.object({ party: id, stance: z.literal('none') }),
]);

/**
 * Approach ("enfoque"): one of the 3 options of a question, with the same what / how / figure
 * template as a neutral text and figures rounded to a common order of magnitude. A `filler`
 * approach is defended by no party: it was added to reach 3.
 */
export const Approach = z.object({
  id,
  ...NeutralText.shape,
  filler: z.boolean(),
  stances: z.array(PartyStance),
});

/** A party that fits no approach of a question ("propone otra cosa"), shown at the reveal. */
export const OtherProposal = z.object({ party: id, quote: Quote });

/** Why the pulse picked a question: a CIS barometer datum and/or how many manifestos address it. */
export const QuestionOrigin = z.object({
  cis: z.string().min(1).nullable(),
  manifestos: z.number().int().min(0),
});

/**
 * Question ("pregunta"): one blind choice inside a theme. Base questions are played first;
 * `followUp` ones ("para afinar") are offered after the theme. A published question always has
 * exactly 3 approaches.
 */
export const Question = z.object({
  id,
  theme: id,
  /** Neutral open question: "¿Qué harían…?". */
  text: z.string().min(1),
  /**
   * Public search terms of V12 ("cómo lo buscamos"): the pages where they appear get a second read
   * before a party is marked "no propone nada". From the pulse; absent, the question's own words.
   */
  keywords: z.array(z.string().min(1)).min(1).optional(),
  followUp: z.boolean(),
  /** Order within the theme (from the pulse). */
  order: z.number().int(),
  origin: QuestionOrigin,
  approaches: z.array(Approach).length(3, 'toda pregunta publicada tiene exactamente 3 enfoques'),
  otherProposals: z.array(OtherProposal),
});

export const Check = z.enum(['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10', 'V11', 'V12', 'V13']);

export const ReportEntry = z.object({
  /** Question of the position this entry is about. Absent for programme-level checks (V7) and suggested answers. */
  question: id.optional(),
  /** Suggested question this entry is about (answers, not positions). */
  suggestedQuestion: id.optional(),
  check: Check,
  /** `extract`: V12 found a proposal the first pass missed. `warning`: V11 internal warning, published anyway. */
  result: z.enum(['pass', 'fix', 'rewrite', 'discard', 'block', 'extract', 'warning']),
  detail: z.string(),
  /**
   * Party whose publication triggered this entry (a re-check of this party's published data).
   * Replaced each time that party is published.
   */
  origin: id.optional(),
});

/** Outcome of one position in the report: final state and why it was discarded. */
export const PositionSummary = z.object({
  question: id,
  state: z.enum(['proposes', 'noProposal', 'unverified']),
  reason: z.string().optional(),
});

/** One step of settling a question's approaches: `agreement` (the two passes) or a check V1–V13 on an approach. */
export const ApproachReportEntry = z.object({
  check: z.union([Check, z.literal('agreement')]),
  approach: z.string().optional(),
  result: z.enum([...ReportEntry.shape.result.options, 'retry']),
  detail: z.string(),
});

/**
 * Public report of settling one question's approaches (settleApproaches). An unpublishable one is
 * listed in the methodology ("preguntas no publicadas") with its reason, so it keeps text and theme.
 */
export const ApproachReport = z.object({
  question: z.string(),
  theme: z.string().optional(),
  text: z.string().optional(),
  promptVersion: z.string(),
  /** Rounds of two passes used (1, or 2 after a retry). */
  rounds: z.number().int().min(0),
  publishable: z.boolean(),
  reason: z.string().optional(),
  entries: z.array(ApproachReportEntry),
});

/** Public verification report, one per programme. */
export const Report = z.object({
  party: id,
  hashPdf: z.string().regex(/^[0-9a-f]{64}$/),
  /** Where the PDF was downloaded from (V7) and when. */
  url: z.string().optional(),
  date: z.string().optional(),
  promptVersion: z.string(),
  extracted: z.number().int().min(0),
  discarded: z.number().int().min(0),
  publishable: z.boolean(),
  reason: z.string().optional(),
  positions: z.array(PositionSummary),
  entries: z.array(ReportEntry),
});

export const Dataset = z
  .object({
    version: z.literal(2),
    generated: z.string(),
    /** "real": produced by the real AI on official PDFs. Anything else must be shown as such. */
    origin: z.enum(['real', 'simulated', 'test']),
    note: z.string().optional(),
    parties: z.array(Party),
    /** v1 (legacy) topics and their neutral cards: see TopicPosition. */
    topics: z.array(Topic),
    topicPositions: z.array(TopicPosition),
    /** One position per party × processed question (published in `questions` or not). */
    positions: z.array(Position),
    reports: z.array(Report),
    /** Suggested questions of the "Preguntar" tab and their precomputed answers. */
    suggestedQuestions: z.array(SuggestedQuestion).optional(),
    answers: z.array(SuggestedAnswer).optional(),
    /** v2: themes and their questions with 3 approaches each. Optional until v1 topics go away (#24). */
    themes: z.array(Theme).optional(),
    questions: z.array(Question).optional(),
    /** v2: one settle report per question, published or not (the unpublished ones say why). */
    approachReports: z.array(ApproachReport).optional(),
  })
  .superRefine((d, ctx) => {
    const parties = new Set(d.parties.map((p) => p.id));
    const topics = new Set(d.topics.map((t) => t.id));
    const seenTopic = new Set<string>();
    d.topicPositions.forEach((p, i) => {
      const key = `${p.party}/${p.topic}`;
      if (!parties.has(p.party)) ctx.addIssue({ code: 'custom', path: ['topicPositions', i, 'party'], message: `partido desconocido: ${p.party}` });
      if (!topics.has(p.topic)) ctx.addIssue({ code: 'custom', path: ['topicPositions', i, 'topic'], message: `tema desconocido: ${p.topic}` });
      if (seenTopic.has(key)) ctx.addIssue({ code: 'custom', path: ['topicPositions', i], message: `más de un estado para ${key}` });
      seenTopic.add(key);
    });
    // Positions: known party, at most one state per party × question. A position may be about a
    // question not in `questions` (processed but not published: settleApproaches found no 3 approaches).
    const seen = new Set<string>();
    d.positions.forEach((p, i) => {
      const key = `${p.party}/${p.question}`;
      if (!parties.has(p.party)) ctx.addIssue({ code: 'custom', path: ['positions', i, 'party'], message: `partido desconocido: ${p.party}` });
      if (seen.has(key)) ctx.addIssue({ code: 'custom', path: ['positions', i], message: `más de un estado para ${key}` });
      seen.add(key);
    });
    // Answers: known party and question, at most one per party × question. A missing answer is
    // allowed (a party processed before a question was added): it is simply not shown.
    const questions = new Set((d.suggestedQuestions ?? []).map((p) => p.id));
    const answered = new Set<string>();
    (d.answers ?? []).forEach((r, i) => {
      const key = `${r.party}/${r.question}`;
      if (!parties.has(r.party)) ctx.addIssue({ code: 'custom', path: ['answers', i, 'party'], message: `partido desconocido: ${r.party}` });
      if (!questions.has(r.question)) ctx.addIssue({ code: 'custom', path: ['answers', i, 'question'], message: `pregunta desconocida: ${r.question}` });
      if (answered.has(key)) ctx.addIssue({ code: 'custom', path: ['answers', i], message: `más de una respuesta para ${key}` });
      answered.add(key);
    });
    checkQuestions(d, parties, ctx);
  });

/**
 * V9 for v2: known theme and parties, unique ids, one stance per party × approach, no defended
 * filler. In a real dataset, also a position of every published party on every published question
 * (settleApproaches classified all of them; a missing one would show as "no propone nada").
 */
function checkQuestions(
  d: { origin: string; themes?: Theme[]; questions?: Question[]; parties: Party[]; positions: Position[] },
  parties: Set<string>,
  ctx: z.RefinementCtx,
) {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  const themes = new Set<string>();
  (d.themes ?? []).forEach((t, i) => {
    if (themes.has(t.id)) issue(['themes', i, 'id'], `temática repetida: ${t.id}`);
    themes.add(t.id);
  });
  const questions = new Set<string>();
  (d.questions ?? []).forEach((q, i) => {
    const at = ['questions', i];
    if (questions.has(q.id)) issue([...at, 'id'], `pregunta repetida: ${q.id}`);
    questions.add(q.id);
    if (!themes.has(q.theme)) issue([...at, 'theme'], `temática desconocida: ${q.theme}`);
    const approaches = new Set<string>();
    const defenders = new Set<string>();
    q.approaches.forEach((a, j) => {
      if (approaches.has(a.id)) issue([...at, 'approaches', j, 'id'], `enfoque repetido en ${q.id}: ${a.id}`);
      approaches.add(a.id);
      const seen = new Set<string>();
      a.stances.forEach((s, k) => {
        const path = [...at, 'approaches', j, 'stances', k];
        if (!parties.has(s.party)) issue(path, `partido desconocido: ${s.party}`);
        if (seen.has(s.party)) issue(path, `más de un nivel de ${s.party} en ${q.id}/${a.id}`);
        seen.add(s.party);
        if (s.stance === 'none') return;
        defenders.add(s.party);
        if (a.filler) issue(path, `el enfoque inventado ${q.id}/${a.id} no puede tener partidos que lo defiendan`);
      });
    });
    q.otherProposals.forEach((o, k) => {
      const path = [...at, 'otherProposals', k];
      if (!parties.has(o.party)) issue(path, `partido desconocido: ${o.party}`);
      if (defenders.has(o.party)) issue(path, `${o.party} defiende un enfoque de ${q.id} y a la vez propone otra cosa`);
    });
    if (d.origin !== 'real') return;
    for (const p of d.parties)
      if (p.manifesto.state === 'published' && !d.positions.some((x) => x.party === p.id && x.question === q.id))
        issue(at, `falta la postura de ${p.id} en la pregunta publicada ${q.id}`);
  });
}

export type SourceType = z.infer<typeof SourceType>;
export type Mode = z.infer<typeof Mode>;
export type Scope = z.infer<typeof Scope>;
export type Party = z.infer<typeof Party>;
export type Topic = z.infer<typeof Topic>;
export type Quote = z.infer<typeof Quote>;
export type NeutralText = z.infer<typeof NeutralText>;
export type Proposal = z.infer<typeof Proposal>;
export type Position = z.infer<typeof Position>;
export type TopicPosition = z.infer<typeof TopicPosition>;
export type AssessmentLevel = z.infer<typeof AssessmentLevel>;
export type FeasibilityResult = z.infer<typeof FeasibilityResult>;
export type Source = z.infer<typeof Source>;
export type Assessment = z.infer<typeof Assessment>;
export type FeasibilityNote = z.infer<typeof FeasibilityNote>;
export type SuggestedQuestion = z.infer<typeof SuggestedQuestion>;
export type SuggestedAnswer = z.infer<typeof SuggestedAnswer>;
export type ReportEntry = z.infer<typeof ReportEntry>;
export type PositionSummary = z.infer<typeof PositionSummary>;
export type Report = z.infer<typeof Report>;
export type Dataset = z.infer<typeof Dataset>;
export type Theme = z.infer<typeof Theme>;
export type Stance = z.infer<typeof Stance>;
export type PartyStance = z.infer<typeof PartyStance>;
export type Approach = z.infer<typeof Approach>;
export type OtherProposal = z.infer<typeof OtherProposal>;
export type QuestionOrigin = z.infer<typeof QuestionOrigin>;
export type Question = z.infer<typeof Question>;
export type ApproachReportEntry = z.infer<typeof ApproachReportEntry>;
export type ApproachReport = z.infer<typeof ApproachReport>;
