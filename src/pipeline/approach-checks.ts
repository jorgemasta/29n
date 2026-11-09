// Checks on the text of each settled approach (#22), run by settleApproaches once the two passes
// agree: V3 marks, V4 rounded figures, V5 similar length, V6 template (scripts) and V10 fidelity,
// V11 guesser vs chance (AI). A `discard` finding carries what to fix: settleApproaches rewrites
// the approach (`rewriteApproach`) up to MAX_REWRITES times before giving up on the question.
import type { AIAdapter } from '../ai/adapter';
import type { Approach, Party, Quote } from '../dataset/schema';
import { shuffle } from '../game/random';
import { PARTIES } from '../registry/parties';
import { TERMS, type IdentifyingTerms } from '../registry/terms';
import { FidelityResponse } from './fidelity';
import { findMarks } from './checks';
import {
  APPROACH_FIDELITY_INSTRUCTIONS,
  APPROACH_GUESS_INSTRUCTIONS,
  GuessApproachResponse,
  REWRITE_APPROACH_INSTRUCTIONS,
  RewriteApproachResponse,
} from './prompts-approach';
import type { ApproachCheck, ApproachFinding, QuestionSpec, SettlePosition } from './settle';

/** Rewrites of a failing approach before the question is given up. */
export const MAX_REWRITES = 2;
/** V5: allowed deviation from the median length of the question's 3 approaches. */
export const LENGTH_TOLERANCE = 0.25;
/** V4: a rounded figure stays within this factor of some defender's figure. */
export const ROUNDING_FACTOR = 1.5;
/** V4: a round figure has at most this many significant digits ("50.000", "1,5 millones", "20 %"). */
export const ROUND_DIGITS = 2;
/** V11: rounds of the guesser, each with the approaches in a different order. */
export const GUESS_ROUNDS = 4;
/** V11: an approach is recognisable when hitting its defenders this often has less than this probability by chance. */
export const CHANCE_SIGNIFICANCE = 0.05;

type Text = Pick<Approach, 'what' | 'how' | 'figure'>;
type PartyName = Pick<Party, 'id' | 'name' | 'acronym'>;

const pass = (check: ApproachFinding['check'], detail: string): ApproachFinding => ({ check, result: 'pass', detail });
const fail = (check: ApproachFinding['check'], detail: string, fix: string): ApproachFinding => ({ check, result: 'discard', detail, fix });
const fullText = (t: Text) => [t.what, t.how, t.figure ?? ''].join(' ');
const defenders = (a: Approach) => a.stances.filter((s) => s.stance !== 'none');

/** Words of "what" + "how": tokens with at least one letter or digit. */
export const countWords = (t: Text) => `${t.what} ${t.how}`.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** V6: "what" and "how" filled ("figure" is optional). */
export const templateCheck = (): ApproachCheck => async (approach) => {
  const missing = (['what', 'how'] as const).filter((f) => !approach[f].trim());
  return [missing.length ? fail('V6', `falta ${missing.map((f) => `"${f}"`).join(' y ')}`, `Rellena ${missing.map((f) => `"${f}"`).join(' y ')}: es obligatorio.`) : pass('V6', 'plantilla completa')];
};

/** V3: no name, acronym, leader or slogan of ANY party. */
export const marksCheck = (terms: IdentifyingTerms = TERMS): ApproachCheck => async (approach) => {
  const marks = findMarks(fullText(approach), terms);
  return [marks.length ? fail('V3', `marcas de partido: ${marks.join(', ')}`, `Quita estas marcas de partido: ${marks.join(', ')}.`) : pass('V3', 'sin marcas de partido')];
};

/** V5: within ±LENGTH_TOLERANCE of the median length of the question's 3 approaches. */
export const lengthCheck = (): ApproachCheck => async (approach, { approaches }) => {
  const lengths = approaches.map(countWords).sort((a, b) => a - b);
  const median = lengths[Math.floor(lengths.length / 2)]!;
  const n = countWords(approach);
  if (Math.abs(n - median) <= median * LENGTH_TOLERANCE) return [pass('V5', `${n} palabras, mediana de la pregunta ${median}`)];
  const min = Math.ceil(median * (1 - LENGTH_TOLERANCE));
  const max = Math.floor(median * (1 + LENGTH_TOLERANCE));
  return [fail('V5', `${n} palabras, fuera del ±${LENGTH_TOLERANCE * 100} % de la mediana de la pregunta (${median})`, `Entre "what" y "how" deben sumar entre ${min} y ${max} palabras, como los otros enfoques (ahora ${n}).`)];
};

/** A figure in a text: its value ("1,5 millones" → 1500000) and how it is written. */
interface Amount {
  value: number;
  written: string;
  year: boolean;
}

const MULTIPLIERS: [RegExp, number][] = [
  [/^mil millones/i, 1e9],
  [/^mill(?:ones|ón)/i, 1e6],
  [/^mil\b/i, 1e3],
];

