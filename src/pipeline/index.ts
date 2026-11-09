// Data pipeline (test point A). Single entry point:
//   processManifesto(pdf, party, ai) → { positions, report, publishable }
// Stages: V7 (source) → PDF text by page → per topic (`processTopic`): extract position (V12 confirms
// absences) → V1/V2 → neutralise with V3–V6 + V10 (`neutralize`, rewrite loop) → V11 over every
// position of the topic (`lowerRecognizability`) → V13/V8 → V9 → publication decision.
// Then the answers to the suggested questions (src/questions: V1, V3–V6, V10), which never block.
import type {
  Quote,
  ReportEntry,
  Report,
  Party,
  Position,
  Question,
  QuestionAnswer,
  PositionSummary,
  Topic,
  NeutralText,
} from '../dataset/schema';
import { Position as PositionSchema, QuestionAnswer as AnswerSchema } from '../dataset/schema';
import { answerQuestion, QUESTION_PROMPT_VERSION } from '../questions';
import { SUGGESTED_QUESTIONS } from '../registry/questions';
import type { AIAdapter } from '../ai/adapter';
import { cachedCheck, withCache, type CacheStore } from '../ai/cache';
import { TOPICS } from '../registry/topics';
import { PARTIES } from '../registry/parties';
import { KEYWORDS, type Keywords } from '../registry/keywords';
import { TERMS, type IdentifyingTerms } from '../registry/terms';
import { OFFICIAL_DOMAINS, type OfficialDomains } from '../registry/domains';
import { confirmAbsence } from './absence';
import { verifyQuote } from './checks';
import { verifyFidelity } from './fidelity';
import { verifySource } from './source';
import { countWords, cleanText, median, reviewText, MEDIAN_TOLERANCE, type TextCheck } from './text';
import { extractPages, hashPdf } from './pdf';
import type { ManifestoText } from '../questions/texts';
import {
  EXTRACT_INSTRUCTIONS,
  NEUTRALIZE_INSTRUCTIONS,
  ExtractResponse,
  NeutralizeResponse,
  VERSION_PROMPT,
} from './prompts';
import { checkRecognizability, type RecognizabilityResult } from './recognizability';
import { checkUrlHttp, assessFeasibility, type CheckUrl } from './feasibility';

export interface ProcessOptions {
  topics?: Topic[];
  terms?: IdentifyingTerms;
  cache?: CacheStore;
  promptVersion?: string;
  /** V12: keywords per topic for the second pass (default: registry/keywords). */
  keywords?: Keywords;
  /**
   * Already-published parties and positions (e.g. the current dataset). Their positions on each topic
   * go to the guesser with this one (V11) and set the topic median (V5); they are re-checked too,
   * and their findings come back in `revisions` (never rewritten here).
   */
  published?: { parties: Party[]; positions: Position[] };
  /** V11: parties the guesser chooses from (default: the registry, plus `published`'s parties). */
  parties?: Pick<Party, 'id' | 'name' | 'acronym'>[];
  /** V8 HTTP 200 check for feasibility sources (default: real fetch). */
  checkUrl?: CheckUrl;
  /** Official domains per party (V7). */
  domains?: OfficialDomains;
  /** Capture date of the PDF, recorded with its hash (V7). Defaults to the programme's date. */
  date?: string;
  /** Suggested questions to precompute answers for (default: registry/questions). */
  questions?: Question[];
}

export interface ProcessResult {
  positions: Position[];
  report: Report;
  publishable: boolean;
  /** One answer per suggested question (anonymous until revealed in the Preguntar tab). */
  answers: QuestionAnswer[];
  /**
   * Page text of the programme, published next to the site (public/texts/<party>.json) so the
   * live free question can answer and run V1/V2 on it. Null when blocked before reading the PDF (V7).
   */
  text: ManifestoText | null;
  /**
   * Findings on OTHER parties' published positions when this one joins the topic (V11 recognisable,
   * V5 outside the new median). `mergeManifesto` writes them into those parties' reports as warnings.
   */
  revisions: Revision[];
}

/** A warning about another party's published position, triggered by this programme. */
export interface Revision {
  party: string;
  topic: string;
  check: 'V5' | 'V11';
  detail: string;
}

/** Max rewrites after a failed rewrite-check before the position is discarded. */
export const MAX_RETRIES = 2;
/** A programme with more than this share of extracted positions discarded is blocked. */
export const MAX_DISCARD = 0.3;

