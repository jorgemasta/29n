// Data pipeline (test point A). Single entry point:
//   processManifesto(pdf, party, ai, { questions }) → { positions, report, publishable }
// Stages: V7 (source) → PDF text by page → per question (`processQuestion`): extract the party's
// position with its quotes and concrete proposal (V12 confirms absences) → V1/V2 → V6 (proposal
// complete) → V13/V8 (feasibility of the proposal) → V9 → publication decision.
// Nothing is neutralised here: blind, the voter only sees approaches, written by `settleApproaches`
// from these positions (where V3–V5, V10 and V11 now apply). The party's own proposal is shown at the reveal.
// Then the answers to the suggested questions (src/questions: V1, V3–V6, V10), which never block.
import type {
  Quote,
  ReportEntry,
  Report,
  Party,
  Position,
  Proposal,
  Question,
  SuggestedQuestion,
  SuggestedAnswer,
  PositionSummary,
} from '../dataset/schema';
import { Position as PositionSchema, SuggestedAnswer as AnswerSchema } from '../dataset/schema';
import { answerQuestion, QUESTION_PROMPT_VERSION } from '../questions';
import { SUGGESTED_QUESTIONS } from '../registry/questions';
import type { AIAdapter } from '../ai/adapter';
import { cachedCheck, withCache, type CacheStore } from '../ai/cache';
import { TERMS, type IdentifyingTerms } from '../registry/terms';
import { OFFICIAL_DOMAINS, type OfficialDomains } from '../registry/domains';
import { confirmAbsence } from './absence';
import { verifyQuote } from './checks';
import { verifySource } from './source';
import { extractPages, hashPdf } from './pdf';
import type { ManifestoText } from '../questions/texts';
import { EXTRACT_INSTRUCTIONS, ExtractResponse, VERSION_PROMPT } from './prompts';
import { checkUrlHttp, assessFeasibility, type CheckUrl } from './feasibility';

/**
 * A question to extract positions for: from the pulse's frozen list (#23) or the dataset's questions.
 * `keywords` are V12's search terms; without them, the words of the question itself.
 */
export type QuestionToProcess = Pick<Question, 'id' | 'text' | 'keywords'>;

export interface ProcessOptions {
  /** One position per question, in this order. */
  questions: QuestionToProcess[];
  terms?: IdentifyingTerms;
  cache?: CacheStore;
  promptVersion?: string;
  /** V8 HTTP 200 check for feasibility sources (default: real fetch). */
  checkUrl?: CheckUrl;
  /** Official domains per party (V7). */
  domains?: OfficialDomains;
  /** Capture date of the PDF, recorded with its hash (V7). Defaults to the programme's date. */
  date?: string;
  /** Suggested questions to precompute answers for (default: registry/questions). */
  suggestedQuestions?: SuggestedQuestion[];
}

export interface ProcessResult {
  /** One per question: what `settleApproaches` groups into approaches, and the reveal shows. */
  positions: Position[];
  report: Report;
  publishable: boolean;
  /** One answer per suggested question (anonymous until revealed in the Preguntar tab). */
  answers: SuggestedAnswer[];
  /**
   * Page text of the programme, published next to the site (public/texts/<party>.json) so the
   * live free question can answer and run V1/V2 on it. Null when blocked before reading the PDF (V7).
   */
  text: ManifestoText | null;
}

/** A programme with more than this share of extracted positions discarded is blocked. */
export const MAX_DISCARD = 0.3;

