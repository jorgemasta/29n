// settleApproaches (#20, test point A'): every party's position on one question → the 3 approaches
// of that question, each party's stance on each of them, and a publication verdict.
//
// Two independent AI passes (different party order) must agree; they agree when they classify the
// parties the same way: the same 3 approaches by defenders and stance, whatever the wording. The
// first pass's wording is kept. On disagreement (or an invalid pass) both passes are retried once;
// if they still disagree the question is not published and the report says why.
//
// Then every approach check (V3, V4, V5, V6, V10, V11 by default, approach-checks.ts) runs on each
// approach; a `discard` finding gets the approach rewritten (at most MAX_REWRITES times, never a
// frozen one), a `block` or a failure that outlives the rewrites makes the question unpublishable.
// Late manifesto (#28): with `input.frozen` (a published question) the approaches are not settled
// again. Only `frozen.parties` are classified into them (the AI sees only their quotes, with the
// frozen approaches); every other party keeps the stance it was published with, and a classified
// party that fits none "proposes something else". The same two passes must agree and the same
// checks run, but a frozen approach is never rewritten: a failing check makes it unpublishable.
import { z } from 'zod';
import type { AIAdapter } from '../ai/adapter';
import {
  ApproachReport,
  ApproachReportEntry,
  Check,
  type Dataset,
  Question,
  type Approach,
  type OtherProposal,
  type PartyStance,
  type Position,
  type Quote,
  ReportEntry,
} from '../dataset/schema';
import { defaultApproachChecks, MAX_REWRITES, rewriteApproach } from './approach-checks';
import { QUOTE_LENGTH } from './checks';
import { normalizeQuote } from './normalize';
import { SETTLE_INSTRUCTIONS, SETTLE_PROMPT_VERSION, SettleResponse } from './prompts-settle';

/** A question as the pulse publishes it, before its approaches are settled. */
export type QuestionSpec = Omit<Question, 'approaches' | 'otherProposals'>;

/** The part of a party's `Position` on the question that settling needs. */
export interface SettlePosition {
  party: string;
  state: Position['state'];
  quotes?: readonly Quote[];
}

/** A published question whose approaches are frozen, and the parties to (re)classify into them (#28). */
export interface FrozenQuestion {
  approaches: readonly Approach[];
  otherProposals: readonly OtherProposal[];
  /** Parties with a new or changed manifesto. Everyone else keeps its published stances. */
  parties: readonly string[];
}

export interface SettleInput {
  question: QuestionSpec;
  /** Every party's position on the question (the checks look at all of them). */
  positions: readonly SettlePosition[];
  /** Already-published approaches of this question: kept as they are, only `parties` classified (#28). */
  frozen?: FrozenQuestion;
}

export interface ApproachFinding {
  check: z.infer<typeof Check>;
  result: ReportEntry['result'];
  detail: string;
  /** `discard` only: what to tell the AI when rewriting the approach. */
  fix?: string;
}

/**
 * A check on one settled approach (#22). `discard`: the approach is rewritten (limited attempts);
 * `block`: the question is unpublishable straight away.
 */
export type ApproachCheck = (
  approach: Approach,
  context: { question: QuestionSpec; approaches: readonly Approach[]; positions: readonly SettlePosition[]; ai: AIAdapter },
) => Promise<ApproachFinding[]>;

export interface SettleOptions {
  /** Defaults to `defaultApproachChecks()` (V3, V4, V5, V6, V10, V11 with the registry terms and parties). */
  checks?: readonly ApproachCheck[];
}

/** Two passes per round; one retry. */
export const MAX_ROUNDS = 2;

/** The settle report lives in the dataset schema (`approachReports`), so the site can show it. */
export const SettleEntry = ApproachReportEntry;
export const SettleReport = ApproachReport;
export type SettleEntry = z.infer<typeof SettleEntry>;
export type SettleReport = z.infer<typeof SettleReport>;