/** Figures of a Spanish text. Grouping "50.000" / "50,000" is thousands; "2,5" is a decimal. */
export function amounts(text: string): Amount[] {
  const found: Amount[] = [];
  for (const m of text.matchAll(/(\d+(?:[.,]\d+)*)\s*(mil millones|millones|millón|mil\b)?/giu)) {
    const raw = m[1]!;
    const grouped = /^\d{1,3}(?:[.,]\d{3})+$/.test(raw);
    const base = Number(grouped ? raw.replace(/[.,]/g, '') : raw.replace(',', '.'));
    if (!Number.isFinite(base)) continue;
    const multiplier = MULTIPLIERS.find(([re]) => re.test(m[2] ?? ''))?.[1] ?? 1;
    found.push({ value: base * multiplier, written: m[0].trim(), year: multiplier === 1 && !grouped && /^(19|20)\d\d$/.test(raw) });
  }
  return found;
}

const significantDigits = (value: number) => String(value).replace('.', '').replace(/^0+/, '').replace(/0+$/, '').length;

/** V4: every figure of the approach is a rounding compatible with its defenders' figures (years: the same year). */
export const figuresCheck = (): ApproachCheck => async (approach, { positions }) => {
  const own = amounts(fullText(approach));
  if (own.length === 0) return [pass('V4', 'sin cifras')];
  const backers = new Set(defenders(approach).map((s) => s.party));
  if (backers.size === 0)
    return [fail('V4', `enfoque inventado con cifras: ${own.map((a) => a.written).join(', ')}`, 'Un enfoque inventado no lo defiende ningún partido: quita sus cifras.')];
  const quoted = positions.filter((p) => backers.has(p.party)).flatMap((p) => (p.quotes ?? []).flatMap((q) => amounts(q.text)));
  const wrong = own.filter((a) => {
    if (a.year) return !quoted.some((q) => q.year && q.value === a.value);
    if (significantDigits(a.value) > ROUND_DIGITS) return true;
    return !quoted.some((q) => !q.year && q.value > 0 && a.value / q.value <= ROUNDING_FACTOR && q.value / a.value <= ROUNDING_FACTOR);
  });
  if (wrong.length === 0) return [pass('V4', `cifras redondeadas compatibles: ${own.map((a) => a.written).join(', ')}`)];
  const sources = [...new Set(quoted.map((q) => q.written))];
  return [
    fail(
      'V4',
      `cifras sin redondear o sin respaldo en las citas: ${wrong.map((a) => a.written).join(', ')}`,
      `Las cifras ${wrong.map((a) => `"${a.written}"`).join(', ')} no son un redondeo de las de las citas (${sources.join(', ') || 'ninguna'}): redondéalas a un orden de magnitud compatible, por ejemplo "decenas de miles", o quítalas.`,
    ),
  ];
};

/** V10: faithful to the quotes of the parties that defend it in full (filler and partial-only approaches: nothing to check). */
export const fidelityCheck = (): ApproachCheck => async (approach, { question, ai }) => {
  const quotes = approach.stances.flatMap((s) => (s.stance === 'full' ? [s.quote.text] : []));
  if (quotes.length === 0) return [pass('V10', approach.filler ? 'enfoque inventado: sin citas que comprobar' : 'ningún partido lo defiende de lleno')];
  const r = await ai.complete({
    task: 'verify-fidelity',
    instructions: APPROACH_FIDELITY_INSTRUCTIONS,
    input: { question: { id: question.id, text: question.text }, approach: { what: approach.what, how: approach.how, figure: approach.figure }, quotes },
    schema: FidelityResponse,
  });
  const problems = [r.adds && 'añade algo', r.omits && 'omite una condición esencial', r.changesMeaning && 'cambia el sentido'].filter(Boolean);
  return [problems.length ? fail('V10', `${problems.join(', ')}: ${r.explanation}`, `Hazlo fiel a las citas: ${r.explanation}`) : pass('V10', 'fiel a las citas')];
};

/** P(X ≥ hits) for X ~ Binomial(rounds, p): how likely guessing this well is by chance. */
export function chanceOfHits(hits: number, rounds: number, p: number): number {
  let total = 0;
  for (let i = hits; i <= rounds; i++) total += binomial(rounds, i) * p ** i * (1 - p) ** (rounds - i);
  return total;
}
const binomial = (n: number, k: number): number => (k === 0 ? 1 : (binomial(n, k - 1) * (n - k + 1)) / k);