export async function processManifesto(
  pdf: Uint8Array,
  party: Party,
  baseAi: AIAdapter,
  options: ProcessOptions = {},
): Promise<ProcessResult> {
  const promptVersion = options.promptVersion ?? VERSION_PROMPT;
  const hash = hashPdf(pdf);
  const cacheContext = { hashPdf: hash, promptVersion };
  const baseCheck = options.checkUrl ?? checkUrlHttp;
  const date = options.date ?? (party.manifesto.state === 'published' ? party.manifesto.date : undefined);
  const entries: ReportEntry[] = [];

  const report = (summary: PositionSummary[], tally: { extracted: number; discarded: number }, reasons: string[], url?: string): Report => ({
    party: party.id,
    hashPdf: hash,
    ...(url ? { url } : {}),
    ...(date ? { date } : {}),
    promptVersion,
    ...tally,
    publishable: reasons.length === 0,
    ...(reasons.length ? { reason: reasons.join('; ') } : {}),
    positions: summary,
    entries,
  });

  // V7: official source. A non-official PDF blocks the programme before any AI call.
  const source = verifySource(party, options.domains ?? OFFICIAL_DOMAINS);
  entries.push({ check: 'V7', result: source.ok ? 'pass' : 'block', detail: source.detail });
  if (!source.ok)
    return {
      positions: [],
      answers: [],
      text: null,
      revisions: [],
      publishable: false,
      report: report([], { extracted: 0, discarded: 0 }, [`V7: ${source.detail}`], source.url),
    };

  const published = options.published ?? { parties: [], positions: [] };
  const ctx: Context = {
    ai: options.cache ? withCache(baseAi, options.cache, cacheContext) : baseAi,
    party,
    hash,
    promptVersion,
    terms: options.terms ?? TERMS,
    keywords: options.keywords ?? KEYWORDS,
    pages: await extractPages(pdf),
    checkUrl: options.cache ? cachedCheck(baseCheck, options.cache, cacheContext) : baseCheck,
    others: published.positions.filter((p): p is ProposingPosition => p.party !== party.id && p.state === 'proposes'),
    candidates: v11Candidates(party, options.parties ?? Object.values(PARTIES), published.parties),
    entries,
  };

  const topics: TopicResult[] = [];
  for (const topic of options.topics ?? TOPICS) topics.push(await processTopic(ctx, topic));
  const positions = topics.map((t) => t.position);
  const tally = { extracted: topics.filter((t) => t.extracted).length, discarded: topics.filter((t) => t.discarded).length };

  // Suggested questions: one answer per question, with the same quote/marks/fidelity checks.
  // They never count towards the publication rule (a programme is not about our questions).
  const answers: QuestionAnswer[] = [];
  for (const question of options.questions ?? SUGGESTED_QUESTIONS) {
    const r = await answerQuestion(ctx.ai, question, ctx.pages, {
      terms: ctx.terms,
      annotate: (check, result, detail) => entries.push({ question: question.id, check, result, detail }),
    });
    const base = { party: party.id, question: question.id, versions: { prompt: QUESTION_PROMPT_VERSION } };
    if (r.state === 'answers') answers.push({ ...base, state: 'answers', text: r.text, quotes: r.quotes });
    else {
      if (r.state === 'notMentioned') entries.push({ question: question.id, check: 'V12', result: 'pass', detail: `no lo menciona: ${r.detail}` });
      answers.push({ ...base, state: r.state });
    }
  }

  // V9: every position validates against the schema (an invalid answer is just not published).
  const invalid = positions.filter((p) => !PositionSchema.safeParse(p).success);
  for (const p of invalid) entries.push({ topic: p.topic, check: 'V9', result: 'discard', detail: 'no valida contra el esquema' });
  const validAnswers = answers.filter((r) => {
    const ok = AnswerSchema.safeParse(r).success;
    if (!ok) entries.push({ question: r.question, check: 'V9', result: 'discard', detail: 'la respuesta no valida contra el esquema' });
    return ok;
  });

  // Publication rule: blocked if more than MAX_DISCARD of the extracted positions were discarded.
  const reasons: string[] = [];
  if (invalid.length) reasons.push(`${invalid.length} postura(s) no validan contra el esquema`);
  if (tally.extracted > 0 && tally.discarded / tally.extracted > MAX_DISCARD)
    reasons.push(`descartado el ${Math.round((tally.discarded / tally.extracted) * 100)} % de las posturas extraídas (máximo ${MAX_DISCARD * 100} %)`);

  return {
    positions,
    answers: validAnswers,
    text: { party: party.id, hashPdf: hash, pages: ctx.pages },
    revisions: topics.flatMap((t) => t.revisions),
    publishable: reasons.length === 0,
    report: report(
      topics.map((t) => t.summary),
      tally,
      reasons,
      source.url,
    ),
  };
}