export async function processManifesto(
  pdf: Uint8Array,
  party: Party,
  baseAi: AIAdapter,
  options: ProcessOptions,
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
      publishable: false,
      report: report([], { extracted: 0, discarded: 0 }, [`V7: ${source.detail}`], source.url),
    };

  const ctx: Context = {
    ai: options.cache ? withCache(baseAi, options.cache, cacheContext) : baseAi,
    party,
    promptVersion,
    terms: options.terms ?? TERMS,
    pages: await extractPages(pdf),
    checkUrl: options.cache ? cachedCheck(baseCheck, options.cache, cacheContext) : baseCheck,
    entries,
  };

  const questions: QuestionResult[] = [];
  for (const question of options.questions) questions.push(await processQuestion(ctx, question));
  const positions = questions.map((q) => q.position);
  const tally = { extracted: questions.filter((q) => q.extracted).length, discarded: questions.filter((q) => q.discarded).length };

  // Suggested questions: one answer per question, with the same quote/marks/fidelity checks.
  // They never count towards the publication rule (a programme is not about our questions).
  const answers: SuggestedAnswer[] = [];
  for (const question of options.suggestedQuestions ?? SUGGESTED_QUESTIONS) {
    const r = await answerQuestion(ctx.ai, question, ctx.pages, {
      terms: ctx.terms,
      annotate: (check, result, detail) => entries.push({ suggestedQuestion: question.id, check, result, detail }),
    });
    const base = { party: party.id, question: question.id, versions: { prompt: QUESTION_PROMPT_VERSION } };
    if (r.state === 'answers') answers.push({ ...base, state: 'answers', text: r.text, quotes: r.quotes });
    else {
      if (r.state === 'notMentioned') entries.push({ suggestedQuestion: question.id, check: 'V12', result: 'pass', detail: `no lo menciona: ${r.detail}` });
      answers.push({ ...base, state: r.state });
    }
  }

  // V9: every position validates against the schema (an invalid answer is just not published).
  const invalid = positions.filter((p) => !PositionSchema.safeParse(p).success);
  for (const p of invalid) entries.push({ question: p.question, check: 'V9', result: 'discard', detail: 'no valida contra el esquema' });
  const validAnswers = answers.filter((r) => {
    const ok = AnswerSchema.safeParse(r).success;
    if (!ok) entries.push({ suggestedQuestion: r.question, check: 'V9', result: 'discard', detail: 'la respuesta no valida contra el esquema' });
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
    publishable: reasons.length === 0,
    report: report(
      questions.map((q) => q.summary),
      tally,
      reasons,
      source.url,
    ),
  };
}

type Annotate = (check: ReportEntry['check'], result: ReportEntry['result'], detail: string) => void;
/** A failed check on a position, recorded in the report. */
interface Failure {
  check: ReportEntry['check'];
  detail: string;
}

/** What every question of one programme shares. */
interface Context {
  ai: AIAdapter;
  party: Party;
  promptVersion: string;
  terms: IdentifyingTerms;
  pages: string[];
  checkUrl: CheckUrl;
  entries: ReportEntry[];
}

interface QuestionResult {
  position: Position;
  summary: PositionSummary;
  extracted: boolean;
  discarded: boolean;
}

/** V12's search terms: the question's keywords, else its own words of 4+ letters. */
const keywordsOf = (q: QuestionToProcess) =>
  q.keywords?.length ? q.keywords : [...new Set(q.text.toLowerCase().match(/[\p{L}]{4,}/gu) ?? [])].filter((w) => !STOPWORDS.has(w));
const STOPWORDS = new Set(['harían', 'harian', 'hacer', 'para', 'como', 'cómo', 'cuál', 'cual', 'cuánto', 'cuanto', 'debería', 'deberia', 'sobre', 'entre', 'esta', 'este', 'estos', 'estas', 'tienen', 'tiene', 'sean', 'quién', 'quien', 'dónde', 'donde']);

/** Trims the proposal; an empty figure becomes null (the figure is optional). Null if none came back. */
function cleanProposal(p: { what: string; how: string; figure: string | null } | null): Proposal | null {
  if (!p) return null;
  const figure = p.figure?.trim() || null;
  return { what: p.what.trim(), how: p.how.trim(), figure };
}