/** `rounds` orders of `n` items, pairwise different while there are enough permutations (deterministic by seed). */
function distinctOrders(n: number, rounds: number, seed: string): number[][] {
  const indices = Array.from({ length: n }, (_, i) => i);
  const possible = Array.from({ length: n }, (_, i) => i + 1).reduce((a, b) => a * b, 1);
  const seen = new Set<string>();
  return Array.from({ length: rounds }, (_, round) => {
    let order = shuffle(indices, `${seed}:${round}`);
    for (let k = 1; seen.has(order.join()) && seen.size < possible && k < 100; k++) order = shuffle(indices, `${seed}:${round}:${k}`);
    seen.add(order.join());
    return order;
  });
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const toText = (t: Text) => [t.what, t.how, t.figure ? `Cifra: ${t.figure}.` : ''].filter(Boolean).join(' ');

/**
 * V11: a guesser sees the 3 anonymous approaches (shuffled, GUESS_ROUNDS times) and the parties
 * that propose something on the question, and names the party most likely behind each. Naming a
 * defender (full or partial) is a hit; by chance it happens with p = defenders / parties. The
 * approach is recognisable when its hits are above p·rounds and that many has a chance below
 * CHANCE_SIGNIFICANCE. One guessing run serves the 3 approaches of the same round.
 */
export function recognizabilityCheck(parties: Record<string, PartyName> = PARTIES): ApproachCheck {
  const runs = new WeakMap<readonly Approach[], Promise<Map<string, { hits: number; hints: string[] }>>>();
  const guess = (approaches: readonly Approach[], question: QuestionSpec, positions: readonly SettlePosition[], ai: AIAdapter) => {
    const candidates = proposingParties(approaches, positions).map((id) => ({ id, name: parties[id]?.name ?? id, acronym: parties[id]?.acronym ?? id }));
    const tally = new Map(approaches.map((a) => [a.id, { hits: 0, hints: [] as string[] }]));
    return (async () => {
      for (const [round, order] of distinctOrders(approaches.length, GUESS_ROUNDS, question.id).entries()) {
        const r = await ai.complete({
          task: 'guess-party',
          instructions: APPROACH_GUESS_INSTRUCTIONS,
          input: { question: { id: question.id, text: question.text }, round, parties: candidates, approaches: order.map((i, slot) => ({ letter: LETTERS[slot]!, text: toText(approaches[i]!) })) },
          schema: GuessApproachResponse,
        });
        order.forEach((i, slot) => {
          const approach = approaches[i]!;
          const a = r.assignments.find((x) => x.letter === LETTERS[slot]);
          if (a && defenders(approach).some((s) => s.party === a.party)) {
            const t = tally.get(approach.id)!;
            t.hits++;
            t.hints.push(a.hint);
          }
        });
      }
      return tally;
    })();
  };
  return async (approach, { question, approaches, positions, ai }) => {
    const total = proposingParties(approaches, positions).length;
    const k = defenders(approach).length;
    if (k === 0 || k >= total) return [pass('V11', k === 0 ? 'enfoque inventado: nadie lo defiende' : 'lo defienden todos los partidos')];
    if (!runs.has(approaches)) runs.set(approaches, guess(approaches, question, positions, ai));
    const { hits, hints } = (await runs.get(approaches)!).get(approach.id)!;
    const p = k / total;
    const chance = chanceOfHits(hits, GUESS_ROUNDS, p);
    const detail = `acertado ${hits} de ${GUESS_ROUNDS} veces; por azar ${(p * 100).toFixed(0)} % por intento, probabilidad de acertar tanto ${chance.toFixed(3)}`;
    if (hits > p * GUESS_ROUNDS && chance < CHANCE_SIGNIFICANCE)
      return [fail('V11', detail, `Una IA adivina qué partido lo defiende por estos rasgos; quítalos o neutralízalos: ${[...new Set(hints)].join('; ')}.`)];
    return [pass('V11', detail)];
  };
}

/** Parties that propose something on the question: the ones classified in the approaches. */
function proposingParties(approaches: readonly Approach[], positions: readonly SettlePosition[]): string[] {
  const classified = new Set(approaches.flatMap((a) => a.stances.map((s) => s.party)));
  return positions.filter((p) => classified.has(p.party)).map((p) => p.party);
}

/** The checks the real pipeline runs on every approach. */
export function defaultApproachChecks(options: { terms?: IdentifyingTerms; parties?: Record<string, PartyName> } = {}): ApproachCheck[] {
  return [templateCheck(), marksCheck(options.terms), figuresCheck(), lengthCheck(), fidelityCheck(), recognizabilityCheck(options.parties)];
}

/** Asks the AI to rewrite an approach that failed some checks, with what to fix and its defenders' quotes. */
export async function rewriteApproach(ai: AIAdapter, question: QuestionSpec, approach: Approach, fixes: readonly string[]): Promise<Approach> {
  const quotes: string[] = defenders(approach).map((s) => (s as { quote: Quote }).quote.text);
  const r = await ai.complete({
    task: 'rewrite-approach',
    instructions: REWRITE_APPROACH_INSTRUCTIONS,
    input: {
      question: { id: question.id, text: question.text },
      approach: { what: approach.what, how: approach.how, figure: approach.figure },
      filler: approach.filler,
      quotes: [...new Set(quotes)],
      fixes,
    },
    schema: RewriteApproachResponse,
  });
  return { ...approach, what: r.what.trim(), how: r.how.trim(), figure: r.figure?.trim() || null };
}