type ProposingPosition = Extract<Position, { state: 'proposes' }>;
type AITopic = Pick<Topic, 'id' | 'title' | 'question'>;
type Annotate = (check: ReportEntry['check'], result: ReportEntry['result'], detail: string) => void;
/** A failed check on a neutral text, with what to tell the AI in the rewrite. */
interface Failure {
  check: ReportEntry['check'];
  detail: string;
  avoid?: string[];
  fix?: string;
}

/** What every topic of one programme shares. */
interface Context {
  ai: AIAdapter;
  party: Party;
  hash: string;
  promptVersion: string;
  terms: IdentifyingTerms;
  keywords: Keywords;
  pages: string[];
  checkUrl: CheckUrl;
  /** Other parties' published proposals (V5 median, V11). */
  others: ProposingPosition[];
  /** V11 party list, sorted by id (the order never hints at the party being processed). */
  candidates: Pick<Party, 'id' | 'name' | 'acronym'>[];
  entries: ReportEntry[];
}

interface TopicResult {
  position: Position;
  summary: PositionSummary;
  extracted: boolean;
  discarded: boolean;
  revisions: Revision[];
}

function v11Candidates(party: Party, ...lists: Pick<Party, 'id' | 'name' | 'acronym'>[][]) {
  const byId = new Map([party, ...lists.flat()].map(({ id, name, acronym }) => [id, { id, name, acronym }]));
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** One topic: extraction (V12) → quotes (V1/V2) → neutral text (V3–V6, V10) → V11 → feasibility (V13/V8). */
async function processTopic(ctx: Context, topic: Topic): Promise<TopicResult> {
  const base = { party: ctx.party.id, topic: topic.id, versions: { prompt: ctx.promptVersion } };
  const aiTopic: AITopic = { id: topic.id, title: topic.title, question: topic.question };
  const annotate: Annotate = (check, result, detail) => ctx.entries.push({ topic: topic.id, check, result, detail });
  const words = ctx.keywords[topic.id] ?? [topic.title];
  const noProposal = (rewrites: number, discarded: boolean, reason?: string): TopicResult => ({
    position: { ...base, state: 'noProposal' },
    summary: { topic: topic.id, state: 'noProposal', rewrites, ...(reason ? { reason } : {}) },
    extracted: discarded,
    discarded,
    revisions: [],
  });

  const extraction = await ctx.ai.complete({
    task: 'extract-position',
    instructions: EXTRACT_INSTRUCTIONS,
    input: { topic: aiTopic, pages: ctx.pages.map((text, i) => ({ page: i + 1, text })) },
    schema: ExtractResponse,
  });

  // V12: "proposes nothing" only after a second pass confirms it; if it finds something, extract it.
  let aiQuotes = extraction.proposes ? extraction.quotes : [];
  let absenceReviewed = false;
  if (aiQuotes.length === 0) {
    const v12 = await confirmAbsence(ctx.ai, aiTopic, ctx.pages, words);
    if (v12.confirmed) {
      annotate('V12', 'pass', v12.detail);
      return noProposal(0, false);
    }
    annotate('V12', 'extract', `la segunda pasada encontró ${v12.quotes.length} cita(s) que la primera no vio`);
    aiQuotes = v12.quotes;
    absenceReviewed = true;
  }

  /**
   * A discarded position shows as "proposes nothing" only if V12 confirms the absence;
   * otherwise as "No pudimos verificar su propuesta". Quotes already found in the PDF prove
   * there is a proposal, so V12 only runs when they were not verified.
   */
  const discard = async (failures: Failure[], rewrites: number, verifiedQuotes: boolean): Promise<TopicResult> => {
    for (const f of failures) annotate(f.check, 'discard', f.detail);
    const reason = failures.map((f) => `${f.check}: ${f.detail}`).join('; ');
    if (!verifiedQuotes && !absenceReviewed) {
      const v12 = await confirmAbsence(ctx.ai, aiTopic, ctx.pages, words);
      if (v12.confirmed) {
        annotate('V12', 'pass', `${v12.detail}; se muestra como "no propone nada"`);
        return noProposal(rewrites, true, reason);
      }
      annotate('V12', 'warning', 'la segunda pasada encontró una propuesta: se muestra como "No pudimos verificar su propuesta"');
    }
    return {
      position: { ...base, state: 'unverified' },
      summary: { topic: topic.id, state: 'unverified', rewrites, reason },
      extracted: true,
      discarded: true,
      revisions: [],
    };
  };

  // V1 + V2: every quote exists in the PDF (page fixed if needed).
  const quotes: Quote[] = [];
  const corrections: string[] = [];
  for (const quote of aiQuotes) {
    const r = verifyQuote(quote, ctx.pages);
    if (!r.ok) return discard([{ check: 'V1', detail: r.reason }], 0, false);
    if (r.fixedPage) corrections.push(`página ${quote.page} → ${r.quote.page}`);
    quotes.push(r.quote);
  }
  annotate('V1', 'pass', `${quotes.length} cita(s) localizadas`);
  if (corrections.length) for (const c of corrections) annotate('V2', 'fix', c);
  else annotate('V2', 'pass', 'páginas declaradas correctas');

  const neutral = await neutralize(ctx, aiTopic, quotes, annotate);
  if ('failures' in neutral) return discard(neutral.failures, neutral.rewrites, true);
  const v11 = await lowerRecognizability(ctx, aiTopic, quotes, neutral.text, annotate);

  // V13 + V8: double-blind feasibility note on the final neutral text.
  const feasibility = await assessFeasibility({
    ai: ctx.ai, topic: aiTopic, text: v11.text, quotes, terms: ctx.terms, checkUrl: ctx.checkUrl, annotate,
  });
  return {
    position: { ...base, state: 'proposes', text: v11.text, quotes, feasibility },
    summary: { topic: topic.id, state: 'proposes', rewrites: neutral.rewrites + v11.rewrites },
    extracted: true,
    discarded: false,
    revisions: [...v11.revisions, ...reviewLengths(ctx, topic.id, v11.text)],
  };
}

/** Word counts of the other parties' published proposals on a topic (V5 median). */
const lengthsOf = (ctx: Context, topicId: string) =>
  ctx.others.filter((p) => p.topic === topicId).map((p) => ({ party: p.party, words: countWords(p.text) }));

/**
 * Neutralise, then V3–V6 (deterministic) and V10 (independent fidelity check, only on a text that
 * passed V3–V6). Any failure is fed back to the next rewrite, up to MAX_RETRIES times.
 * `hint`: what gave the party away (V11).
 */
async function neutralize(
  ctx: Context,
  topic: AITopic,
  quotes: Quote[],
  annotate: Annotate,
  hint?: string[],
): Promise<({ text: NeutralText } | { failures: Failure[] }) & { rewrites: number }> {
  const topicLengths = lengthsOf(ctx, topic.id).map((l) => l.words);
  let avoid: string[] = [];
  let fix: string[] = [];
  for (let attempt = 0; ; attempt++) {
    const proposal = cleanText(
      await ctx.ai.complete({
        task: 'neutralize',
        instructions: NEUTRALIZE_INSTRUCTIONS,
        input: {
          topic,
          quotes,
          ...(avoid.length ? { avoid } : {}),
          ...(fix.length ? { fix } : {}),
          ...(hint?.length ? { hint } : {}),
        },
        schema: NeutralizeResponse,
      }),
    );
    const failures: Failure[] = reviewText(proposal, { quotes, terms: ctx.terms, topicLengths });
    if (failures.length === 0) {
      const fidelity = await verifyFidelity(ctx.ai, topic, quotes, proposal);
      if (fidelity.faithful) {
        const pass: Record<TextCheck | 'V10', string> = {
          V3: 'sin marcas identificativas',
          V4: 'cifras trazables a las citas',
          V5: 'longitud dentro del rango',
          V6: 'plantilla completa',
          V10: 'fiel a la cita según un verificador independiente',
        };
        for (const [check, detail] of Object.entries(pass)) annotate(check as TextCheck | 'V10', 'pass', detail);
        return { text: proposal, rewrites: attempt };
      }
      failures.push({ check: 'V10', detail: `no es fiel a la cita: ${fidelity.reason}`, fix: fidelity.reason });
    }
    if (attempt === MAX_RETRIES)
      return {
        failures: failures.map((f) => ({ check: f.check, detail: `${f.detail} (tras ${MAX_RETRIES} reintentos)` })),
        rewrites: attempt,
      };
    for (const f of failures) annotate(f.check, 'rewrite', f.detail);
    avoid = [...new Set([...avoid, ...failures.flatMap((f) => f.avoid ?? [])])];
    fix = failures.flatMap((f) => (f.fix ? [f.fix] : []));
  }
}

/**
 * V11: the guesser sees this text with every other published proposal of the topic. A recognisable
 * text is rewritten with the clue (up to MAX_RETRIES); if it persists it is published with an
 * internal warning. Other parties found recognisable come back as revisions, never rewritten here.
 */
async function lowerRecognizability(
  ctx: Context,
  topic: AITopic,
  quotes: Quote[],
  text: NeutralText,
  annotate: Annotate,
): Promise<{ text: NeutralText; rewrites: number; revisions: Revision[] }> {
  if (ctx.candidates.length < 2) {
    annotate('V11', 'pass', 'no aplica: no hay otros partidos entre los que elegir');
    return { text, rewrites: 0, revisions: [] };
  }
  const others = ctx.others.filter((p) => p.topic === topic.id).map((p) => ({ party: p.party, text: p.text }));
  let rewrites = 0;
  for (let round = 0; ; round++) {
    const verdicts = await checkRecognizability(ctx.ai, {
      topic,
      positions: [{ party: ctx.party.id, text }, ...others],
      parties: ctx.candidates,
      seed: `${ctx.hash}:${round}`,
    });
    const finish = () => ({ text, rewrites, revisions: v11Revisions(ctx, topic.id, verdicts) });
    const own = verdicts.get(ctx.party.id)!;
    if (!own.recognizable) {
      annotate('V11', 'pass', own.detail);
      return finish();
    }
    const hints = own.hints.join(' / ');
    if (round === MAX_RETRIES) {
      annotate('V11', 'warning', `sigue siendo reconocible tras ${MAX_RETRIES} reescrituras (${own.detail}; pista: ${hints}); se publica`);
      return finish();
    }
    annotate('V11', 'rewrite', `${own.detail}; pista: ${hints}`);
    rewrites++;
    const newOne = await neutralize(ctx, topic, quotes, annotate, own.hints);
    rewrites += newOne.rewrites;
    if ('failures' in newOne) {
      const checks = newOne.failures.map((f) => f.check).join(', ');
      annotate('V11', 'warning', `la reescritura no pasó ${checks}; se publica la versión anterior, reconocible (pista: ${hints})`);
      return finish();
    }
    text = newOne.text;
  }
}

const onPublishing = (ctx: Context) => `al publicarse el programa de ${ctx.party.name}`;
const willBeRewritten = 'se reescribirá cuando se vuelva a procesar su programa';

function v11Revisions(ctx: Context, topic: string, verdicts: Map<string, RecognizabilityResult>): Revision[] {
  return [...verdicts].flatMap(([party, v]) =>
    party !== ctx.party.id && v.recognizable
      ? [{ party, topic, check: 'V11' as const, detail: `${onPublishing(ctx)}, el adivinador la reconoce (${v.detail}; pista: ${v.hints.join(' / ')}); ${willBeRewritten}` }]
      : [],
  );
}

/** V5 re-check of the published proposals against the topic median with this text in it. */
function reviewLengths(ctx: Context, topic: string, text: NeutralText): Revision[] {
  const others = lengthsOf(ctx, topic);
  if (others.length === 0) return [];
  const m = median([...others.map((o) => o.words), countWords(text)])!;
  return others
    .filter((o) => Math.abs(o.words - m) > m * MEDIAN_TOLERANCE)
    .map((o) => ({
      party: o.party,
      topic,
      check: 'V5' as const,
      detail: `${onPublishing(ctx)}, tiene ${o.words} palabras, fuera del ±${MEDIAN_TOLERANCE * 100} % de la mediana del tema (${m}); ${willBeRewritten}`,
    }));
}