/** One question: extraction (V12) → quotes (V1/V2) → proposal complete (V6) → feasibility (V13/V8). */
async function processQuestion(ctx: Context, question: QuestionToProcess): Promise<QuestionResult> {
  const base = { party: ctx.party.id, question: question.id, versions: { prompt: ctx.promptVersion } };
  const aiQuestion = { id: question.id, text: question.text };
  const annotate: Annotate = (check, result, detail) => ctx.entries.push({ question: question.id, check, result, detail });
  const words = keywordsOf(question);
  const noProposal = (discarded: boolean, reason?: string): QuestionResult => ({
    position: { ...base, state: 'noProposal' },
    summary: { question: question.id, state: 'noProposal', ...(reason ? { reason } : {}) },
    extracted: discarded,
    discarded,
  });

  let found = await ctx.ai.complete({
    task: 'extract-position',
    instructions: EXTRACT_INSTRUCTIONS,
    input: { question: aiQuestion, pages: ctx.pages.map((text, i) => ({ page: i + 1, text })) },
    schema: ExtractResponse,
  });

  // V12: "proposes nothing" only after a second pass confirms it; if it finds something, extract it.
  let absenceReviewed = false;
  if (!found.proposes || found.quotes.length === 0) {
    const v12 = await confirmAbsence(ctx.ai, aiQuestion, ctx.pages, words);
    if (v12.confirmed) {
      annotate('V12', 'pass', v12.detail);
      return noProposal(false);
    }
    annotate('V12', 'extract', `la segunda pasada encontró ${v12.found.quotes.length} cita(s) que la primera no vio`);
    found = v12.found;
    absenceReviewed = true;
  }

  /**
   * A discarded position shows as "proposes nothing" only if V12 confirms the absence;
   * otherwise as "No pudimos verificar su propuesta". Quotes already found in the PDF prove
   * there is a proposal, so V12 only runs when they were not verified.
   */
  const discard = async (failures: Failure[], verifiedQuotes: boolean): Promise<QuestionResult> => {
    for (const f of failures) annotate(f.check, 'discard', f.detail);
    const reason = failures.map((f) => `${f.check}: ${f.detail}`).join('; ');
    if (!verifiedQuotes && !absenceReviewed) {
      const v12 = await confirmAbsence(ctx.ai, aiQuestion, ctx.pages, words);
      if (v12.confirmed) {
        annotate('V12', 'pass', `${v12.detail}; se muestra como "no propone nada"`);
        return noProposal(true, reason);
      }
      annotate('V12', 'warning', 'la segunda pasada encontró una propuesta: se muestra como "No pudimos verificar su propuesta"');
    }
    return {
      position: { ...base, state: 'unverified' },
      summary: { question: question.id, state: 'unverified', reason },
      extracted: true,
      discarded: true,
    };
  };

  // V1 + V2: every quote exists in the PDF (page fixed if needed).
  const quotes: Quote[] = [];
  const corrections: string[] = [];
  for (const quote of found.quotes) {
    const r = verifyQuote(quote, ctx.pages);
    if (!r.ok) return discard([{ check: 'V1', detail: r.reason }], false);
    if (r.fixedPage) corrections.push(`página ${quote.page} → ${r.quote.page}`);
    quotes.push(r.quote);
  }
  annotate('V1', 'pass', `${quotes.length} cita(s) localizadas`);
  if (corrections.length) for (const c of corrections) annotate('V2', 'fix', c);
  else annotate('V2', 'pass', 'páginas declaradas correctas');

  // V6: the concrete proposal shown at the reveal says what and how.
  const proposal = cleanProposal(found.proposal);
  const missing = !proposal ? 'la propuesta' : [!proposal.what && 'qué', !proposal.how && 'cómo'].filter(Boolean).join(' y ');
  if (!proposal || missing) return discard([{ check: 'V6', detail: `falta ${missing} en la propuesta concreta` }], true);

  // V13 + V8: double-blind feasibility note on the concrete proposal.
  const feasibility = await assessFeasibility({
    ai: ctx.ai, question: aiQuestion, proposal, quotes, terms: ctx.terms, checkUrl: ctx.checkUrl, annotate,
  });
  return {
    position: { ...base, state: 'proposes', proposal, quotes, feasibility },
    summary: { question: question.id, state: 'proposes' },
    extracted: true,
    discarded: false,
  };
}