export interface SettleResult {
  /** The question with its 3 approaches; null when not publishable. */
  question: Question | null;
  publishable: boolean;
  report: SettleReport;
}

interface Classification {
  approaches: Approach[];
  otherProposals: OtherProposal[];
}

type PassResult = { ok: true; classification: Classification } | { ok: false; reason: string };

export async function settleApproaches(input: SettleInput, ai: AIAdapter, options: SettleOptions = {}): Promise<SettleResult> {
  const { question } = input;
  const entries: SettleEntry[] = [];
  const proposing = input.positions.filter((p) => p.state === 'proposes' && (p.quotes?.length ?? 0) > 0);
  const result = (publishable: boolean, rounds: number, q: Question | null, reason?: string): SettleResult => ({
    question: publishable ? q : null,
    publishable,
    report: { question: question.id, theme: question.theme, text: question.text, promptVersion: SETTLE_PROMPT_VERSION, rounds, publishable, ...(reason ? { reason } : {}), entries },
  });

  const { frozen } = input;
  if (frozen) {
    // Only the late parties are classified; with no proposal among them nothing is asked.
    const late = proposing.filter((p) => frozen.parties.includes(p.party));
    if (late.length === 0) {
      const parsed = Question.safeParse({ ...question, ...mergeFrozen(frozen, [], { approaches: frozen.approaches.map(() => new Map()), otherProposals: [] }) });
      if (parsed.success) return result(true, 0, parsed.data);
      return result(false, 0, null, `esquema no válido: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
    }
    return settle(input, late, ai, options, entries, result);
  }
  if (proposing.length === 0) return result(false, 0, null, 'ningún partido propone nada en esta pregunta');
  return settle(input, proposing, ai, options, entries, result);
}

/** The two passes, the checks and V9; `proposing` are the parties the AI classifies. */
async function settle(
  input: SettleInput,
  proposing: readonly SettlePosition[],
  ai: AIAdapter,
  options: SettleOptions,
  entries: SettleEntry[],
  result: (publishable: boolean, rounds: number, q: Question | null, reason?: string) => SettleResult,
): Promise<SettleResult> {
  const { question } = input;

  let settled: Classification | null = null;
  let rounds = 0;
  while (!settled && rounds < MAX_ROUNDS) {
    rounds++;
    const first = await runPass(ai, input, proposing, 1, rounds);
    const second = await runPass(ai, input, proposing, 2, rounds);
    const disagreement = !first.ok ? `pasada 1 no válida: ${first.reason}` : !second.ok ? `pasada 2 no válida: ${second.reason}` : differences(first.classification, second.classification);
    if (!disagreement && first.ok) {
      settled = first.classification;
      entries.push({ check: 'agreement', result: 'pass', detail: `las dos pasadas coinciden (ronda ${rounds})` });
    } else {
      entries.push({ check: 'agreement', result: rounds < MAX_ROUNDS ? 'retry' : 'block', detail: `ronda ${rounds}: ${disagreement}` });
    }
  }
  if (!settled) return result(false, rounds, null, `las dos pasadas no coinciden tras ${MAX_ROUNDS} rondas`);

  const approaches = await checkApproaches(input, settled.approaches, ai, options.checks ?? defaultApproachChecks(), entries);
  const blocked = entries.find((e) => e.check !== 'agreement' && e.result === 'block');
  if (blocked || !approaches) return result(false, rounds, null, blocked ? `${blocked.check} en ${blocked.approach}: ${blocked.detail}` : 'no pasa las comprobaciones');
  const full: Question = { ...question, ...settled, approaches };

  // V9: what is returned always fits the published schema.
  const parsed = Question.safeParse(full);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    entries.push({ check: 'V9', result: 'block', detail });
    return result(false, rounds, null, `esquema no válido: ${detail}`);
  }
  return result(true, rounds, parsed.data);
}

/**
 * Runs every check on every approach; rewrites the approaches with a `discard` finding and checks
 * them all again (lengths depend on each other), up to MAX_REWRITES times. Returns the approaches
 * that pass, or null after logging the failures as `block`.
 */
async function checkApproaches(input: SettleInput, settled: Approach[], ai: AIAdapter, checks: readonly ApproachCheck[], entries: SettleEntry[]): Promise<Approach[] | null> {
  let approaches = settled;
  for (let attempt = 0; ; attempt++) {
    const findings: { approach: Approach; finding: ApproachFinding }[] = [];
    for (const approach of approaches) {
      for (const check of checks) {
        const found = await check(approach, { question: input.question, approaches, positions: input.positions, ai });
        findings.push(...found.map((finding) => ({ approach, finding })));
      }
    }
    const entry = ({ approach, finding }: (typeof findings)[number], result: SettleEntry['result']): SettleEntry => ({ check: finding.check, approach: approach.id, result, detail: finding.detail });
    const failing = findings.filter((f) => f.finding.result === 'discard' || f.finding.result === 'block');
    const rewritable = failing.length > 0 && failing.every((f) => f.finding.result === 'discard') && attempt < MAX_REWRITES && !input.frozen;
    if (!rewritable) {
      entries.push(...findings.map((f) => entry(f, f.finding.result === 'discard' ? 'block' : f.finding.result)));
      return failing.length ? null : approaches;
    }
    entries.push(...failing.map((f) => entry(f, 'rewrite')));
    const next: Approach[] = [];
    for (const approach of approaches) {
      const fixes = failing.filter((f) => f.approach === approach).map((f) => f.finding.fix ?? f.finding.detail);
      next.push(fixes.length ? await rewriteApproach(ai, input.question, approach, fixes) : approach);
    }
    approaches = next;
  }
}

async function runPass(ai: AIAdapter, input: SettleInput, proposing: readonly SettlePosition[], pass: 1 | 2, round: number): Promise<PassResult> {
  // Independent passes see the parties in a different order; `pass`/`round` keep cache keys apart.
  const ordered = pass === 1 ? proposing : [...proposing].reverse();
  const answer = await ai.complete({
    task: 'settle-approaches',
    instructions: SETTLE_INSTRUCTIONS,
    input: {
      question: { id: input.question.id, text: input.question.text },
      pass,
      round,
      positions: ordered.map((p) => ({ party: p.party, quotes: (p.quotes ?? []).map((q) => q.text) })),
      ...(input.frozen ? { frozenApproaches: input.frozen.approaches.map(({ what, how, figure, filler }) => ({ what, how, figure, filler })) } : {}),
    },
    schema: SettleResponse,
  });
  return readPass(answer, input, proposing);
}

/** Validates one pass and turns it into a classification of every proposing party. */
function readPass(answer: SettleResponse, input: SettleInput, proposing: readonly SettlePosition[]): PassResult {
  const fail = (reason: string): PassResult => ({ ok: false, reason });
  if (answer.approaches.length !== 3) return fail(`devuelve ${answer.approaches.length} enfoques en vez de 3`);
  const byParty = new Map(proposing.map((p) => [p.party, p]));
  const approaches: Approach[] = [];
  const levelsByApproach: Map<string, PartyStance>[] = [];
  const defenders = new Set<string>();
  for (const [i, a] of answer.approaches.entries()) {
    const levels = new Map<string, PartyStance>();
    for (const s of a.stances) {
      const position = byParty.get(s.party);
      if (!position) return fail(`clasifica a ${s.party}, que no propone nada en esta pregunta`);
      if (levels.has(s.party)) return fail(`da más de un nivel a ${s.party} en el enfoque ${i + 1}`);
      const quote = findQuote(s.quote, position);
      if (!quote) return fail(`la cita de ${s.party} en el enfoque ${i + 1} no está en su postura`);
      levels.set(s.party, { party: s.party, stance: s.stance, quote });
      defenders.add(s.party);
    }
    levelsByApproach.push(levels);
    if (input.frozen) continue;
    const filler = levels.size === 0;
    approaches.push({
      id: `${input.question.id}-${i + 1}`,
      what: a.what,
      how: a.how,
      figure: a.figure,
      filler,
      stances: proposing.map((p) => levels.get(p.party) ?? { party: p.party, stance: 'none' as const }),
    });
  }
  // Whoever fits no approach "proposes something else", shown at the reveal with its first quote.
  const otherProposals = proposing.filter((p) => !defenders.has(p.party)).map((p) => ({ party: p.party, quote: { ...p.quotes![0]! } }));
  if (input.frozen) return { ok: true, classification: mergeFrozen(input.frozen, proposing, { approaches: levelsByApproach, otherProposals }) };
  if (approaches.every((a) => a.filler)) return fail('ningún enfoque lo defiende un partido');
  return { ok: true, classification: { approaches, otherProposals } };
}

/**
 * The frozen question with `frozen.parties` taken out and the late classification put in: same
 * ids and texts, everyone else's stances untouched. A filler approach a late party defends is no
 * longer filler (its text stays: it was plausible enough to be someone's proposal).
 */
function mergeFrozen(
  frozen: FrozenQuestion,
  classified: readonly SettlePosition[],
  late: { approaches: readonly Map<string, PartyStance>[]; otherProposals: readonly OtherProposal[] },
): Classification {
  const reclassified = new Set(frozen.parties);
  const approaches = frozen.approaches.map((a, i) => {
    const levels = late.approaches[i]!;
    const levelOf = (party: string): PartyStance => levels.get(party) ?? { party, stance: 'none' };
    // A reclassified party keeps its slot (or leaves it, without a proposal now); new ones go last.
    const stances = [
      ...a.stances.flatMap((s) => (!reclassified.has(s.party) ? [{ ...s }] : classified.some((p) => p.party === s.party) ? [levelOf(s.party)] : [])),
      ...classified.filter((p) => !a.stances.some((s) => s.party === p.party)).map((p) => levelOf(p.party)),
    ];
    const defended = stances.some((s) => s.stance !== 'none');
    return { ...a, filler: a.filler && !defended, stances };
  });
  const otherProposals = [...frozen.otherProposals.filter((o) => !reclassified.has(o.party)).map((o) => ({ ...o })), ...late.otherProposals];
  return { approaches, otherProposals };
}

/** The party's own quote that contains what the AI quoted (literal, normalised like V1). */
function findQuote(text: string, position: SettlePosition): Quote | null {
  const searched = normalizeQuote(text);
  if (searched.length < QUOTE_LENGTH.min) return null;
  const found = (position.quotes ?? []).find((q) => normalizeQuote(q.text).includes(searched));
  return found ? { ...found } : null;
}

/** How two passes differ (null when they agree): approaches compared by who defends them and how. */
function differences(a: Classification, b: Classification): string | null {
  const signature = (x: Approach) => (x.filler ? 'inventado' : x.stances.filter((s) => s.stance !== 'none').map((s) => `${s.party}:${s.stance}`).sort().join(', '));
  const left = a.approaches.map(signature).sort();
  const right = b.approaches.map(signature).sort();
  if (left.join(' | ') === right.join(' | ')) return null;
  return `las pasadas clasifican distinto: [${left.join(' | ')}] frente a [${right.join(' | ')}]`;
}

/**
 * Puts a settled question into the dataset: the question when publishable (removed when not, so it
 * is never played), and its report either way, replacing an earlier one of the same question.
 */
export function publishSettled<D extends Pick<Dataset, 'questions' | 'approachReports'>>(ds: D, result: SettleResult): D {
  const id = result.report.question;
  const questions = (ds.questions ?? []).filter((q) => q.id !== id);
  if (result.question) questions.push(result.question);
  return { ...ds, questions, approachReports: [...(ds.approachReports ?? []).filter((r) => r.question !== id), result.report] };
}
